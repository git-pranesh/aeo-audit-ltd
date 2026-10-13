import { auth } from './firebase';
import { 
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  type User
} from 'firebase/auth';
import { userDb } from './firestore-utils';
import { isAdminEmail } from './admin-utils';

// Google OAuth provider - exactly like working project
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Authentication service
export const authService = {
  // Google Sign In - Using popup (like working project)
  async signInWithGoogle(): Promise<User> {
    try {
      // Direct signInWithPopup - returns UserCredential
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Create or update user in Firestore
      const isAdmin = isAdminEmail(user.email!);
      const isNewUser = await userDb.createUser(user.uid, {
        email: user.email!,
        displayName: user.displayName || user.email!.split('@')[0],
        photoURL: user.photoURL,
        authProvider: 'google',
        isAdmin: isAdmin
      });
      
      // Send welcome email for new users
      if (isNewUser) {
        try {
          await fetch('/api/auth/send-welcome-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userEmail: user.email,
              userName: user.displayName || user.email!.split('@')[0]
            })
          });
        } catch (e) {
          // Non-critical
        }
      }
      
      await userDb.updateLastLogin(user.uid);
      return user;
    } catch (error: any) {
      console.error('Google sign in error:', error.code, error.message);
      
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Sign-in cancelled.');
      } else if (error.code === 'auth/popup-blocked') {
        throw new Error('Popup was blocked. Please allow popups for this site.');
      }
      
      throw new Error(error.message || 'Failed to sign in with Google');
    }
  },

  // Email/Password Sign Up
  async signUpWithEmail(email: string, password: string, displayName: string): Promise<User> {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      const user = result.user;
      
      await updateProfile(user, { displayName });
      
      const isAdmin = isAdminEmail(user.email!);
      await userDb.createUser(user.uid, {
        email: user.email!,
        displayName: displayName,
        photoURL: null,
        authProvider: 'email',
        isAdmin: isAdmin
      });

      try {
        await fetch('/api/auth/send-welcome-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userEmail: user.email, userName: displayName })
        });
      } catch (e) {
        // Non-critical
      }
      
      return user;
    } catch (error: any) {
      console.error('Email signup error:', error.code);
      
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('This email is already registered.');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('Password is too weak. Use at least 6 characters.');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address.');
      }
      
      throw new Error(error.message || 'Failed to create account');
    }
  },

  // Email/Password Sign In
  async signInWithEmail(email: string, password: string): Promise<User> {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await userDb.updateLastLogin(result.user.uid);
      return result.user;
    } catch (error: any) {
      console.error('Email signin error:', error.code);
      
      if (error.code === 'auth/user-not-found') {
        throw new Error('No account found with this email.');
      } else if (error.code === 'auth/wrong-password') {
        throw new Error('Incorrect password.');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address.');
      }
      
      throw new Error(error.message || 'Failed to sign in');
    }
  },

  // Sign Out
  async signOut(): Promise<void> {
    await signOut(auth);
  },

  // Password Reset
  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        throw new Error('No account found with this email.');
      }
      throw new Error('Failed to send password reset email');
    }
  },

  // Get current user
  getCurrentUser(): User | null {
    return auth.currentUser;
  }
};
