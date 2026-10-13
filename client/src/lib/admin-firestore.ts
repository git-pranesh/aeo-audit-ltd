import { db } from './firebase';
import { 
  collection, 
  getDocs, 
  query,
  orderBy,
  limit,
  where,
  updateDoc,
  doc,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { COLLECTIONS, type UserDocument, type AuditDocument } from './firestore-utils';

// Admin-only database operations
export const adminDb = {
  // Get all users
  async getAllUsers(limitCount: number = 100): Promise<UserDocument[]> {
    console.log('📖 Admin: Fetching all users...');
    
    const usersRef = collection(db, COLLECTIONS.USERS);
    const q = query(
      usersRef,
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
    console.log('✅ Admin: Found users:', querySnapshot.docs.length);
    
    return querySnapshot.docs.map(doc => doc.data() as UserDocument);
  },

  // Get users by plan
  async getUsersByPlan(plan: string): Promise<UserDocument[]> {
    const usersRef = collection(db, COLLECTIONS.USERS);
    const q = query(
      usersRef,
      where('subscriptionPlan', '==', plan),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as UserDocument);
  },

  // Update user subscription
  async updateUserSubscription(
    uid: string, 
    plan: 'free' | 'starter' | 'pro' | 'enterprise' | 'lifetime',
    status: 'active' | 'cancelled' | 'expired'
  ): Promise<void> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    await updateDoc(userRef, {
      subscriptionPlan: plan,
      subscriptionStatus: status,
      subscriptionStartDate: Timestamp.now()
    });
    console.log('✅ Admin: Updated subscription for user:', uid);
  },

  // Reset user's monthly usage
  async resetUserMonthlyUsage(uid: string): Promise<void> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    await updateDoc(userRef, {
      auditsUsedThisMonth: 0
    });
    console.log('✅ Admin: Reset monthly usage for user:', uid);
  },

  // Delete user
  async deleteUser(uid: string): Promise<void> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    await deleteDoc(userRef);
    console.log('✅ Admin: Deleted user:', uid);
  },

  // Get all audits (admin view)
  async getAllAudits(limitCount: number = 100): Promise<AuditDocument[]> {
    const auditsRef = collection(db, COLLECTIONS.AUDITS);
    const q = query(
      auditsRef,
      orderBy('generatedAt', 'desc'),
      limit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      auditId: doc.id,
      ...doc.data()
    } as AuditDocument));
  },

  // Get platform statistics
  async getStats() {
    const users = await this.getAllUsers();
    const audits = await this.getAllAudits();

    const totalUsers = users.length;
    const activeSubscriptions = users.filter(u => 
      u.subscriptionStatus === 'active' && u.subscriptionPlan !== 'free'
    ).length;
    const totalAudits = audits.length;
    
    // Calculate revenue (approximate)
    const planPrices: Record<string, number> = {
      'starter': 49,
      'pro': 149,
      'enterprise': 299,
      'lifetime': 0,
      'free': 0
    };
    
    const monthlyRevenue = users
      .filter(u => u.subscriptionStatus === 'active')
      .reduce((sum, u) => sum + (planPrices[u.subscriptionPlan] || 0), 0);

    return {
      totalUsers,
      activeSubscriptions,
      totalAudits,
      monthlyRevenue,
      planBreakdown: {
        free: users.filter(u => u.subscriptionPlan === 'free').length,
        starter: users.filter(u => u.subscriptionPlan === 'starter').length,
        pro: users.filter(u => u.subscriptionPlan === 'pro').length,
        enterprise: users.filter(u => u.subscriptionPlan === 'enterprise').length,
        lifetime: users.filter(u => u.subscriptionPlan === 'lifetime').length,
      }
    };
  }
};

