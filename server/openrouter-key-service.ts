import 'dotenv/config';
import { initializeApp, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

// Initialize Firebase client SDK
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
};

let db: any;
try {
  const app = initializeApp(firebaseConfig, 'openrouter-key-service');
  db = getFirestore(app);
} catch (e: any) {
  if (e.code === 'app/duplicate-app') {
    const app = getApp('openrouter-key-service');
    db = getFirestore(app);
  } else {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
}

/**
 * Read a user's Firestore doc and return their BYOK OpenRouter key, if any.
 * New docs store it under `openRouterApiKey`. Older docs (written before this
 * field was renamed from the legacy `perplexityApiKey` name) may still only
 * have the old field — fall back to it so existing AppSumo users don't lose
 * their saved key.
 */
function readUserOpenRouterKey(userData: any): string | undefined {
  return userData?.openRouterApiKey || userData?.perplexityApiKey || undefined;
}

/**
 * Get the correct OpenRouter API key for a user.
 * AppSumo lifetime users use their own key (BYOK), others use the platform key.
 */
export async function getOpenRouterApiKeyForUser(userId?: string, knownPlan?: string): Promise<string> {
  // When the caller already knows this is a lifetime user, enforce BYOK deterministically.
  // We must never leak the platform key for them — not even if the Firestore read fails.
  const isKnownLifetime = knownPlan === 'lifetime';

  // If no userId provided, use platform OpenRouter key
  if (!userId || userId === 'anonymous') {
    const platformKey = process.env.OPENROUTER_API_KEY;
    if (!platformKey) {
      throw new Error('Platform API key not configured. Set OPENROUTER_API_KEY.');
    }
    console.log('🔑 Using platform API key');
    return platformKey;
  }

  try {
    // Get user from Firestore
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      if (isKnownLifetime) {
        console.log('🚫 Lifetime user (caller-confirmed) doc missing — BYOK required (no platform fallback)');
        throw new Error('APPSUMO_KEY_REQUIRED: Lifetime users must add their own OpenRouter key in Profile → API Configuration before running audits.');
      }
      console.log('⚠️ User not found, using platform key');
      const platformKey = process.env.OPENROUTER_API_KEY;
      if (!platformKey) {
        throw new Error('Platform API key not configured');
      }
      return platformKey;
    }

    const userData = userDoc.data();

    // Check if AppSumo lifetime user (stored plan OR caller-confirmed plan)
    if (userData.subscriptionPlan === 'lifetime' || isKnownLifetime) {
      console.log('🎁 AppSumo lifetime user detected');

      // Check if user has their own key
      const userKey = readUserOpenRouterKey(userData);
      if (userKey) {
        console.log('✅ Using lifetime user\'s own OpenRouter key');
        return userKey;
      }

      // BYOK ENFORCED: Lifetime/AppSumo users must bring their own OpenRouter key.
      // We never fall back to the platform key for them — a one-time LTD purchase
      // must not run indefinitely on our own paid key.
      console.log('🚫 Lifetime user has no API key — BYOK required (no platform fallback)');
      throw new Error('APPSUMO_KEY_REQUIRED: Lifetime users must add their own OpenRouter key in Profile → API Configuration before running audits.');
    }

    // All other users (free, starter, pro, enterprise) - use platform key
    console.log(`🔑 Using platform key for ${userData.subscriptionPlan} user`);
    const platformKey = process.env.OPENROUTER_API_KEY;
    if (!platformKey) {
      throw new Error('Platform API key not configured');
    }
    return platformKey;
  } catch (error: any) {
    // If it's the AppSumo key required error, re-throw it
    if (error.message?.includes('APPSUMO_KEY_REQUIRED')) {
      throw error;
    }

    // For a caller-confirmed lifetime user, fail closed — never leak the platform key,
    // even on a transient Firestore error.
    if (isKnownLifetime) {
      console.error('🚫 Error getting lifetime user key — failing closed (no platform fallback):', error.message);
      throw new Error('APPSUMO_KEY_REQUIRED: Lifetime users must add their own OpenRouter key in Profile → API Configuration before running audits.');
    }

    // For other errors, fall back to platform key
    console.error('⚠️ Error getting user key, falling back to platform key:', error.message);
    const platformKey = process.env.OPENROUTER_API_KEY;
    if (!platformKey) {
      throw new Error('Platform API key not configured');
    }
    return platformKey;
  }
}

/**
 * Validate if an OpenRouter API key works
 */
export async function validateOpenRouterApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });

    return response.ok || response.status === 200;
  } catch (error) {
    console.error('API key validation error:', error);
    return false;
  }
}
