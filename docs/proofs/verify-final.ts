/**
 * Task #18 — Final reconciliation runtime proof.
 *
 * Verifies the one remaining runtime claim that needs live data:
 *   PB-05 — Lifetime audits = unlimited (-1) in system/planSettings.
 *
 * Reads system/planSettings directly via the Firebase Admin SDK
 * (bypasses security rules; requires FIREBASE_SERVICE_ACCOUNT).
 *
 * Run: npx tsx docs/proofs/verify-final.ts
 */
import { adminDb } from '../../server/firebase-admin';

async function main() {
  const snap = await adminDb.collection('system').doc('planSettings').get();
  if (!snap.exists) {
    console.log('❌ system/planSettings document does not exist');
    process.exit(1);
  }
  const data = snap.data() as Record<string, any>;
  const perPlan: Record<string, unknown> = {};
  for (const plan of ['free', 'starter', 'pro', 'enterprise', 'lifetime']) {
    perPlan[plan] = data?.[plan]?.auditsPerMonth;
  }
  console.log('system/planSettings auditsPerMonth per plan:', JSON.stringify(perPlan));
  const lifetime = data?.lifetime?.auditsPerMonth;
  console.log(`PB-05 lifetime auditsPerMonth = ${lifetime} (expected -1 = unlimited)`);
  if (lifetime === -1) {
    console.log('✅ PB-05 PASS');
    process.exit(0);
  }
  console.log(`❌ PB-05 MISMATCH (got ${lifetime})`);
  process.exit(1);
}

main().catch((e) => {
  console.error('proof error:', e);
  process.exit(1);
});
