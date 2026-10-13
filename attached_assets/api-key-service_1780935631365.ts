/**
 * API Key Service
 *
 * Issues, validates, and tracks usage of public API keys (cr_live_xxxx).
 * Keys are stored in Firestore collection `api_keys`.
 * Usage is tracked per key, reset monthly.
 *
 * Plan limits (calls/month):
 *   free:         50
 *   starter:     500
 *   professional: 5,000
 *   enterprise:  20,000
 */

import crypto from 'crypto';

// ─── Plan limits ─────────────────────────────────────────────────────────────

export const API_PLAN_LIMITS: Record<string, number> = {
  free: 50,
  starter: 500,
  professional: 5000,
  enterprise: 20000,
};

export const API_PLAN_NAMES: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiKeyRecord {
  key: string;                    // cr_live_xxxx
  userId: string;                 // Firebase UID
  userEmail: string;
  plan: string;                   // free | starter | professional | enterprise
  dodoSubscriptionId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  callsThisMonth: number;
  callsTotal: number;
  resetAt: string;                // ISO date when monthly counter resets
  active: boolean;
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

async function getDb() {
  const { initializeApp, getApp } = await import('firebase/app');
  const { getFirestore } = await import('firebase/firestore');
  try {
    return getFirestore(getApp('api-keys-app'));
  } catch {
    return getFirestore(initializeApp({
      apiKey: process.env.VITE_FIREBASE_API_KEY,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    }, 'api-keys-app'));
  }
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Issue a new API key for a user.
 * One key per user — if they already have one, return it.
 */
export async function issueApiKey(
  userId: string,
  userEmail: string,
  plan: string = 'free'
): Promise<ApiKeyRecord> {
  const { collection, query, where, getDocs, doc, setDoc } = await import('firebase/firestore');
  const db = await getDb();

  // Check if user already has a key
  const existing = await getUserApiKey(userId);
  if (existing) return existing;

  // Generate key: cr_live_ + 32 random hex chars
  const raw = crypto.randomBytes(16).toString('hex');
  const key = `cr_live_${raw}`;

  const now = new Date();
  const resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const record: ApiKeyRecord = {
    key,
    userId,
    userEmail,
    plan,
    dodoSubscriptionId: null,
    createdAt: now.toISOString(),
    lastUsedAt: null,
    callsThisMonth: 0,
    callsTotal: 0,
    resetAt,
    active: true,
  };

  await setDoc(doc(db, 'api_keys', key), record);
  // Also index by userId for fast lookup
  await setDoc(doc(db, 'api_keys_by_user', userId), { key, plan });

  console.log(`🔑 API key issued: ${key} for ${userEmail} (${plan})`);
  return record;
}

/**
 * Get a user's API key record (by userId).
 */
export async function getUserApiKey(userId: string): Promise<ApiKeyRecord | null> {
  const { doc, getDoc } = await import('firebase/firestore');
  const db = await getDb();

  const indexDoc = await getDoc(doc(db, 'api_keys_by_user', userId));
  if (!indexDoc.exists()) return null;

  const { key } = indexDoc.data() as { key: string };
  const keyDoc = await getDoc(doc(db, 'api_keys', key));
  if (!keyDoc.exists()) return null;

  return keyDoc.data() as ApiKeyRecord;
}

/**
 * Validate an API key from an incoming request.
 * Returns the record if valid, null if not found or inactive.
 */
export async function validateApiKey(key: string): Promise<ApiKeyRecord | null> {
  if (!key || !key.startsWith('cr_live_')) return null;

  const { doc, getDoc } = await import('firebase/firestore');
  const db = await getDb();

  const keyDoc = await getDoc(doc(db, 'api_keys', key));
  if (!keyDoc.exists()) return null;

  const record = keyDoc.data() as ApiKeyRecord;
  if (!record.active) return null;

  return record;
}

/**
 * Check if a key has quota remaining. Resets monthly counter if needed.
 * Returns { allowed: boolean, remaining: number, limit: number }
 */
export async function checkQuota(key: string): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  plan: string;
}> {
  const record = await validateApiKey(key);
  if (!record) return { allowed: false, remaining: 0, limit: 0, plan: 'none' };

  const limit = API_PLAN_LIMITS[record.plan] ?? API_PLAN_LIMITS.free;

  // Reset monthly counter if needed
  const now = new Date();
  const resetAt = new Date(record.resetAt);
  if (now >= resetAt) {
    await resetMonthlyCounter(key);
    record.callsThisMonth = 0;
    record.resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  }

  const remaining = Math.max(0, limit - record.callsThisMonth);
  return {
    allowed: record.callsThisMonth < limit,
    remaining,
    limit,
    plan: record.plan,
  };
}

/**
 * Increment usage counter after a successful API call.
 */
export async function incrementUsage(key: string): Promise<void> {
  try {
    const { doc, updateDoc, increment } = await import('firebase/firestore');
    const db = await getDb();
    await updateDoc(doc(db, 'api_keys', key), {
      callsThisMonth: increment(1),
      callsTotal: increment(1),
      lastUsedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn(`⚠️ Failed to increment usage for key ${key}:`, err?.message);
  }
}

/**
 * Reset monthly counter (called automatically when resetAt is passed).
 */
async function resetMonthlyCounter(key: string): Promise<void> {
  try {
    const { doc, updateDoc } = await import('firebase/firestore');
    const db = await getDb();
    const now = new Date();
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    await updateDoc(doc(db, 'api_keys', key), {
      callsThisMonth: 0,
      resetAt: nextReset,
    });
    console.log(`🔄 Monthly counter reset for key ${key}`);
  } catch (err: any) {
    console.warn(`⚠️ Failed to reset counter for key ${key}:`, err?.message);
  }
}

/**
 * Update a key's plan after Dodo subscription event.
 * Called from the Dodo webhook handler.
 */
export async function updateApiKeyPlan(
  userId: string,
  plan: string,
  dodoSubscriptionId: string
): Promise<void> {
  try {
    const record = await getUserApiKey(userId);
    if (!record) {
      console.warn(`⚠️ updateApiKeyPlan: no key found for userId ${userId}`);
      return;
    }

    const { doc, updateDoc } = await import('firebase/firestore');
    const db = await getDb();
    await updateDoc(doc(db, 'api_keys', record.key), {
      plan,
      dodoSubscriptionId,
    });
    // Update index
    await updateDoc(doc(db, 'api_keys_by_user', userId), { plan });

    console.log(`✅ API key plan updated: ${record.key} → ${plan} (sub: ${dodoSubscriptionId})`);
  } catch (err: any) {
    console.warn(`⚠️ Failed to update API key plan for userId ${userId}:`, err?.message);
  }
}

/**
 * Deactivate a key on subscription cancellation.
 * Downgrades to free rather than fully deleting.
 */
export async function downgradeApiKeyToFree(userId: string): Promise<void> {
  try {
    const record = await getUserApiKey(userId);
    if (!record) return;

    const { doc, updateDoc } = await import('firebase/firestore');
    const db = await getDb();
    await updateDoc(doc(db, 'api_keys', record.key), {
      plan: 'free',
      dodoSubscriptionId: null,
    });
    await updateDoc(doc(db, 'api_keys_by_user', userId), { plan: 'free' });

    console.log(`⬇️ API key downgraded to free: ${record.key}`);
  } catch (err: any) {
    console.warn(`⚠️ Failed to downgrade API key for userId ${userId}:`, err?.message);
  }
}
