/**
 * One-time migration from the SaaS data model to the LTD model.
 * Safe to re-run (idempotent). Dry run by default:
 *
 *   FIREBASE_SERVICE_ACCOUNT='{...}' KEY_ENCRYPTION_SECRET=... npx tsx scripts/migrate-legacy.ts          # report only
 *   FIREBASE_SERVICE_ACCOUNT='{...}' KEY_ENCRYPTION_SECRET=... npx tsx scripts/migrate-legacy.ts --apply  # write
 *
 *  1. users with subscriptionPlan == 'lifetime'  → license doc `legacy_<uid>` + entitlement
 *  2. plaintext openRouterApiKey / perplexityApiKey → encrypted openRouterKey; plaintext deleted
 *  3. unredeemed codes in the legacy `appsumo` collection → hashed licenses (channel: marketplace)
 */

import 'dotenv/config';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../server/firebase-admin';
import { encryptSecret } from '../server/security/encryption';
import { hashCode, normalizeCode } from '../server/services/license-service';

const apply = process.argv.includes('--apply');
const now = new Date().toISOString();

async function main() {
  let licensed = 0;
  let keys = 0;
  let codes = 0;

  const users = await adminDb.collection('users').get();
  for (const doc of users.docs) {
    const u = doc.data();
    const updates: Record<string, unknown> = {};

    if (u.subscriptionPlan === 'lifetime' && !u.entitlement) {
      const licenseId = `legacy_${doc.id}`;
      const whiteLabel = false;
      if (apply) {
        await adminDb.collection('licenses').doc(licenseId).set({
          product: 'lifetime', whiteLabel, channel: 'marketplace', status: 'active',
          activatedBy: doc.id, activatedAt: now, createdAt: now, note: 'migrated from SaaS lifetime plan',
          ...(u.appSumoCode ? { codeHint: normalizeCode(u.appSumoCode).slice(-4) } : {}),
        }, { merge: true });
      }
      updates.entitlement = { product: 'lifetime', whiteLabel, status: 'active', licenseId, channel: 'marketplace', activatedAt: now };
      licensed++;
    }

    const plaintextKey: string | undefined = u.openRouterApiKey || u.perplexityApiKey;
    if (plaintextKey && !u.openRouterKey) {
      updates.openRouterKey = { ...encryptSecret(plaintextKey), last4: plaintextKey.slice(-4), updatedAt: now };
      keys++;
    }
    if ('openRouterApiKey' in u) updates.openRouterApiKey = FieldValue.delete();
    if ('perplexityApiKey' in u) updates.perplexityApiKey = FieldValue.delete();
    if ('isAdmin' in u) updates.isAdmin = FieldValue.delete(); // admin is now ADMIN_EMAILS only

    if (apply && Object.keys(updates).length) await doc.ref.set(updates, { merge: true });
  }

  const legacyCodes = await adminDb.collection('appsumo').get();
  for (const doc of legacyCodes.docs) {
    const c = doc.data();
    if (!c.code || c.isRedeemed) continue;
    const id = hashCode(c.code);
    if (apply) {
      await adminDb.collection('licenses').doc(id).set({
        product: 'lifetime', whiteLabel: false, channel: 'marketplace', status: 'available',
        codeHash: id, codeHint: normalizeCode(c.code).slice(-4), createdAt: now, note: 'imported from appsumo collection',
      }, { merge: true });
    }
    codes++;
  }

  console.log(`${apply ? 'Migrated' : 'Would migrate'}: ${licensed} lifetime users, ${keys} plaintext keys, ${codes} unredeemed codes.`);
  if (!apply) console.log('Re-run with --apply to write changes.');
}

main().then(() => process.exit(0), (err) => {
  console.error(err);
  process.exit(1);
});
