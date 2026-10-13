import admin from 'firebase-admin';

// Initialize Firebase Admin SDK.
// A full service-account JSON (stringified) can be provided via the
// FIREBASE_SERVICE_ACCOUNT secret to enable privileged operations
// (disabling/deleting auth users, admin Firestore access that bypasses rules).
let firebaseAdmin: admin.app.App;

function loadServiceAccountCredential(): admin.credential.Credential | undefined {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return admin.credential.cert(parsed as admin.ServiceAccount);
  } catch (error) {
    console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT secret:', (error as Error).message);
    return undefined;
  }
}

try {
  if (!admin.apps.length) {
    const credential = loadServiceAccountCredential();
    firebaseAdmin = admin.initializeApp({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'ai-citation-51aba',
      ...(credential ? { credential } : {}),
    });
    console.log(
      credential
        ? '✅ Firebase Admin initialized with service account (full privileges)'
        : '✅ Firebase Admin initialized with application default credentials'
    );
  } else {
    firebaseAdmin = admin.app();
  }
} catch (error) {
  console.error('❌ Firebase Admin initialization error:', error);
  throw error;
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
export default firebaseAdmin;

