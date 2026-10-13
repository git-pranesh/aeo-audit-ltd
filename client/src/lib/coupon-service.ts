import { db } from './firebase';
import { collection, query, where, getDocs, updateDoc, doc, Timestamp, runTransaction } from 'firebase/firestore';

interface CouponValidationResult {
  valid: boolean;
  discount?: {
    type: 'percentage' | 'fixed';
    value: number;
  };
  message: string;
}

export const couponService = {
  // Validate discount coupon
  async validateCoupon(code: string, plan: string): Promise<CouponValidationResult> {
    try {
      const couponsRef = collection(db, 'coupons');
      const q = query(couponsRef, where('code', '==', code.toUpperCase()));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return {
          valid: false,
          message: 'Invalid coupon code'
        };
      }

      const couponDoc = snapshot.docs[0];
      const coupon = couponDoc.data();

      // Check if active
      if (!coupon.isActive) {
        return {
          valid: false,
          message: 'This coupon is no longer active'
        };
      }

      // Check if expired
      const now = new Date();
      const validUntil = coupon.validUntil.toDate();
      if (now > validUntil) {
        return {
          valid: false,
          message: 'This coupon has expired'
        };
      }

      // Check usage limit
      if (coupon.timesUsed >= coupon.maxUses) {
        return {
          valid: false,
          message: 'This coupon has reached its usage limit'
        };
      }

      // Check if applicable to selected plan
      if (!coupon.applicablePlans.includes(plan)) {
        return {
          valid: false,
          message: `This coupon is not applicable to the ${plan} plan`
        };
      }

      return {
        valid: true,
        discount: {
          type: coupon.discountType,
          value: coupon.discountValue
        },
        message: 'Coupon applied successfully!'
      };
    } catch (error) {
      console.error('Error validating coupon:', error);
      return {
        valid: false,
        message: 'Error validating coupon. Please try again.'
      };
    }
  },

  // Apply coupon (increment usage count)
  async applyCoupon(code: string): Promise<void> {
    try {
      const couponsRef = collection(db, 'coupons');
      const q = query(couponsRef, where('code', '==', code.toUpperCase()));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const couponDoc = snapshot.docs[0];
        const currentUsage = couponDoc.data().timesUsed || 0;
        
        await updateDoc(doc(db, 'coupons', couponDoc.id), {
          timesUsed: currentUsage + 1
        });
      }
    } catch (error) {
      console.error('Error applying coupon:', error);
    }
  },

  // Calculate discounted price
  calculateDiscountedPrice(
    originalPrice: number,
    discountType: 'percentage' | 'fixed',
    discountValue: number
  ): number {
    if (discountType === 'percentage') {
      return originalPrice * (1 - discountValue / 100);
    } else {
      return Math.max(0, originalPrice - discountValue);
    }
  },

  // Validate AppSumo code
  async validateAppSumoCode(code: string): Promise<{
    valid: boolean;
    message: string;
  }> {
    try {
      const appSumoRef = collection(db, 'appsumo');
      const q = query(appSumoRef, where('code', '==', code.toUpperCase()));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return {
          valid: false,
          message: 'Invalid AppSumo code'
        };
      }

      const codeDoc = snapshot.docs[0];
      const codeData = codeDoc.data();

      if (codeData.isRedeemed) {
        return {
          valid: false,
          message: 'This code has already been redeemed'
        };
      }

      return {
        valid: true,
        message: 'Valid AppSumo lifetime deal code!'
      };
    } catch (error) {
      console.error('Error validating AppSumo code:', error);
      return {
        valid: false,
        message: 'Error validating code. Please try again.'
      };
    }
  },

  // Redeem AppSumo code (atomic: isRedeemed is re-checked inside the transaction)
  async redeemAppSumoCode(code: string, userId: string, userEmail: string): Promise<boolean> {
    try {
      // Firestore transactions cannot run queries, so locate the code doc ID first...
      const appSumoRef = collection(db, 'appsumo');
      const q = query(appSumoRef, where('code', '==', code.toUpperCase()));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return false;
      }

      const codeRef = doc(db, 'appsumo', snapshot.docs[0].id);
      const userRef = doc(db, 'users', userId);

      // ...then atomically: read the code doc, check isRedeemed, and only if false
      // mark it redeemed AND upgrade the user — all in one transaction.
      await runTransaction(db, async (transaction) => {
        const codeSnap = await transaction.get(codeRef);

        if (!codeSnap.exists()) {
          throw new Error('AppSumo code no longer exists');
        }
        if (codeSnap.data().isRedeemed) {
          throw new Error('This code has already been redeemed');
        }

        transaction.update(codeRef, {
          isRedeemed: true,
          redeemedBy: userEmail,
          redeemedAt: Timestamp.now()
        });

        transaction.update(userRef, {
          subscriptionPlan: 'lifetime',
          subscriptionStatus: 'active',
          appSumoCode: code.toUpperCase()
        });
      });

      console.log('✅ AppSumo code redeemed:', code);
      return true;
    } catch (error) {
      console.error('Error redeeming AppSumo code:', error);
      return false;
    }
  }
};

