/**
 * HeyCatch server events: business outcomes only the backend knows.
 * Server calls send immediately and never throw; we await them so a request
 * cannot finish mid-send. Ids are Firebase uids, the same as the browser side.
 */
import { analytics } from '@heycatch/sdk';
import type { Request } from 'express';

// Test runs must never send events.
if (!process.env.VITEST) analytics.init({ projectKey: 'hck_pk_UcdGoSp6IP9msvAHpcGe84rGIUqwgWIy' });

export async function trackServerEvent(
  name: string,
  properties: Record<string, string | number | boolean | null | undefined>,
  userId: string,
  request?: Request,
): Promise<void> {
  // Drop missing values: the SDK accepts only plain scalars.
  const props = Object.fromEntries(Object.entries(properties).filter(([, v]) => v !== undefined)) as Record<string, string | number | boolean | null>;
  try {
    await analytics.trackEvent(name, props, request ? { userId, request } : { userId });
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
