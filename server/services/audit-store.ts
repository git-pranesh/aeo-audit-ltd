/**
 * Audit persistence + fair-use enforcement.
 *
 * Only compact final reports are stored (no raw HTML, prompts or model
 * responses). Each account keeps its most recent SAVED_AUDITS audits.
 *
 * Concurrency and daily limits live on the user document and are updated in a
 * transaction, so they hold across restarts and multiple server instances.
 */

import crypto from 'crypto';
import { adminDb } from '../firebase-admin';
import type { AuditData } from '@shared/schema';
import type { AuditDetail, AuditSummary, ConfirmedContext, FairUseLimits, AuditHistory, CheckSummary } from '@shared/api';
import type { AeoInputs } from './audit-pipeline';
import { MAX_CITATION_PROMPTS } from './citation-snapshot';

export const FAIR_USE: FairUseLimits = {
  auditsPerDay: 10,
  auditsPerHour: 3,
  concurrentAudits: 2,
  pagesPerAudit: 10,
  maxCompetitors: 3,
  savedAudits: 25,
  citationPrompts: MAX_CITATION_PROMPTS,
};

/** Agency buyers audit client sites, so their fair-use ceiling is higher. */
export const AGENCY_FAIR_USE: FairUseLimits = {
  ...FAIR_USE,
  auditsPerDay: 30,
  auditsPerHour: 10,
  savedAudits: 100,
};

export function limitsFor(whiteLabel: boolean | undefined): FairUseLimits {
  return whiteLabel ? AGENCY_FAIR_USE : FAIR_USE;
}

/** A running audit older than this is treated as dead (server restarted mid-run). */
const STALE_RUN_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const audits = () => adminDb.collection('audits');
const users = () => adminDb.collection('users');

export class FairUseError extends Error {
  constructor(message: string, public code: string, public status = 429) {
    super(message);
  }
}

interface Usage {
  active: { id: string; startedAt: number }[];
  recent: number[]; // start timestamps (ms) within the last 24h
}

interface StoredAudit {
  userId: string;
  websiteUrl: string;
  domain: string;
  status: AuditSummary['status'];
  createdAt: string;
  completedAt?: string;
  overallScore?: number;
  letterGrade?: string;
  previousScore?: number | null;
  error?: string;
  context: ConfirmedContext;
  auditData?: AuditData;
  aeoInputs?: AeoInputs;
  citationHistory?: CheckSummary[];
}

const MAX_CHECK_HISTORY = 30;
const MAX_TOPICS_PER_CATEGORY = 40;

export function auditIdFor(uid: string, idempotencyKey: string): string {
  return crypto.createHash('sha256').update(`${uid}:${idempotencyKey}`).digest('hex').slice(0, 24);
}

export type StartResult =
  | { kind: 'started'; auditId: string }
  | { kind: 'existing'; audit: AuditSummary };

/**
 * Reserve a slot and create the audit document. Idempotent per
 * (user, idempotencyKey): a retried request returns the existing audit instead
 * of starting a second one.
 */
export async function startAudit(params: {
  uid: string;
  idempotencyKey: string;
  websiteUrl: string;
  domain: string;
  context: ConfirmedContext;
  limits?: FairUseLimits;
}): Promise<StartResult> {
  const { uid, idempotencyKey, websiteUrl, domain, context, limits = FAIR_USE } = params;
  const auditId = auditIdFor(uid, idempotencyKey);
  const auditRef = audits().doc(auditId);
  const userRef = users().doc(uid);

  return adminDb.runTransaction(async (tx) => {
    const [auditSnap, userSnap] = await Promise.all([tx.get(auditRef), tx.get(userRef)]);
    if (auditSnap.exists) {
      const data = auditSnap.data() as StoredAudit;
      if (data.userId !== uid) throw new FairUseError('Invalid request.', 'BAD_REQUEST', 400);
      return { kind: 'existing', audit: toSummary(auditId, data) } as StartResult;
    }

    const now = Date.now();
    const usage: Usage = { active: [], recent: [], ...(userSnap.data()?.usage || {}) };
    const active = usage.active.filter((a) => now - a.startedAt < STALE_RUN_MS);
    const recent = usage.recent.filter((t) => now - t < DAY_MS);

    if (active.length >= limits.concurrentAudits) {
      throw new FairUseError(`You can run ${limits.concurrentAudits} audits at the same time. Please wait for one to finish.`, 'TOO_MANY_RUNNING');
    }
    if (recent.filter((t) => now - t < HOUR_MS).length >= limits.auditsPerHour) {
      throw new FairUseError(`Fair-use limit reached: ${limits.auditsPerHour} audits per hour. Please try again a little later.`, 'HOURLY_LIMIT');
    }
    if (recent.length >= limits.auditsPerDay) {
      throw new FairUseError(`Fair-use limit reached: ${limits.auditsPerDay} audits per 24 hours. Please try again later.`, 'DAILY_LIMIT');
    }

    const createdAt = new Date(now).toISOString();
    const doc: StoredAudit = { userId: uid, websiteUrl, domain, status: 'running', createdAt, context };
    tx.create(auditRef, doc);
    // guarantee.auditsRun is a lifetime counter (money-back guarantee): deleting audits does not lower it, a failed audit does.
    const guarantee = userSnap.data()?.guarantee ?? {};
    tx.set(userRef, {
      usage: {
        active: [...active, { id: auditId, startedAt: now }],
        recent: [...recent, now],
      },
      guarantee: { ...guarantee, auditsRun: (guarantee.auditsRun ?? 0) + 1 },
    }, { merge: true });
    return { kind: 'started', auditId } as StartResult;
  });
}

async function releaseSlot(uid: string, auditId: string): Promise<void> {
  const userRef = users().doc(uid);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const usage: Usage = { active: [], recent: [], ...(snap.data()?.usage || {}) };
    tx.set(userRef, { usage: { ...usage, active: usage.active.filter((a) => a.id !== auditId) } }, { merge: true });
  });
}

export async function completeAudit(uid: string, auditId: string, auditData: AuditData, aeoInputs: AeoInputs, previousScore: number | null, savedAudits = FAIR_USE.savedAudits): Promise<void> {
  await audits().doc(auditId).update({
    status: 'completed',
    completedAt: new Date().toISOString(),
    overallScore: auditData.auditResults.overallScore,
    letterGrade: auditData.auditResults.letterGrade,
    previousScore,
    // Firestore rejects `undefined`; JSON round-trip drops those keys.
    auditData: JSON.parse(JSON.stringify(auditData)),
    aeoInputs,
  });
  await releaseSlot(uid, auditId);
  await enforceRetention(uid, savedAudits).catch((err) => console.warn('Retention cleanup failed:', err?.message));
}

export async function failAudit(uid: string, auditId: string, message: string): Promise<void> {
  await audits().doc(auditId).update({
    status: 'failed',
    completedAt: new Date().toISOString(),
    error: message.slice(0, 300),
  }).catch(() => {});
  await refundFailedAudit(uid, auditId).catch(() => {});
}

/**
 * A failed audit gave the customer nothing, so it frees the running slot and
 * also gives back its place in the hourly and daily limits and in the
 * money-back guarantee count. The burst limiter on the route still stops tight
 * retry loops. Keyed on the active entry, so a repeated call cannot refund twice.
 */
async function refundFailedAudit(uid: string, auditId: string): Promise<void> {
  const userRef = users().doc(uid);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const usage: Usage = { active: [], recent: [], ...(snap.data()?.usage || {}) };
    const entry = usage.active.find((a) => a.id === auditId);
    if (!entry) return;
    const index = usage.recent.indexOf(entry.startedAt);
    const recent = index === -1 ? usage.recent : usage.recent.filter((_, i) => i !== index);
    const guarantee = snap.data()?.guarantee ?? {};
    tx.set(userRef, {
      usage: { active: usage.active.filter((a) => a.id !== auditId), recent },
      guarantee: { ...guarantee, auditsRun: Math.max(0, (guarantee.auditsRun ?? 0) - 1) },
    }, { merge: true });
  });
}

/** Keep the newest SAVED_AUDITS audits per account; never touches running audits. */
async function enforceRetention(uid: string, keep: number): Promise<void> {
  const snap = await audits().where('userId', '==', uid).select('createdAt', 'status').get();
  const finished = snap.docs
    .filter((d) => d.get('status') !== 'running')
    .sort((a, b) => String(b.get('createdAt')).localeCompare(String(a.get('createdAt'))));
  const excess = finished.slice(keep);
  if (excess.length === 0) return;
  const batch = adminDb.batch();
  excess.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

function toSummary(auditId: string, d: StoredAudit): AuditSummary {
  const stale = d.status === 'running' && Date.now() - Date.parse(d.createdAt) > STALE_RUN_MS;
  return {
    auditId,
    websiteUrl: d.websiteUrl,
    domain: d.domain,
    status: stale ? 'failed' : d.status,
    createdAt: d.createdAt,
    ...(d.completedAt ? { completedAt: d.completedAt } : {}),
    ...(d.overallScore !== undefined ? { overallScore: d.overallScore } : {}),
    ...(d.letterGrade ? { letterGrade: d.letterGrade } : {}),
    ...(d.previousScore !== undefined ? { previousScore: d.previousScore } : {}),
    ...(stale ? { error: 'This audit was interrupted. Please run it again.' } : d.error ? { error: d.error } : {}),
  };
}

export async function listAudits(uid: string): Promise<AuditSummary[]> {
  const snap = await audits()
    .where('userId', '==', uid)
    .select('websiteUrl', 'domain', 'status', 'createdAt', 'completedAt', 'overallScore', 'letterGrade', 'previousScore', 'error')
    .get();
  return snap.docs
    // Skip documents written by the pre-LTD app (different shape).
    .filter((d) => typeof d.get('createdAt') === 'string' && typeof d.get('status') === 'string')
    .map((d) => toSummary(d.id, d.data() as StoredAudit))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Score of the newest completed audit for the same domain (for "vs last audit"). */
export async function previousScoreFor(uid: string, domain: string, excludeId: string): Promise<number | null> {
  const list = await listAudits(uid);
  const prev = list.find((a) => a.domain === domain && a.status === 'completed' && a.auditId !== excludeId);
  return prev?.overallScore ?? null;
}

async function getOwned(uid: string, auditId: string): Promise<StoredAudit | null> {
  if (!/^[a-f0-9]{24}$/.test(auditId)) return null;
  const snap = await audits().doc(auditId).get();
  if (!snap.exists) return null;
  const data = snap.data() as StoredAudit;
  return data.userId === uid ? data : null;
}

export async function getAudit(uid: string, auditId: string): Promise<AuditDetail | null> {
  const d = await getOwned(uid, auditId);
  if (!d) return null;
  return { ...toSummary(auditId, d), context: d.context, ...(d.auditData ? { auditData: d.auditData } : {}) };
}

export async function getAuditForFiles(uid: string, auditId: string): Promise<StoredAudit | null> {
  return getOwned(uid, auditId);
}

export async function deleteAudit(uid: string, auditId: string): Promise<boolean> {
  const d = await getOwned(uid, auditId);
  if (!d || d.status === 'running') return false;
  await audits().doc(auditId).delete();
  return true;
}

/** Only the latest citation snapshot is kept, inside the audit report. */
export async function saveCitationSnapshot(uid: string, auditId: string, snapshot: NonNullable<AuditData['citationSnapshot']>, summary?: CheckSummary): Promise<void> {
  const d = await getOwned(uid, auditId);
  if (!d) return;
  const history = [...(d.citationHistory ?? []), ...(summary ? [summary] : [])].slice(-MAX_CHECK_HISTORY);
  await audits().doc(auditId).update({
    'auditData.citationSnapshot': JSON.parse(JSON.stringify(snapshot)),
    ...(summary ? { citationHistory: JSON.parse(JSON.stringify(history)) } : {}),
  });
}

/** Adds new topic ideas to a saved audit. Returns the updated lists, or null if it is not yours. */
export async function appendTopics(uid: string, auditId: string, fresh: Record<string, any[]>): Promise<Record<string, any[]> | null> {
  const d = await getOwned(uid, auditId);
  if (!d?.auditData) return null;
  const current = (d.auditData.contentTopics ?? {}) as unknown as Record<string, any[]>;
  const merged: Record<string, any[]> = { ...current };
  for (const [category, list] of Object.entries(fresh)) {
    const seen = new Set((current[category] ?? []).map((t) => String(t.topic).toLowerCase()));
    const added = list.filter((t) => !seen.has(String(t.topic).toLowerCase()));
    merged[category] = [...(current[category] ?? []), ...added].slice(0, MAX_TOPICS_PER_CATEGORY);
  }
  await audits().doc(auditId).update({ 'auditData.contentTopics': JSON.parse(JSON.stringify(merged)) });
  return merged;
}

/** Scores and citation checks for one website across this account's saved audits, oldest score first. */
export async function auditHistoryFor(uid: string, auditId: string): Promise<AuditHistory | null> {
  const owned = await getOwned(uid, auditId);
  if (!owned) return null;
  const snap = await audits().where('userId', '==', uid).select('domain', 'status', 'createdAt', 'overallScore', 'letterGrade', 'citationHistory').get();
  const same = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as StoredAudit) })).filter((a) => a.domain === owned.domain);
  return {
    scores: same
      .filter((a) => a.status === 'completed' && typeof a.overallScore === 'number')
      .map((a) => ({ date: a.createdAt, score: a.overallScore as number, grade: a.letterGrade, auditId: a.id }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    checks: same.flatMap((a) => a.citationHistory ?? []).sort((a, b) => b.date.localeCompare(a.date)),
  };
}
