/**
 * Citation Snapshot Service
 *
 * Queries the Perplexity Sonar model (via OpenRouter — not a direct Perplexity
 * API integration) with real prompts to check if a business is actually being
 * mentioned/recommended by AI. This is a manual, one-time check started by the
 * customer and paid for by the customer's OpenRouter key — never scheduled.
 */

import { extractDomain } from '../engine/domain-utils';
import { llmCall, OpenRouterError } from './openrouter';

/** Manual, one-off check. Hard cap keeps each run predictable on the customer's key. */
export const MAX_CITATION_PROMPTS = 8;

export interface CitationSnapshotParams {
  websiteUrl: string;
  industry: string;
  companyName: string;
  keywords: string[];
  apiKey: string;
  auditId?: string;
  model?: string;
}

export interface PromptResult {
  prompt: string;
  mentioned: boolean;
  mentionContext: string | null;
  competitorsMentioned: string[];
  fullResponse: string;
  error?: string;
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
  snapshotDate: string;
  estimatedCost: number;
}

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

function generatePrompts(params: CitationSnapshotParams): string[] {
  const { industry, companyName, keywords } = params;
  const prompts: string[] = [];

  // BUG-05 FIX: Only add company-specific prompts when we have a real name
  const hasName = companyName && companyName.trim().length >= 2;

  if (hasName) {
    prompts.push(`What is ${companyName} and what do they offer?`);
    prompts.push(`Is ${companyName} good? Reviews and reputation`);

    if (keywords.length > 0) {
      prompts.push(`${companyName} vs alternatives for ${keywords[0]}`);
    } else {
      prompts.push(`Tell me about ${companyName}`);
    }
  }

  const usedKeywords = new Set<string>();
  for (const kw of keywords.slice(0, 3)) {
    const lower = kw.toLowerCase();
    if (hasName && (lower.includes(companyName.toLowerCase()) ||
        companyName.toLowerCase().includes(lower))) continue;
    if (usedKeywords.has(lower)) continue;
    usedKeywords.add(lower);
    prompts.push(`Best ${kw} tools and software`);
  }

  const simplifiedIndustry = simplifyIndustry(industry);
  prompts.push(
    `What ${simplifiedIndustry} do you recommend for small business?`
  );
  prompts.push(
    `Top rated ${simplifiedIndustry} platforms right now`
  );
  if (keywords.length > 1) {
    prompts.push(
      `What is the best ${keywords[1]} solution?`
    );
  }

  const fillers = [
    `Who are the leaders in ${simplifiedIndustry}?`,
    `${simplifiedIndustry} comparison and recommendations`,
    `Affordable ${simplifiedIndustry} for startups`,
    `Enterprise ${simplifiedIndustry} solutions`,
    `Best free ${simplifiedIndustry} options`,
  ];
  for (const f of fillers) {
    if (prompts.length >= MAX_CITATION_PROMPTS) break;
    prompts.push(f);
  }

  return prompts.slice(0, MAX_CITATION_PROMPTS);
}

async function callPerplexitySonar(
  prompt: string,
  apiKey: string,
  auditId?: string,
  model?: string,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const response = await llmCall({
    task: 'webSearch',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 1024,
    temperature: 0.1,
    apiKey,
    auditId,
    model,
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
function checkMention(
  responseText: string,
  companyName: string,
  domain: string
): { mentioned: boolean; mentionContext: string | null } {
  // CRITICAL: empty name → regex \b\b matches every position → always true
  if (!companyName || companyName.trim().length < 2) {
    return { mentioned: false, mentionContext: null };
  }

  const lowerResponse = responseText.toLowerCase();
  const lowerCompany = companyName.toLowerCase();
  const lowerDomain = domain.toLowerCase();

  const companyWords = lowerCompany.split(/\s+/);
  const primaryName = companyWords[0];

  const exactRegex = new RegExp(`\\b${lowerCompany.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  const exactMatch = exactRegex.exec(responseText);

  // BUG-06 FIX: Expanded commonNouns to include brand names that are also everyday words
  const commonNouns = new Set([
    'square', 'box', 'stripe', 'slack', 'sage', 'oracle', 'apple', 'shell',
    'bolt', 'wave', 'tide', 'spark', 'bloom', 'dash', 'hive', 'nest', 'pulse',
    'snap', 'flow', 'base', 'core', 'edge', 'mint', 'seed', 'clay', 'iron',
    'ruby', 'notion', 'monday', 'linear', 'mercury', 'aurora', 'prism',
    'beacon', 'compass', 'anchor', 'bridge', 'signal', 'relay', 'motion',
    'orbit', 'summit', 'peak', 'pivot', 'arc', 'loop', 'canvas', 'fiber',
    'spring', 'copper', 'zinc', 'loom', 'craft', 'draft', 'launch', 'pilot',
  ]);
  const primaryRegex = new RegExp(`\\b${primaryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  const isCommonNoun = commonNouns.has(primaryName.toLowerCase());
  const primaryMatch = primaryName.length >= 4 && !isCommonNoun ? primaryRegex.exec(responseText) : null;

  const brandVariationRegex = new RegExp(
    `\\b${primaryName.replace(
      /[.*+?^${}()|[\]\\]/g, '\\$&'
    )}\\s+[A-Z][a-z]+`, 'i'
  );
  const brandVariationMatch = primaryName.length >= 3
    ? brandVariationRegex.exec(responseText) : null;

  const domainIndex = lowerResponse.indexOf(lowerDomain);

  const match = exactMatch || primaryMatch || brandVariationMatch || (domainIndex !== -1 ? { index: domainIndex } : null);

  if (!match) {
    return { mentioned: false, mentionContext: null };
  }

  const matchIndex = 'index' in match ? match.index : 0;
  const start = Math.max(0, matchIndex - 80);
  const end = Math.min(responseText.length, matchIndex + 120);
  let snippet = responseText.substring(start, end).trim();
  snippet = snippet.replace(/[#*|_\[\]]/g, '').replace(/\s+/g, ' ');
  if (start > 0) snippet = '…' + snippet;
  if (end < responseText.length) snippet = snippet + '…';

  return {
    mentioned: true,
    mentionContext: snippet,
  };
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
    .filter(([, timesFound]) => timesFound >= 2)  // Must appear in 2+ responses
    .map(([name, timesFound]) => ({ name, timesFound }))
    .sort((a, b) => b.timesFound - a.timesFound)
    .slice(0, 10);  // Reduced from 20 to 10
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateCitationSnapshot(
  params: CitationSnapshotParams
): Promise<CitationSnapshotResult> {
  const { companyName, websiteUrl, apiKey, auditId, model } = params;
  const domain = extractDomain(websiteUrl);
  const prompts = generatePrompts(params);

  console.log(`\n🔍 Citation Snapshot: Checking ${prompts.length} prompts for "${companyName}" (${domain})`);
  console.log(`📝 Prompts generated:`, prompts.map((p, i) => `  ${i + 1}. ${p}`).join('\n'));

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const promptResults: PromptResult[] = [];

  const batchSize = 4;
  let fatalKeyError: OpenRouterError | null = null;
  for (let i = 0; i < prompts.length; i += batchSize) {
    const batch = prompts.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(prompts.length / batchSize);

    console.log(`\n⏳ Processing batch ${batchNumber}/${totalBatches} (${batch.length} prompts)...`);

    const batchResults = await Promise.allSettled(
      batch.map(async (prompt) => {
        const { content, inputTokens, outputTokens } = await callPerplexitySonar(prompt, apiKey, auditId, model);
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;

        const { mentioned, mentionContext } = checkMention(content, companyName, domain);
        const competitorsMentioned = extractCompetitors(content, companyName, domain);

        console.log(`  ${mentioned ? '✅' : '❌'} "${prompt.substring(0, 60)}..." → ${mentioned ? 'MENTIONED' : 'not mentioned'} | ${competitorsMentioned.length} competitors found`);

        return {
          prompt,
          mentioned,
          mentionContext,
          competitorsMentioned,
          fullResponse: normalizeResponse(content),
        } as PromptResult;
      })
    );

    for (const result of batchResults) {
      if (result.status === 'rejected' && result.reason instanceof OpenRouterError && result.reason.code !== 'UPSTREAM') {
        fatalKeyError = result.reason;
      }
      if (result.status === 'fulfilled') {
        promptResults.push(result.value);
      } else {
        const failedIndex = promptResults.length;
        const failedPrompt = batch[batchResults.indexOf(result)] || prompts[i + failedIndex] || 'Unknown prompt';
        console.error(`  ⚠️ Prompt failed: "${failedPrompt.substring(0, 60)}..." - ${result.reason?.message || 'Unknown error'}`);
        promptResults.push({
          prompt: failedPrompt,
          mentioned: false,
          mentionContext: null,
          competitorsMentioned: [],
          fullResponse: '',
          error: 'API call failed',
        });
      }
    }

    // A rejected/empty key will fail every remaining prompt too — stop and tell the customer.
    if (fatalKeyError) throw fatalKeyError;

    if (i + batchSize < prompts.length) {
      console.log(`  ⏸️ Waiting 2 seconds before next batch...`);
      await delay(2000);
    }
  }

  const mentionedCount = promptResults.filter((r) => r.mentioned).length;
  const mentionRate = promptResults.length > 0
    ? Math.round((mentionedCount / promptResults.length) * 100)
    : 0;

  const totalTokens = totalInputTokens + totalOutputTokens;
  const estimatedCost = parseFloat(((totalTokens / 1_000_000) * 1).toFixed(6));

  const topCompetitorsCited = aggregateCompetitors(promptResults);

  console.log(`\n📊 Citation Snapshot Complete:`);
  console.log(`   Prompts checked: ${promptResults.length}`);
  console.log(`   Mentioned in: ${mentionedCount}/${promptResults.length} (${mentionRate}%)`);
  console.log(`   Top competitors: ${topCompetitorsCited.slice(0, 5).map((c) => `${c.name} (${c.timesFound}x)`).join(', ') || 'none'}`);
  console.log(`   Estimated cost: $${estimatedCost}`);
  console.log(`   Total tokens: ${totalTokens} (in: ${totalInputTokens}, out: ${totalOutputTokens})`);

  return {
    totalPromptsChecked: promptResults.length,
    mentionedCount,
    mentionRate,
    promptResults,
    topCompetitorsCited,
    snapshotDate: new Date().toISOString(),
    estimatedCost,
  };
}
