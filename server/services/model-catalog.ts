/**
 * OpenRouter model catalogue (public endpoint, no key needed), cached in
 * memory for an hour. Lets customers pick any model — free to premium — while
 * we validate the choice and know whether it supports JSON output.
 */

const CATALOG_URL = 'https://openrouter.ai/api/v1/models';
const TTL_MS = 60 * 60 * 1000;

export interface CatalogModel {
  id: string;
  name: string;
  promptPerM: number;     // USD per 1M input tokens
  completionPerM: number; // USD per 1M output tokens
  contextLength: number;
  supportsJson: boolean;
  free: boolean;
  webSearch: boolean;     // has built-in live web search (Perplexity Sonar family)
}

let cache: { at: number; models: CatalogModel[] } | null = null;

export async function getCatalog(): Promise<CatalogModel[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.models;
  const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    if (cache) return cache.models;
    throw new Error(`OpenRouter model list unavailable (${res.status})`);
  }
  const data = ((await res.json()) as any).data ?? [];
  const models: CatalogModel[] = data
    // Text-in/text-out chat models only (no image/music generators, no batch endpoints).
    .filter((m: any) => {
      const out: string[] = m.architecture?.output_modalities ?? ['text'];
      const input: string[] = m.architecture?.input_modalities ?? ['text'];
      return out.length === 1 && out[0] === 'text' && input.includes('text') && !String(m.id).endsWith(':batch');
    })
    .map((m: any) => {
      const params: string[] = m.supported_parameters ?? [];
      const prompt = Number(m.pricing?.prompt ?? 0) * 1e6;
      const completion = Number(m.pricing?.completion ?? 0) * 1e6;
      return {
        id: m.id,
        name: m.name ?? m.id,
        promptPerM: Math.round(prompt * 1000) / 1000,
        completionPerM: Math.round(completion * 1000) / 1000,
        contextLength: m.context_length ?? 0,
        supportsJson: params.includes('response_format') || params.includes('structured_outputs'),
        free: String(m.id).endsWith(':free') || (prompt === 0 && completion === 0),
        webSearch: /^perplexity\/sonar/.test(m.id),
      };
    })
    .filter((m: CatalogModel) => m.promptPerM >= 0 && m.completionPerM >= 0);
  cache = { at: Date.now(), models };
  return models;
}

/** Rough per-audit cost: context (~1k in / 0.2k out) + topics (~5k in / 2.5k out). */
export function estimateAuditCost(m: CatalogModel): number {
  return ((6000 * m.promptPerM) + (2700 * m.completionPerM)) / 1e6;
}

/** Rough per-snapshot cost: 8 prompts × (~0.1k in / ~0.6k out) + Sonar request fees where applicable. */
export function estimateSnapshotCost(m: CatalogModel): number {
  const tokens = (8 * 100 * m.promptPerM + 8 * 600 * m.completionPerM) / 1e6;
  const requestFee = m.webSearch ? 8 * 0.005 : 0;
  return tokens + requestFee;
}

/**
 * Validates a model id for a task. Web-search tasks accept Perplexity Sonar
 * models or any model with OpenRouter's ":online" suffix (web plugin).
 */
export async function resolveModel(id: string, task: 'structured' | 'webSearch'): Promise<CatalogModel> {
  const catalog = await getCatalog();
  const online = id.endsWith(':online');
  const base = catalog.find((m) => m.id === (online ? id.slice(0, -':online'.length) : id));
  if (!base) throw new Error(`"${id}" is not an available OpenRouter model.`);
  if (task === 'webSearch' && !base.webSearch && !online) {
    throw new Error('The citation check needs live web search: pick a Perplexity Sonar model, or add ":online" to any model id.');
  }
  return online ? { ...base, id, webSearch: true } : base;
}
