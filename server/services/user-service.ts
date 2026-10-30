/**
 * Server-owned user records. The browser never writes Firestore directly —
 * every field below is written here, after authentication, so customers cannot
 * grant themselves a license, admin rights or white-label.
 */

import { adminAuth, adminDb } from '../firebase-admin';
import { decryptSecret, encryptSecret, type EncryptedSecret } from '../security/encryption';
import { OpenRouterError, type ModelChoice } from './openrouter';
import { releaseLicense, type Entitlement } from './license-service';
import type { GuaranteeUsage } from '../../shared/guarantee';

export interface Branding {
  agencyName: string;
  logoDataUrl?: string;   // small PNG/JPEG data URL, rendered client-side into PDFs
  accentColor: string;    // #RRGGBB
  reportTitle: string;
  footerText: string;
}

export interface StoredKey extends EncryptedSecret {
  last4: string;
  updatedAt: string;
}

export interface UserRecord {
  aiModels?: ModelChoice;
  email: string;
  displayName?: string;
  createdAt: string;
  entitlement?: Entitlement;
  openRouterKey?: StoredKey;
  branding?: Branding;
  /** Money-back guarantee counters (audits started, exports taken). Never reset. */
  guarantee?: GuaranteeUsage;
}

/** Marks a self-serve refund as requested. False if one was already requested (double click, retry). */
export async function markRefundRequested(uid: string): Promise<boolean> {
  const ref = users().doc(uid);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const g: GuaranteeUsage = snap.data()?.guarantee ?? {};
    if (g.refundRequestedAt) return false;
    tx.set(ref, { guarantee: { ...g, refundRequestedAt: new Date().toISOString() } }, { merge: true });
    return true;
  });
}

export async function setRefundResult(uid: string, result: { refundId: string } | null): Promise<void> {
  const { FieldValue } = await import('firebase-admin/firestore');
  await users().doc(uid).set({
    guarantee: result ? { refundId: result.refundId } : { refundRequestedAt: FieldValue.delete() },
  }, { merge: true });
}

/** Counts an export (PDF, CSV or AEO Pack). Any download ends the money-back guarantee. */
export async function recordDownload(uid: string, kind: 'pdf' | 'csv' | 'pack'): Promise<void> {
  const ref = users().doc(uid);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const g: GuaranteeUsage = snap.data()?.guarantee ?? {};
    tx.set(ref, { guarantee: { ...g, downloads: (g.downloads ?? 0) + 1, lastDownload: kind } }, { merge: true });
  });
}

const users = () => adminDb.collection('users');

export async function getOrCreateUser(uid: string, email?: string, displayName?: string): Promise<UserRecord> {
  return (await getOrCreateUserWithFlag(uid, email, displayName)).user;
}

/** Same as getOrCreateUser, and says whether this call created the account record. */
export async function getOrCreateUserWithFlag(uid: string, email?: string, displayName?: string): Promise<{ user: UserRecord; created: boolean }> {
  const ref = users().doc(uid);
  const snap = await ref.get();
  if (snap.exists) return { user: snap.data() as UserRecord, created: false };
  const record: UserRecord = {
    email: (email || '').toLowerCase(),
    ...(displayName ? { displayName } : {}),
    createdAt: new Date().toISOString(),
  };
  await ref.set(record, { merge: true });
  return { user: record, created: true };
}

export async function getUser(uid: string): Promise<UserRecord | null> {
  const snap = await users().doc(uid).get();
  return snap.exists ? (snap.data() as UserRecord) : null;
}

export async function saveOpenRouterKey(uid: string, plaintextKey: string): Promise<StoredKey> {
  const stored: StoredKey = {
    ...encryptSecret(plaintextKey),
    last4: plaintextKey.slice(-4),
    updatedAt: new Date().toISOString(),
  };
  await users().doc(uid).set({ openRouterKey: stored }, { merge: true });
  return stored;
}

export async function deleteOpenRouterKey(uid: string): Promise<void> {
  const { FieldValue } = await import('firebase-admin/firestore');
  await users().doc(uid).set({ openRouterKey: FieldValue.delete() }, { merge: true });
}

/** Decrypts the customer's key for a single request. Fails closed. */
export async function requireOpenRouterKey(uid: string): Promise<string> {
  const user = await getUser(uid);
  if (!user?.openRouterKey) {
    throw new OpenRouterError('Add your OpenRouter key in Settings before running audits.', 'KEY_MISSING', 400);
  }
  try {
    return decryptSecret(user.openRouterKey);
  } catch {
    throw new OpenRouterError('Your saved OpenRouter key could not be read. Please add it again in Settings.', 'KEY_INVALID', 400);
  }
}

export async function saveModelChoice(uid: string, choice: ModelChoice): Promise<void> {
  // Replace the whole map so clearing a choice (back to default) works.
  await users().doc(uid).update({ aiModels: JSON.parse(JSON.stringify(choice)) });
}

export async function getModelChoice(uid: string): Promise<ModelChoice> {
  return (await getUser(uid))?.aiModels ?? {};
}

export async function saveBranding(uid: string, branding: Branding | null): Promise<void> {
  const { FieldValue } = await import('firebase-admin/firestore');
  await users().doc(uid).set({ branding: branding ?? FieldValue.delete() }, { merge: true });
}

/** Deletes audits, saved key, user doc and the Firebase Auth user; releases the license. */
export async function deleteAccount(uid: string): Promise<void> {
  const user = await getUser(uid);

  const audits = await adminDb.collection('audits').where('userId', '==', uid).select().get();
  for (let i = 0; i < audits.docs.length; i += 400) {
    const batch = adminDb.batch();
    audits.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  if (user?.entitlement?.licenseId) {
    await releaseLicense(user.entitlement.licenseId, uid);
  }
  await users().doc(uid).delete();
  try {
    await adminAuth.deleteUser(uid);
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }
}
