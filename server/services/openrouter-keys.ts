/**
 * OpenRouter key management (sponsored invite keys only).
 *
 * Customers still bring their own key for everything else. This module is used
 * by admin invites: each invite gets its own OpenRouter key, created with a
 * dollar cap through OpenRouter's key-management API, so a guest can run audits
 * on the company account without the cap ever being shared between guests.
 *
 * Needs OPENROUTER_MANAGEMENT_KEY (openrouter.ai → Settings → Management keys).
 * Management keys cannot call completion endpoints; completion calls keep
 * using the per-account key via services/openrouter.ts.
 *
 * Docs: https://openrouter.ai/docs/api/api-reference/api-keys
 */

const KEYS_BASE = 'https://openrouter.ai/api/v1/keys';

export class ManagedKeyError extends Error {
  constructor(message: string, public code: 'NOT_CONFIGURED' | 'UPSTREAM', public status = 502) {
    super(message);
  }
}

export interface ManagedKeyUsage {
  usage: number;            // USD spent, lifetime of the key
  limit: number | null;     // USD cap, null = none
  limitRemaining: number | null;
  disabled: boolean;
  lastUsedAt: string | null;
}

export function isKeyManagementConfigured(): boolean {
  return !!process.env.OPENROUTER_MANAGEMENT_KEY;
}

function managementKey(): string {
  const key = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!key) {
    throw new ManagedKeyError('Invites need OPENROUTER_MANAGEMENT_KEY (an OpenRouter management key) in the server secrets.', 'NOT_CONFIGURED', 503);
  }
  return key;
}

async function request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${KEYS_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${managementKey()}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    // Never echo the upstream body: it can contain key material.
    console.error(`OpenRouter key management ${method} ${path} → ${res.status}`);
    throw new ManagedKeyError(`OpenRouter key management returned ${res.status}. Check the management key and try again.`, 'UPSTREAM', 502);
  }
  return res.json();
}

function toUsage(data: any): ManagedKeyUsage {
  return {
    usage: typeof data?.usage === 'number' ? data.usage : 0,
    limit: typeof data?.limit === 'number' ? data.limit : null,
    limitRemaining: typeof data?.limit_remaining === 'number' ? data.limit_remaining : null,
    disabled: data?.disabled === true,
    lastUsedAt: typeof data?.last_used_at === 'string' ? data.last_used_at : null,
  };
}

/** Creates a capped key. The plaintext key exists only in this response. */
export async function createManagedKey(params: { name: string; limitUsd: number }): Promise<{ key: string; hash: string }> {
  const json = await request('POST', '', { name: params.name.slice(0, 256), limit: params.limitUsd });
  const key = typeof json?.key === 'string' ? json.key : '';
  const hash = typeof json?.data?.hash === 'string' ? json.data.hash : '';
  if (!key || !hash) {
    throw new ManagedKeyError('OpenRouter did not return a key. Try again.', 'UPSTREAM', 502);
  }
  return { key, hash };
}

export async function getManagedKeyUsage(hash: string): Promise<ManagedKeyUsage> {
  const json = await request('GET', `/${encodeURIComponent(hash)}`);
  return toUsage(json?.data);
}

export async function updateManagedKey(hash: string, patch: { disabled?: boolean; limitUsd?: number }): Promise<ManagedKeyUsage> {
  const body: Record<string, unknown> = {};
  if (typeof patch.disabled === 'boolean') body.disabled = patch.disabled;
  if (typeof patch.limitUsd === 'number') body.limit = patch.limitUsd;
  const json = await request('PATCH', `/${encodeURIComponent(hash)}`, body);
  return toUsage(json?.data);
}

export async function deleteManagedKey(hash: string): Promise<void> {
  await request('DELETE', `/${encodeURIComponent(hash)}`);
}
