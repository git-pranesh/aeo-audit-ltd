// Dev helper: toggle white-label on the license of a given email (used for demo recordings).
// Usage: npx tsx scripts/demo-whitelabel.ts <email> <on|off>
import 'dotenv/config';
import { adminDb as db } from '../server/firebase-admin';
import { setLicenseWhiteLabel } from '../server/services/license-service';

const [email, mode] = process.argv.slice(2);
const users = await db.collection('users').where('email', '==', email).limit(1).get();
const licenseId = users.docs[0]?.get('entitlement.licenseId');
if (!licenseId) throw new Error(`No license found for ${email}`);
const updated = await setLicenseWhiteLabel(licenseId, mode === 'on');
console.log(`${email}: whiteLabel=${updated?.whiteLabel}`);
