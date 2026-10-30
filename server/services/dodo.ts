/**
 * Dodo Payments API (merchant of record). Two calls only:
 *   - checkout sessions, so the founding price step is set per purchase
 *     (both products have Pay What You Want enabled with the base price as minimum);
 *   - refunds, for the self-serve money-back guarantee.
 * Needs DODO_API_KEY (Developer → API keys in Dodo). DODO_API_BASE switches to test mode.
 */

const BASE = (process.env.DODO_API_BASE || 'https://live.dodopayments.com').replace(/\/$/, '');

export class DodoError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = process.env.DODO_API_KEY;
  if (!key) throw new DodoError('Payments are not configured (DODO_API_KEY missing).', 503);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Dodo ${path} failed (${res.status}): ${text.slice(0, 300)}`);
    throw new DodoError('The payment provider did not accept the request. Please try again.');
  }
  return JSON.parse(text) as T;
}

export async function createCheckoutSession(params: {
  productId: string;
  amountUsd: number;
  returnUrl: string;
  metadata: Record<string, string>;
}): Promise<{ url: string; sessionId: string }> {
  const data = await call<{ session_id: string; checkout_url: string | null }>('/checkouts', {
    product_cart: [{ product_id: params.productId, quantity: 1, amount: Math.round(params.amountUsd * 100) }],
    return_url: params.returnUrl,
    metadata: params.metadata,
  });
  if (!data.checkout_url) throw new DodoError('No checkout link was returned.');
  return { url: data.checkout_url, sessionId: data.session_id };
}

export async function createRefund(paymentId: string, reason: string): Promise<{ refundId: string; status: string }> {
  const data = await call<{ refund_id: string; status: string }>('/refunds', { payment_id: paymentId, reason });
  return { refundId: data.refund_id, status: data.status };
}
