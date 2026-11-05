/**
 * Citation Snapshot Service
 *
 * Asks live web-search AI engines (via OpenRouter, not the vendors' consumer apps)
 * real customer questions to check whether a business is actually being
 * mentioned or recommended. A manual check started by the customer and paid for
 * by the customer's OpenRouter key: never scheduled.
 */

import { extractDomain } from '../engine/domain-utils';
import { llmCall, llmJson, OpenRouterError } from './openrouter';
import { detectIndustryKey } from '../engine/industry';
import { MAX_OWN_QUESTIONS } from '../../shared/engines';
import type { CheckSummary } from '../../shared/api';

/** Manual, one-off check. Hard cap keeps each run predictable on the customer's key. */
export const MAX_CITATION_PROMPTS = 8;

export interface CheckEngine {
  id: string;
  label: string;
  model: string;
}

export interface CitationSnapshotParams {
  websiteUrl: string;
  industry: string;
  companyName: string;
  keywords: string[];
  apiKey: string;
  auditId?: string;
  model?: string;
  /** Ask these engines the same questions. Omitted: one engine, `model`, as before. */
  engines?: CheckEngine[];
  /** The customer's own questions. Omitted: AI writes a fresh set. */
  questions?: string[];
  /** Model used to write the questions (the customer's analysis model). */
  questionModel?: { id: string; supportsJson: boolean };
}

export interface PromptResult {
  prompt: string;
  mentioned: boolean;
  mentionContext: string | null;
  competitorsMentioned: string[];
  fullResponse: string;
  engine?: string;
  error?: string;
}

export interface EngineSummary {
  id: string;
  label: string;
  model: string;
  answered: number;
  mentionedCount: number;
  mentionRate: number;
  failed: boolean;
  topCompetitorsCited: CompetitorCitation[];
}

export interface CompetitorCitation {
  name: string;
  timesFound: number;
}

export interface CitationSnapshotResult {
  totalPromptsChecked: number;
  mentionedCount: number;
  mentionRate: number;
  promptResults: PromptResult[];
  topCompetitorsCited: CompetitorCitation[];
  engines?: EngineSummary[];
  /** Why the check stopped early. Answers already paid for are kept. */
  stoppedEarly?: string;
  snapshotDate: string;
  /** What OpenRouter charged for this check, in USD. */
  estimatedCost: number;
}

/** Keeps any check well inside the audit document's size limit, however many answers it has. */
const MAX_ANSWER_CHARS = 3000;
const MAX_STORED_ANSWERS_CHARS = 200_000;

function simplifyIndustry(industry: string): string {
  const lower = industry.toLowerCase();
  const removeWords = [
    'cloud-based', 'cloud based', 'online', 'digital',
    'professional', 'advanced', 'enterprise', 'modern',
    'integrated', 'comprehensive', 'full-service',
    'leading', 'innovative', 'solutions', 'services',
    'provider', 'company', 'companies', 'platform',
  ];
  let simplified = lower;
  for (const word of removeWords) {
    simplified = simplified.replace(
      new RegExp(`\\b${word}\\b`, 'gi'), ''
    );
  }
  simplified = simplified.replace(/\s+/g, ' ').trim();

  // Removing a word from the middle/end of the phrase can leave a dangling
  // conjunction or filler word behind (e.g. "business consulting and services"
  // -> "business consulting and"), which produces grammatically broken
  // citation prompts like "Who are the leaders in business consulting and?".
  // Strip leading/trailing filler tokens and collapse doubled ones so the
  // result never starts or ends on a conjunction/preposition/article.
  const fillerTokens = new Set(['and', 'or', '&', 'for', 'of', 'with', 'the', 'a', 'an', 'to', 'in']);
  let tokens = simplified.split(' ').filter(Boolean);
  tokens = tokens.filter((t, i) => !(fillerTokens.has(t) && tokens[i - 1] === t));
  while (tokens.length && fillerTokens.has(tokens[0])) tokens.shift();
  while (tokens.length && fillerTokens.has(tokens[tokens.length - 1])) tokens.pop();
  simplified = tokens.join(' ').trim();

  if (simplified.length < 4) return lower;
  return simplified;
}

/** Fallback questions when the AI question writer is unavailable. Industry-aware, no software bias. */
function templatePrompts(params: CitationSnapshotParams): string[] {
  const { industry, companyName, keywords } = params;
  const category = simplifyIndustry(industry || 'this category');
  const kw = keywords.filter((k) => !k.toLowerCase().includes(companyName.toLowerCase())).slice(0, 3);
  const key = detectIndustryKey(industry);
  const noun = key === 'saas' || key === 'marketing' ? 'tools' : key === 'ecommerce' ? 'brands' : key === 'legal' ? 'law firms' : key === 'healthcare' ? 'providers' : key === 'local' ? 'places' : 'options';

  const prompts = [
    `What is ${companyName} and what do they offer?`,
    `Is ${companyName} any good? What do customers say?`,
    `What are the best alternatives to ${companyName}?`,
    ...kw.map((k) => `What are the best ${k} ${noun}?`),
    `Which ${category} ${noun} do you recommend?`,
    `How do I choose a good ${category} provider?`,
    `What are the most trusted names in ${category}?`,
  ];
  return Array.from(new Set(prompts)).slice(0, MAX_CITATION_PROMPTS);
}

/**
 * Writes the questions a real customer of this business would ask an AI
 * assistant (one cheap structured call on the customer's key), with a
 * template fallback. 3 brand questions + 5 category questions where the
 * company is not named (that's where being recommended matters).
 */
async function generatePrompts(params: CitationSnapshotParams, onCost?: (usd: number) => void, avoid: string[] = []): Promise<string[]> {
  try {
    const result = await llmJson<string[]>(
      {
        task: 'structured',
        onCost,
        apiKey: params.apiKey,
        model: params.questionModel?.id,
        supportsJson: params.questionModel?.supportsJson,
        maxTokens: 600,
        temperature: 0.4,
        messages: [{
          role: 'user',
          content: `Write the questions real customers would ask an AI assistant (ChatGPT, Perplexity) when looking for what this business offers.

Business: ${params.companyName} (${params.websiteUrl})
Industry: ${params.industry || 'unknown'}
Keywords: ${params.keywords.join(', ') || 'none'}

Return JSON {"brand": [3 questions that name ${params.companyName}], "category": [5 questions that do NOT name ${params.companyName} — the questions where AI decides which businesses to recommend]}.
Natural phrasing, under 15 words each, no years, no invented facts. If location matters for this business (restaurants, clinics, law firms, trades), phrase it generally ("near me" is fine).${avoid.length ? `

These questions were already asked. Every question you write must be about a different angle, use case or buyer. Do not reuse or lightly reword any of them:
${avoid.slice(0, 40).map((q) => `- ${q}`).join('\n')}` : ''}

JSON only.`,
        }],
      },
      (raw) => {
        // The instruction above is not enough on its own: models do repeat, so repeats are removed here too.
        const norm = (q: string) => q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        const used = new Set(avoid.map(norm));
        const clean = (list: unknown) => (Array.isArray(list) ? list : [])
          .filter((q): q is string => typeof q === 'string' && q.trim().length > 8 && q.length < 160)
          .map((q) => q.trim())
          .filter((q) => !used.has(norm(q)));
        const brand = clean(raw?.brand).slice(0, 3);
        const category = clean(raw?.category).filter((q) => !q.toLowerCase().includes(params.companyName.toLowerCase())).slice(0, 5);
        // With an avoid list, take what is genuinely new; a retry follows if there is too little.
        return brand.length + category.length >= (avoid.length ? 4 : 6) ? [...brand, ...category] : null;
      },
    );
    return result.slice(0, MAX_CITATION_PROMPTS);
  } catch (err) {
    if (err instanceof OpenRouterError && err.code !== 'UPSTREAM') throw err;
    return templatePrompts(params);
  }
}

/** A fresh set of questions for the customer to review before spending anything on engines. */
export async function writeCitationQuestions(params: CitationSnapshotParams, avoid: string[] = []): Promise<string[]> {
  return generatePrompts(params, undefined, avoid);
}

/** A short record of a finished check, kept for history after the full answers are replaced. */
export function summarizeCheck(result: CitationSnapshotResult, companyName: string): CheckSummary {
  const brand = companyName.trim().toLowerCase();
  const answered = result.promptResults.filter((r) => !r.error);
  const open = answered.filter((r) => !brand || !r.prompt.toLowerCase().includes(brand));
  return {
    date: result.snapshotDate,
    engines: result.engines ? result.engines.filter((e) => !e.failed).map((e) => e.label) : ['Single engine'],
    totalAnswers: answered.length,
    mentioned: answered.filter((r) => r.mentioned).length,
    openTotal: open.length,
    openNamed: open.filter((r) => r.mentioned).length,
    cost: result.estimatedCost,
  };
}

async function askEngine(
  prompt: string,
  apiKey: string,
  auditId: string | undefined,
  model: string | undefined,
  exactModel: boolean,
  onCost: (usd: number) => void,
  budgetCalls: number,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const response = await llmCall({
    task: 'webSearch',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1024,
    temperature: 0.1,
    apiKey,
    auditId,
    model,
    exactModel,
    onCost,
    budgetCalls,
  });
  return { content: response.content, inputTokens: response.inputTokens, outputTokens: response.outputTokens };
}

function normalizeResponse(raw: string): string {
  if (!raw || !raw.trim()) return '';

  let text = raw;
  text = text.replace(/\[(\d+)\]/g, '');
  text = text.replace(/^#{1,4}\s+(.+)$/gm, '$1:');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/^[-*]\s+/gm, '• ');
  text = text.replace(/^\d+\.\s+/gm, '• ');

  const isTableRow = (s: string): boolean => {
    if (s.startsWith('|')) return true;
    const pipeCount = (s.match(/\|/g) || []).length;
    return pipeCount >= 2;
  };

  const isSeparatorRow = (s: string): boolean => {
    const stripped = s.replace(/\|/g, '').trim();
    return /^[-:\s]+$/.test(stripped) && stripped.length > 2;
  };

  const parseCells = (s: string): string[] => {
    let row = s.trim();
    if (row.startsWith('|')) row = row.substring(1);
    if (row.endsWith('|')) row = row.substring(0, row.length - 1);
    return row.split('|').map(c => c.trim()).filter(Boolean);
  };

  const lines = text.split('\n');
  const cleaned: string[] = [];
  let inTable = false;
  let headers: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (!inTable) cleaned.push('');
      continue;
    }

    if (isTableRow(trimmed)) {
      if (isSeparatorRow(trimmed)) {
        continue;
      }
      const cells = parseCells(trimmed);
      if (cells.length === 0) {
        cleaned.push(trimmed);
        continue;
      }
      if (!inTable) {
        inTable = true;
        headers = cells;
        continue;
      }
      if (headers.length > 0 && cells.length <= headers.length) {
        const entry = cells.map((c, i) => headers[i] ? `${headers[i]}: ${c}` : c).join(' | ');
        cleaned.push(`• ${entry}`);
      } else {
        cleaned.push(`• ${cells.join(' | ')}`);
      }
      continue;
    }

    if (inTable) {
      inTable = false;
      headers = [];
    }
    cleaned.push(trimmed);
  }

  return cleaned
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// BUG-04 FIX: Hard guard against empty company name matching everything
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Words that don't identify a business on their own: "Acme Inc" is still "Acme". */
const COMPANY_SUFFIXES = new Set(['inc', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company', 'gmbh', 'plc', 'pty', 'group', 'holdings']);

/**
 * Does this answer really name the business? A name of several words must appear
 * whole ("Citation Rocket", "citation-rocket", "CitationRocket"), or as its domain.
 * Its first word alone never counts: an answer about "citation" tools is not an
 * answer about Citation Rocket. Spacing, punctuation and "&" or "and" may vary.
 */
export function checkMention(
  responseText: string,
  companyName: string,
  domain: string
): { mentioned: boolean; mentionContext: string | null } {
  // CRITICAL: empty name would match every position.
  if (!companyName || companyName.trim().length < 2) {
    return { mentioned: false, mentionContext: null };
  }

  const words = companyName.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w && w !== 'and');
  while (words.length > 1 && COMPANY_SUFFIXES.has(words[words.length - 1])) words.pop();
  if (words.length === 0) return { mentioned: false, mentionContext: null };

  const separator = String.raw`(?:[\s\p{P}\p{S}]+(?:and[\s\p{P}\p{S}]+)?|[\s\p{P}\p{S}]*)`;
  const nameRegex = new RegExp(`(?<![\\p{L}\\p{N}])${words.map(esc).join(separator)}(?:['’]s)?(?![\\p{L}\\p{N}])`, 'iu');
  const nameMatch = nameRegex.exec(responseText);

  const domainIndex = domain ? responseText.toLowerCase().indexOf(domain.toLowerCase()) : -1;
  const stem = domain.toLowerCase().replace(/^www\./, '').split('.')[0];
  const stemMatch = stem.length >= 5 && words.length > 1 ? new RegExp(`(?<![\\p{L}\\p{N}])${esc(stem)}(?![\\p{L}\\p{N}])`, 'iu').exec(responseText) : null;

  const matchIndex = nameMatch?.index ?? (domainIndex !== -1 ? domainIndex : stemMatch?.index);
  if (matchIndex === undefined) {
    return { mentioned: false, mentionContext: null };
  }

  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(responseText.length, matchIndex + 120);
  let snippet = responseText.substring(start, end).trim();
  snippet = snippet.replace(/[#*|_\[\]]/g, '').replace(/\s+/g, ' ');
  if (start > 0) snippet = '…' + snippet;
  if (end < responseText.length) snippet = snippet + '…';

  return { mentioned: true, mentionContext: snippet };
}

// BUG-07 FIX: Tightened competitor extraction to reject descriptor words and section headers
function extractCompetitors(
  responseText: string,
  companyName: string,
  domain: string
): string[] {
  const competitors = new Set<string>();
  const lowerCompany = companyName.toLowerCase();
  const lowerDomain = domain.toLowerCase();

  const dotComPattern = /\b([A-Z][a-zA-Z0-9]*(?:\s[A-Z][a-zA-Z0-9]*)*)\s*\(\s*[a-zA-Z0-9.-]+\.com\s*\)/g;
  let match;
  while ((match = dotComPattern.exec(responseText)) !== null) {
    const name = match[1].trim();
    if (name.toLowerCase() !== lowerCompany && !name.toLowerCase().includes(lowerDomain) && !name.toLowerCase().includes(lowerCompany) && !lowerCompany.includes(name.toLowerCase())) {
      competitors.add(name);
    }
  }

  const domainPattern = /\b([a-zA-Z0-9][-a-zA-Z0-9]*\.com)\b/g;
  while ((match = domainPattern.exec(responseText)) !== null) {
    const foundDomain = match[1].toLowerCase();
    if (foundDomain !== lowerDomain && !foundDomain.includes(lowerCompany.replace(/\s/g, '').toLowerCase()) && !foundDomain.startsWith(lowerCompany.split(' ')[0])) {
      const cleanName = foundDomain.replace('.com', '');
      const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      competitors.add(capitalized);
    }
  }

  // BUG-07 FIX: Max 4 words for bold pattern (section headers tend to be longer)
  const boldPattern = /\*\*([A-Z][A-Za-z0-9\s&.'-]{1,40})\*\*/g;
  while ((match = boldPattern.exec(responseText)) !== null) {
    const name = match[1].trim();
    const lower = name.toLowerCase();
    const wordCount = name.trim().split(/\s+/).length;
    if (
      lower !== lowerCompany &&
      !lower.includes(lowerDomain) &&
      !lower.includes(lowerCompany) &&
      !lowerCompany.includes(lower) &&
      !lower.match(/^(best|top|key|pros?|cons?|features?|pricing|conclusion|summary|overview|why|how|what|the|and|or|a)\b/i) &&
      name.length > 2 &&
      name.length < 40 &&
      wordCount <= 4
    ) {
      competitors.add(name);
    }
  }

  const numberedListPattern = /(?:^|\n)\s*\d+[.)]\s*\**([A-Z][A-Za-z0-9\s&.'-]{1,40}?)\**\s*[-–:]/gm;
  while ((match = numberedListPattern.exec(responseText)) !== null) {
    const name = match[1].trim();
    const lower = name.toLowerCase();
    if (
      lower !== lowerCompany &&
      !lower.includes(lowerDomain) &&
      !lower.includes(lowerCompany) &&
      !lowerCompany.includes(lower) &&
      name.length > 2 &&
      name.length < 40
    ) {
      competitors.add(name);
    }
  }

  // BUG-07 FIX: Extended generic blocklist + descriptor word filter
  const GENERIC_BLOCKLIST = new Set([
    'features', 'services', 'tools', 'highlights', 'users',
    'feedback', 'drawbacks', 'strengths', 'weaknesses',
    'capabilities', 'approach', 'pricing', 'overview',
    'conclusion', 'summary', 'benefits', 'limitations',
    'advantages', 'disadvantages', 'alternatives',
    'considerations', 'recommendations', 'comparison',
    'additional services', 'standout features', 'user feedback',
    'potential drawbacks', 'target users', 'recent highlights',
    'key features', 'notable features', 'main features',
    'global capabilities', 'network-enabled approach',
    'positive overall sentiment', 'customer support',
    'exceptional customer support', 'usability and features',
    'revenue cycle and efficiency tools',
    'reliability for online sales', 'costly fees',
    'support issues', 'technical demands', 'account risks',
    // Extended: common section header words
    'collaboration', 'customization', 'automation', 'databases',
    'templates', 'integrations', 'productivity', 'security',
    'reliability', 'performance', 'analytics', 'reporting',
    'infrastructure', 'management', 'workflow', 'deployment',
    'scalability', 'flexibility', 'usability', 'accessibility',
  ]);

  // Descriptor words that should not appear in any position of a competitor name
  const DESCRIPTOR_WORDS = new Set([
    'collaboration', 'customization', 'automation', 'databases', 'templates',
    'integrations', 'productivity', 'security', 'reliability', 'performance',
    'analytics', 'reporting', 'infrastructure', 'management', 'workflow',
    'deployment', 'scalability', 'flexibility', 'usability', 'accessibility',
    'capabilities', 'features', 'services', 'solutions', 'platforms',
    'tools', 'advantages', 'disadvantages', 'limitations', 'benefits',
  ]);

  const filtered = Array.from(competitors).filter(name => {
    const lower = name.toLowerCase().trim();

    if (GENERIC_BLOCKLIST.has(lower)) return false;

    const words = name.trim().split(/\s+/);

    // Reject if any word in the name is a descriptor word
    if (words.some(w => DESCRIPTOR_WORDS.has(w.toLowerCase()))) return false;

    if (words.length === 1) {
      const singleWordBlocklist = new Set([
        'payments', 'connect', 'billing', 'radar', 'terminal',
        'issuing', 'treasury', 'atlas', 'sigma', 'identity',
        'online', 'business', 'enterprise', 'mobile', 'analytics',
        'integration', 'integrations', 'automation', 'security',
        'compliance', 'reporting', 'dashboard', 'portal',
        'engagement', 'management', 'infrastructure', 'platform',
      ]);
      if (singleWordBlocklist.has(lower)) return false;
    }

    if (words.length >= 3) {
      const startsWithGeneric = /^(for|the|a|an|how|what|why|with|about|their|your|our|key|top|best|main|other|more|also|and)\b/i;
      if (startsWithGeneric.test(name.trim())) return false;
    }

    if (lower.includes(' and ') && words.length > 3) return false;
    if (lower.includes('customer support')) return false;
    if (lower.includes('user ')) return false;
    if (lower.includes(' issues')) return false;
    if (lower.includes(' demands')) return false;
    if (lower.includes(' risks')) return false;
    if (lower.includes(' sentiment')) return false;

    return true;
  });

  return filtered;
}

// BUG-08 FIX: Require minimum frequency of 2, cap list at 10
/**
 * The regex extractor picks up any bold text ("Choose a no-code builder",
 * "Merino wool"). One cheap structured call keeps only real businesses,
 * brands and organizations actually recommended in each answer.
 */
/** True when the answer presents `name` as the company's own product, e.g. "Allbirds Wool Runner" or "Allbirds' Tree Dasher". */
export function isOwnProduct(name: string, companyName: string, answer: string): boolean {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const core = name.replace(/^(the|a)\s+/i, '').trim();
  if (!core || !companyName.trim()) return false;
  const re = new RegExp(`${esc(companyName.trim())}(?:['’]s?)?\\s+(?:the\\s+|new\\s+)?${esc(core)}`, 'i');
  return re.test(answer);
}

async function refineCompetitorNames(results: PromptResult[], params: CitationSnapshotParams, onCost?: (usd: number) => void): Promise<void> {
  const answered = results.map((r, i) => ({ i, text: r.fullResponse.slice(0, 1800) })).filter((r) => r.text);
  if (answered.length === 0) return;
  try {
    const parsed = await llmJson<{ i: number; names: string[]; own?: string[] }[]>(
      {
        task: 'structured',
        onCost,
        apiKey: params.apiKey,
        model: params.questionModel?.id,
        supportsJson: params.questionModel?.supportsJson,
        maxTokens: 1200,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `${params.companyName} is in this industry: ${params.industry || 'unknown'}. For each AI answer below, list the COMPETITORS: other businesses or brands named in the answer that offer the same kind of product or service as ${params.companyName}, so a customer could choose them instead (e.g. for a burger chain: other restaurant chains; for an automation tool: other automation tools).
Do NOT list: ${params.companyName}'s own products, product lines or sub-brands (put those in "own"); publications, media and review sites (Forbes, WSJ, TODAY, Wirecutter); marketplaces, retailers and delivery apps; apps or tools that merely integrate with or are used alongside ${params.companyName}; nutrition or data sites; generic terms; places; Reddit, Yelp, Wikipedia.

${answered.map((a) => `### ANSWER ${a.i}\n${a.text}`).join('\n\n')}

Return JSON {"results": [{"i": <answer number>, "names": ["Competitor", ...], "own": ["${params.companyName} product", ...]}]}. Empty lists if none. JSON only.`,
        }],
      },
      (raw) => (Array.isArray(raw?.results) ? raw.results : null),
    );
    const own = params.companyName.toLowerCase();
    const ownProducts = new Set(parsed.flatMap((r) => (Array.isArray(r.own) ? r.own : [])).filter((n): n is string => typeof n === 'string').map((n) => n.trim().toLowerCase()));
    for (const r of parsed) {
      const target = results[Number(r.i)];
      if (!target || !Array.isArray(r.names)) continue;
      target.competitorsMentioned = Array.from(new Set(r.names
        .filter((n): n is string => typeof n === 'string')
        .map((n) => n.trim())
        .filter((n) => n.length >= 2 && n.length <= 60 && !n.toLowerCase().includes(own) && !ownProducts.has(n.toLowerCase()))
        .filter((n) => !isOwnProduct(n, params.companyName, target.fullResponse))))
        .slice(0, 8);
    }
  } catch (err) {
    if (err instanceof OpenRouterError && err.code !== 'UPSTREAM') throw err;
    // Keep the heuristic names if the clean-up call fails.
  }
}

function aggregateCompetitors(allResults: PromptResult[]): CompetitorCitation[] {
  const counts = new Map<string, number>();

  for (const result of allResults) {
    for (const competitor of result.competitorsMentioned) {
      const normalized = competitor.trim();
      if (normalized) {
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      }
    }
  }

  return Array.from(counts.entries())
    .filter(([, timesFound]) => timesFound >= 1)
    .map(([name, timesFound]) => ({ name, timesFound }))
    .sort((a, b) => b.timesFound - a.timesFound)
    .slice(0, 10);  // Reduced from 20 to 10
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Asks one engine every question, in small batches, and cleans the competitor names it named. */
async function runEngine(
  prompts: string[],
  params: CitationSnapshotParams,
  model: string | undefined,
  auditId: string | undefined,
  exactModel: boolean,
  onCost: (usd: number) => void,
): Promise<{ results: PromptResult[]; fatal: OpenRouterError | null }> {
  const { companyName, websiteUrl, apiKey } = params;
  const domain = extractDomain(websiteUrl);
  const promptResults: PromptResult[] = [];
  const batchSize = 4;
  let fatalKeyError: OpenRouterError | null = null;

  for (let i = 0; i < prompts.length; i += batchSize) {
    const batch = prompts.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(async (prompt) => {
        const { content } = await askEngine(prompt, apiKey, auditId, model, exactModel, onCost, prompts.length + 2);
        const { mentioned, mentionContext } = checkMention(content, companyName, domain);
        const competitorsMentioned = extractCompetitors(content, companyName, domain);
        return { prompt, mentioned, mentionContext, competitorsMentioned, fullResponse: normalizeResponse(content) } as PromptResult;
      }),
    );

    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        promptResults.push(result.value);
        return;
      }
      if (result.reason instanceof OpenRouterError && result.reason.code !== 'UPSTREAM' && result.reason.code !== 'RATE_LIMITED') {
        fatalKeyError = result.reason;
      }
      console.error(`  Prompt failed on ${model ?? 'default model'}: ${result.reason?.message || 'Unknown error'}`);
      promptResults.push({ prompt: batch[index], mentioned: false, mentionContext: null, competitorsMentioned: [], fullResponse: '', error: 'API call failed' });
    });

    // A rejected or empty key will fail every remaining prompt too: stop asking, keep what was paid for.
    if (fatalKeyError) return { results: promptResults, fatal: fatalKeyError };
    if (i + batchSize < prompts.length) await delay(2000);
  }

  try {
    await refineCompetitorNames(promptResults, params, onCost);
  } catch (err) {
    if (err instanceof OpenRouterError) return { results: promptResults, fatal: err };
    throw err;
  }
  return { results: promptResults, fatal: null };
}

function rate(mentioned: number, total: number): number {
  return total > 0 ? Math.round((mentioned / total) * 100) : 0;
}

export async function generateCitationSnapshot(
  params: CitationSnapshotParams
): Promise<CitationSnapshotResult> {
  const { companyName, websiteUrl, auditId, model, engines } = params;
  let spent = 0;
  const onCost = (usd: number) => { spent += usd; };
  const prompts = params.questions?.length ? params.questions.slice(0, MAX_OWN_QUESTIONS) : await generatePrompts(params, onCost);
  const finish = () => parseFloat(spent.toFixed(6));

  console.log(`Citation check: ${prompts.length} questions for "${companyName}" (${extractDomain(websiteUrl)}) on ${engines ? engines.map((e) => e.label).join(', ') : model ?? 'default model'}`);

  if (!engines) {
    const { results: promptResults, fatal } = await runEngine(prompts, params, model, auditId, false, onCost);
    if (fatal && !promptResults.some((r) => !r.error)) throw fatal;
    const mentionedCount = promptResults.filter((r) => r.mentioned).length;
    return {
      ...(fatal ? { stoppedEarly: fatal.message } : {}),
      totalPromptsChecked: promptResults.length,
      mentionedCount,
      mentionRate: rate(mentionedCount, promptResults.length),
      promptResults,
      topCompetitorsCited: aggregateCompetitors(promptResults),
      snapshotDate: new Date().toISOString(),
      estimatedCost: finish(),
    };
  }

  // Same questions to every engine, side by side. Each engine has its own call budget,
  // and never swaps to a backup, so every answer is labelled with who really gave it.
  const settled = await Promise.allSettled(engines.map((engine) =>
    runEngine(prompts, params, engine.model, auditId ? `${auditId}-${engine.id}` : undefined, true, onCost),
  ));

  const fatal = settled.flatMap((r) => (r.status === 'fulfilled' && r.value.fatal ? [r.value.fatal] : []))[0] ?? null;

  const answerLimit = Math.min(MAX_ANSWER_CHARS, Math.floor(MAX_STORED_ANSWERS_CHARS / Math.max(prompts.length * engines.length, 1)));
  const summaries: EngineSummary[] = [];
  const promptResults: PromptResult[] = [];
  settled.forEach((result, index) => {
    const engine = engines[index];
    const results = result.status === 'fulfilled' ? result.value.results : [];
    const answered = results.filter((r) => !r.error);
    const mentionedCount = answered.filter((r) => r.mentioned).length;
    summaries.push({
      id: engine.id,
      label: engine.label,
      model: engine.model,
      answered: answered.length,
      mentionedCount,
      mentionRate: rate(mentionedCount, answered.length),
      failed: answered.length === 0,
      topCompetitorsCited: aggregateCompetitors(answered).slice(0, 5),
    });
    for (const r of results) promptResults.push({ ...r, engine: engine.id, fullResponse: r.fullResponse.slice(0, answerLimit) });
  });

  const answers = promptResults.filter((r) => !r.error);
  if (answers.length === 0) {
    throw fatal ?? new OpenRouterError('None of the AI engines answered just now. Please try again in a minute.', 'UPSTREAM', 502);
  }
  const mentionedCount = answers.filter((r) => r.mentioned).length;
  return {
    ...(fatal ? { stoppedEarly: fatal.message } : {}),
    totalPromptsChecked: answers.length,
    mentionedCount,
    mentionRate: rate(mentionedCount, answers.length),
    promptResults,
    topCompetitorsCited: aggregateCompetitors(answers),
    engines: summaries,
    snapshotDate: new Date().toISOString(),
    estimatedCost: finish(),
  };
}
