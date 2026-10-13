import 'dotenv/config';
import { DodoPayments } from 'dodopayments';

// Initialize DODO client - using environment parameter per SDK docs
const dodoClient = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY || process.env.DODO_API_KEY!,
  environment: 'live_mode'
});

// Product ID mapping
const PRODUCT_IDS = {
  monthly: {
    starter: process.env.DODO_PRODUCT_STARTER || '',
    pro: process.env.DODO_PRODUCT_PRO || '',
    enterprise: process.env.DODO_PRODUCT_ENTERPRISE || ''
  },
  annual: {
    starter: process.env.DODO_PRODUCT_STARTER_ANNUAL || '',
    pro: process.env.DODO_PRODUCT_PRO_ANNUAL || '',
    enterprise: process.env.DODO_PRODUCT_ENTERPRISE_ANNUAL || ''
  }
};

interface PricingUpdate {
  plan: 'starter' | 'pro' | 'enterprise';
  monthlyPrice: number;
  annualPrice: number;
}

/**
 * Update product prices in DODO
 * Reference: https://docs.dodopayments.com/api-reference/products/patch-products
 */
export const dodoPricingSync = {
  /**
   * Update a single product's price in DODO
   */
  async updateProductPrice(productId: string, priceInDollars: number): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      console.log(`\n💰 Updating DODO product ${productId} to $${priceInDollars}`);
      
      // Convert dollars to cents
      const priceInCents = Math.round(priceInDollars * 100);
      
      // Determine if monthly or annual
      const isAnnual = productId.includes('ANNUAL');
      
      // Build request body matching DODO's format exactly
      const requestBody = {
        price: {
          type: 'recurring_price',
          currency: 'USD',
          discount: 0,
          tax_inclusive: false,
          payment_frequency_count: 1,
          payment_frequency_interval: isAnnual ? 'Year' : 'Month',
          price: priceInCents,
          purchasing_power_parity: false,
          subscription_period_count: 1,
          subscription_period_interval: isAnnual ? 'Year' : 'Month',
          trial_period_days: 0
        }
      };
      
      console.log('📤 Request to DODO:');
      console.log('   Product ID:', productId);
      console.log('   Request Body:', JSON.stringify(requestBody, null, 2));
      
      // Update product in DODO
      const response = await dodoClient.products.update(productId, requestBody as any);
      
      console.log('📥 Response from DODO:');
      console.log('   Status: Success');
      console.log('   Response:', JSON.stringify(response, null, 2));
      console.log(`✅ DODO product updated: ${productId} = $${priceInDollars}\n`);
      
      return {
        success: true,
        message: `Product price updated to $${priceInDollars}`
      };
    } catch (error: any) {
      console.error(`\n❌ Failed to update DODO product ${productId}:`);
      console.error('   Error type:', error.constructor.name);
      console.error('   Error message:', error.message);
      console.error('   Error code:', error.error?.code);
      console.error('   Full error:', error);
      console.log('');
      
      return {
        success: false,
        message: error.message || 'Failed to update product in DODO'
      };
    }
  },

  /**
   * Update all products for a plan (monthly + annual)
   */
  async syncPlanPricing(data: PricingUpdate): Promise<{
    success: boolean;
    results: {
      monthly: { success: boolean; message: string };
      annual: { success: boolean; message: string };
    };
  }> {
    try {
      console.log(`\n🔄 Syncing ${data.plan} pricing to DODO...`);
      console.log(`  Monthly: $${data.monthlyPrice}`);
      console.log(`  Annual: $${data.annualPrice}`);
      
      const monthlyProductId = PRODUCT_IDS.monthly[data.plan];
      const annualProductId = PRODUCT_IDS.annual[data.plan];

      if (!monthlyProductId || !annualProductId) {
        throw new Error(`Product IDs not configured for ${data.plan} plan`);
      }

      // Update both monthly and annual products in parallel
      const [monthlyResult, annualResult] = await Promise.all([
        this.updateProductPrice(monthlyProductId, data.monthlyPrice),
        this.updateProductPrice(annualProductId, data.annualPrice)
      ]);

      const allSuccess = monthlyResult.success && annualResult.success;

      if (allSuccess) {
        console.log(`✅ Successfully synced ${data.plan} pricing to DODO\n`);
      } else {
        console.log(`⚠️ Partial sync for ${data.plan}: some products failed\n`);
      }

      return {
        success: allSuccess,
        results: {
          monthly: monthlyResult,
          annual: annualResult
        }
      };
    } catch (error: any) {
      console.error(`❌ Error syncing ${data.plan} pricing:`, error);
      return {
        success: false,
        results: {
          monthly: { success: false, message: error.message },
          annual: { success: false, message: error.message }
        }
      };
    }
  },

  /**
   * Sync all plans to DODO
   */
  async syncAllPricing(plans: {
    starter: { monthlyPrice: number; annualPrice: number };
    pro: { monthlyPrice: number; annualPrice: number };
    enterprise: { monthlyPrice: number; annualPrice: number };
  }): Promise<{
    success: boolean;
    results: Record<string, any>;
  }> {
    console.log('\n========== SYNC ALL PRICING TO DODO ==========');
    
    const results: Record<string, any> = {};

    // Sync all plans
    for (const [planName, prices] of Object.entries(plans)) {
      const result = await this.syncPlanPricing({
        plan: planName as 'starter' | 'pro' | 'enterprise',
        monthlyPrice: prices.monthlyPrice,
        annualPrice: prices.annualPrice
      });
      results[planName] = result;
    }

    const allSuccess = Object.values(results).every((r: any) => r.success);

    console.log(allSuccess ? '✅ All pricing synced successfully' : '⚠️ Some pricing updates failed');
    console.log('==========================================\n');

    return {
      success: allSuccess,
      results
    };
  },

  /**
   * Get product IDs for reference
   */
  getProductIds() {
    return PRODUCT_IDS;
  }
};

export default dodoPricingSync;

