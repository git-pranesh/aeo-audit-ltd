import 'dotenv/config';
import { DodoPayments } from 'dodopayments';
import { Webhook } from 'svix';

// Initialize DODO client - using environment parameter per SDK docs
const dodoClient = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY || process.env.DODO_API_KEY!,
  environment: 'live_mode'
});

// Product ID mapping
export const DODO_PRODUCTS = {
  starter: process.env.DODO_PRODUCT_STARTER || 'pdt_KvPoUQnAs169rhtBLWANG',
  pro: process.env.DODO_PRODUCT_PRO || 'pdt_5yiyiPhkDxmODYAWXBjRg',
  enterprise: process.env.DODO_PRODUCT_ENTERPRISE || 'pdt_jC6cML2azTSnia6v2VSod'
};

// Plan pricing (for reference)
export const PLAN_PRICING = {
  starter: 49,
  pro: 149,
  enterprise: 299
};

export interface CheckoutSessionData {
  checkoutUrl: string;
  sessionId: string;
}

export interface DodoCustomer {
  id: string;
  email: string;
  name: string;
}

export const dodoService = {
  /**
   * Create or get existing DODO customer
   */
  async createCustomer(email: string, name: string, userId: string): Promise<DodoCustomer> {
    try {
      console.log('📝 Creating DODO customer:', email);
      
      const response = await dodoClient.customers.create({
        email: email,
        name: name
      });

      console.log('✅ DODO customer created:', response);
      
      return {
        id: (response as any).customer_id || (response as any).id,
        email: email,
        name: name
      };
    } catch (error: any) {
      console.error('Error creating DODO customer:', error);
      throw new Error('Failed to create customer');
    }
  },

  /**
   * Create checkout session for subscription
   */
  async createCheckoutSession(
    customerEmail: string,
    customerName: string,
    planName: 'starter' | 'pro' | 'enterprise',
    userId: string,
    successUrl: string,
    cancelUrl: string,
    discountCode?: string,
    productId?: string,
    billingPeriod: 'monthly' | 'annual' = 'monthly'
  ): Promise<CheckoutSessionData> {
    console.log('\n--- DODO Service: createCheckoutSession ---');
    
    try {
      // Use provided productId or fallback to default monthly product
      const finalProductId = productId || DODO_PRODUCTS[planName];
      
      console.log(`💳 Plan: ${planName}`);
      console.log(`📅 Billing: ${billingPeriod}`);
      console.log(`🆔 Product ID: ${finalProductId}`);
      console.log(`👤 Customer: ${customerName} <${customerEmail}>`);
      console.log(`🔑 User ID: ${userId}`);
      console.log(`🎟️ Discount Code: ${discountCode || 'None'}`);

      // Create checkout session with proper redirect URL (singular, not success/cancel)
      const checkoutData: any = {
        customer: {
          email: customerEmail,
          name: customerName
        },
        product_cart: [
          {
            product_id: finalProductId,
            quantity: 1
          }
        ],
        redirect_url: successUrl, // DODO uses single redirect_url, not success_url/cancel_url
        metadata: {
          user_id: userId,
          plan_name: planName,
          billing_period: billingPeriod,
          user_email: customerEmail,
          user_name: customerName
        }
      };

      // Add discount code if provided
      if (discountCode) {
        checkoutData.discount_code = discountCode;
        console.log('✅ Discount code added to session:', discountCode);
      }

      console.log('📦 Sending to DODO API...');
      console.log(JSON.stringify(checkoutData, null, 2));

      const response = await dodoClient.checkoutSessions.create(checkoutData as any);

      console.log('✅ DODO API Response received');
      console.log('📄 Response:', JSON.stringify(response, null, 2));

      const sessionData = response as any;
      const checkoutUrl = sessionData.checkout_url || sessionData.payment_link || sessionData.url;
      const sessionId = sessionData.session_id || sessionData.checkout_session_id || sessionData.id;

      console.log('🔗 Extracted checkout URL:', checkoutUrl);
      console.log('🆔 Extracted session ID:', sessionId);
      console.log('--- End DODO Service ---\n');

      return {
        checkoutUrl: checkoutUrl,
        sessionId: sessionId
      };
    } catch (error: any) {
      console.error('❌ DODO Service Error:');
      console.error('  Message:', error.message);
      console.error('  Full error:', error);
      console.log('--- End DODO Service (ERROR) ---\n');
      throw new Error('Failed to create checkout session');
    }
  },

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string) {
    try {
      const response = await dodoClient.subscriptions.retrieve(subscriptionId);

      return response;
    } catch (error: any) {
      console.error('Error fetching subscription:', error);
      throw new Error('Failed to fetch subscription');
    }
  },

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string) {
    try {
      console.log('🚫 Cancelling subscription:', subscriptionId);

      const response = await dodoClient.subscriptions.update(
        subscriptionId,
        {} as any
      );

      console.log('✅ Subscription cancelled:', subscriptionId);
      return response;
    } catch (error: any) {
      console.error('Error cancelling subscription:', error);
      throw new Error('Failed to cancel subscription');
    }
  },

  /**
   * Create discount/coupon in DODO
   * NOTE: DODO currently only supports 'percentage' type discounts
   */
  async createDiscount(params: {
    code: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    applicablePlans: string[];
    maxUses?: number;
    validUntil?: Date;
  }) {
    try {
      console.log('🎟️ Creating DODO discount:', params.code);

      // IMPORTANT: DODO API only supports 'percentage' type
      // If user selected 'fixed', we need to convert it to percentage based on plan price
      let amount: number;
      let discountType: 'percentage' = 'percentage';

      if (params.discountType === 'percentage') {
        // Convert percentage to basis points (e.g., 20% = 2000)
        amount = params.discountValue * 100;
        console.log(`💯 Percentage discount: ${params.discountValue}% = ${amount} basis points`);
      } else {
        // Fixed discounts not supported by DODO API
        console.warn('⚠️ Fixed discounts not supported by DODO. Skipping DODO sync.');
        return {
          success: false,
          error: 'DODO only supports percentage discounts. Please use percentage type instead of fixed amount.'
        };
      }

      // Get product IDs for applicable plans
      const restrictedTo = params.applicablePlans
        .map(plan => DODO_PRODUCTS[plan as keyof typeof DODO_PRODUCTS])
        .filter(Boolean);

      const discountData: any = {
        code: params.code.toUpperCase(),
        type: discountType, // Always 'percentage'
        amount: amount,
        restricted_to: restrictedTo.length > 0 ? restrictedTo : undefined,
        usage_limit: params.maxUses || undefined,
        expires_at: params.validUntil ? params.validUntil.toISOString() : undefined,
        name: `Coupon ${params.code}`
      };

      console.log('📦 DODO discount data:', discountData);

      const response = await dodoClient.discounts.create(discountData);

      console.log('✅ DODO discount created:', response);

      return {
        success: true,
        discountId: (response as any).discount_id,
        code: (response as any).code
      };
    } catch (error: any) {
      console.error('❌ Error creating DODO discount:', error);
      console.error('Error details:', error.response?.data || error.message);
      
      // Return error details for better debugging
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Verify webhook signature using Svix (Standard Webhooks)
   * DODO Payments uses Standard Webhooks format
   */
  verifyWebhookSignature(
    payload: string,
    headers: {
      'webhook-id'?: string;
      'webhook-timestamp'?: string;
      'webhook-signature'?: string;
      'svix-id'?: string;
      'svix-timestamp'?: string;
      'svix-signature'?: string;
    },
    secret: string
  ): boolean {
    try {
      if (!secret) {
        console.error('❌ Webhook secret not configured');
        return false;
      }

      // DODO uses Standard Webhooks (Svix) format
      // Headers can be prefixed with 'webhook-' or 'svix-'
      const webhookId = headers['webhook-id'] || headers['svix-id'];
      const webhookTimestamp = headers['webhook-timestamp'] || headers['svix-timestamp'];
      const webhookSignature = headers['webhook-signature'] || headers['svix-signature'];

      if (!webhookId || !webhookTimestamp || !webhookSignature) {
        console.error('❌ Missing webhook headers:', { 
          hasId: !!webhookId, 
          hasTimestamp: !!webhookTimestamp, 
          hasSignature: !!webhookSignature 
        });
        return false;
      }

      // Create Svix Webhook instance with the secret
      const wh = new Webhook(secret);

      // Verify the payload - this throws if verification fails
      wh.verify(payload, {
        'svix-id': webhookId,
        'svix-timestamp': webhookTimestamp,
        'svix-signature': webhookSignature
      });

      console.log('✅ Webhook signature verified successfully');
      return true;
    } catch (error) {
      console.error('❌ Webhook verification failed:', error instanceof Error ? error.message : error);
      return false;
    }
  },

  /**
   * Create a new product in DODO
   * Reference: https://docs.dodopayments.com/api-reference/products/post-products
   */
  async createProduct(params: {
    name: string;
    description?: string;
    priceInDollars: number;
    billingType: 'one_time' | 'monthly' | 'annual';
    metadata?: Record<string, string>;
  }): Promise<{
    success: boolean;
    productId?: string;
    error?: string;
  }> {
    try {
      console.log('\n🆕 Creating DODO Product...');
      console.log(`   Name: ${params.name}`);
      console.log(`   Price: $${params.priceInDollars}`);
      console.log(`   Billing Type: ${params.billingType}`);

      // Convert dollars to cents
      const priceInCents = Math.round(params.priceInDollars * 100);

      // Build price object based on billing type
      let priceConfig: any;

      if (params.billingType === 'one_time') {
        // One-time payment
        priceConfig = {
          type: 'one_time_price',
          currency: 'USD',
          price: priceInCents,
          discount: 0,
          purchasing_power_parity: false,
          tax_inclusive: false
        };
      } else {
        // Recurring payment (monthly or annual)
        const interval = params.billingType === 'monthly' ? 'Month' : 'Year';
        priceConfig = {
          type: 'recurring_price',
          currency: 'USD',
          price: priceInCents,
          discount: 0,
          purchasing_power_parity: false,
          tax_inclusive: false,
          payment_frequency_count: 1,
          payment_frequency_interval: interval,
          subscription_period_count: 1,
          subscription_period_interval: interval,
          trial_period_days: 0
        };
      }

      const productData: any = {
        name: params.name,
        price: priceConfig,
        tax_category: 'saas',
        description: params.description || `${params.name} - Citation Rocket Plan`,
        metadata: params.metadata || {}
      };

      console.log('📦 Product data:', JSON.stringify(productData, null, 2));

      const response = await dodoClient.products.create(productData);

      const productId = (response as any).product_id;
      console.log('✅ DODO Product created successfully!');
      console.log(`   Product ID: ${productId}`);

      return {
        success: true,
        productId: productId
      };
    } catch (error: any) {
      console.error('❌ Error creating DODO product:', error);
      console.error('   Error details:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to create product in DODO'
      };
    }
  },

  /**
   * Update an existing product in DODO
   */
  async updateProduct(productId: string, params: {
    name?: string;
    description?: string;
    priceInDollars?: number;
    billingType?: 'one_time' | 'monthly' | 'annual';
  }): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log('\n📝 Updating DODO Product:', productId);

      const updateData: any = {};

      if (params.name) {
        updateData.name = params.name;
      }

      if (params.description) {
        updateData.description = params.description;
      }

      if (params.priceInDollars !== undefined && params.billingType) {
        const priceInCents = Math.round(params.priceInDollars * 100);

        if (params.billingType === 'one_time') {
          updateData.price = {
            type: 'one_time_price',
            currency: 'USD',
            price: priceInCents,
            discount: 0,
            purchasing_power_parity: false,
            tax_inclusive: false
          };
        } else {
          const interval = params.billingType === 'monthly' ? 'Month' : 'Year';
          updateData.price = {
            type: 'recurring_price',
            currency: 'USD',
            price: priceInCents,
            discount: 0,
            purchasing_power_parity: false,
            tax_inclusive: false,
            payment_frequency_count: 1,
            payment_frequency_interval: interval,
            subscription_period_count: 1,
            subscription_period_interval: interval,
            trial_period_days: 0
          };
        }
      }

      console.log('📦 Update data:', JSON.stringify(updateData, null, 2));

      await dodoClient.products.update(productId, updateData);

      console.log('✅ DODO Product updated successfully!');

      return { success: true };
    } catch (error: any) {
      console.error('❌ Error updating DODO product:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to update product'
      };
    }
  },

  /**
   * Get product details from DODO
   */
  async getProduct(productId: string): Promise<any> {
    try {
      const response = await dodoClient.products.retrieve(productId);
      return response;
    } catch (error: any) {
      console.error('Error fetching product:', error);
      throw new Error('Failed to fetch product');
    }
  },

  /**
   * List all products from DODO
   */
  async listProducts(): Promise<any[]> {
    try {
      const response = await dodoClient.products.list();
      return (response as any).items || [];
    } catch (error: any) {
      console.error('Error listing products:', error);
      return [];
    }
  }
};

export default dodoService;

