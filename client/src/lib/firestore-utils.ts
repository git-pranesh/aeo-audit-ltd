import { db } from './firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  getDocs,
  addDoc,
  Timestamp,
  type DocumentData
} from 'firebase/firestore';
import type { AuditData } from '@shared/schema';

// Collection names
export const COLLECTIONS = {
  USERS: 'users',
  AUDITS: 'audits',
  SUBSCRIPTIONS: 'subscriptions',
  COUPONS: 'coupons',
  APPSUMO_CODES: 'appsumo'
};

// User document type
export interface UserDocument {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  customPhotoURL?: string | null; // User-uploaded photo (base64)
  bio?: string;
  authProvider: 'google' | 'email';
  subscriptionPlan: 'free' | 'starter' | 'pro' | 'enterprise' | 'lifetime';
  subscriptionStatus: 'active' | 'cancelled' | 'expired';
  subscriptionStartDate: Timestamp;
  subscriptionEndDate: Timestamp | null;
  billingPeriod?: 'monthly' | 'annual';
  stripeCustomerId: string | null;
  dodoCustomerId: string | null;
  dodoSubscriptionId: string | null;
  auditsUsedThisMonth: number;
  totalAuditsRun: number;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  appSumoCode: string | null;
  isAdmin: boolean;
  openRouterApiKey?: string | null;
  openRouterKeySource?: 'PLATFORM' | 'USER';
  /** @deprecated legacy field name, kept for reading pre-migration user docs. Use openRouterApiKey. */
  perplexityApiKey?: string | null;
  /** @deprecated legacy field name, kept for reading pre-migration user docs. Use openRouterKeySource. */
  perplexityKeySource?: 'PLATFORM' | 'USER';
  emailPreferences?: {
    marketing: boolean;
    productUpdates: boolean;
    auditCompleted: boolean;
  };
  pendingDowngrade?: {
    targetPlan: string;
    fromPlan: string;
    effectiveDate: Timestamp;
    scheduledAt: Timestamp;
  };
  pendingUpgrade?: {
    targetPlan: string;
    fromPlan: string;
    billingPeriod: 'monthly' | 'annual';
    scheduledAt: Timestamp;
  };
}

// Audit document type
export interface AuditDocument {
  auditId: string;
  userId: string;
  websiteUrl: string;
  auditData: AuditData;
  generatedAt: Timestamp | string;
  userPlanAtTime: string;
  creditsUsed: number;
  lastCitationRefreshAt?: string | null;
  lastScheduledCitationAt?: string | null;
  checklist?: Array<{
    actionId: string;
    title: string;
    priority: string;
    targetPlatform: string;
    estimatedImpact: string;
    difficulty: string;
    completed: boolean;
    completedAt: string | null;
    status?: 'carried_over' | 'new';
  }>;
  checklistArchive?: Array<{
    actionId: string;
    title: string;
    priority: string;
    targetPlatform: string;
    completed: boolean;
    completedAt: string | null;
    resolvedAt: string;
    retiredReason: string;
  }>;
  checklistMeta?: {
    carriedOverCount: number;
    carriedOverCompletedCount: number;
    newCount: number;
    resolvedCount: number;
    lastMergedAt: string;
  };
  status?: string;
  lastReauditAt?: string;
  // Admin-only public share link fields (set via /api/admin/audits/:id/share)
  isPublic?: boolean;
  shareToken?: string | null;
  sharedAt?: string | null;
  revokedAt?: string | null;
}

// User database operations
export const userDb = {
  // Create or update user document
  async createUser(uid: string, data: Partial<UserDocument>): Promise<boolean> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    const now = Timestamp.now();
    
    // Check if user already exists
    const existingUser = await getDoc(userRef);
    const isNewUser = !existingUser.exists();
    
    const userData: Partial<UserDocument> = {
      uid,
      subscriptionPlan: 'free',
      subscriptionStatus: 'active',
      subscriptionStartDate: now,
      subscriptionEndDate: null,
      auditsUsedThisMonth: 0,
      totalAuditsRun: 0,
      createdAt: now,
      lastLoginAt: now,
      isAdmin: false,
      stripeCustomerId: null,
      dodoCustomerId: null,
      dodoSubscriptionId: null,
      appSumoCode: null,
      ...data
    };
    
    await setDoc(userRef, userData, { merge: true });
    
    // Return true if this was a new user creation
    return isNewUser;
  },

  // Get user document
  async getUser(uid: string): Promise<UserDocument | null> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return userSnap.data() as UserDocument;
    }
    return null;
  },

  // Update user document
  async updateUser(uid: string, data: Partial<UserDocument>): Promise<void> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    await updateDoc(userRef, data as DocumentData);
  },

  // Update last login time
  async updateLastLogin(uid: string): Promise<void> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    await updateDoc(userRef, {
      lastLoginAt: Timestamp.now()
    });
  },

  // Delete user and all associated data
  async deleteUser(uid: string): Promise<void> {
    const { deleteDoc } = await import('firebase/firestore');
    
    // Delete user document
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    await deleteDoc(userRef);
    
    // Delete all user audits
    const auditsQuery = query(
      collection(db, COLLECTIONS.AUDITS),
      where('userId', '==', uid)
    );
    const auditsSnapshot = await getDocs(auditsQuery);
    
    const deletePromises = auditsSnapshot.docs.map(auditDoc => 
      deleteDoc(doc(db, COLLECTIONS.AUDITS, auditDoc.id))
    );
    
    await Promise.all(deletePromises);
  },

  // Increment audit usage
  async incrementAuditUsage(uid: string): Promise<void> {
    const user = await this.getUser(uid);
    if (user) {
      await updateDoc(doc(db, COLLECTIONS.USERS, uid), {
        auditsUsedThisMonth: user.auditsUsedThisMonth + 1,
        totalAuditsRun: user.totalAuditsRun + 1
      });
    }
  }
};

// Audit database operations
export const auditDb = {
  // Save audit result
  async saveAudit(userId: string, websiteUrl: string, auditData: AuditData, userPlan: string): Promise<string> {
    console.log('💾 Saving audit to Firestore...', { userId, websiteUrl, userPlan });
    
    const auditRef = await addDoc(collection(db, COLLECTIONS.AUDITS), {
      userId,
      websiteUrl,
      auditData,
      generatedAt: Timestamp.now(),
      userPlanAtTime: userPlan,
      creditsUsed: 1
    });
    
    console.log('✅ Audit saved with ID:', auditRef.id);
    return auditRef.id;
  },

  // Get user's audit history
  async getUserAudits(userId: string, limitCount: number = 10): Promise<AuditDocument[]> {
    console.log('📖 Fetching audit history for user:', userId);
    
    const auditsRef = collection(db, COLLECTIONS.AUDITS);
    const q = query(
      auditsRef,
      where('userId', '==', userId),
      orderBy('generatedAt', 'desc'),
      limit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
    console.log('✅ Found audits:', querySnapshot.docs.length);
    
    return querySnapshot.docs.map(doc => ({
      auditId: doc.id,
      ...doc.data()
    } as AuditDocument));
  },

  // Get specific audit
  async getAudit(auditId: string): Promise<AuditDocument | null> {
    const auditRef = doc(db, COLLECTIONS.AUDITS, auditId);
    const auditSnap = await getDoc(auditRef);
    
    if (auditSnap.exists()) {
      return {
        auditId: auditSnap.id,
        ...auditSnap.data()
      } as AuditDocument;
    }
    return null;
  }
};

// Score history types and operations
export interface ScoreHistoryEntry {
  runId: string;
  runAt: string;
  overallScore: number;
  letterGrade: string;
  platformScores: {
    chatgpt: number;
    perplexity: number;
    gemini: number;
    claude: number;
  };
  type: 'initial' | 'reaudit';
}

export const scoreHistoryDb = {
  async getScoreHistory(auditId: string): Promise<ScoreHistoryEntry[]> {
    const historyRef = collection(db, COLLECTIONS.AUDITS, auditId, 'scoreHistory');
    const q = query(historyRef, orderBy('runAt', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as ScoreHistoryEntry);
  },
};

export interface CitationHistoryEntry {
  runId: string;
  runAt: string;
  trigger: 'initial' | 'manual' | 'reaudit' | 'scheduled';
  mentionRate: number;
  totalPromptsChecked: number;
  mentionedCount: number;
  topCompetitorsCited: Array<{ name: string; timesFound: number }>;
  promptSummaries: Array<{
    prompt: string;
    mentioned: boolean;
    competitorsMentioned: string[];
  }>;
}

export const citationHistoryDb = {
  async getCitationHistory(auditId: string): Promise<CitationHistoryEntry[]> {
    const historyRef = collection(db, COLLECTIONS.AUDITS, auditId, 'citationHistory');
    const q = query(historyRef, orderBy('runAt', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as CitationHistoryEntry);
  },
};

// Plan limits configuration (defaults - will be overridden by Firestore settings)
export const PLAN_LIMITS = {
  free: {
    auditsPerMonth: 1,
    topicsPerCategory: 3,
    features: ['basic_audit', 'pdf_export']
  },
  starter: {
    auditsPerMonth: 10,
    topicsPerCategory: 12,
    features: ['basic_audit', 'pdf_export', 'csv_export', 'enhanced_topics']
  },
  pro: {
    auditsPerMonth: -1, // unlimited
    topicsPerCategory: 25,
    features: ['basic_audit', 'pdf_export', 'csv_export', 'enhanced_topics', 'competitor_analysis', 'priority_support']
  },
  enterprise: {
    auditsPerMonth: -1, // unlimited
    topicsPerCategory: 100,
    features: ['basic_audit', 'pdf_export', 'csv_export', 'enhanced_topics', 'competitor_analysis', 'white_label', 'api_access', 'priority_support']
  },
  lifetime: {
    auditsPerMonth: -1, // unlimited
    topicsPerCategory: 100,
    features: ['basic_audit', 'pdf_export', 'csv_export', 'enhanced_topics', 'competitor_analysis', 'white_label', 'api_access', 'priority_support']
  }
};

// Get dynamic plan limits from Firestore (with caching)
let cachedPlanLimits = PLAN_LIMITS;
let lastPlanFetch = 0;
const PLAN_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getDynamicPlanLimits() {
  const now = Date.now();
  
  // Return cached if still valid
  if (cachedPlanLimits !== PLAN_LIMITS && (now - lastPlanFetch) < PLAN_CACHE_DURATION) {
    return cachedPlanLimits;
  }

  try {
    const settingsRef = doc(db, 'system', 'planSettings');
    const settingsDoc = await getDoc(settingsRef);
    
    if (settingsDoc.exists()) {
      cachedPlanLimits = settingsDoc.data() as any;
      lastPlanFetch = now;
      console.log('✅ Loaded dynamic plan limits from Firestore');
      return cachedPlanLimits;
    }
  } catch (error) {
    console.error('Error loading plan limits:', error);
  }

  // Return defaults if Firestore fails
  return PLAN_LIMITS;
}

// Check if user can run audit (uses dynamic limits)
export async function canUserRunAudit(uid: string): Promise<{ allowed: boolean; reason?: string }> {
  const user = await userDb.getUser(uid);
  
  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }

  // Get dynamic plan limits from Firestore
  const dynamicLimits = await getDynamicPlanLimits();
  const planLimit = dynamicLimits[user.subscriptionPlan];
  
  // Check if unlimited
  if (planLimit.auditsPerMonth === -1) {
    return { allowed: true };
  }

  // Check monthly limit
  if (user.auditsUsedThisMonth >= planLimit.auditsPerMonth) {
    return { 
      allowed: false, 
      reason: `You've reached your monthly limit of ${planLimit.auditsPerMonth} audits. Upgrade your plan for more audits.` 
    };
  }

  return { allowed: true };
}

// Get topic limit for user's plan
export function getTopicLimitForPlan(plan: string): number {
  return PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.topicsPerCategory || 3;
}

