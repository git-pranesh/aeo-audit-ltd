import { initializeApp, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import type { CitationSnapshotResult, CompetitorCitation } from './citation-snapshot-service';

function getFirestoreDb() {
  let app;
  try { app = getApp('citation-history-app'); } catch {
    app = initializeApp({
      apiKey: process.env.VITE_FIREBASE_API_KEY,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    }, 'citation-history-app');
  }
  return getFirestore(app);
}

export type CitationTrigger = 'initial' | 'manual' | 'reaudit' | 'scheduled';

export interface CitationHistoryEntry {
  runId: string;
  runAt: string;
  trigger: CitationTrigger;
  mentionRate: number;
  totalPromptsChecked: number;
  mentionedCount: number;
  topCompetitorsCited: CompetitorCitation[];
  promptSummaries: Array<{
    prompt: string;
    mentioned: boolean;
    competitorsMentioned: string[];
  }>;
  // BUG-09 FIX: Marks entries that used domain-name fallback (companyName was missing)
  // These are recovery runs after the root bug was fixed — skip alert comparison against them
  isRecovery?: boolean;
}

export interface CitationChanges {
  mentionRateChange: number;
  previousMentionRate: number;
  currentMentionRate: number;
  newCompetitors: string[];
  lostCompetitors: string[];
  visibilityGained: boolean;
  visibilityLost: boolean;
  hasSignificantChange: boolean;
}

export async function saveCitationSnapshot(
  auditId: string,
  snapshot: CitationSnapshotResult,
  trigger: CitationTrigger,
  isRecovery: boolean = false
): Promise<string> {
  const db = getFirestoreDb();
  const historyRef = collection(db, 'audits', auditId, 'citationHistory');

  const runId = `cit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: CitationHistoryEntry = {
    runId,
    runAt: new Date().toISOString(),
    trigger,
    mentionRate: snapshot.mentionRate,
    totalPromptsChecked: snapshot.totalPromptsChecked,
    mentionedCount: snapshot.mentionedCount,
    topCompetitorsCited: snapshot.topCompetitorsCited || [],
    promptSummaries: (snapshot.promptResults || []).map(pr => ({
      prompt: pr.prompt,
      mentioned: pr.mentioned,
      competitorsMentioned: pr.competitorsMentioned || [],
    })),
    ...(isRecovery ? { isRecovery: true } : {}),
  };

  const docRef = await addDoc(historyRef, entry);
  console.log(`✅ Citation history saved: ${trigger}${isRecovery ? ' [recovery]' : ''} entry for audit ${auditId} (doc: ${docRef.id})`);
  return docRef.id;
}

export async function getCitationHistory(auditId: string): Promise<CitationHistoryEntry[]> {
  const db = getFirestoreDb();
  const historyRef = collection(db, 'audits', auditId, 'citationHistory');
  const q = query(historyRef, orderBy('runAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => d.data() as CitationHistoryEntry);
}

export async function getLatestCitationEntry(auditId: string): Promise<CitationHistoryEntry | null> {
  const db = getFirestoreDb();
  const historyRef = collection(db, 'audits', auditId, 'citationHistory');
  const q = query(historyRef, orderBy('runAt', 'desc'), firestoreLimit(1));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as CitationHistoryEntry;
}

export function detectCitationChanges(
  current: CitationSnapshotResult,
  previous: CitationHistoryEntry
): CitationChanges {
  const currentMentionRate = current.mentionRate;
  const previousMentionRate = previous.mentionRate;
  const mentionRateChange = currentMentionRate - previousMentionRate;

  const currentCompetitorNames = (current.topCompetitorsCited || []).map(c => c.name.toLowerCase());
  const previousCompetitorNames = (previous.topCompetitorsCited || []).map(c => c.name.toLowerCase());

  const newCompetitors = currentCompetitorNames
    .filter(c => !previousCompetitorNames.includes(c))
    .map(c => {
      const original = (current.topCompetitorsCited || []).find(tc => tc.name.toLowerCase() === c);
      return original?.name || c;
    });

  const lostCompetitors = previousCompetitorNames
    .filter(c => !currentCompetitorNames.includes(c))
    .map(c => {
      const original = (previous.topCompetitorsCited || []).find(tc => tc.name.toLowerCase() === c);
      return original?.name || c;
    });

  const visibilityGained = previousMentionRate === 0 && currentMentionRate > 0;
  const visibilityLost = previousMentionRate > 0 && currentMentionRate === 0;

  // BUG-09 FIX: Skip comparison when previous entry is a recovery run (domain-fallback baseline)
  // or shows the hallmark of a corrupt baseline (100% rate with zero competitors)
  const isCorruptBaseline =
    previous.isRecovery === true ||
    (previousMentionRate === 100 && previousCompetitorNames.length === 0);

  // BUG-10 FIX: Raise threshold from 10pp to 20pp (requires 2+ prompts to flip)
  // Removed noisy `newCompetitors.length >= 2` trigger — too unreliable post-extraction-fix
  // Require both a visibility state change AND a meaningful mention count change
  // to avoid alerting on single-prompt variance
  const meaningfulVisibilityGain =
    visibilityGained &&
    current.mentionedCount >= 2; // at least 2 prompts must mention to count as real gain
  const meaningfulVisibilityLoss =
    visibilityLost &&
    previous.mentionedCount >= 2; // must have had at least 2 mentions before to count as real loss
  const hasSignificantChange = isCorruptBaseline
    ? false  // Never alert when comparing against a corrupt/recovery baseline
    : (
        Math.abs(mentionRateChange) >= 20 ||
        meaningfulVisibilityGain ||
        meaningfulVisibilityLoss
      );

  return {
    mentionRateChange,
    previousMentionRate,
    currentMentionRate,
    newCompetitors,
    lostCompetitors,
    visibilityGained,
    visibilityLost,
    hasSignificantChange,
  };
}
