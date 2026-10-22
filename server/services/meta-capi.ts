/**
 * Meta Conversions API (server-side events). Each event carries the same
 * event_id as its browser Pixel event so Meta keeps only one of them.
 * Off unless META_PIXEL_ID (shared/meta.ts) and the META_CAPI_TOKEN secret are set.
 * Never throws: tracking must not break a request.
 */
import crypto from 'crypto';
import type { Request } from 'express';
import { CONSENT_COOKIE, META_PIXEL_ID, REGION_COOKIE } from '../../shared/meta';

const GRAPH = 'https://graph.facebook.com/v26.0';

export const sha256 = (value: string) => crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');

export interface MetaUserData {
  em?: string[];
  external_id?: string[];
  client_ip_address?: string;
  client_user_agent?: string;
  fbp?: string;
  fbc?: string;
}

export interface MetaServerEvent {
  event_name: string;
  event_id: string;
  event_source_url: string;
  action_source: 'website';
  user_data: MetaUserData;
  custom_data?: Record<string, string | number>;
}

export function cookieValue(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie || '';
  const m = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : undefined;
}

/** Same rule as the browser Pixel: outside the EEA/UK/CH, or the visitor accepted. */
export function requestAllowsTracking(req: Request): boolean {
  const consent = cookieValue(req, CONSENT_COOKIE);
  if (consent === 'granted') return true;
  if (consent === 'denied') return false;
  return cookieValue(req, REGION_COOKIE) === 'open';
}

/** Browser identifiers for an event happening during the user's own request. */
export function requestUserData(req: Request): MetaUserData {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || undefined;
  return {
    client_ip_address: ip,
    client_user_agent: req.headers['user-agent'] || undefined,
    fbp: cookieValue(req, '_fbp'),
    fbc: cookieValue(req, '_fbc'),
  };
}

export async function sendMetaEvent(event: MetaServerEvent): Promise<boolean> {
  const token = process.env.META_CAPI_TOKEN;
  if (!META_PIXEL_ID || !token || process.env.VITEST) return false;
  if (!event.user_data.client_user_agent) {
    console.warn(`Meta CAPI: ${event.event_name} skipped, no user agent (required for website events)`);
    return false;
  }
  const user_data = Object.fromEntries(Object.entries(event.user_data).filter(([, v]) => v !== undefined && v !== ''));
  const body: Record<string, unknown> = { data: [{ ...event, user_data, event_time: Math.floor(Date.now() / 1000) }] };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
  try {
    const res = await fetch(`${GRAPH}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`Meta CAPI: ${event.event_name} rejected (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Meta CAPI: ${event.event_name} failed: ${(err as Error).message}`);
    return false;
  }
}
