/**
 * Topic ideas + (optional) competitor comparison in ONE LLM call.
 *
 * The SaaS version made 4+ batched calls per audit with retries and fallbacks.
 * The LTD edition asks once for a fixed, small set (5 per category), validates
 * the JSON strictly and retries at most once (see llmJson).
 */

import type { ContentSignals, PlatformScores } from '../engine/content-signal-service';
import type { ConfirmedContext } from '@shared/api';
import { llmJson, type ModelChoice } from './openrouter';
import { isAdviceRelevant } from '../engine/industry';

export const TOPICS_PER_CATEGORY = 5;

export const TOPIC_CATEGORIES = ['authoritative', 'thoughtLeadership', 'competitiveAdvantage', 'emergingOpportunity'] as const;
export type TopicCategory = (typeof TOPIC_CATEGORIES)[number];

export interface TopicContext {
  websiteUrl: string;
  context: ConfirmedContext;
  signals: ContentSignals;
  platformScores: PlatformScores;
  lowestPlatform: keyof PlatformScores;
}

export interface CompetitorInsights {
  competitorStrengths: string[];
  competitorWeaknesses: string[];
  marketOpportunities: string[];
}

export interface TopicResult {
  topics: Record<TopicCategory, any[]>;
  competitorInsights: CompetitorInsights | null;
}

const CONFIDENCE: Record<TopicCategory, [number, number]> = {
  authoritative: [85, 95],
  thoughtLeadership: [70, 84],
  competitiveAdvantage: [50, 69],
  emergingOpportunity: [30, 49],
};

const CATEGORY_FOCUS: Record<TopicCategory, string> = {
  authoritative: 'questions where the site already has strong expertise',
  thoughtLeadership: 'industry trends and analysis the brand can lead on',
  competitiveAdvantage: 'what makes THIS company different from alternatives',
  emergingOpportunity: 'emerging questions buyers are starting to ask',
};


function buildPrompt(input: TopicContext): string {
  const { websiteUrl, context: c, signals: s, platformScores: p, lowestPlatform } = input;
  const hasCompetitors = c.competitors.length > 0;
  const formats = [
    isAdviceRelevant(c.industry, 'faq') && 'FAQ answers',
    isAdviceRelevant(c.industry, 'howto') && 'how-to guides',
    isAdviceRelevant(c.industry, 'tutorials') && 'tutorials',
    isAdviceRelevant(c.industry, 'caseStudies') && 'case studies',
    isAdviceRelevant(c.industry, 'data') && 'data-backed articles',
    isAdviceRelevant(c.industry, 'frameworks') && 'frameworks',
    'buyer questions and comparisons',
  ].filter(Boolean) as string[];

  return `You are an Answer Engine Optimization (AEO) analyst. Produce content topic ideas for ${websiteUrl}.

COMPANY CONTEXT (confirmed by the site owner — use it, never infer from the domain name):
- Company: ${c.companyName}
- Industry: ${c.industry}
- Business type: ${c.businessType}
- Target audience: ${c.targetAudience}
- Value proposition: ${c.valueProposition}
- Priority keywords: ${c.keywords.length ? c.keywords.join(', ') : 'none given'}
- Competitors: ${hasCompetitors ? c.competitors.join(', ') : 'NONE PROVIDED — do not name any competitor'}

MEASURED SITE SIGNALS:
- Platform scores: ChatGPT ${p.chatgpt}, Perplexity ${p.perplexity}, Gemini ${p.gemini}, Claude ${p.claude}
- Weakest platform: ${lowestPlatform}
- Content formats that suit this business: ${formats.join(', ')}

Return ONE JSON object with exactly these keys:
{
${TOPIC_CATEGORIES.map((k) => `  "${k}": [${TOPICS_PER_CATEGORY} topics — ${CATEGORY_FOCUS[k]}, confidence ${CONFIDENCE[k][0]}-${CONFIDENCE[k][1]}]`).join(',\n')}${hasCompetitors ? `,
  "competitorAnalysis": {
    "competitorStrengths": [5 short items: what ${c.competitors.join(', ')} likely do well],
    "competitorWeaknesses": [5 short items: where they likely fall short],
    "marketOpportunities": [5 short items: content gaps ${c.companyName} can own]
  }` : ''}
}

Each topic object:
{"topic": "a specific question a buyer would ask an AI assistant", "confidence": number, "justification": "which content gap this fills and why it fits this company", "targetPlatform": "chatgpt|perplexity|gemini|claude", "searchVolume": "Estimated: 500-1,500/month", "competitionLevel": "Low|Medium|High", "contentType": "tutorial|case-study|faq|data-driven|framework|how-to", "isBranded": boolean, "gapFilled": "tutorials|case-studies|faqs|data-points|frameworks"}

RULES:
- About 70% industry-level questions, 30% branded.
- Only questions real customers of this kind of business ask. Use only the content formats listed above.
- Never imply the company offers, uses or believes something not stated in the context (no invented technologies, policies, awards, prices or numbers).
- Search volumes are estimates and must be ranges ("Estimated: X-Y/month"), never exact numbers.
- Never claim citation counts or facts you cannot verify.
- ${hasCompetitors ? 'Only mention the competitors listed above.' : 'Do not mention any competitor names.'}
- Every list item under 25 words. Output JSON only.`;
}

const CONTENT_TYPES = ['tutorial', 'case-study', 'faq', 'data-driven', 'framework', 'how-to'];
const PLATFORMS = ['chatgpt', 'perplexity', 'gemini', 'claude'];
const DIFFICULTY: Record<string, 'Easy' | 'Medium' | 'Hard'> = {
  faq: 'Easy', tutorial: 'Medium', 'how-to': 'Medium', 'case-study': 'Hard', 'data-driven': 'Hard', framework: 'Hard',
};
const TIME: Record<string, string> = {
  faq: '1-2 hours', tutorial: '3-5 hours', 'how-to': '2-4 hours', 'case-study': '5-10 hours', 'data-driven': '5-10 hours', framework: '8-15 hours',
};
const TIER: Record<TopicCategory, 'Quick Win' | 'High Impact' | 'Long-term'> = {
  authoritative: 'High Impact', thoughtLeadership: 'Long-term', competitiveAdvantage: 'High Impact', emergingOpportunity: 'Quick Win',
};
const GAP: Record<string, string> = {
  tutorial: 'tutorials', 'how-to': 'tutorials', 'case-study': 'case-studies', faq: 'faqs', 'data-driven': 'data-points', framework: 'frameworks',
};

function clampText(v: unknown, max = 300): string {
  return typeof v === 'string' ? v.replace(/\[\d+\]/g, '').trim().slice(0, max) : '';
}

function sanitizeVolume(v: unknown): string {
  const s = clampText(v, 60);
  if (/^estimated:/i.test(s) && /\d+\s*[-–]\s*\d/.test(s)) return s;
  return 'Estimated: varies';
}

function normalizeTopic(raw: any, category: TopicCategory) {
  const topic = clampText(raw?.topic, 200);
  if (!topic) return null;
  const contentType = CONTENT_TYPES.includes(raw?.contentType) ? raw.contentType : 'how-to';
  const targetPlatform = PLATFORMS.includes(raw?.targetPlatform) ? raw.targetPlatform : 'chatgpt';
  const [lo, hi] = CONFIDENCE[category];
  const confidence = Math.min(hi, Math.max(lo, Math.round(Number(raw?.confidence) || lo)));
  const difficulty = DIFFICULTY[contentType];
  return {
    topic,
    confidence,
    justification: clampText(raw?.justification) || 'Fills a content gap identified in the audit.',
    targetPlatform,
    platforms: [targetPlatform],
    searchVolume: sanitizeVolume(raw?.searchVolume),
    competitionLevel: ['Low', 'Medium', 'High'].includes(raw?.competitionLevel) ? raw.competitionLevel : 'Medium',
    contentType,
    isBranded: raw?.isBranded === true,
    gapFilled: GAP[contentType],
    difficulty,
    effort: difficulty === 'Easy' ? 'Low' : difficulty === 'Medium' ? 'Medium' : 'High',
    priorityTier: TIER[category],
    timeEstimate: TIME[contentType],
  };
}

function dedupe<T extends { topic: string }>(list: T[], seen: Set<string>): T[] {
  return list.filter((t) => {
    const key = t.topic.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => clampText(x, 160)).filter(Boolean).slice(0, 5) : [];
}

export async function generateTopics(input: TopicContext, apiKey: string, auditId: string, models: ModelChoice = {}): Promise<TopicResult> {
  const hasCompetitors = input.context.competitors.length > 0;

  return llmJson<TopicResult>(
    {
      task: 'structured',
      apiKey,
      auditId,
      model: models.structured?.id,
      supportsJson: models.structured?.supportsJson,
      maxTokens: 6000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'You are an AEO analyst. Reply with a single valid JSON object and nothing else.' },
        { role: 'user', content: buildPrompt(input) },
      ],
    },
    (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const seen = new Set<string>();
      const topics = {} as Record<TopicCategory, any[]>;
      for (const cat of TOPIC_CATEGORIES) {
        const list = Array.isArray(raw[cat]) ? raw[cat] : [];
        topics[cat] = dedupe(
          list.map((t: any) => normalizeTopic(t, cat)).filter(Boolean) as any[],
          seen,
        ).slice(0, TOPICS_PER_CATEGORY);
      }
      // Usable if most categories came back; a single empty category is tolerated.
      if (TOPIC_CATEGORIES.filter((c) => topics[c].length > 0).length < 3) return null;

      let competitorInsights: CompetitorInsights | null = null;
      if (hasCompetitors && raw.competitorAnalysis) {
        competitorInsights = {
          competitorStrengths: stringList(raw.competitorAnalysis.competitorStrengths),
          competitorWeaknesses: stringList(raw.competitorAnalysis.competitorWeaknesses),
          marketOpportunities: stringList(raw.competitorAnalysis.marketOpportunities),
        };
      }
      return { topics, competitorInsights };
    },
  );
}
