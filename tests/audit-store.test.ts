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

  it('frees the slot on completion/failure and enforces the hourly cap', async () => {
    const a = await start('u1', 'req-00000001');
    const b = await start('u1', 'req-00000002');
    if (a.kind !== 'started' || b.kind !== 'started') throw new Error('expected start');
    await completeAudit('u1', a.auditId, fakeReport(61), { signals: {} as any, sitemapUrls: [], scrapedText: '' }, null);
    await failAudit('u1', b.auditId, 'boom');
    const c = await start('u1', 'req-00000003');
    expect(c.kind).toBe('started');
    await expect(start('u1', 'req-00000004')).rejects.toMatchObject({ code: 'HOURLY_LIMIT' });

    const list = await listAudits('u1');
    expect(list.map((x) => x.status).sort()).toEqual(['completed', 'failed', 'running']);
    expect(list.find((x) => x.status === 'completed')?.overallScore).toBe(61);
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
    await completeAudit('u1', s.auditId, fakeReport(70), { signals: {} as any, sitemapUrls: [], scrapedText: '' }, null);
    const remaining = fakeDb._all('audits').filter(([, d]) => d.userId === 'u1');
    expect(remaining).toHaveLength(FAIR_USE.savedAudits);
    expect(remaining.some(([id]) => id === s.auditId)).toBe(true);
  });
});
