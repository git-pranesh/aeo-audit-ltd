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
import type { AuditDetail, AuditSummary, ConfirmedContext, FairUseLimits } from '@shared/api';
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
}

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
}): Promise<StartResult> {
  const { uid, idempotencyKey, websiteUrl, domain, context } = params;
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

    if (active.length >= FAIR_USE.concurrentAudits) {
      throw new FairUseError(`You can run ${FAIR_USE.concurrentAudits} audits at the same time. Please wait for one to finish.`, 'TOO_MANY_RUNNING');
    }
    if (recent.filter((t) => now - t < HOUR_MS).length >= FAIR_USE.auditsPerHour) {
      throw new FairUseError(`Fair-use limit reached: ${FAIR_USE.auditsPerHour} audits per hour. Please try again a little later.`, 'HOURLY_LIMIT');
    }
    if (recent.length >= FAIR_USE.auditsPerDay) {
      throw new FairUseError(`Fair-use limit reached: ${FAIR_USE.auditsPerDay} audits per 24 hours. Please try again later.`, 'DAILY_LIMIT');
    }

    const createdAt = new Date(now).toISOString();
    const doc: StoredAudit = { userId: uid, websiteUrl, domain, status: 'running', createdAt, context };
    tx.create(auditRef, doc);
    tx.set(userRef, {
      usage: {
        active: [...active, { id: auditId, startedAt: now }],
        recent: [...recent, now],
      },
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

export async function completeAudit(uid: string, auditId: string, auditData: AuditData, aeoInputs: AeoInputs, previousScore: number | null): Promise<void> {
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
  await enforceRetention(uid).catch((err) => console.warn('Retention cleanup failed:', err?.message));
}

export async function failAudit(uid: string, auditId: string, message: string): Promise<void> {
  await audits().doc(auditId).update({
    status: 'failed',
    completedAt: new Date().toISOString(),
    error: message.slice(0, 300),
  }).catch(() => {});
  await releaseSlot(uid, auditId).catch(() => {});
}

/** Keep the newest SAVED_AUDITS audits per account; never touches running audits. */
async function enforceRetention(uid: string): Promise<void> {
  const snap = await audits().where('userId', '==', uid).select('createdAt', 'status').get();
  const finished = snap.docs
    .filter((d) => d.get('status') !== 'running')
    .sort((a, b) => String(b.get('createdAt')).localeCompare(String(a.get('createdAt'))));
  const excess = finished.slice(FAIR_USE.savedAudits);
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
export async function saveCitationSnapshot(uid: string, auditId: string, snapshot: NonNullable<AuditData['citationSnapshot']>): Promise<void> {
  const d = await getOwned(uid, auditId);
  if (!d) return;
  await audits().doc(auditId).update({ 'auditData.citationSnapshot': JSON.parse(JSON.stringify(snapshot)) });
}
