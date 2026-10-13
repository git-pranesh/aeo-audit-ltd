/**
 * LLM Router — OpenRouter Abstraction Layer
 *
 * Single entry point for ALL LLM calls in Citation Rocket.
 * Routes each task to the most cost-effective model via OpenRouter.
 *
 * Cost per audit (after routing):
 *   Company intelligence:  ~$0.0003  (DeepSeek V4 Flash)
 *   Topic generation:      ~$0.001   (DeepSeek V4 Flash)
 *   Content verification:  ~$0.0004  (DeepSeek V4 Flash)
 *   Citation snapshot:     ~$0.006   (Perplexity Sonar — live search)
 *   TOTAL per audit:       ~$0.008
 *
 * BYOK (optional): User provides their own OpenRouter key.
 * If no BYOK key, the app's own key is used (costs are trivial).
 *
 * OpenRouter docs: https://openrouter.ai/docs
 */

import { checkAuditCallBudget } from './audit-call-budget';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// ─── Model routing by task ────────────────────────────────────────────────────

/**
 * Task → Model mapping.
 * Change models here without touching any other file.
 */
export const MODEL_MAP = {
  // Cheap structured extraction — DeepSeek V4 Flash ($0.14/M input)
  companyIntelligence:  'deepseek/deepseek-v4-flash',
  competitorAnalysis:   'deepseek/deepseek-v4-flash',
  topicGeneration:      'deepseek/deepseek-v4-flash',
  contentVerification:  'deepseek/deepseek-v4-flash',
  playbookGeneration:   'deepseek/deepseek-v4-flash',
  schemaGeneration:     'deepseek/deepseek-v4-flash',

  // Live web search — Perplexity Sonar Pro ($3/M input, $15/M output)
  // Only use when Pro reasoning quality is essential; prefer companyResearch for most web-search tasks.
  perplexitySonarPro:   'perplexity/sonar-pro',

  // Live web search — Perplexity Sonar basic ($1/M in, $1/M out)
  // DEPRECATED: use `competitorDiscovery` for new call sites. Kept for backward compat.
  companyResearch:      'perplexity/sonar',

  // Live web search — Perplexity Sonar basic ($1/M in, $1/M out)
  // Used ONLY for competitor auto-discovery — needs live search to find who AI
  // platforms currently cite. Classification (companyIntelligence) must NOT use
  // this: it has no web access requirement once grounded in scraped page text,
  // and using a search model there just re-introduces domain-name guessing risk.
  competitorDiscovery:  'perplexity/sonar',

  // Live web search — Perplexity Sonar ($1/M, same as direct API)
  // Used for citation snapshots only
  citationSnapshot:     'perplexity/sonar',

  // Fallback for any unknown task
  fallback:             'openai/gpt-4o-mini',
} as const;

export type LlmTask = keyof typeof MODEL_MAP;

// ─── Request/Response types ───────────────────────────────────────────────────

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmOptions {
  task: LlmTask;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'json' | 'text';
  byokKey?: string;              // user's own OpenRouter key (optional)
  auditId?: string;              // when set, enforces the per-audit call budget
}

export interface LlmResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  provider: 'openrouter';
}

// ─── Cost estimator ───────────────────────────────────────────────────────────

const COST_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  'deepseek/deepseek-v4-flash': { input: 0.14,  output: 0.28  },
  'deepseek/deepseek-chat-v3-0324': { input: 0.20, output: 0.77 },
  'perplexity/sonar':           { input: 1.00,  output: 1.00  },
  'perplexity/sonar-pro':       { input: 3.00,  output: 15.00 },
  'openai/gpt-4o-mini':         { input: 0.15,  output: 0.60  },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_M_TOKENS[model] ?? { input: 1.00, output: 1.00 };
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}

// ─── Main call function ───────────────────────────────────────────────────────

/**
 * Make an LLM call via OpenRouter.
 * This is the ONLY function that should make LLM API calls in Citation Rocket.
 */
export async function llmCall(options: LlmOptions): Promise<LlmResponse> {
  const { task, messages, maxTokens = 4096, temperature = 0.1, responseFormat, byokKey, auditId } = options;

  // Hard per-audit call budget — guards against runaway loops/retries blowing up cost
  // for a single audit, independent of any per-user/per-IP rate limiting at the route layer.
  if (auditId) {
    checkAuditCallBudget(auditId);
  }

  const model = MODEL_MAP[task] ?? MODEL_MAP.fallback;
  const apiKey = byokKey || process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('No OpenRouter API key available. Set OPENROUTER_API_KEY in environment or provide byokKey.');
  }

  const body: Record<string, any> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  };

  // JSON mode for structured outputs — only supported by non-Perplexity models
  const isPerplexityModel = model.startsWith('perplexity/');
  if (responseFormat === 'json' && !isPerplexityModel) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://citationrocket.com',
      'X-Title': 'Citation Rocket',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000), // 60s timeout
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'unknown error');
    throw new Error(`OpenRouter API error ${response.status}: ${errText}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content ?? '';
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  return {
    content,
    model,
    inputTokens,
    outputTokens,
    estimatedCostUsd: estimateCost(model, inputTokens, outputTokens),
    provider: 'openrouter',
  };
}

/**
 * JSON extraction helper — calls LLM and parses JSON response.
 * Strips markdown code fences if present.
 */
export async function llmJsonCall<T>(options: LlmOptions): Promise<T> {
  const response = await llmCall({ ...options, responseFormat: 'json' });

  let text = response.content.trim();
  // Strip ```json ... ``` fences if model adds them
  text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(`Failed to parse JSON from LLM response: ${text.substring(0, 200)}`);
  }
}

/**
 * Citation snapshot call — uses Perplexity Sonar (live web search).
 * Returns the full LlmResponse which includes citations in the content.
 */
export async function citationSnapshotCall(
  prompt: string,
  byokKey?: string,
  auditId?: string
): Promise<LlmResponse> {
  return llmCall({
    task: 'citationSnapshot',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1024,
    temperature: 0.1,
    byokKey,
    auditId,
  });
}

// ─── Usage tracking helper ────────────────────────────────────────────────────

/**
 * Log LLM usage for cost monitoring.
 * Call after each llmCall() to track costs per audit.
 */
export function logLlmUsage(auditId: string, task: LlmTask, response: LlmResponse): void {
  console.log(
    `💰 LLM [${auditId}] ${task}: ${response.model}, ` +
    `${response.inputTokens}in + ${response.outputTokens}out tokens, ` +
    `$${response.estimatedCostUsd.toFixed(6)}`
  );
}
