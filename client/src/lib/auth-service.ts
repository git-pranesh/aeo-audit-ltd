import { auth } from "./firebase";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

function friendly(error: any, fallback: string): Error {
  const map: Record<string, string> = {
    "auth/popup-closed-by-user": "Sign-in cancelled.",
    "auth/popup-blocked": "Popup was blocked. Please allow popups for this site.",
    "auth/email-already-in-use": "This email is already registered. Try signing in.",
    "auth/weak-password": "Password is too weak. Use at least 8 characters.",
    "auth/invalid-email": "Invalid email address.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  };
  return new Error(map[error?.code] || error?.message || fallback);
}

// Account records are created server-side on first /api/me call.
export const authService = {
  async signInWithGoogle(): Promise<User> {
    try {
      return (await signInWithPopup(auth, googleProvider)).user;
    } catch (error) {
      throw friendly(error, "Failed to sign in with Google");
    }
  },

  async signUpWithEmail(email: string, password: string, displayName: string): Promise<User> {
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) await updateProfile(user, { displayName });
      // Verified email is required to auto-claim a license bought with this address.
      await sendEmailVerification(user).catch(() => {});
      return user;
    } catch (error) {
      throw friendly(error, "Failed to create account");
    }
  },

  async signInWithEmail(email: string, password: string): Promise<User> {
    try {
      return (await signInWithEmailAndPassword(auth, email, password)).user;
    } catch (error) {
      throw friendly(error, "Failed to sign in");
    }
  },

  async sendVerificationEmail(): Promise<void> {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  },

  async signOut(): Promise<void> {
    await signOut(auth);
  },

  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      throw friendly(error, "Failed to send password reset email");
    }
  },
};
