---
name: Firebase Admin privileges & data model
description: Why admin user/audit operations need a service account, and how audits are stored.
---

## Admin SDK needs FIREBASE_SERVICE_ACCOUNT
`server/firebase-admin.ts` initializes with only `projectId` unless the `FIREBASE_SERVICE_ACCOUNT` secret (full service-account JSON, stringified) is present. Without it the Admin SDK **silently degrades**: `verifyIdToken` still works (auth middleware is fine), but privileged calls (`listUsers`, `deleteUsers`, `updateUser({disabled})`, and admin Firestore reads/writes that bypass rules) fail with `app/invalid-credential` / "Could not load the default credentials".
**Why:** the app's normal reads/writes go through the *client* SDK (firebase/firestore with apiKey), so the missing service account is invisible until you attempt an admin-only operation.
**How to apply:** any user-management or rules-bypassing data operation must go through `adminAuth`/`adminDb` AND requires the secret to be set. To disable a login: `adminAuth.updateUser(uid, {disabled:true})` (reversible). To delete: `adminAuth.deleteUsers([uids])`.

## Data model for cleanup
- Users: `users/{uid}` Firestore docs; login identity is a separate Firebase Auth account with the same uid. Deleting a user fully = delete the Firestore doc AND the Auth account (Firestore-doc-only leaves the login alive; some Firestore docs have no matching Auth account).
- Audits: **top-level** `audits/{auditId}` collection with owner field `userId` (also `userEmail`, `userPlanAtTime`). Subcollections per audit: `scoreHistory`, `citationHistory`.
- Use `adminDb.recursiveDelete(ref)` to remove a doc/collection with its subcollections in one call.
