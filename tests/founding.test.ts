import { describe, expect, it } from 'vitest';
import { fakeDb } from './setup';
import { foundingStatus, FOUNDING_TOTAL, PRICE_AFTER, PRICE_STEPS } from '../shared/founding';
import { countSoldLicenses, invalidateFoundingCache } from '../server/services/founding';

describe('founding price steps', () => {
  it('starts at step 1 and moves through the steps as licences sell', () => {
    expect(foundingStatus(0)).toMatchObject({ step: 1, prices: { lifetime: 99, agency: 149 }, remainingInStep: 300, remaining: 1000, founding: true, next: PRICE_STEPS[1].prices });
    expect(foundingStatus(299)).toMatchObject({ step: 1, remainingInStep: 1 });
    expect(foundingStatus(300)).toMatchObject({ step: 2, prices: { lifetime: 119, agency: 169 }, remainingInStep: 400 });
    expect(foundingStatus(700)).toMatchObject({ step: 3, prices: { lifetime: 139, agency: 189 }, next: PRICE_AFTER });
    expect(foundingStatus(999)).toMatchObject({ step: 3, remaining: 1 });
  });

  it('settles at the final price after the founding run', () => {
    expect(foundingStatus(FOUNDING_TOTAL)).toMatchObject({ step: 0, prices: PRICE_AFTER, remaining: 0, remainingInStep: 0, next: null, founding: false });
    expect(foundingStatus(5000)).toMatchObject({ step: 0, prices: PRICE_AFTER });
  });

  it('counts only direct licences that were not refunded or charged back', async () => {
    const lic = fakeDb.collection('licenses');
    await lic.doc('a').set({ channel: 'direct', status: 'available' });
    await lic.doc('b').set({ channel: 'direct', status: 'active' });
    await lic.doc('c').set({ channel: 'direct', status: 'refunded' });
    await lic.doc('d').set({ channel: 'direct', status: 'revoked' });
    await lic.doc('e').set({ channel: 'partner', status: 'active' });
    await lic.doc('f').set({ channel: 'marketplace', status: 'available' });
    invalidateFoundingCache();
    expect(await countSoldLicenses()).toBe(2);
  });
});
