import { describe, expect, it, vi, afterEach } from 'vitest';
import { fakeDb } from './setup';
import { fallbackFor, FALLBACK_MODEL, llmCall, llmJson, MODEL_MAP } from '../server/services/openrouter';
import { requireOpenRouterKey, saveOpenRouterKey, deleteOpenRouterKey } from '../server/services/user-service';

afterEach(() => vi.unstubAllGlobals());

describe('BYOK', () => {
  it('fails closed when the account has no key', async () => {
    await expect(requireOpenRouterKey('nobody')).rejects.toMatchObject({ code: 'KEY_MISSING' });
  });

  it('never calls OpenRouter without a customer key', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    process.env.OPENROUTER_API_KEY = 'sk-or-platform-key-should-never-be-used';
    await expect(llmCall({ task: 'structured', apiKey: '', messages: [] })).rejects.toMatchObject({ code: 'KEY_MISSING' });
    expect(fetchSpy).not.toHaveBeenCalled();
    delete process.env.OPENROUTER_API_KEY;
  });

  it('stores only ciphertext and decrypts for the request', async () => {
    const key = 'sk-or-v1-0123456789abcdef0123456789';
    await saveOpenRouterKey('u1', key);
    const raw = JSON.stringify(fakeDb._all('users'));
    expect(raw).not.toContain(key);
    expect(raw).toContain('"last4":"6789"');
    await expect(requireOpenRouterKey('u1')).resolves.toBe(key);
    await deleteOpenRouterKey('u1');
    await expect(requireOpenRouterKey('u1')).rejects.toMatchObject({ code: 'KEY_MISSING' });
  });

  it('maps OpenRouter auth/credit errors to customer-actionable codes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 402 })));
    await expect(llmCall({ task: 'structured', apiKey: 'sk-or-x', messages: [] })).rejects.toMatchObject({ code: 'KEY_NO_CREDIT' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(llmCall({ task: 'structured', apiKey: 'sk-or-x', messages: [] })).rejects.toMatchObject({ code: 'KEY_INVALID' });
  });

  it('retries invalid JSON at most once', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not json' } }] })));
    vi.stubGlobal('fetch', fetchSpy);
    await expect(llmJson({ task: 'structured', apiKey: 'sk-or-x', messages: [] }, (r) => r)).rejects.toMatchObject({ code: 'UPSTREAM' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('provider fallback', () => {
  const ok = (content = 'hello') => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  /** Returns each queued response in turn, and records which model was asked for. */
  const queue = (...steps: (Response | Error)[]) => {
    const models: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      models.push(JSON.parse(String(init.body)).model);
      const step = steps.shift();
      if (!step) throw new Error('unexpected extra call');
      if (step instanceof Error) throw step;
      return step;
    }));
    return models;
  };
  const call = (over = {}) => llmCall({ task: 'structured', apiKey: 'sk-or-x', messages: [], ...over });

  it('tries the backup when the provider rate limits, errors or stalls', async () => {
    for (const failure of [new Response('{}', { status: 429 }), new Response('{}', { status: 500 }), new Response('{}', { status: 503 }), new Error('timeout')]) {
      const models = queue(failure, ok());
      const res = await call();
      expect(models).toEqual([MODEL_MAP.structured, FALLBACK_MODEL.structured]);
      expect(res.model).toBe(FALLBACK_MODEL.structured);
    }
  });

  it('never tries a backup for key or credit problems', async () => {
    for (const [status, code] of [[401, 'KEY_INVALID'], [403, 'KEY_INVALID'], [402, 'KEY_NO_CREDIT']] as const) {
      // A plain 403 is a rejected key. A 403 for the key's own cap is tested below.
      const models = queue(new Response('{}', { status }));
      await expect(call()).rejects.toMatchObject({ code });
      expect(models).toHaveLength(1);
    }
  });

  it('a key that hit its own spending cap gets the right message, and no backup call', async () => {
    const capped = () => new Response(JSON.stringify({ error: { message: 'Key limit exceeded: $5 of $5 used; resets never', metadata: { limit_source: 'openrouter_key_limit' } } }), { status: 403 });
    const models = queue(capped());
    await expect(call()).rejects.toMatchObject({ code: 'KEY_NO_CREDIT', message: expect.stringContaining('spending limit') });
    expect(models).toHaveLength(1);
  });

  it('a customer\'s chosen model falls back to the default, and a free model never falls back', async () => {
    const chosen = queue(new Response('{}', { status: 429 }), ok());
    await call({ model: 'anthropic/claude-sonnet-5.5' });
    expect(chosen).toEqual(['anthropic/claude-sonnet-5.5', MODEL_MAP.structured]);

    const free = queue(new Response('{}', { status: 429 }));
    await expect(call({ model: 'google/gemma-4-31b-it:free' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(free).toHaveLength(1);
    expect(fallbackFor('structured', 'x/y:free')).toBeNull();
  });

  it('live search falls back to a model with web search on', async () => {
    const models = queue(new Response('{}', { status: 500 }), ok());
    await llmCall({ task: 'webSearch', apiKey: 'sk-or-x', messages: [] });
    expect(models).toEqual([MODEL_MAP.webSearch, FALLBACK_MODEL.webSearch]);
    expect(FALLBACK_MODEL.webSearch.endsWith(':online')).toBe(true);
  });

  it('gives a clear message when both fail, and stops at one backup', async () => {
    const models = queue(new Error('timeout'), new Response('{}', { status: 503 }));
    await expect(call()).rejects.toMatchObject({ code: 'UPSTREAM', message: expect.stringContaining('slow or busy') });
    expect(models).toHaveLength(2);
  });

  it('a backup attempt does not use up the per-audit call budget', async () => {
    queue(new Response('{}', { status: 500 }), ok());
    await call({ auditId: 'budget-check' });
    const { checkAuditCallBudget } = await import('../server/services/audit-call-budget');
    for (let i = 0; i < 9; i++) checkAuditCallBudget('budget-check');
    expect(() => checkAuditCallBudget('budget-check')).toThrow(/budget/);
  });
});
