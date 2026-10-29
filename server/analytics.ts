import { analytics } from '@heycatch/sdk';
import { createXRay, cv } from '@hellyeah/x-ray/server';
import type { Request } from 'express';

export const TRACKER_ID =
  process.env.HELLYEAH_TRACKER_ID || '01a188c5-121c-7000-8914-9c4ee203853a';

export const tracker = createXRay(TRACKER_ID, {
  env: process.env.HELLYEAH_TRACKER_ENV,
});

export { cv };

if (!process.env.VITEST) analytics.init({ projectKey: 'hck_pk_UcdGoSp6IP9msvAHpcGe84rGIUqwgWIy' });

function visitorIdFromRequest(request?: Request): string | undefined {
  const raw = (request?.headers.cookie ?? '')
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith('hy_attr='))
    ?.slice('hy_attr='.length);

  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(Buffer.from(decodeURIComponent(raw), 'base64url').toString('utf8'));
    return typeof parsed?.vid === 'string' ? parsed.vid : undefined;
  } catch {
    return undefined;
  }
}

function visitorBridge(request?: Request): { visitorId: string } | undefined {
  const visitorId = visitorIdFromRequest(request);
  return visitorId ? { visitorId } : undefined;
}

export async function trackServerEvent(
  name: string,
  properties: Record<string, string | number | boolean | null | undefined>,
  userId: string,
  request?: Request,
): Promise<void> {
  const metadata = Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined)) as Record<string, string | number | boolean | null>;

  try {
    await analytics.trackEvent(name, metadata, request ? { userId, request } : { userId });
  } catch {
    // Analytics must never break a request.
  }

  try {
    await tracker.track(name, {
      distinctId: userId,
      ...visitorBridge(request),
      metadata,
    });
  } catch {
    // Analytics must never break a request.
  }
}

export async function trackRegistrationComplete(
  userId: string,
  email: string | undefined,
  request: Request,
): Promise<void> {
  try {
    await tracker.track(cv.registrationComplete, {
      distinctId: userId,
      ...visitorBridge(request),
      ...(email ? { identity: { email } } : {}),
    });
  } catch {
    // Analytics must never break a request.
  }
}

export async function setServerPlan(userId: string, plan: 'lifetime' | 'agency' | 'none'): Promise<void> {
  try {
    await analytics.setIdentity(userId, { plan });
  } catch {
    // ignore
  }
}
