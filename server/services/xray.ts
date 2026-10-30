/**
 * HellYeah X-Ray server events: conversions only the backend can confirm
 * (sign-up, paid purchase), joined to the ad click through the visitor id
 * from X-Ray's hy_attr cookie. Sent only when the visitor may be tracked.
 */
import { createXRay, cv, type TrackData } from '@hellyeah/x-ray/server';
import { XRAY_WEBSITE_ID } from '../../shared/meta';

export { cv };

const xray = createXRay(XRAY_WEBSITE_ID);

/** Visitor id inside hy_attr (base64url JSON). */
export function xrayVisitorId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const vid = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))?.vid;
    return typeof vid === 'string' && /^[0-9a-f-]{36}$/i.test(vid) ? vid : undefined;
  } catch {
    return undefined;
  }
}

export async function sendXrayEvent(name: string, data: TrackData): Promise<void> {
  // Test runs must never send events.
  if (!XRAY_WEBSITE_ID || process.env.VITEST) return;
  try {
    await xray.trackImmediate(name, data); // resolves even when the request fails
  } catch {
    // Analytics must never break a request.
  }
}
