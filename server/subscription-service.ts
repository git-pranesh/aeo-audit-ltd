import 'dotenv/config';
import dodoService from './dodo-service';
import { initializeApp, getApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, getDoc } from 'firebase/firestore';

// Initialize Firebase client SDK
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID
};

let db: any;
try {
  const app = initializeApp(firebaseConfig, 'subscription-service-app');
  db = getFirestore(app);
} catch (e: any) {
  if (e.code === 'app/duplicate-app') {
    const app = getApp('subscription-service-app');
    db = getFirestore(app);
  } else {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
}

interface UpgradeRequest {
  userId: string;
  userEmail: string;
  userName: string;
  currentPlan: string;
  newPlan: string;
  billingPeriod: 'monthly' | 'annual';
  currentSubscriptionId: string;
}

interface DowngradeRequest {
  userId: string;
  currentPlan: string;
  newPlan: string;
  subscriptionId: string;
}

export const subscriptionService = {
  /**
   * Calculate proration amount for upgrade
   */
  calculateProration(
    currentMonthlyPrice: number,
    newMonthlyPrice: number,
    daysRemaining: number,
    daysInPeriod: number = 30
  ): number {
    const priceDifference = newMonthlyPrice - currentMonthlyPrice;
    const dailyDifference = priceDifference / daysInPeriod;
    const prorationAmount = dailyDifference * daysRemaining;
    return Math.round(prorationAmount * 100) / 100; // Round to 2 decimals
  },

  /**
   * Get plan prices
   */
  getPlanPrices(): Record<string, { monthly: number; annual: number }> {
    return {
      starter: { monthly: 49, annual: 490 },
      pro: { monthly: 149, annual: 1490 },
      enterprise: { monthly: 299, annual: 2990 }
    };
  },

  /**
   * Upgrade user to higher plan (with payment)
   */
  async upgradeSubscription(data: UpgradeRequest): Promise<{
    success: boolean;
    checkoutUrl?: string;
    proratedAmount?: number;
    message: string;
  }> {
    try {
      const prices = this.getPlanPrices();
      const currentPrice = prices[data.currentPlan as keyof typeof prices]?.[data.billingPeriod] || 0;
      const newPrice = prices[data.newPlan as keyof typeof prices]?.[data.billingPeriod] || 0;

      if (newPrice <= currentPrice) {
        return {
          success: false,
          message: 'Cannot upgrade to a lower or same-tier plan. Use downgrade instead.'
        };
      }

      // For DODO: Create new checkout session for the upgraded plan
      // DODO will handle the subscription switch
      const baseUrl = process.env.PRODUCTION_URL || `https://${process.env.REPLIT_DEV_DOMAIN || 'app.citationrocket.com'}`;
      const redirectUrl = `${baseUrl}/payment-success?upgrade=true`;

      const session = await dodoService.createCheckoutSession(
        data.userEmail,
        data.userName,
        data.newPlan as 'starter' | 'pro' | 'enterprise',
        data.userId,
        redirectUrl,
        redirectUrl,
        undefined, // no coupon
        undefined, // will use default product ID
        data.billingPeriod
      );

      // Store pending upgrade in Firestore
      const userRef = doc(db, 'users', data.userId);
      await updateDoc(userRef, {
        pendingUpgrade: {
          targetPlan: data.newPlan,
          fromPlan: data.currentPlan,
          billingPeriod: data.billingPeriod,
          scheduledAt: new Date()
        }
      });

      return {
        success: true,
        checkoutUrl: session.checkoutUrl,
        message: 'Upgrade checkout session created. Complete payment to activate.'
      };
    } catch (error: any) {
      console.error('Upgrade error:', error);
      return {
        success: false,
        message: error.message || 'Failed to process upgrade'
      };
    }
  },

  /**
   * Downgrade user to lower plan (effective at period end)
   */
  async downgradeSubscription(data: DowngradeRequest): Promise<{
    success: boolean;
    effectiveDate?: Date;
    message: string;
  }> {
    try {
      const prices = this.getPlanPrices();
      const currentPrice = prices[data.currentPlan as keyof typeof prices]?.monthly || 0;
      const newPrice = prices[data.newPlan as keyof typeof prices]?.monthly || 0;

      if (newPrice >= currentPrice) {
        return {
          success: false,
          message: 'Cannot downgrade to a higher or same-tier plan. Use upgrade instead.'
        };
      }

      // Calculate end of current billing period (approximate)
      const now = new Date();
      const effectiveDate = new Date(now);
      effectiveDate.setMonth(effectiveDate.getMonth() + 1);
      effectiveDate.setDate(1); // First day of next month

      // Store pending downgrade in Firestore
      const userRef = doc(db, 'users', data.userId);
      await updateDoc(userRef, {
        pendingDowngrade: {
          targetPlan: data.newPlan,
          fromPlan: data.currentPlan,
          effectiveDate: effectiveDate,
          scheduledAt: new Date()
        }
      });

      // Note: Actual downgrade will happen via DODO webhook when subscription ends
      // For now, we just schedule it in our database

      return {
        success: true,
        effectiveDate: effectiveDate,
        message: `Downgrade scheduled. Your plan will change to ${data.newPlan} at the end of your current billing period.`
      };
    } catch (error: any) {
      console.error('Downgrade error:', error);
      return {
        success: false,
        message: error.message || 'Failed to schedule downgrade'
      };
    }
  },

  /**
   * Cancel pending downgrade
   */
  async cancelPendingDowngrade(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        pendingDowngrade: null
      });

      return {
        success: true,
        message: 'Pending downgrade cancelled. You will stay on your current plan.'
      };
    } catch (error: any) {
      console.error('Cancel downgrade error:', error);
      return {
        success: false,
        message: error.message || 'Failed to cancel downgrade'
      };
    }
  },

  /**
   * Switch billing period (monthly ↔ annual)
   */
  async switchBillingPeriod(data: {
    userId: string;
    userEmail: string;
    userName: string;
    planName: string;
    currentPeriod: 'monthly' | 'annual';
    newPeriod: 'monthly' | 'annual';
  }): Promise<{
    success: boolean;
    checkoutUrl?: string;
    message: string;
  }> {
    try {
      // Create new checkout session for the same plan but different billing period
      const baseUrl = process.env.PRODUCTION_URL || `https://${process.env.REPLIT_DEV_DOMAIN || 'app.citationrocket.com'}`;
      const redirectUrl = `${baseUrl}/payment-success?billing_change=true`;

      const session = await dodoService.createCheckoutSession(
        data.userEmail,
        data.userName,
        data.planName as 'starter' | 'pro' | 'enterprise',
        data.userId,
        redirectUrl,
        redirectUrl,
        undefined, // no coupon
        undefined, // will use default product ID
        data.newPeriod
      );

      return {
        success: true,
        checkoutUrl: session.checkoutUrl,
        message: `Switching to ${data.newPeriod} billing. Complete payment to confirm.`
      };
    } catch (error: any) {
      console.error('Billing period switch error:', error);
      return {
        success: false,
        message: error.message || 'Failed to switch billing period'
      };
    }
  }
};

