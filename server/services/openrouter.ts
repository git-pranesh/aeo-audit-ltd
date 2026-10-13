/**
 * OpenRouter — the ONLY place Citation Rocket talks to an LLM.
 *
 * Every call runs on the customer's own OpenRouter key. There is no platform
 * key and no fallback: if the customer key is missing or rejected, the call
 * fails with a clear, customer-actionable error.
 */

import { checkAuditCallBudget } from './audit-call-budget';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

/**
 * Task → model. Structured extraction uses a cheap model; the citation check
 * needs live web search. Override with env vars without a code change.
 */
export const MODEL_MAP = {
  structured: process.env.MODEL_STRUCTURED || 'deepseek/deepseek-v4-flash',
  webSearch: process.env.MODEL_WEB_SEARCH || 'perplexity/sonar',
} as const;

export type LlmTask = keyof typeof MODEL_MAP;

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmOptions {
  task: LlmTask;
  messages: LlmMessage[];
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  auditId?: string; // enforces the per-audit call budget
  timeoutMs?: number;
  /** Customer-chosen OpenRouter model id; defaults to MODEL_MAP[task]. */
  model?: string;
  /** False when the chosen model doesn't support response_format. */
  supportsJson?: boolean;
}

/** Customer model preferences (validated when saved). */
export interface ModelChoice {
  structured?: { id: string; supportsJson: boolean };
  webSearch?: { id: string };
}

export interface LlmResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** Errors the UI can explain to the customer (bad key, no credit, rate limited). */
export class OpenRouterError extends Error {
  constructor(message: string, public code: 'KEY_MISSING' | 'KEY_INVALID' | 'KEY_NO_CREDIT' | 'RATE_LIMITED' | 'UPSTREAM', public status = 502) {
    super(message);
  }
}

function mapHttpError(status: number): OpenRouterError {
  if (status === 401 || status === 403) {
    return new OpenRouterError('Your OpenRouter key was rejected. Update it in Settings.', 'KEY_INVALID', 400);
  }
  if (status === 402) {
    return new OpenRouterError('Your OpenRouter key is out of credit or hit its spending limit. Top up at openrouter.ai.', 'KEY_NO_CREDIT', 402);
  }
  if (status === 429) {
    return new OpenRouterError('OpenRouter is rate limiting your key. Please wait a minute and try again.', 'RATE_LIMITED', 429);
  }
  return new OpenRouterError(`The AI provider returned an error (${status}). Please try again.`, 'UPSTREAM', 502);
}

export async function llmCall(options: LlmOptions): Promise<LlmResponse> {
  const { task, messages, apiKey, maxTokens = 2048, temperature = 0.2, json, auditId, timeoutMs = 90_000, supportsJson = true } = options;
  if (!apiKey) {
    throw new OpenRouterError('Add your OpenRouter key in Settings before running audits.', 'KEY_MISSING', 400);
  }
  if (auditId) checkAuditCallBudget(auditId);

  const model = options.model || MODEL_MAP[task];
  const body: Record<string, unknown> = { model, messages, max_tokens: maxTokens, temperature };
  if (json && supportsJson && !model.startsWith('perplexity/')) body.response_format = { type: 'json_object' };
  // Structured extraction must not "think": reasoning tokens count against
  // max_tokens (empty answers) and cost the customer money for no benefit.
  if (task === 'structured') body.reasoning = { enabled: false };

  const send = (payload: Record<string, unknown>) =>
    fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://citationrocket.com',
        'X-Title': 'Citation Rocket',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

  let response: Response;
  try {
    response = await send(body);
    if (response.status === 400 && body.reasoning) {
      const detail = await response.clone().text().catch(() => '');
      // Some models (e.g. Gemini 2.5 Pro) can't switch reasoning off: allow it,
      // with room for the hidden reasoning tokens.
      if (/reasoning/i.test(detail)) {
        const { reasoning: _off, ...rest } = body;
        response = await send({ ...rest, max_tokens: Math.min(16_000, maxTokens * 3) });
      }
    }
  } catch {
    throw new OpenRouterError('Could not reach OpenRouter. Please try again.', 'UPSTREAM', 502);
  }

  if (response.status === 429 && model.endsWith(':free')) {
    throw new OpenRouterError('This free model is rate-limited by its provider right now. Try again in a few minutes, or choose a paid model in Settings.', 'RATE_LIMITED', 429);
  }
  if (!response.ok) throw mapHttpError(response.status);

  let data: any;
  try {
    data = await response.json();
  } catch {
    // The timeout can fire while the body is still streaming in.
    throw new OpenRouterError('The AI model took too long to answer. Please try again or pick a faster model in Settings.', 'UPSTREAM', 504);
  }
  return {
    content: data.choices?.[0]?.message?.content ?? '',
    model,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

/**
 * Extract the first JSON object/array from model output. Tolerates code
 * fences and leading prose; returns null when nothing parseable is found.
 */
export function parseJsonLoose<T = any>(text: string): T | null {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const candidates = [cleaned];
  const obj = cleaned.match(/\{[\s\S]*\}/);
  if (obj) candidates.push(obj[0]);
  const arr = cleaned.match(/\[[\s\S]*\]/);
  if (arr) candidates.push(arr[0]);
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * JSON call with strict validation and at most ONE retry. `validate` returns
 * the cleaned value or null when the shape is unusable.
 */
export async function llmJson<T>(options: LlmOptions, validate: (raw: any) => T | null): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await llmCall({ ...options, json: true });
    const parsed = validate(parseJsonLoose(res.content));
    if (parsed) return parsed;
  }
  throw new OpenRouterError('The AI model returned an unreadable answer twice. Please try again.', 'UPSTREAM', 502);
}

export interface KeyInfo {
  valid: boolean;
  label?: string;
  limit?: number | null;
  limitRemaining?: number | null;
  usage?: number;
}

/** Validates a key against OpenRouter and returns its spending limit info. */
export async function inspectOpenRouterKey(apiKey: string): Promise<KeyInfo> {
  try {
    const get = (path: string) => fetch(`${OPENROUTER_BASE}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    let res = await get('/key');
    if (res.status === 404) res = await get('/auth/key'); // legacy path
    if (!res.ok) return { valid: false };
    const data = ((await res.json()) as any)?.data ?? {};
    return {
      valid: true,
      label: typeof data.label === 'string' ? data.label : undefined,
      limit: typeof data.limit === 'number' ? data.limit : null,
      limitRemaining: typeof data.limit_remaining === 'number' ? data.limit_remaining : null,
      usage: typeof data.usage === 'number' ? data.usage : undefined,
    };
  } catch {
    return { valid: false };
  }
}
