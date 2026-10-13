/**
 * One-time migration: copy historical usage-tracking data out of the legacy
 * "perplexity_*" Firestore collections/fields into their "openrouter_*"
 * replacements (see server/openrouter-tracker.ts for the naming rationale).
 *
 * This only migrates tracking/analytics data used by the admin usage
 * dashboard. It does not touch the unrelated BYOK key fields
 * (openRouterApiKey / legacy perplexityApiKey) or any AI-platform-name
 * strings such as "perplexity" used for ChatGPT/Perplexity/Gemini/Claude
 * citation scoring - those are intentional and out of scope here.
 *
 * Safe to run multiple times (idempotent merges). Does not delete the old
 * collections/fields, so nothing is lost if something needs re-running.
 *
 * Usage:
 *   npx tsx server/scripts/migrate-perplexity-to-openrouter.ts
 */
import { initializeApp, getApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID
};

let db: any;
try {
  const app = initializeApp(firebaseConfig, 'migration-app');
  db = getFirestore(app);
} catch (e: any) {
  if (e.code === 'app/duplicate-app') {
    db = getFirestore(getApp('migration-app'));
  } else {
    db = getFirestore(initializeApp(firebaseConfig));
  }
}

async function migrateCalls() {
  const snapshot = await getDocs(collection(db, 'perplexity_calls'));
  let copied = 0;
  for (const callDoc of snapshot.docs) {
    await setDoc(doc(db, 'openrouter_calls', callDoc.id), callDoc.data(), { merge: true });
    copied++;
  }
  console.log(`✅ Migrated ${copied} call log(s) from perplexity_calls -> openrouter_calls`);
}

async function migrateStatsSubcollection(kind: 'dates' | 'months', parent: 'daily' | 'monthly') {
  const snapshot = await getDocs(collection(db, 'perplexity_stats', parent, kind));
  let copied = 0;
  for (const entryDoc of snapshot.docs) {
    await setDoc(doc(db, 'openrouter_stats', parent, kind, entryDoc.id), entryDoc.data(), { merge: true });
    copied++;
  }
  console.log(`✅ Migrated ${copied} ${parent} stat(s) (perplexity_stats/${parent}/${kind} -> openrouter_stats/${parent}/${kind})`);
}

async function migrateLifetimeStats() {
  const lifetimeRef = doc(db, 'perplexity_stats', 'overall', 'lifetime', 'all_time');
  const lifetimeDoc = await getDoc(lifetimeRef);
  if (lifetimeDoc.exists()) {
    await setDoc(doc(db, 'openrouter_stats', 'overall', 'lifetime', 'all_time'), lifetimeDoc.data(), { merge: true });
    console.log('✅ Migrated lifetime stats (perplexity_stats/overall -> openrouter_stats/overall)');
  } else {
    console.log('ℹ️ No legacy lifetime stats doc found, skipping.');
  }
}

async function migrateApiStatus() {
  const statusRef = doc(db, 'system', 'perplexityApiStatus');
  const statusDoc = await getDoc(statusRef);
  if (statusDoc.exists()) {
    await setDoc(doc(db, 'system', 'openRouterApiStatus'), statusDoc.data(), { merge: true });
    console.log('✅ Migrated system/perplexityApiStatus -> system/openRouterApiStatus');
  } else {
    console.log('ℹ️ No legacy API status doc found, skipping.');
  }
}

async function migrateAuditUsageField() {
  const snapshot = await getDocs(collection(db, 'audits'));
  let copied = 0;
  for (const auditDoc of snapshot.docs) {
    const data = auditDoc.data();
    if (data.perplexityUsage && !data.openRouterUsage) {
      await setDoc(auditDoc.ref, { openRouterUsage: data.perplexityUsage }, { merge: true });
      copied++;
    }
  }
  console.log(`✅ Backfilled openRouterUsage on ${copied} audit doc(s) from legacy perplexityUsage field`);
}

async function main() {
  console.log('Starting perplexity_* -> openrouter_* migration...');
  await migrateCalls();
  await migrateStatsSubcollection('dates', 'daily');
  await migrateStatsSubcollection('months', 'monthly');
  await migrateLifetimeStats();
  await migrateApiStatus();
  await migrateAuditUsageField();
  console.log('Done. Legacy collections/fields were left in place (not deleted) in case anything needs re-running.');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
