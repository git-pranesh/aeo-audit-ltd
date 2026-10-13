import { describe, expect, it } from 'vitest';
import { fakeDb } from './setup';
import {
  activateCode, claimPurchasedLicense, createPurchasedLicense, generateCodes, hashCode,
  normalizeCode, releaseLicense, setLicenseStatus,
} from '../server/services/license-service';

const userDoc = async (uid: string) => (await fakeDb.collection('users').doc(uid).get()).data();

describe('license codes', () => {
  it('normalizes and hashes codes; never stores plaintext', async () => {
    expect(normalizeCode('cr-abcd-efgh')).toBe('CRABCDEFGH');
    const [code] = await generateCodes(1, { whiteLabel: false, channel: 'marketplace' });
    const stored = fakeDb._all('licenses');
    expect(stored).toHaveLength(1);
    expect(stored[0][0]).toBe(hashCode(code));
    expect(JSON.stringify(stored)).not.toContain(normalizeCode(code));
  });

  it('activates a code once and sets the server-side entitlement', async () => {
    const [code] = await generateCodes(1, { whiteLabel: true, channel: 'partner' });
    const ent = await activateCode('u1', code.toLowerCase().replace(/-/g, ' '));
    expect(ent).toMatchObject({ product: 'lifetime', whiteLabel: true, status: 'active', channel: 'partner' });
    expect((await userDoc('u1'))?.entitlement?.licenseId).toBe(hashCode(code));

    await expect(activateCode('u2', code)).rejects.toMatchObject({ code: 'ALREADY_ACTIVATED' });
  });

  it('rejects unknown codes and code stacking', async () => {
    await expect(activateCode('u1', 'CR-NOPE-NOPE-NOPE-NOPE')).rejects.toMatchObject({ code: 'INVALID_CODE' });
    const [a, b] = await generateCodes(2, { whiteLabel: false, channel: 'marketplace' });
    await activateCode('u1', a);
    await expect(activateCode('u1', b)).rejects.toMatchObject({ code: 'ALREADY_LICENSED' });
  });

  it('re-activating the same code on the same account is idempotent', async () => {
    const [code] = await generateCodes(1, { whiteLabel: false, channel: 'marketplace' });
    const first = await activateCode('u1', code);
    await expect(activateCode('u1', code)).resolves.toMatchObject({ licenseId: first.licenseId });
  });
});

describe('direct purchases', () => {
  it('duplicate webhook deliveries create exactly one license', async () => {
    const a = await createPurchasedLicense({ orderReference: 'pay_123', email: 'Buyer@Example.com', whiteLabel: false });
    const b = await createPurchasedLicense({ orderReference: 'pay_123', email: 'buyer@example.com', whiteLabel: false });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(fakeDb._all('licenses')).toHaveLength(1);
  });

  it('is claimed only by the verified purchase email', async () => {
    await createPurchasedLicense({ orderReference: 'pay_9', email: 'buyer@example.com', whiteLabel: true });
    expect(await claimPurchasedLicense('u1', 'buyer@example.com', false)).toBeNull();
    expect(await claimPurchasedLicense('u2', 'other@example.com', true)).toBeNull();
    const ent = await claimPurchasedLicense('u3', 'BUYER@example.com', true);
    expect(ent).toMatchObject({ whiteLabel: true, channel: 'direct' });
    expect(await claimPurchasedLicense('u4', 'buyer@example.com', true)).toBeNull();
  });

  it('refund removes the entitlement; reactivation restores it', async () => {
    const { licenseId } = await createPurchasedLicense({ orderReference: 'pay_r', email: 'x@y.com', whiteLabel: false });
    await claimPurchasedLicense('u1', 'x@y.com', true);
    await setLicenseStatus(licenseId, 'refunded');
    expect((await userDoc('u1'))?.entitlement).toBeUndefined();
    await setLicenseStatus(licenseId, 'active');
    expect((await userDoc('u1'))?.entitlement?.status).toBe('active');
  });

  it('released licenses can be activated again', async () => {
    const [code] = await generateCodes(1, { whiteLabel: false, channel: 'marketplace' });
    const ent = await activateCode('u1', code);
    await releaseLicense(ent.licenseId, 'u1');
    await expect(activateCode('u2', code)).resolves.toMatchObject({ status: 'active' });
  });
});
