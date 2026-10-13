import { describe, expect, it, vi, afterEach } from 'vitest';
import { fakeDb } from './setup';
import { llmCall, llmJson } from '../server/services/openrouter';
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
