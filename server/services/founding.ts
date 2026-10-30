/**
 * Live count of direct licences sold (Dodo), minus refunds and chargebacks.
 * Partner and marketplace codes do not count. Cached briefly: the number is
 * shown on every page of the website.
 */
import { adminDb } from '../firebase-admin';
import { foundingStatus, type FoundingStatus } from '../../shared/founding';
import type { License } from './license-service';

const TTL_MS = 30 * 1000;
let cache: { at: number; sold: number } | null = null;

export async function countSoldLicenses(): Promise<number> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.sold;
  const snap = await adminDb.collection('licenses').where('channel', '==', 'direct').get();
  const sold = snap.docs.filter((d) => {
    const s = (d.data() as License).status;
    return s === 'available' || s === 'active';
  }).length;
  cache = { at: Date.now(), sold };
  return sold;
}

/** Call after a sale or refund so the next read is fresh. */
export function invalidateFoundingCache(): void {
  cache = null;
}

export async function getFoundingStatus(): Promise<FoundingStatus> {
  return foundingStatus(await countSoldLicenses());
}
