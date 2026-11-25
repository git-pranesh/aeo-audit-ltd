/**
 * ChatGPT ads Conversions API (OpenAI Ads Manager). Server events carry the same id as the
 * browser Measurement Pixel event (event_id) so OpenAI keeps only one of them.
 * Off unless OPENAI_PIXEL_ID (shared/meta.ts) and the OPENAI_CAPI_KEY secret are set.
 * Docs: https://developers.openai.com/ads/conversions-api
 * Never throws: tracking must not break a request.
 */
import { OPENAI_PIXEL_ID } from '../../shared/meta';

export interface OpenAiServerEvent {
  id: string;
  type: 'order_created' | 'registration_completed' | 'checkout_started' | 'lead_created';
  source_url: string;
  /** OpenAI click reference from the pixel's __oppref cookie, unmodified. */
  oppref?: string;
  user: {
    obref?: string;
    emails_sha256?: string[];
    ip_address?: string;
    user_agent?: string;
  };
  data: Record<string, unknown>;
}

export async function sendOpenAiEvent(event: OpenAiServerEvent): Promise<boolean> {
  const key = process.env.OPENAI_CAPI_KEY;
  if (!OPENAI_PIXEL_ID || !key || process.env.VITEST) return false;
  const user = Object.fromEntries(Object.entries(event.user).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
  const { oppref, ...rest } = event;
  const body = {
    validate_only: process.env.OPENAI_CAPI_VALIDATE_ONLY === '1',
    events: [{ ...rest, ...(oppref ? { oppref } : {}), user, action_source: 'web', timestamp_ms: Date.now() }],
  };
  try {
    const res = await fetch(`https://bzr.openai.com/v1/events?pid=${encodeURIComponent(OPENAI_PIXEL_ID)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`OpenAI CAPI: ${event.type} rejected (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`OpenAI CAPI: ${event.type} failed: ${(err as Error).message}`);
    return false;
  }
}
