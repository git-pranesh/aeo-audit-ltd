/**
 * One license system for every sales channel.
 *
 *  - Direct sale (Dodo): webhook creates a license bound to the buyer's email.
 *    It is claimed automatically the first time that email signs in with a
 *    verified address — no code, no email infrastructure.
 *  - Marketplaces / partners: admin generates codes (CSV, shown once). Only the
 *    SHA-256 hash of each code is stored; the code itself is the document id hash.
 *  - Refund: revoke. Replacement: revoke + issue a new code.
 *
 * No stacking, no tiers, no upgrades: one account ⇄ at most one license.
 */

import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../firebase-admin';

export type LicenseStatus = 'available' | 'active' | 'revoked' | 'refunded';
export type SalesChannel = 'direct' | 'marketplace' | 'partner';

export interface License {
  product: 'lifetime';
  whiteLabel: boolean;
  channel: SalesChannel;
  status: LicenseStatus;
  codeHash?: string;
  codeHint?: string;          // last 4 chars of the code, for support lookups
  purchaserEmail?: string;    // direct sales: claimed by this verified email
  orderReference?: string;
  activatedBy?: string;
  activatedAt?: string;
  createdAt: string;
  note?: string;
}

export interface Entitlement {
  product: 'lifetime';
  whiteLabel: boolean;
  status: 'active';
  licenseId: string;
  channel: SalesChannel;
  activatedAt: string;
}

export class LicenseError extends Error {
  constructor(message: string, public code: string, public status = 400) {
    super(message);
  }
}

const licenses = () => adminDb.collection('licenses');
const users = () => adminDb.collection('users');

/** Normalise user input: case-insensitive, ignores spaces and dashes. */
export function normalizeCode(code: string): string {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeCode(code)).digest('hex');
}

/** CR-XXXX-XXXX-XXXX-XXXX using an unambiguous alphabet (~80 bits of entropy). */
export function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(16);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `CR-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

function toEntitlement(licenseId: string, license: License, activatedAt: string): Entitlement {
  return {
    product: 'lifetime',
    whiteLabel: !!license.whiteLabel,
    status: 'active',
    licenseId,
    channel: license.channel,
    activatedAt,
  };
}

/** Atomically bind an available license document to a user. */
async function bindLicense(licenseId: string, uid: string): Promise<Entitlement> {
  const licenseRef = licenses().doc(licenseId);
  const userRef = users().doc(uid);

  return adminDb.runTransaction(async (tx) => {
    const [licenseSnap, userSnap] = await Promise.all([tx.get(licenseRef), tx.get(userRef)]);
    if (!licenseSnap.exists) {
      throw new LicenseError('That license code is not valid.', 'INVALID_CODE', 404);
    }
    const license = licenseSnap.data() as License;
    const current = userSnap.exists ? userSnap.data()?.entitlement : null;

    if (current?.status === 'active') {
      if (current.licenseId === licenseId) return current as Entitlement;
      throw new LicenseError('This account already has an active lifetime license.', 'ALREADY_LICENSED', 409);
    }
    if (license.status === 'active') {
      throw new LicenseError('This license code has already been activated.', 'ALREADY_ACTIVATED', 409);
    }
    if (license.status !== 'available') {
      throw new LicenseError('This license is no longer valid. Contact support if you think this is a mistake.', 'LICENSE_INACTIVE', 403);
    }

    const activatedAt = new Date().toISOString();
    const entitlement = toEntitlement(licenseId, license, activatedAt);
    tx.update(licenseRef, { status: 'active', activatedBy: uid, activatedAt });
    tx.set(userRef, { entitlement }, { merge: true });
    return entitlement;
  });
}

export async function activateCode(uid: string, code: string): Promise<Entitlement> {
  const normalized = normalizeCode(code);
  if (normalized.length < 8 || normalized.length > 64) {
    throw new LicenseError('That license code is not valid.', 'INVALID_CODE', 400);
  }
  return bindLicense(hashCode(normalized), uid);
}

/**
 * Called on every /api/me load for verified emails: if this email bought a
 * license directly and it has not been claimed yet, attach it.
 */
export async function claimPurchasedLicense(uid: string, email: string | undefined, emailVerified: boolean): Promise<Entitlement | null> {
  if (!email || !emailVerified) return null;
  const snap = await licenses().where('purchaserEmail', '==', email.toLowerCase()).limit(10).get();
  const available = snap.docs.find((d) => (d.data() as License).status === 'available');
  if (!available) return null;
  try {
    return await bindLicense(available.id, uid);
  } catch (err) {
    if (err instanceof LicenseError) return null;
    throw err;
  }
}

/** Generate marketplace/partner codes. Returns plaintext codes — the only time they exist. */
export async function generateCodes(count: number, opts: { whiteLabel: boolean; channel: SalesChannel; note?: string }): Promise<string[]> {
  const n = Math.max(1, Math.min(1000, Math.floor(count)));
  const codes: string[] = [];
  const createdAt = new Date().toISOString();
  for (let i = 0; i < n; i += 400) {
    const batch = adminDb.batch();
    for (let j = i; j < Math.min(n, i + 400); j++) {
      const code = generateCode();
      const codeHash = hashCode(code);
      const license: License = {
        product: 'lifetime',
        whiteLabel: opts.whiteLabel,
        channel: opts.channel,
        status: 'available',
        codeHash,
        codeHint: normalizeCode(code).slice(-4),
        createdAt,
        ...(opts.note ? { note: opts.note.slice(0, 200) } : {}),
      };
      batch.create(licenses().doc(codeHash), license);
      codes.push(code);
    }
    await batch.commit();
  }
  return codes;
}

/**
 * Direct purchase. Idempotent: the license id is derived from the order id,
 * so a duplicated webhook delivery cannot create a second license.
 */
export async function createPurchasedLicense(params: {
  orderReference: string;
  email: string;
  whiteLabel: boolean;
}): Promise<{ created: boolean; licenseId: string }> {
  const licenseId = `order_${params.orderReference.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const license: License = {
    product: 'lifetime',
    whiteLabel: params.whiteLabel,
    channel: 'direct',
    status: 'available',
    purchaserEmail: params.email.toLowerCase(),
    orderReference: params.orderReference,
    createdAt: new Date().toISOString(),
  };
  try {
    await licenses().doc(licenseId).create(license);
    return { created: true, licenseId };
  } catch (err: any) {
    if (err?.code === 6 /* ALREADY_EXISTS */) return { created: false, licenseId };
    throw err;
  }
}

/** Revoke/refund a license and remove the entitlement from whoever holds it. */
export async function setLicenseStatus(licenseId: string, status: 'revoked' | 'refunded' | 'active'): Promise<License | null> {
  const ref = licenses().doc(licenseId);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const license = snap.data() as License;

    if (status === 'active') {
      // Reactivation: back to 'active' if it was bound, otherwise 'available'.
      const next: LicenseStatus = license.activatedBy ? 'active' : 'available';
      tx.update(ref, { status: next });
      if (license.activatedBy) {
        tx.set(users().doc(license.activatedBy), {
          entitlement: toEntitlement(licenseId, license, license.activatedAt || new Date().toISOString()),
        }, { merge: true });
      }
      return { ...license, status: next };
    }

    tx.update(ref, { status });
    if (license.activatedBy) {
      tx.set(users().doc(license.activatedBy), { entitlement: FieldValue.delete() }, { merge: true });
    }
    return { ...license, status };
  });
}

export async function setLicenseWhiteLabel(licenseId: string, whiteLabel: boolean): Promise<License | null> {
  const ref = licenses().doc(licenseId);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const license = snap.data() as License;
    tx.update(ref, { whiteLabel });
    if (license.activatedBy && license.status === 'active') {
      tx.set(users().doc(license.activatedBy), { entitlement: { whiteLabel } }, { merge: true });
    }
    return { ...license, whiteLabel };
  });
}

/** When an account is deleted its license goes back to 'available' so the buyer can re-activate. */
export async function releaseLicense(licenseId: string, uid: string): Promise<void> {
  const ref = licenses().doc(licenseId);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const license = snap.data() as License;
    if (license.activatedBy !== uid || license.status !== 'active') return;
    tx.update(ref, { status: 'available', activatedBy: FieldValue.delete(), activatedAt: FieldValue.delete() });
  });
}

export async function findLicenseByOrder(orderReference: string): Promise<string | null> {
  const id = `order_${orderReference.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const snap = await licenses().doc(id).get();
  return snap.exists ? id : null;
}
