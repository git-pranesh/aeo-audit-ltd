import { describe, expect, it } from 'vitest';
import { fakeDb } from './setup';
import { FAIR_USE, completeAudit, failAudit, listAudits, startAudit } from '../server/services/audit-store';

const ctx = { companyName: 'Acme', industry: 'SaaS', businessType: 'B2B', targetAudience: 'SMBs', valueProposition: 'x', keywords: [], competitors: [] };
const start = (uid: string, key: string) => startAudit({ uid, idempotencyKey: key, websiteUrl: 'https://acme.com/', domain: 'acme.com', context: ctx });
const fakeReport = (score: number) => ({ auditResults: { overallScore: score, letterGrade: 'B' } } as any);

describe('audit persistence and fair use', () => {
  it('is idempotent per request id', async () => {
    const a = await start('u1', 'req-00000001');
    const b = await start('u1', 'req-00000001');
    expect(a.kind).toBe('started');
    expect(b.kind).toBe('existing');
    expect(fakeDb._all('audits')).toHaveLength(1);
  });

  it('limits concurrent audits per account', async () => {
    await start('u1', 'req-00000001');
    await start('u1', 'req-00000002');
    await expect(start('u1', 'req-00000003')).rejects.toMatchObject({ code: 'TOO_MANY_RUNNING' });
    // Another account is unaffected.
    await expect(start('u2', 'req-00000003')).resolves.toMatchObject({ kind: 'started' });
  });

  it('a failed audit gives back its place in the limits and the guarantee count, once', async () => {
    const userDoc = async () => (await fakeDb.collection('users').doc('u9').get()).data();
    for (const key of ['fail-0001', 'fail-0002', 'fail-0003', 'fail-0004', 'fail-0005']) {
      const r = await start('u9', key);
      if (r.kind !== 'started') throw new Error('expected start');
      await failAudit('u9', r.auditId, 'provider stalled');
      await failAudit('u9', r.auditId, 'repeated call must not refund twice');
    }
    const user = await userDoc();
    expect(user?.usage.recent).toHaveLength(0);
    expect(user?.usage.active).toHaveLength(0);
    expect(user?.guarantee.auditsRun).toBe(0);
    const list = await listAudits('u9');
    expect(list.filter((x) => x.status === 'failed')).toHaveLength(5);
  });

  it('a failed audit never refunds another audit\'s place', async () => {
    const a = await start('u8', 'keep-0001');
    const b = await start('u8', 'keep-0002');
    if (a.kind !== 'started' || b.kind !== 'started') throw new Error('expected start');
    await failAudit('u8', b.auditId, 'boom');
    const user = (await fakeDb.collection('users').doc('u8').get()).data();
    expect(user?.usage.recent).toHaveLength(1);
    expect(user?.usage.active.map((x: any) => x.id)).toEqual([a.auditId]);
    expect(user?.guarantee.auditsRun).toBe(1);
  });

  it('frees the slot on completion and enforces the hourly cap on audits that did not fail', async () => {
    const a = await start('u1', 'req-00000001');
    const b = await start('u1', 'req-00000002');
    if (a.kind !== 'started' || b.kind !== 'started') throw new Error('expected start');
    await completeAudit('u1', a.auditId, fakeReport(61), { signals: {} as any, sitemapUrls: [], facts: { pages: [], logoUrl: null, socialProfiles: [], faqs: [] }, sitemapLocation: null, hasLlmsTxt: false }, null);
    await failAudit('u1', b.auditId, 'boom');
    const c = await start('u1', 'req-00000003');
    const d = await start('u1', 'req-00000005');
    expect(c.kind).toBe('started');
    expect(d.kind).toBe('started');
    await expect(start('u1', 'req-00000004')).rejects.toMatchObject({ code: 'TOO_MANY_RUNNING' });
    if (d.kind !== 'started') throw new Error('expected start');
    await failAudit('u1', d.auditId, 'boom');
    if (c.kind !== 'started') throw new Error('expected start');
    await completeAudit('u1', c.auditId, fakeReport(62), { signals: {} as any, sitemapUrls: [], facts: { pages: [], logoUrl: null, socialProfiles: [], faqs: [] }, sitemapLocation: null, hasLlmsTxt: false } as any, null);
    const e = await start('u1', 'req-00000006');
    expect(e.kind).toBe('started');
    await expect(start('u1', 'req-00000007')).rejects.toMatchObject({ code: 'HOURLY_LIMIT' });

    const list = await listAudits('u1');
    expect(list.filter((x) => x.status === 'completed')).toHaveLength(2);
    expect(list.filter((x) => x.status === 'failed')).toHaveLength(2);
    expect(list.filter((x) => x.status === 'running')).toHaveLength(1);
    expect(list.find((x) => x.overallScore === 61)?.status).toBe('completed');
  });

  it(`keeps only the latest ${FAIR_USE.savedAudits} audits`, async () => {
    // Seed 30 finished audits directly, then complete one more.
    for (let i = 0; i < 30; i++) {
      await fakeDb.collection('audits').doc(`seed${String(i).padStart(20, '0')}`).set({
        userId: 'u1', status: 'completed', createdAt: new Date(2020, 0, i + 1).toISOString(), domain: 'acme.com', websiteUrl: 'https://acme.com/', context: ctx,
      });
    }
    const s = await start('u1', 'req-00000009');
    if (s.kind !== 'started') throw new Error('expected start');
    await completeAudit('u1', s.auditId, fakeReport(70), { signals: {} as any, sitemapUrls: [], facts: { pages: [], logoUrl: null, socialProfiles: [], faqs: [] }, sitemapLocation: null, hasLlmsTxt: false }, null);
    const remaining = fakeDb._all('audits').filter(([, d]) => d.userId === 'u1');
    expect(remaining).toHaveLength(FAIR_USE.savedAudits);
    expect(remaining.some(([id]) => id === s.auditId)).toBe(true);
  });
});

describe('agency limits', () => {
  it('agency accounts get a higher hourly ceiling', async () => {
    const { AGENCY_FAIR_USE } = await import('../server/services/audit-store');
    const run = async (n: number) => {
      const r = await startAudit({ uid: 'agency', idempotencyKey: `agency-req-${n}`, websiteUrl: 'https://a.com/', domain: 'a.com', context: ctx, limits: AGENCY_FAIR_USE });
      if (r.kind === 'started') await completeAudit('agency', r.auditId, fakeReport(50), { signals: {} as any, sitemapUrls: [], facts: { pages: [], logoUrl: null, socialProfiles: [], faqs: [] }, sitemapLocation: null, hasLlmsTxt: false } as any, null, AGENCY_FAIR_USE.savedAudits);
    };
    for (let i = 0; i < 5; i++) await run(i); // > 3/hour lifetime cap, < 10/hour agency cap
    expect(fakeDb._all('audits').filter(([, d]) => d.userId === 'agency')).toHaveLength(5);
  });
});
