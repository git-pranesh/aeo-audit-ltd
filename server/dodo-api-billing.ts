/**
 * Dodo API Billing
 *
 * Handles Dodo webhook events for API subscription plans.
 * Creates checkout sessions for API plan upgrades.
 *
 * Product IDs (from Dodo dashboard):
 *
 * Monthly:
 *   Starter      $29   pdt_0NgbqsqV2s2ppCUdKJOLu
 *   Professional $99   pdt_0NgbqyuHoAves0cTkSEf2
 *   Enterprise   $299  pdt_0Ngbr5wqnDLITjR5NgnOR
 *
 * Annual:
 *   Starter      $290  pdt_0NgbrlgIlHvl22z7d9jRY
 *   Professional $990  pdt_0NgbrtC04tWjmn5gzernh
 *   Enterprise   $2990 pdt_0NgbrzynWPTwcPDlaj9lT
 */

import { updateApiKeyPlan, downgradeApiKeyToFree, issueApiKey } from './api-key-service';

// ─── Product → Plan mapping ───────────────────────────────────────────────────

export const DODO_API_PRODUCTS: Record<string, { plan: string; billing: string; price: number }> = {
  // Monthly
  pdt_0NgbqsqV2s2ppCUdKJOLu: { plan: 'starter',      billing: 'monthly', price: 29  },
  pdt_0NgbqyuHoAves0cTkSEf2: { plan: 'professional', billing: 'monthly', price: 99  },
  pdt_0Ngbr5wqnDLITjR5NgnOR: { plan: 'enterprise',   billing: 'monthly', price: 299 },
  // Annual
  pdt_0NgbrlgIlHvl22z7d9jRY: { plan: 'starter',      billing: 'annual',  price: 290  },
  pdt_0NgbrtC04tWjmn5gzernh: { plan: 'professional', billing: 'annual',  price: 990  },
  pdt_0NgbrzynWPTwcPDlaj9lT: { plan: 'enterprise',   billing: 'annual',  price: 2990 },
};

// Reverse map: plan+billing → productId
export const API_PLAN_TO_PRODUCT: Record<string, string> = {
  'starter_monthly':      'pdt_0NgbqsqV2s2ppCUdKJOLu',
  'professional_monthly': 'pdt_0NgbqyuHoAves0cTkSEf2',
  'enterprise_monthly':   'pdt_0Ngbr5wqnDLITjR5NgnOR',
  'starter_annual':       'pdt_0NgbrlgIlHvl22z7d9jRY',
  'professional_annual':  'pdt_0NgbrtC04tWjmn5gzernh',
  'enterprise_annual':    'pdt_0NgbrzynWPTwcPDlaj9lT',
};

// ─── Checkout session creator ─────────────────────────────────────────────────

/**
 * Create a Dodo checkout session for an API plan.
 * Returns the checkout URL to redirect the user to.
 */
export async function createApiPlanCheckout(params: {
  plan: string;
  billing: 'monthly' | 'annual';
  userId: string;
  userEmail: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<{ checkoutUrl: string } | { error: string }> {
  const { plan, billing, userId, userEmail, successUrl, cancelUrl } = params;

  const productId = API_PLAN_TO_PRODUCT[`${plan}_${billing}`];
  if (!productId) {
    return { error: `Unknown plan: ${plan} (${billing})` };
  }

  try {
    const response = await fetch('https://api.dodopayments.com/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DODO_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product_id: productId,
        customer: {
          email: userEmail,
          metadata: { userId, source: 'citation_rocket_api' },
        },
        payment_link: true,
        success_url: successUrl || `${process.env.VITE_APP_URL || 'https://citationrocket.com'}/dashboard/api?success=true`,
        cancel_url: cancelUrl || `${process.env.VITE_APP_URL || 'https://citationrocket.com'}/dashboard/api?cancelled=true`,
        metadata: {
          userId,
          plan,
          billing,
          source: 'api_billing',
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`❌ Dodo checkout error: ${response.status} ${err}`);
      return { error: `Dodo API error: ${response.status}` };
    }

    const data = await response.json();
    const checkoutUrl = data.payment_link || data.checkout_url || data.url;

    if (!checkoutUrl) {
      return { error: 'No checkout URL in Dodo response' };
    }

    console.log(`✅ Dodo checkout created for ${userEmail} → ${plan} (${billing}): ${checkoutUrl}`);
    return { checkoutUrl };

  } catch (err: any) {
    console.error('❌ createApiPlanCheckout error:', err?.message);
    return { error: err?.message || 'Unknown error' };
  }
}

// ─── Webhook event handler ────────────────────────────────────────────────────

/**
 * Handle Dodo webhook events for API billing.
 * Called from the existing webhook route in routes.ts.
 *
 * Add this call inside the existing webhook handler, after the existing
 * subscription event processing:
 *
 *   await handleDodoApiWebhook(event);
 */
export async function handleDodoApiWebhook(event: {
  type: string;
  data: Record<string, any>;
}): Promise<void> {
  const { type, data } = event;

  // Only handle events that have metadata.source === 'api_billing'
  const metadata = data?.metadata || data?.subscription?.metadata || {};
  if (metadata.source !== 'api_billing') return;

  const userId = metadata.userId as string;
  const plan = metadata.plan as string;
  const subscriptionId = data?.subscription_id || data?.id || '';

  if (!userId) {
    console.warn(`⚠️ Dodo API webhook missing userId in metadata. Event: ${type}`);
    return;
  }

  console.log(`📦 Dodo API webhook: ${type} for userId ${userId}, plan ${plan}`);

  switch (type) {
    case 'subscription.active':
    case 'subscription.renewed':
    case 'payment.succeeded': {
      // Ensure user has an API key, then upgrade it
      await issueApiKey(userId, metadata.email || '', plan);
      await updateApiKeyPlan(userId, plan, subscriptionId);
      console.log(`✅ API plan activated: userId ${userId} → ${plan}`);
      break;
    }

    case 'subscription.cancelled':
    case 'subscription.expired':
    case 'subscription.failed': {
      await downgradeApiKeyToFree(userId);
      console.log(`⬇️ API plan cancelled: userId ${userId} → downgraded to free`);
      break;
    }

    case 'subscription.paused': {
      await downgradeApiKeyToFree(userId);
      console.log(`⏸️ API plan paused: userId ${userId} → downgraded to free`);
      break;
    }

    default:
      // Not an event we care about for API billing
      break;
  }
}

// ─── Routes to add to routes.ts ──────────────────────────────────────────────

/**
 * ADD THESE ROUTES to routes.ts inside registerRoutes().
 *
 * 1. Import at top of routes.ts:
 *    import { createApiPlanCheckout, handleDodoApiWebhook, DODO_API_PRODUCTS } from './dodo-api-billing';
 *    import { issueApiKey, getUserApiKey } from './api-key-service';
 *    import { apiKeyAuth } from './api-key-middleware';
 *
 * 2. Apply middleware to all v1 routes:
 *    app.use('/api/v1', apiKeyAuth);
 *
 * 3. Add these 3 routes:
 */

/*

// GET /api/keys/me — Get current user's API key and usage
app.get('/api/keys/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.uid;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const record = await getUserApiKey(userId);
  if (!record) {
    // Auto-issue a free key if they don't have one
    const newRecord = await issueApiKey(userId, req.user?.email || '', 'free');
    return res.json({ success: true, apiKey: newRecord });
  }

  return res.json({ success: true, apiKey: record });
});

// POST /api/keys/issue — Issue/re-issue API key (called after signup)
app.post('/api/keys/issue', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.uid;
  const userEmail = req.user?.email || '';
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const record = await issueApiKey(userId, userEmail, 'free');
  return res.json({ success: true, apiKey: record });
});

// POST /api/keys/checkout — Start Dodo checkout for API plan upgrade
app.post('/api/keys/checkout', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user?.uid;
  const userEmail = req.user?.email || '';
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const { plan, billing = 'monthly' } = req.body;
  if (!plan) return res.status(400).json({ error: 'plan is required' });

  const result = await createApiPlanCheckout({
    plan,
    billing,
    userId,
    userEmail,
  });

  if ('error' in result) {
    return res.status(500).json({ error: result.error });
  }

  return res.json({ success: true, checkoutUrl: result.checkoutUrl });
});

*/
