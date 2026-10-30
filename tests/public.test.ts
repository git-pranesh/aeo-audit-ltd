import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { fakeDb } from './setup';
import { registerRoutes } from '../server/routes';
import { createPurchasedLicense } from '../server/services/license-service';
import { invalidateFoundingCache } from '../server/services/founding';

let server: Server;
let base = '';
const realFetch = globalThis.fetch;

beforeAll(() => {
  process.env.DODO_PRODUCT_LIFETIME = 'prod_lifetime';
  process.env.DODO_PRODUCT_AGENCY = 'prod_agency';
  process.env.DODO_API_KEY = 'test_key';
  const app = express();
  app.use(express.json());
  registerRoutes(app);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
afterEach(() => { globalThis.fetch = realFetch; invalidateFoundingCache(); });

const call = (method: string, path: string, token?: string, body?: unknown) =>
  realFetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

/** Answers Dodo API calls; everything else goes to the network. */
function stubDodo(reply: (path: string, body: any) => object) {
  const calls: { path: string; body: any; auth: string | null }[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    if (!url.includes('dodopayments.com')) return realFetch(input, init);
    const body = init?.body ? JSON.parse(init.body) : null;
    const path = new URL(url).pathname;
    calls.push({ path, body, auth: new Headers(init?.headers).get('authorization') });
    return new Response(JSON.stringify(reply(path, body)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return calls;
}

describe('public API', () => {
  it('reports the founding count from direct licences', async () => {
    await createPurchasedLicense({ orderReference: 'pay_a', email: 'a@x.com', whiteLabel: false, amountPaid: 9900 });
    await createPurchasedLicense({ orderReference: 'pay_b', email: 'b@x.com', whiteLabel: true, amountPaid: 14900 });
    invalidateFoundingCache();
    const res = await call('GET', '/api/public/founding');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sold: 2, step: 1, remainingInStep: 298, prices: { lifetime: 99, agency: 149 }, founding: true });
  });

  it('creates a Dodo checkout session at the current step price with the metadata', async () => {
    const calls = stubDodo(() => ({ session_id: 'cks_1', checkout_url: 'https://checkout.dodopayments.com/session/cks_1' }));
    const res = await call('POST', '/api/public/checkout', undefined, { plan: 'agency', metadata: { consent: 'allowed', hy_vid: '11111111-2222-3333-4444-555555555555' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ url: 'https://checkout.dodopayments.com/session/cks_1', price: 149, step: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ path: '/checkouts', auth: 'Bearer test_key' });
    expect(calls[0].body).toMatchObject({
      product_cart: [{ product_id: 'prod_agency', quantity: 1, amount: 14900 }],
      return_url: 'https://app.citationrocket.com/welcome/agency',
      metadata: { consent: 'allowed', hy_vid: '11111111-2222-3333-4444-555555555555', plan: 'agency', price: '149', step: '1' },
    });
  });

  it('rejects bad metadata keys and unknown plans', async () => {
    expect((await call('POST', '/api/public/checkout', undefined, { plan: 'monthly' })).status).toBe(400);
    expect((await call('POST', '/api/public/checkout', undefined, { plan: 'lifetime', metadata: { 'X-Bad': '1' } })).status).toBe(400);
  });
});

describe('money-back guarantee over HTTP', () => {
  it('is open after purchase, closes on a download, and refuses the refund', async () => {
    await createPurchasedLicense({ orderReference: 'pay_1', email: 'one@x.com', whiteLabel: false });
    let me = await (await call('GET', '/api/me', 'u1:one@x.com:true')).json();
    expect(me.entitlement).toMatchObject({ status: 'active', channel: 'direct' });
    expect(me.guarantee).toMatchObject({ eligible: true, reason: 'ok', auditsRun: 0, downloads: 0 });

    expect((await call('POST', '/api/me/download-event', 'u1:one@x.com:true', { kind: 'pdf' })).status).toBe(200);
    me = await (await call('GET', '/api/me', 'u1:one@x.com:true')).json();
    expect(me.guarantee).toMatchObject({ eligible: false, reason: 'downloads', downloads: 1 });

    const refund = await call('POST', '/api/me/refund', 'u1:one@x.com:true');
    expect(refund.status).toBe(403);
    expect((await refund.json()).code).toBe('NOT_ELIGIBLE');
  });

  it('refunds an eligible buyer through Dodo, ends the licence and lowers the founding count', async () => {
    await createPurchasedLicense({ orderReference: 'pay_2', email: 'two@x.com', whiteLabel: false, amountPaid: 9900 });
    await (await call('GET', '/api/me', 'u2:two@x.com:true')).json();
    invalidateFoundingCache();
    const before = (await (await call('GET', '/api/public/founding')).json()).sold;

    const calls = stubDodo(() => ({ refund_id: 'ref_1', status: 'succeeded' }));
    const res = await call('POST', '/api/me/refund', 'u2:two@x.com:true');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, refundId: 'ref_1' });
    expect(calls[0]).toMatchObject({ path: '/refunds', body: { payment_id: 'pay_2' } });

    const me = await (await call('GET', '/api/me', 'u2:two@x.com:true')).json();
    expect(me.entitlement).toBeNull();
    expect((await fakeDb.collection('licenses').doc('order_pay_2').get()).data()?.status).toBe('refunded');
    expect((await (await call('GET', '/api/public/founding')).json()).sold).toBe(before - 1);

    // A second request cannot refund twice.
    expect((await call('POST', '/api/me/refund', 'u2:two@x.com:true')).status).toBe(404);
  });

  it('keeps the licence when Dodo fails, so the buyer can retry', async () => {
    await createPurchasedLicense({ orderReference: 'pay_3', email: 'three@x.com', whiteLabel: false });
    await (await call('GET', '/api/me', 'u3:three@x.com:true')).json();
    globalThis.fetch = (async (input: any, init?: any) => {
      if (!String(input).includes('dodopayments.com')) return realFetch(input, init);
      return new Response('{"message":"nope"}', { status: 400 });
    }) as typeof fetch;
    const res = await call('POST', '/api/me/refund', 'u3:three@x.com:true');
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('REFUND_FAILED');
    const me = await (await call('GET', '/api/me', 'u3:three@x.com:true')).json();
    expect(me.entitlement).toMatchObject({ status: 'active' });
    expect(me.guarantee.eligible).toBe(true);
  });
});

describe('free preview audit', () => {
  it('scores a real site with no AI key and caches the result', async () => {
    const res = await call('POST', '/api/public/preview', undefined, { websiteUrl: 'allbirds.com' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ domain: 'allbirds.com', cached: false });
    expect(typeof data.score).toBe('number');
    expect(data.platformScores).toHaveProperty('chatgpt');
    expect(Array.isArray(data.fixes)).toBe(true);
    expect(data.totalFixes).toBeGreaterThan(0);

    const again = await (await call('POST', '/api/public/preview', undefined, { websiteUrl: 'https://www.allbirds.com/', email: 'lead@x.com' })).json();
    expect(again).toMatchObject({ cached: true, score: data.score });
    expect((await fakeDb.collection('preview_leads').doc('allbirds.com__lead@x.com').get()).data()).toMatchObject({ email: 'lead@x.com', domain: 'allbirds.com' });
  }, 120_000);

  it('rejects private and malformed addresses', async () => {
    expect((await call('POST', '/api/public/preview', undefined, { websiteUrl: 'localhost' })).status).toBe(400);
    expect((await call('POST', '/api/public/preview', undefined, { websiteUrl: '' })).status).toBe(400);
  });
});
