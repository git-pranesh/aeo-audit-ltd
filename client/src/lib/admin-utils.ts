import { userDb, type UserDocument } from './firestore-utils';

// Check if user is admin
export async function isUserAdmin(uid: string): Promise<boolean> {
  try {
    const userDoc = await userDb.getUser(uid);
    return userDoc?.isAdmin || false;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// Admin emails (hardcoded for now - move to env or Firestore later)
export const ADMIN_EMAILS = [
  'hello@pressense.co'
];

// Check if email is admin email
export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

// Set user as admin (to be called when admin signs up)
export async function setUserAsAdmin(uid: string): Promise<void> {
  try {
    await userDb.updateUser(uid, { isAdmin: true });
    console.log('✅ User set as admin:', uid);
  } catch (error) {
    console.error('Error setting admin status:', error);
    throw error;
  }
}

