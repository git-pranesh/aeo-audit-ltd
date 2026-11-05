/**
 * The live AI engines a citation check can ask. Each runs through OpenRouter with
 * live web search on, on the customer's own key. These are the vendors' models via
 * their APIs, not the consumer apps, which is why the labels name the model family.
 * Cost per question was measured on 5 Nov 2026; OpenRouter's prices can change.
 */
export interface EngineDef {
  id: EngineId;
  label: string;
  model: string;
  estPerQuestionUsd: number;
}

export type EngineId = 'perplexity' | 'gemini' | 'claude' | 'gpt' | 'grok';

export const ENGINES: EngineDef[] = [
  { id: 'perplexity', label: 'Perplexity', model: 'perplexity/sonar', estPerQuestionUsd: 0.0056 },
  { id: 'gemini', label: 'Gemini', model: 'google/gemini-2.5-flash-lite:online', estPerQuestionUsd: 0.0075 },
  { id: 'claude', label: 'Claude', model: 'anthropic/claude-haiku-5.5:online', estPerQuestionUsd: 0.0248 },
  { id: 'gpt', label: 'GPT', model: 'openai/gpt-6-luna:online', estPerQuestionUsd: 0.0334 },
  { id: 'grok', label: 'Grok', model: 'x-ai/grok-4.3:online', estPerQuestionUsd: 0.0438 },
];

export const ENGINE_IDS = ENGINES.map((e) => e.id) as [EngineId, ...EngineId[]];

/** Most questions a customer can ask in one check. */
export const MAX_OWN_QUESTIONS = 25;

/** The customer's own citation-check model from Settings, offered beside the five. */
export const CUSTOM_ENGINE = 'custom';

/** Small allowance for writing the questions and cleaning competitor names. */
const OVERHEAD_USD = 0.002;

export function estimateCheckUsd(ids: string[], questions = 8, customPerQuestionUsd = 0.0056): number {
  const perQuestion = ids.reduce((sum, id) => sum + (ENGINES.find((e) => e.id === id)?.estPerQuestionUsd ?? customPerQuestionUsd), 0);
  return perQuestion * questions + OVERHEAD_USD * Math.max(ids.length, 1);
}
