/**
 * Admin invites: "give this person the product, free, with nothing to set up".
 *
 * An invite is a partner licence (kind: 'invite') created together with its own
 * capped OpenRouter key. The link carries the licence code; opening it, signing
 * in and activating binds the licence and copies the key into the account, so
 * the guest lands on the dashboard ready to audit. The licence is lifetime; the
 * free inference stops at the cap, after which they add their own key.
 *
 * Nothing in the audit path changes: by the time an audit runs, the account
 * simply has a key, the same as any paying customer.
 */

import { adminDb } from '../firebase-admin';
import { decryptSecret, encryptSecret } from '../security/encryption';
import {
  generateCode, hashCode, normalizeCode, setLicenseStatus, LicenseError, type License, type LicenseStatus,
} from './license-service';
import {
  createManagedKey, deleteManagedKey, getManagedKeyUsage, isKeyManagementConfigured, updateManagedKey,
  ManagedKeyError, type ManagedKeyUsage,
} from './openrouter-keys';
import type { AdminInvite, PublicInvite } from '@shared/api';

const licenses = () => adminDb.collection('licenses');
const users = () => adminDb.collection('users');
const audits = () => adminDb.collection('audits');

export const INVITE_CAP_DEFAULT_USD = 5;
export const INVITE_CAP_MAX_USD = 100;

export function inviteLink(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/$/, '')}/invite/${encodeURIComponent(code)}`;
}

export interface CreateInviteParams {
  name: string;
  note?: string;
  capUsd: number;
  whiteLabel: boolean;
  createdBy: string;
  appUrl: string;
}

/** Creates the OpenRouter key first, then the licence; a failed licence write removes the key again. */
export async function createInvite(params: CreateInviteParams): Promise<{ id: string; link: string }> {
  if (!isKeyManagementConfigured()) {
    throw new ManagedKeyError('Invites need OPENROUTER_MANAGEMENT_KEY (an OpenRouter management key) in the server secrets.', 'NOT_CONFIGURED', 503);
  }
  const name = params.name.trim().slice(0, 80);
  const capUsd = Math.min(INVITE_CAP_MAX_USD, Math.max(0, Math.round(params.capUsd * 100) / 100));
  const managed = await createManagedKey({ name: `Citation Rocket invite: ${name}`, limitUsd: capUsd });

  const code = generateCode();
  const id = hashCode(code);
  const license: License = {
    product: 'lifetime',
    whiteLabel: params.whiteLabel,
    channel: 'partner',
    status: 'available',
    codeHash: id,
    codeHint: normalizeCode(code).slice(-4),
    createdAt: new Date().toISOString(),
    kind: 'invite',
    invite: { name, capUsd, createdBy: params.createdBy, keyHash: managed.hash },
    sponsoredKey: { ...encryptSecret(managed.key), last4: managed.key.slice(-4) },
    inviteCode: encryptSecret(code),
    ...(params.note?.trim() ? { note: params.note.trim().slice(0, 200) } : {}),
  };
  try {
    await licenses().doc(id).create(license);
  } catch (err) {
    await deleteManagedKey(managed.hash).catch(() => undefined);
    throw err;
  }
  return { id, link: inviteLink(params.appUrl, code) };
}

async function getInvite(id: string): Promise<License> {
  const snap = await licenses().doc(id).get();
  const license = snap.exists ? (snap.data() as License) : null;
  if (!license || license.kind !== 'invite') {
    throw new LicenseError('Invite not found.', 'INVITE_NOT_FOUND', 404);
  }
  return license;
}

/** The link again, while the invite is still unused. Null once it has been activated or revoked. */
export async function getInviteLink(id: string, appUrl: string): Promise<string | null> {
  const license = await getInvite(id);
  if (license.status !== 'available' || !license.inviteCode) return null;
  return inviteLink(appUrl, decryptSecret(license.inviteCode));
}

async function summarize(id: string, license: License, withUsage: boolean): Promise<AdminInvite> {
  let activatedEmail: string | null = null;
  let auditCount = 0;
  if (license.activatedBy) {
    const [userSnap, count] = await Promise.all([
      users().doc(license.activatedBy).get(),
      audits().where('userId', '==', license.activatedBy).count().get(),
    ]);
    activatedEmail = userSnap.exists ? (userSnap.data()?.email ?? null) : null;
    auditCount = count.data().count;
  }
  let key: ManagedKeyUsage | null = null;
  if (withUsage && license.invite?.keyHash) {
    key = await getManagedKeyUsage(license.invite.keyHash).catch(() => null);
  }
  return {
    id,
    name: license.invite?.name ?? '',
    note: license.note,
    capUsd: license.invite?.capUsd ?? 0,
    whiteLabel: !!license.whiteLabel,
    status: license.status,
    createdAt: license.createdAt,
    createdBy: license.invite?.createdBy ?? '',
    activatedAt: license.activatedAt,
    activatedEmail,
    audits: auditCount,
    key,
    linkAvailable: license.status === 'available' && !!license.inviteCode,
  };
}

/** Newest first. Key usage comes from OpenRouter, one call per invite; failures show as null. */
export async function listInvites(opts: { withUsage?: boolean; limit?: number } = {}): Promise<AdminInvite[]> {
  const snap = await licenses().where('kind', '==', 'invite').limit(opts.limit ?? 200).get();
  const rows = await Promise.all(snap.docs.map((d) => summarize(d.id, d.data() as License, opts.withUsage !== false)));
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getInviteSummary(id: string): Promise<AdminInvite> {
  return summarize(id, await getInvite(id), true);
}

/** Revokes the licence (entitlement removed from whoever holds it) and disables the key at OpenRouter. */
export async function revokeInvite(id: string): Promise<{ invite: AdminInvite; keyDisabled: boolean }> {
  const license = await getInvite(id);
  await setLicenseStatus(id, 'revoked');
  let keyDisabled = false;
  if (license.invite?.keyHash) {
    keyDisabled = await updateManagedKey(license.invite.keyHash, { disabled: true }).then(() => true).catch(() => false);
  }
  return { invite: await getInviteSummary(id), keyDisabled };
}

/** Changes the dollar cap at OpenRouter (the guest's balance moves with it) and records it on the invite. */
export async function setInviteCap(id: string, capUsd: number): Promise<AdminInvite> {
  const license = await getInvite(id);
  const cap = Math.min(INVITE_CAP_MAX_USD, Math.max(0, Math.round(capUsd * 100) / 100));
  if (license.invite?.keyHash) {
    await updateManagedKey(license.invite.keyHash, { limitUsd: cap });
  }
  await licenses().doc(id).update({ 'invite.capUsd': cap });
  return getInviteSummary(id);
}

function publicStatus(status: LicenseStatus): PublicInvite['status'] {
  if (status === 'available') return 'open';
  if (status === 'active') return 'used';
  return 'inactive';
}

/** What the invite page may show before sign-in: the name and whether the link still works. No secrets. */
export async function lookupInvite(code: string): Promise<PublicInvite> {
  const normalized = normalizeCode(code);
  if (normalized.length < 8 || normalized.length > 64) return { valid: false };
  const snap = await licenses().doc(hashCode(normalized)).get();
  const license = snap.exists ? (snap.data() as License) : null;
  if (!license || license.kind !== 'invite') return { valid: false };
  return {
    valid: true,
    name: license.invite?.name ?? '',
    status: publicStatus(license.status),
    whiteLabel: !!license.whiteLabel,
    capUsd: license.invite?.capUsd ?? 0,
  };
}
