import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { fakeDb } from './setup';
import { registerRoutes } from '../server/routes';
import { activateCode, normalizeCode } from '../server/services/license-service';
import { requireOpenRouterKey, saveOpenRouterKey } from '../server/services/user-service';
import {
  createInvite, getInviteLink, listInvites, lookupInvite, revokeInvite, setInviteCap,
} from '../server/services/invite-service';

const MANAGED_KEY = 'sk-or-v1-managed-0123456789abcdef0123456789abcdef';
const HASH = 'f01d52606dc8f0a8303a7b5cc3fa07109c2e346cec7c0a16b40de462992ce943';
const APP = 'https://app.example.com';

/** Fake OpenRouter key-management API: records every call, answers like the real one. */
function stubOpenRouter(overrides: { createStatus?: number } = {}) {
  const calls: { method: string; url: string; body: any }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    if (!url.startsWith('https://openrouter.ai/api/v1/keys')) throw new Error(`unexpected fetch ${url}`);
    if (method === 'POST') {
      if (overrides.createStatus) return new Response('{"error":"nope"}', { status: overrides.createStatus });
      return Response.json({ key: MANAGED_KEY, data: { hash: HASH, name: body.name, limit: body.limit, usage: 0, limit_remaining: body.limit, disabled: false } });
    }
    if (method === 'DELETE') return Response.json({ deleted: true });
    // GET / PATCH
    return Response.json({ data: { hash: HASH, limit: body?.limit ?? 5, usage: 1.25, limit_remaining: (body?.limit ?? 5) - 1.25, disabled: body?.disabled ?? false, last_used_at: '2026-11-04T10:00:00Z' } });
  }));
  return calls;
}

const codeFromLink = (link: string) => decodeURIComponent(link.split('/invite/')[1]);

beforeEach(() => { process.env.OPENROUTER_MANAGEMENT_KEY = 'sk-or-mgmt-test'; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.OPENROUTER_MANAGEMENT_KEY; });

describe('invites', () => {
  it('refuses without a management key and creates nothing', async () => {
    delete process.env.OPENROUTER_MANAGEMENT_KEY;
    const calls = stubOpenRouter();
    await expect(createInvite({ name: 'Stella', capUsd: 5, whiteLabel: false, createdBy: 'admin@example.com', appUrl: APP }))
      .rejects.toMatchObject({ code: 'NOT_CONFIGURED', status: 503 });
    expect(calls).toHaveLength(0);
    expect(fakeDb._all('licenses')).toHaveLength(0);
  });

  it('creates a capped OpenRouter key and a partner licence; stores only ciphertext', async () => {
    const calls = stubOpenRouter();
    const { id, link } = await createInvite({ name: 'Stella', note: 'LinkedIn creator', capUsd: 5, whiteLabel: false, createdBy: 'admin@example.com', appUrl: APP });

    expect(calls[0]).toMatchObject({ method: 'POST', url: 'https://openrouter.ai/api/v1/keys', body: { name: 'Citation Rocket invite: Stella', limit: 5 } });
    expect(link).toMatch(/^https:\/\/app\.example\.com\/invite\/CR-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const [[storedId, doc]] = fakeDb._all('licenses');
    expect(storedId).toBe(id);
    expect(doc).toMatchObject({ kind: 'invite', channel: 'partner', status: 'available', note: 'LinkedIn creator', invite: { name: 'Stella', capUsd: 5, keyHash: HASH } });
    const raw = JSON.stringify(doc);
    expect(raw).not.toContain(MANAGED_KEY);
    expect(raw).not.toContain(normalizeCode(codeFromLink(link)));
    expect(doc.sponsoredKey.last4).toBe(MANAGED_KEY.slice(-4));
  });

  it('removes the key again if the licence cannot be written', async () => {
    const calls = stubOpenRouter();
    const first = await createInvite({ name: 'A', capUsd: 5, whiteLabel: false, createdBy: 'x', appUrl: APP });
    // Force a collision: pre-create the next licence id by making generateCode deterministic is overkill;
    // instead, fake a Firestore write failure.
    const col = fakeDb.collection('licenses');
    const realDoc = fakeDb.docRef.bind(fakeDb);
    vi.spyOn(fakeDb, 'docRef').mockImplementation((c: string, id: string) => {
      const ref = realDoc(c, id);
      if (c === 'licenses' && id !== first.id) ref.create = async () => { throw new Error('write failed'); };
      return ref;
    });
    await expect(createInvite({ name: 'B', capUsd: 5, whiteLabel: false, createdBy: 'x', appUrl: APP })).rejects.toThrow('write failed');
    vi.restoreAllMocks();
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual([`https://openrouter.ai/api/v1/keys/${HASH}`]);
    expect((await col.get()).size).toBe(1);
  });

  it('activating the link gives the account the licence and the sponsored key', async () => {
    stubOpenRouter();
    const { link } = await createInvite({ name: 'Stella', capUsd: 5, whiteLabel: true, createdBy: 'x', appUrl: APP });
    const ent = await activateCode('stella', codeFromLink(link));
    expect(ent).toMatchObject({ status: 'active', channel: 'partner', whiteLabel: true });
    await expect(requireOpenRouterKey('stella')).resolves.toBe(MANAGED_KEY);
    const user = (await fakeDb.collection('users').doc('stella').get()).data();
    expect(user?.openRouterKey).toMatchObject({ sponsored: true, last4: MANAGED_KEY.slice(-4) });
    expect(JSON.stringify(user)).not.toContain(MANAGED_KEY);
  });

  it('never overwrites a key the person already saved', async () => {
    stubOpenRouter();
    const own = 'sk-or-v1-own-key-0123456789abcdef0123456789';
    await saveOpenRouterKey('u1', own);
    const { link } = await createInvite({ name: 'Existing customer', capUsd: 5, whiteLabel: false, createdBy: 'x', appUrl: APP });
    await activateCode('u1', codeFromLink(link));
    await expect(requireOpenRouterKey('u1')).resolves.toBe(own);
    expect((await fakeDb.collection('users').doc('u1').get()).data()?.openRouterKey.sponsored).toBeUndefined();
  });

  it('saving their own key later replaces the sponsored one and clears the flag', async () => {
    stubOpenRouter();
    const { link } = await createInvite({ name: 'Stella', capUsd: 5, whiteLabel: false, createdBy: 'x', appUrl: APP });
    await activateCode('stella', codeFromLink(link));
    const own = 'sk-or-v1-own-key-0123456789abcdef0123456789';
    await saveOpenRouterKey('stella', own);
    await expect(requireOpenRouterKey('stella')).resolves.toBe(own);
    expect((await fakeDb.collection('users').doc('stella').get()).data()?.openRouterKey.sponsored).toBeUndefined();
  });

  it('public lookup reveals the name and state only; the link can be re-read while unused', async () => {
    stubOpenRouter();
    const { id, link } = await createInvite({ name: 'Stella', capUsd: 5, whiteLabel: false, createdBy: 'x', appUrl: APP });
    const code = codeFromLink(link);
    expect(await lookupInvite(code)).toEqual({ valid: true, name: 'Stella', status: 'open', whiteLabel: false, capUsd: 5 });
    expect(await lookupInvite('CR-NOPE-NOPE-NOPE-NOPE')).toEqual({ valid: false });
    expect(await lookupInvite('x')).toEqual({ valid: false });
    expect(await getInviteLink(id, APP)).toBe(link);

    await activateCode('stella', code);
    expect((await lookupInvite(code)).status).toBe('used');
    expect(await getInviteLink(id, APP)).toBeNull();
  });

  it('lists invites with activation details and live key usage', async () => {
    stubOpenRouter();
    const { link } = await createInvite({ name: 'Stella', capUsd: 5, whiteLabel: false, createdBy: 'admin@example.com', appUrl: APP });
    await createInvite({ name: 'Later', capUsd: 2, whiteLabel: false, createdBy: 'admin@example.com', appUrl: APP });
    await fakeDb.collection('users').doc('stella').set({ email: 'stella@example.com', createdAt: 'now' });
    await activateCode('stella', codeFromLink(link));
    await fakeDb.collection('audits').doc('a1').set({ userId: 'stella', status: 'completed' });

    const rows = await listInvites();
    expect(rows.map((r) => r.name).sort()).toEqual(['Later', 'Stella']);
    const stella = rows.find((r) => r.name === 'Stella')!;
    expect(stella).toMatchObject({ status: 'active', activatedEmail: 'stella@example.com', audits: 1, linkAvailable: false, capUsd: 5 });
    expect(stella.key).toMatchObject({ usage: 1.25, limit: 5, limitRemaining: 3.75, disabled: false });
    expect(JSON.stringify(rows)).not.toContain(MANAGED_KEY);
  });

  it('revoking removes the entitlement and disables the key; cap changes reach OpenRouter', async () => {
    const calls = stubOpenRouter();
    const { id, link } = await createInvite({ name: 'Stella', capUsd: 5, whiteLabel: false, createdBy: 'x', appUrl: APP });
    await activateCode('stella', codeFromLink(link));

    const capped = await setInviteCap(id, 12);
    expect(capped.capUsd).toBe(12);
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ limit: 12 });

    const { invite, keyDisabled } = await revokeInvite(id);
    expect(keyDisabled).toBe(true);
    expect(invite.status).toBe('revoked');
    expect(calls.filter((c) => c.method === 'PATCH').at(-1)?.body).toEqual({ disabled: true });
    expect((await fakeDb.collection('users').doc('stella').get()).data()?.entitlement).toBeUndefined();
    await expect(activateCode('other', codeFromLink(link))).rejects.toMatchObject({ code: 'LICENSE_INACTIVE' });
  });

  it('surfaces an OpenRouter failure without creating a licence', async () => {
    stubOpenRouter({ createStatus: 401 });
    await expect(createInvite({ name: 'Stella', capUsd: 5, whiteLabel: false, createdBy: 'x', appUrl: APP }))
      .rejects.toMatchObject({ code: 'UPSTREAM', status: 502 });
    expect(fakeDb._all('licenses')).toHaveLength(0);
  });
});

describe('invite HTTP API', () => {
  let server: Server;
  let base = '';

  beforeAll(() => {
    process.env.ADMIN_EMAILS = 'admin@example.com';
    const app = express();
    app.use(express.json());
    registerRoutes(app);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  const call = (method: string, path: string, token?: string, body?: unknown) => {
    const realFetch = (globalThis as any).__realFetch as typeof fetch;
    return realFetch(base + path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  // The OpenRouter stub replaces global fetch; keep the real one for calling our own server.
  beforeAll(() => { (globalThis as any).__realFetch = fetch; });

  it('admin only', async () => {
    expect((await call('GET', '/api/admin/invites', 'u1:user@example.com:true')).status).toBe(403);
    expect((await call('POST', '/api/admin/invites', 'u1:user@example.com:true', { name: 'x' })).status).toBe(403);
  });

  it('creates, lists, re-reads the link, and the public lookup leaks nothing', async () => {
    stubOpenRouter();
    const admin = 'a1:admin@example.com:true';
    const created = await call('POST', '/api/admin/invites', admin, { name: 'Stella', capUsd: 5 });
    expect(created.status).toBe(201);
    const { id, link } = await created.json();
    expect(link).toContain('/invite/CR-');

    const list = await (await call('GET', '/api/admin/invites', admin)).json();
    expect(list.configured).toBe(true);
    expect(list.invites[0]).toMatchObject({ id, name: 'Stella', status: 'available', linkAvailable: true });
    expect(JSON.stringify(list)).not.toContain(MANAGED_KEY);

    expect((await (await call('GET', `/api/admin/invites/${id}/link`, admin)).json()).link).toBe(link);

    const code = codeFromLink(link);
    const pub = await call('GET', `/api/public/invite/${encodeURIComponent(code)}`);
    expect(pub.status).toBe(200);
    const body = await pub.json();
    expect(body).toEqual({ valid: true, name: 'Stella', status: 'open', whiteLabel: false, capUsd: 5 });

    // Admin lookup by code must not include the stored secrets either.
    const lookup = await (await call('GET', `/api/admin/lookup?q=${encodeURIComponent(code)}`, admin)).json();
    expect(lookup.licenses[0].kind).toBe('invite');
    expect(lookup.licenses[0].sponsoredKey).toBeUndefined();
    expect(lookup.licenses[0].inviteCode).toBeUndefined();

    // The guest activates through the normal endpoint and /api/me reports the sponsored key.
    const act = await call('POST', '/api/licenses/activate', 's1:stella@example.com:true', { code });
    expect(act.status).toBe(200);
    const me = await act.json();
    expect(me.entitlement).toMatchObject({ status: 'active', channel: 'partner' });
    expect(me.openRouterKey).toMatchObject({ sponsored: true, last4: MANAGED_KEY.slice(-4) });

    const revoked = await call('POST', `/api/admin/invites/${id}/revoke`, admin);
    expect((await revoked.json()).invite.status).toBe('revoked');
  });

  it('reports a missing management key clearly', async () => {
    delete process.env.OPENROUTER_MANAGEMENT_KEY;
    const res = await call('POST', '/api/admin/invites', 'a1:admin@example.com:true', { name: 'Stella' });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('NOT_CONFIGURED');
  });
});
