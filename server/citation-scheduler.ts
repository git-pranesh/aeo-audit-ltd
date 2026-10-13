import { initializeApp, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, doc, getDoc, updateDoc } from 'firebase/firestore';
import { getFeatureFlags } from './feature-flags';
import { generateCitationSnapshot } from './citation-snapshot-service';
import { saveCitationSnapshot, getLatestCitationEntry, detectCitationChanges } from './citation-history-service';
import { getOpenRouterApiKeyForUser } from './openrouter-key-service';
import { emailService } from './email-service';
import { deriveNameFromDomain } from './domain-utils';

const FREQUENCY_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 10_000;

let isRunning = false;

function getSchedulerDb() {
  let app;
  try { app = getApp('citation-scheduler-app'); } catch {
    app = initializeApp({
      apiKey: process.env.VITE_FIREBASE_API_KEY,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    }, 'citation-scheduler-app');
  }
  return getFirestore(app);
}

function isDue(lastRefreshAt: string | null | undefined, frequency: string): boolean {
  const intervalMs = FREQUENCY_MS[frequency];
  if (!intervalMs) return false;
  if (!lastRefreshAt) return true;
  const elapsed = Date.now() - new Date(lastRefreshAt).getTime();
  return elapsed >= intervalMs;
}

interface SchedulerResult {
  processed: number;
  refreshed: number;
  errors: number;
  skipped: number;
}

export async function runCitationRefreshCycle(): Promise<SchedulerResult> {
  if (isRunning) {
    console.log('⏭️ Citation scheduler: previous cycle still running, skipping');
    return { processed: 0, refreshed: 0, errors: 0, skipped: 0 };
  }

  isRunning = true;
  const result: SchedulerResult = { processed: 0, refreshed: 0, errors: 0, skipped: 0 };

  try {
    console.log('\n========== CITATION SCHEDULER CYCLE ==========');
    const startTime = Date.now();
    const db = getSchedulerDb();

    const usersSnapshot = await getDocs(collection(db, 'users'));
    const eligibleUsers: Array<{ uid: string; plan: string; email: string; displayName: string }> = [];

    for (const userDoc of usersSnapshot.docs) {
      const data = userDoc.data();
      const plan = data.subscriptionPlan || 'free';
      const flags = getFeatureFlags(plan);
      if (flags.citationMonitoringFrequency !== 'none') {
        eligibleUsers.push({
          uid: userDoc.id,
          plan,
          email: data.email || '',
          displayName: data.displayName || '',
        });
      }
    }

    console.log(`📋 Found ${eligibleUsers.length} users with citation monitoring enabled`);

    const dueAudits: Array<{
      auditId: string;
      userId: string;
      websiteUrl: string;
      companyIntelligence: any;
      lastCitationRefreshAt: string | null;
      usedFallback: boolean;
      userEmail: string;
      userName: string;
      plan: string;
      snapshotPrompts: string[];
    }> = [];

    for (const user of eligibleUsers) {
      const flags = getFeatureFlags(user.plan);
      const frequency = flags.citationMonitoringFrequency;

      const auditsQuery = query(
        collection(db, 'audits'),
        where('userId', '==', user.uid)
      );
      const auditsSnapshot = await getDocs(auditsQuery);

      for (const auditDoc of auditsSnapshot.docs) {
        const data = auditDoc.data();
        // BUG-11 FIX: Use lastScheduledCitationAt (not lastCitationRefreshAt) so that
        // manual user refreshes don't accidentally reset the scheduler timer.
        const lastScheduled = data.lastScheduledCitationAt || null;

        if (isDue(lastScheduled, frequency)) {
          const auditData = data.auditData || {};
          const companyIntelligence = auditData.companyIntelligence || {};

          if (data.websiteUrl) {
            // BUG-02 FIX: Use deriveNameFromDomain fallback if companyName is missing
            const rawName = (companyIntelligence.companyName || '').trim();
            const resolvedCompanyName = rawName.length >= 2
              ? rawName
              : deriveNameFromDomain(data.websiteUrl);
            const usedFallback = rawName.length < 2;
            if (usedFallback) {
              console.warn(`⚠️ Scheduler: companyName missing for audit ${auditDoc.id}; using domain fallback: "${resolvedCompanyName}"`);
            }

            dueAudits.push({
              auditId: auditDoc.id,
              userId: user.uid,
              websiteUrl: data.websiteUrl,
              companyIntelligence: { ...companyIntelligence, companyName: resolvedCompanyName },
              lastCitationRefreshAt: lastScheduled,
              usedFallback,
              userEmail: user.email,
              userName: user.displayName,
              plan: user.plan,
              snapshotPrompts: data.snapshotPrompts ?? [],
            });
          }
        }
      }
    }

    console.log(`🔍 Found ${dueAudits.length} audits due for citation refresh`);
    result.processed = dueAudits.length;

    for (let i = 0; i < dueAudits.length; i += BATCH_SIZE) {
      const batch = dueAudits.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(dueAudits.length / BATCH_SIZE);

      console.log(`\n⏳ Processing batch ${batchNum}/${totalBatches} (${batch.length} audits)...`);

      await Promise.allSettled(batch.map(async (audit) => {
        try {
          const apiKey = await getOpenRouterApiKeyForUser(audit.userId);
          if (!apiKey) {
            console.warn(`⚠️ No OpenRouter API key for user ${audit.userId}, skipping audit ${audit.auditId}`);
            result.skipped++;
            return;
          }

          const previousEntry = await getLatestCitationEntry(audit.auditId);

          const newSnapshot = await generateCitationSnapshot({
            websiteUrl: audit.websiteUrl,
            industry: audit.companyIntelligence.industry || 'General',
            companyName: audit.companyIntelligence.companyName || '',
            keywords: audit.companyIntelligence.suggestedKeywords || [],
            apiKey,
            auditId: audit.auditId,
            // If we have the original prompts, pass them directly to ensure
            // the denominator (totalPromptsChecked) stays consistent across runs
            ...(audit.snapshotPrompts.length > 0 ? { fixedPrompts: audit.snapshotPrompts } : {}),
          });

          // Guard: if totalPromptsChecked differs from previous run by more than 1,
          // skip the change detection and save as a calibration run instead
          if (previousEntry && Math.abs(newSnapshot.totalPromptsChecked - previousEntry.totalPromptsChecked) > 1) {
            console.warn(
              `Prompt count mismatch for audit ${audit.auditId}: ` +
              `previous=${previousEntry.totalPromptsChecked}, current=${newSnapshot.totalPromptsChecked}. ` +
              `Saving as calibration run — no alert will fire.`
            );
            await saveCitationSnapshot(audit.auditId, newSnapshot, "scheduled", false);
            const auditRef = doc(db, "audits", audit.auditId);
            await updateDoc(auditRef, {
              lastScheduledCitationAt: new Date().toISOString(),
            });
            result.refreshed++;
            return; // skip detectCitationChanges and email sending for this run
          }

          await saveCitationSnapshot(audit.auditId, newSnapshot, 'scheduled', audit.usedFallback);

          // BUG-11 FIX: Write to lastScheduledCitationAt (not lastCitationRefreshAt)
          const auditRef = doc(db, 'audits', audit.auditId);
          await updateDoc(auditRef, {
            lastScheduledCitationAt: new Date().toISOString(),
          });

          if (previousEntry) {
            const changes = detectCitationChanges(newSnapshot, previousEntry);
            const flags = getFeatureFlags(audit.plan);

            if (changes.hasSignificantChange && flags.citationAlerts && audit.userEmail) {
              try {
                await emailService.sendCitationAlertEmail(audit.userEmail, audit.userName, {
                  websiteUrl: audit.websiteUrl,
                  previousMentionRate: changes.previousMentionRate,
                  currentMentionRate: changes.currentMentionRate,
                  mentionRateChange: changes.mentionRateChange,
                  newCompetitors: changes.newCompetitors,
                  lostCompetitors: changes.lostCompetitors,
                  visibilityGained: changes.visibilityGained,
                  visibilityLost: changes.visibilityLost,
                  auditId: audit.auditId,
                });
                console.log(`📧 Citation alert email sent to ${audit.userEmail} for ${audit.websiteUrl}`);
              } catch (emailErr: any) {
                console.warn(`⚠️ Failed to send citation alert email: ${emailErr.message}`);
              }
            }
          }

          result.refreshed++;
          console.log(
            `Refreshed citation for ${audit.websiteUrl} — ` +
            `${newSnapshot.totalPromptsChecked} prompts, ` +
            `mentionRate: ${newSnapshot.mentionRate}%`
          );
        } catch (err: any) {
          result.errors++;
          console.error(`❌ Failed citation refresh for audit ${audit.auditId}: ${err.message}`);
        }
      }));

      if (i + BATCH_SIZE < dueAudits.length) {
        console.log(`⏸️ Waiting ${BATCH_DELAY_MS / 1000}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    result.skipped = result.processed - result.refreshed - result.errors;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Citation scheduler cycle complete in ${elapsed}s: ${result.refreshed} refreshed, ${result.errors} errors, ${result.skipped} skipped`);
  } catch (err: any) {
    console.error('❌ Citation scheduler cycle failed:', err.message);
  } finally {
    isRunning = false;
  }

  return result;
}
