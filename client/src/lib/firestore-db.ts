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
  authProvider: 'google' | 'email';
  subscriptionPlan: 'free' | 'starter' | 'pro' | 'enterprise' | 'lifetime';
  subscriptionStatus: 'active' | 'cancelled' | 'expired';
  subscriptionStartDate: Timestamp;
  subscriptionEndDate: Timestamp | null;
  stripeCustomerId: string | null;
  auditsUsedThisMonth: number;
  totalAuditsRun: number;
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  appSumoCode: string | null;
  isAdmin: boolean;
}

// Audit document type
export interface AuditDocument {
  auditId: string;
  userId: string;
  websiteUrl: string;
  auditData: AuditData;
  generatedAt: Timestamp;
  userPlanAtTime: string;
  creditsUsed: number;
}

// User database operations
export const userDb = {
  // Create or update user document
  async createUser(uid: string, data: Partial<UserDocument>): Promise<void> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    const now = Timestamp.now();
    
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
      appSumoCode: null,
      ...data
    };
    
    await setDoc(userRef, userData, { merge: true });
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
    const auditRef = await addDoc(collection(db, COLLECTIONS.AUDITS), {
      userId,
      websiteUrl,
      auditData,
      generatedAt: Timestamp.now(),
      userPlanAtTime: userPlan,
      creditsUsed: 1
    });
    
    return auditRef.id;
  },

  // Get user's audit history
  async getUserAudits(userId: string, limitCount: number = 10): Promise<AuditDocument[]> {
    const auditsRef = collection(db, COLLECTIONS.AUDITS);
    const q = query(
      auditsRef,
      where('userId', '==', userId),
      orderBy('generatedAt', 'desc'),
      limit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
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

// Plan limits configuration
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

// Check if user can run audit
export async function canUserRunAudit(uid: string): Promise<{ allowed: boolean; reason?: string }> {
  const user = await userDb.getUser(uid);
  
  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }

  const planLimit = PLAN_LIMITS[user.subscriptionPlan];
  
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

