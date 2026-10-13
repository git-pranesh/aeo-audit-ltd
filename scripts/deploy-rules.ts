/**
 * Publishes firestore.rules with the Admin SDK (no firebase CLI needed):
 *   GOOGLE_APPLICATION_CREDENTIALS=sa.json npx tsx scripts/deploy-rules.ts
 */
import 'dotenv/config';
import fs from 'fs';
import firebaseAdmin from '../server/firebase-admin';

(async () => {
  const source = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const ruleset = await firebaseAdmin.securityRules().releaseFirestoreRulesetFromSource(source);
  console.log(`Published Firestore ruleset ${ruleset.name}`);
  const live = await firebaseAdmin.securityRules().getFirestoreRuleset();
  console.log(live.source[0].content.includes('allow read, write: if false') ? 'Verified: deny-all rules are live.' : 'WARNING: live rules differ!');
  process.exit(0);
})().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
