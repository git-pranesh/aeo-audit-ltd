import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { Webhook } from 'standardwebhooks';
import { fakeDb } from './setup';
import { registerRoutes, registerWebhooks } from '../server/routes';
import { generateCodes } from '../server/services/license-service';

const SECRET = 'whsec_' + Buffer.from('test-secret-test-secret-123456').toString('base64');
let server: Server;
let base = '';

beforeAll(async () => {
  process.env.DODO_WEBHOOK_SECRET = SECRET;
  process.env.DODO_PRODUCT_LIFETIME = 'prod_lifetime';
  process.env.DODO_PRODUCT_AGENCY = 'prod_agency';
  process.env.ADMIN_EMAILS = 'admin@example.com';
  const app = express();
  registerWebhooks(app);
  app.use(express.json());
  registerRoutes(app);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const call = (method: string, path: string, token?: string, body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

function signed(payload: object, id = 'msg_1') {
  const body = JSON.stringify(payload);
  const ts = new Date();
  const signature = new Webhook(SECRET).sign(id, ts, body);
  return { body, headers: { 'webhook-id': id, 'webhook-timestamp': String(Math.floor(ts.getTime() / 1000)), 'webhook-signature': signature } };
}

describe('HTTP API', () => {
  it('requires auth', async () => {
    expect((await call('GET', '/api/me')).status).toBe(401);
    expect((await call('GET', '/api/audits')).status).toBe(401);
  });

  it('creates the account server-side and blocks audits until licensed', async () => {
    const me = await (await call('GET', '/api/me', 'u1:a@b.com:true')).json();
    expect(me).toMatchObject({ uid: 'u1', entitlement: null, isAdmin: false, openRouterKey: null });
    const res = await call('POST', '/api/audits/analyze', 'u1:a@b.com:true', { websiteUrl: 'example.com' });
    expect(res.status).toBe(402);
  });

  it('activates a license via POST /api/licenses/activate', async () => {
    const [code] = await generateCodes(1, { whiteLabel: false, channel: 'marketplace' });
    const res = await call('POST', '/api/licenses/activate', 'u1:a@b.com:true', { code });
    expect(res.status).toBe(200);
    expect((await res.json()).entitlement).toMatchObject({ status: 'active', whiteLabel: false });
  });

  it('licensed user without a key gets KEY_MISSING (no platform fallback)', async () => {
    const [code] = await generateCodes(1, { whiteLabel: false, channel: 'marketplace' });
    await call('POST', '/api/licenses/activate', 'u1:a@b.com:true', { code });
    const res = await call('POST', '/api/audits/analyze', 'u1:a@b.com:true', { websiteUrl: 'example.com' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('KEY_MISSING');
  });

  it('rejects internal targets (SSRF)', async () => {
    const [code] = await generateCodes(1, { whiteLabel: false, channel: 'marketplace' });
    await call('POST', '/api/licenses/activate', 'u1:a@b.com:true', { code });
    const res = await call('POST', '/api/audits/analyze', 'u1:a@b.com:true', { websiteUrl: 'http://169.254.169.254/' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('BLOCKED_HOST');
  });

  it('branding requires the agency license', async () => {
    const res = await call('PUT', '/api/me/branding', 'u1:a@b.com:true', { agencyName: 'X', accentColor: '#112233' });
    expect(res.status).toBe(403);
  });

  it('admin routes require an allow-listed, verified email', async () => {
    expect((await call('GET', '/api/admin/status', 'u1:a@b.com:true')).status).toBe(403);
    expect((await call('GET', '/api/admin/status', 'u9:admin@example.com:false')).status).toBe(403);
    expect((await call('GET', '/api/admin/status', 'u9:admin@example.com:true')).status).toBe(200);
  });

  it('webhook: rejects bad signatures, creates one license per payment, revokes on refund', async () => {
    const bad = await fetch(`${base}/api/webhooks/dodo`, { method: 'POST', body: '{"type":"payment.succeeded"}', headers: { 'webhook-id': 'x', 'webhook-timestamp': '1', 'webhook-signature': 'v1,bad' } });
    expect(bad.status).toBe(401);

    const payment = { type: 'payment.succeeded', data: { payment_id: 'pay_42', customer: { email: 'buyer@example.com' }, product_cart: [{ product_id: 'prod_agency', quantity: 1 }] } };
    for (const id of ['msg_a', 'msg_b']) {
      const { body, headers } = signed(payment, id);
      expect((await fetch(`${base}/api/webhooks/dodo`, { method: 'POST', body, headers })).status).toBe(200);
    }
    expect(fakeDb._all('licenses')).toHaveLength(1);

    // Buyer signs in with the verified purchase email → auto-claimed agency license.
    const me = await (await call('GET', '/api/me', 'buyer1:buyer@example.com:true')).json();
    expect(me.entitlement).toMatchObject({ whiteLabel: true, channel: 'direct' });

    const { body, headers } = signed({ type: 'refund.succeeded', data: { payment_id: 'pay_42' } }, 'msg_c');
    expect((await fetch(`${base}/api/webhooks/dodo`, { method: 'POST', body, headers })).status).toBe(200);
    const after = await (await call('GET', '/api/me', 'buyer1:buyer@example.com:true')).json();
    expect(after.entitlement).toBeNull();
  });

  it('webhook: a lost chargeback revokes the license; other products are ignored', async () => {
    const pay = { type: 'payment.succeeded', data: { payment_id: 'pay_77', customer: { email: 'cb@example.com' }, product_cart: [{ product_id: 'prod_lifetime', quantity: 1 }] } };
    let s = signed(pay, 'msg_d');
    expect((await fetch(`${base}/api/webhooks/dodo`, { method: 'POST', body: s.body, headers: s.headers })).status).toBe(200);
    const other = { type: 'payment.succeeded', data: { payment_id: 'pay_78', customer: { email: 'x@example.com' }, product_cart: [{ product_id: 'pdt_something_else', quantity: 1 }] } };
    s = signed(other, 'msg_e');
    expect((await fetch(`${base}/api/webhooks/dodo`, { method: 'POST', body: s.body, headers: s.headers })).status).toBe(200);
    expect(fakeDb._all('licenses').filter(([, l]: any) => l.orderReference === 'pay_78')).toHaveLength(0);

    const me = await (await call('GET', '/api/me', 'cb1:cb@example.com:true')).json();
    expect(me.entitlement).toMatchObject({ whiteLabel: false, channel: 'direct' });
    s = signed({ type: 'dispute.lost', data: { payment_id: 'pay_77', dispute_id: 'dsp_1' } }, 'msg_f');
    expect((await fetch(`${base}/api/webhooks/dodo`, { method: 'POST', body: s.body, headers: s.headers })).status).toBe(200);
    const after = await (await call('GET', '/api/me', 'cb1:cb@example.com:true')).json();
    expect(after.entitlement).toBeNull();
  });

  it('account deletion removes audits and key and releases the license', async () => {
    const [code] = await generateCodes(1, { whiteLabel: false, channel: 'marketplace' });
    await call('POST', '/api/licenses/activate', 'u1:a@b.com:true', { code });
    await fakeDb.collection('audits').doc('a1').set({ userId: 'u1', status: 'completed' });
    expect((await call('DELETE', '/api/me', 'u1:a@b.com:true')).status).toBe(200);
    expect(fakeDb._all('audits')).toHaveLength(0);
    expect(fakeDb._all('users')).toHaveLength(0);
    expect(fakeDb._all('licenses')[0][1].status).toBe('available');
  });
});
