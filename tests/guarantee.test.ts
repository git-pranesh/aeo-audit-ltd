import { describe, expect, it } from 'vitest';
import { fakeDb } from './setup';
import { GUARANTEE, guaranteeStatus } from '../shared/guarantee';
import { startAudit } from '../server/services/audit-store';
import { markRefundRequested, recordDownload, setRefundResult } from '../server/services/user-service';

const purchasedAt = '2026-10-01T00:00:00.000Z';
const day = (n: number) => new Date(new Date(purchasedAt).getTime() + n * 24 * 60 * 60 * 1000);

describe('money-back guarantee', () => {
  it('is open for a fresh direct purchase with no audits and no downloads', () => {
    const s = guaranteeStatus({ channel: 'direct', purchasedAt, usage: undefined, now: day(1) });
    expect(s).toMatchObject({ eligible: true, reason: 'ok', auditsRun: 0, downloads: 0, maxAudits: GUARANTEE.maxAudits });
    expect(s.until).toBe(day(GUARANTEE.days).toISOString());
  });

  it('allows fewer than the audit limit, then closes', () => {
    expect(guaranteeStatus({ channel: 'direct', purchasedAt, usage: { auditsRun: 2 }, now: day(1) }).eligible).toBe(true);
    expect(guaranteeStatus({ channel: 'direct', purchasedAt, usage: { auditsRun: 3 }, now: day(1) })).toMatchObject({ eligible: false, reason: 'audits' });
  });

  it('closes on any download, after the window, for non-direct licences, and once requested', () => {
    expect(guaranteeStatus({ channel: 'direct', purchasedAt, usage: { downloads: 1 }, now: day(1) })).toMatchObject({ eligible: false, reason: 'downloads' });
    expect(guaranteeStatus({ channel: 'direct', purchasedAt, usage: {}, now: day(GUARANTEE.days + 1) })).toMatchObject({ eligible: false, reason: 'expired' });
    expect(guaranteeStatus({ channel: 'partner', purchasedAt, usage: {}, now: day(1) })).toMatchObject({ eligible: false, reason: 'not_direct' });
    expect(guaranteeStatus({ channel: 'direct', purchasedAt, usage: { refundRequestedAt: purchasedAt }, now: day(1) })).toMatchObject({ eligible: false, reason: 'refunded' });
  });

  it('counts audits started and exports on the user record', async () => {
    const ctx = { companyName: '', industry: '', businessType: '', targetAudience: '', valueProposition: '', keywords: [], competitors: [] };
    await startAudit({ uid: 'u1', idempotencyKey: 'key-00000001', websiteUrl: 'https://a.com', domain: 'a.com', context: ctx });
    await startAudit({ uid: 'u1', idempotencyKey: 'key-00000002', websiteUrl: 'https://b.com', domain: 'b.com', context: ctx });
    await startAudit({ uid: 'u1', idempotencyKey: 'key-00000002', websiteUrl: 'https://b.com', domain: 'b.com', context: ctx }); // retry: not counted twice
    await recordDownload('u1', 'pdf');
    const user = (await fakeDb.collection('users').doc('u1').get()).data();
    expect(user?.guarantee).toMatchObject({ auditsRun: 2, downloads: 1, lastDownload: 'pdf' });
  });

  it('marks a refund request once, and can clear it when the provider fails', async () => {
    expect(await markRefundRequested('u2')).toBe(true);
    expect(await markRefundRequested('u2')).toBe(false);
    await setRefundResult('u2', null);
    expect(await markRefundRequested('u2')).toBe(true);
    await setRefundResult('u2', { refundId: 'ref_1' });
    expect((await fakeDb.collection('users').doc('u2').get()).data()?.guarantee?.refundId).toBe('ref_1');
  });
});
