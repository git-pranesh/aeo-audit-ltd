/**
 * The audit pipeline. Runs only when the customer asks; nothing is scheduled.
 *
 *   analyzeWebsite()  homepage scrape + ONE LLM call → editable business context
 *   runAudit()        scrape (≤10 pages) → deterministic signals, scores,
 *                     findings, playbook, benchmark → ONE LLM call for topics
 *
 * Everything except company context and topic ideas is deterministic, so the
 * same site produces the same scores and fewer model-format failures.
 */

import type { AuditData } from '@shared/schema';
import type { ConfirmedContext, ContextSuggestion } from '@shared/api';
import {
  extractContentSignals,
  generateSignalBasedRecommendations,
  generateSignalBasedStrengths,
  generateSignalBasedWeaknesses,
  type ContentSignals,
} from '../engine/content-signal-service';
import { calculatePlatformScoresV2, type ScoringResult } from '../engine/scoring-service';
import { getIndustryBenchmarks } from '../engine/industry-benchmarks';
import { generatePlaybook } from '../engine/playbook-generator-service';
import { runBlueprintAudit } from '../engine/blueprint-orchestrator';
import { deriveNameFromDomain, extractDomain } from '../engine/domain-utils';
import { adviceTopicOf, isAdviceRelevant } from '../engine/industry';
import { extractSiteFacts, type SiteFacts } from '../engine/site-facts';
import { scrapeHomepageLite, scrapeWebsite } from './scraper';
import { generateTopics, TOPIC_CATEGORIES } from './topics';
import { llmJson, OpenRouterError, type ModelChoice } from './openrouter';

// ─── Step 1: business context (one LLM call) ─────────────────────────────────

export async function analyzeWebsite(websiteUrl: string, apiKey: string, models: ModelChoice = {}): Promise<ContextSuggestion> {
  const lite = await scrapeHomepageLite(websiteUrl);
  const block = [
    lite.title && `Title: ${lite.title}`,
    lite.metaDescription && `Meta description: ${lite.metaDescription}`,
    lite.h1s.length > 0 && `Headings: ${lite.h1s.join(' | ')}`,
    lite.text && `Page text: ${lite.text}`,
  ].filter(Boolean).join('\n');

  const fallbackName = deriveNameFromDomain(websiteUrl);
  const unknown: ContextSuggestion = {
    companyName: fallbackName,
    industry: '',
    businessType: '',
    targetAudience: '',
    valueProposition: '',
    suggestedKeywords: [],
    evidenceQuote: null,
    signalQuality: 'minimal',
  };

  // Not enough real text to classify — let the customer fill it in rather than guess.
  if (block.length < 100) return unknown;

  const str = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() && !/^unknown$/i.test(v.trim()) ? v.trim().slice(0, max) : '');

  try {
    return await requestContext(websiteUrl, apiKey, block, fallbackName, str, models);
  } catch (err) {
    // Key/credit problems must reach the customer; a model that keeps answering
    // badly just means they fill in the form themselves.
    if (err instanceof OpenRouterError && err.code === 'UPSTREAM') return unknown;
    throw err;
  }
}

async function requestContext(
  websiteUrl: string,
  apiKey: string,
  block: string,
  fallbackName: string,
  str: (v: unknown, max?: number) => string,
  models: ModelChoice,
): Promise<ContextSuggestion> {
  return llmJson<ContextSuggestion>(
    {
      task: 'structured',
      apiKey,
      model: models.structured?.id,
      supportsJson: models.structured?.supportsJson,
      maxTokens: 700,
      temperature: 0.2,
      messages: [{
        role: 'user',
        content: `Extract business facts for ${websiteUrl} using ONLY the scraped content below. Do not use outside knowledge or guess from the domain name.

<SCRAPED_CONTENT>
${block}
</SCRAPED_CONTENT>

Return JSON:
{"companyName": "brand name as shown", "industry": "specific industry", "businessType": "business model, e.g. B2B SaaS", "targetAudience": "primary customer", "valueProposition": "max 12 words", "suggestedKeywords": ["up to 6 topics/keywords"], "evidenceQuote": "verbatim quote (max 20 words) from the content supporting the industry, or null"}

Use "" for any field the content does not clearly support. JSON only.`,
      }],
    },
    (raw) => {
      if (!raw || typeof raw !== 'object') return null;
      // There is real page text, so an all-blank answer is a bad response: retry.
      if (!str(raw.industry) && !str(raw.businessType) && !str(raw.targetAudience)) return null;
      return {
        companyName: str(raw.companyName, 80) || fallbackName,
        industry: str(raw.industry),
        businessType: str(raw.businessType),
        targetAudience: str(raw.targetAudience),
        valueProposition: str(raw.valueProposition, 160),
        suggestedKeywords: Array.isArray(raw.suggestedKeywords)
          ? raw.suggestedKeywords.map((k: unknown) => str(k, 60)).filter(Boolean).slice(0, 6)
          : [],
        evidenceQuote: str(raw.evidenceQuote, 200) || null,
        signalQuality: 'grounded',
      };
    },
  );
}

// ─── Step 2: the audit ────────────────────────────────────────────────────────

export interface AeoInputs {
  signals: ContentSignals;
  sitemapUrls: string[];
  facts: SiteFacts;
  sitemapLocation: string | null;
  hasLlmsTxt: boolean;
}

export interface AuditOutput {
  auditData: AuditData;
  aeoInputs: AeoInputs;
}

type PlatformKey = 'chatgpt' | 'perplexity' | 'gemini' | 'claude';

export async function runAudit(params: {
  auditId: string;
  websiteUrl: string;
  context: ConfirmedContext;
  apiKey: string;
  models?: ModelChoice;
}): Promise<AuditOutput> {
  const { auditId, websiteUrl, context, apiKey, models = {} } = params;
  const startedAt = Date.now();
  const domain = extractDomain(websiteUrl);
  const companyName = context.companyName || deriveNameFromDomain(websiteUrl) || domain;

  // 1. Scrape (never throws for unreachable pages — returns what it could read).
  const scrape = await scrapeWebsite(websiteUrl);
  const scrapingSucceeded = scrape.pagesFetched > 0;
  // Scoring an error page or bot wall would produce a fake "F". Stop before any AI call.
  if (!scrapingSucceeded || scrape.text.length < 300) {
    throw new OpenRouterError(
      "We couldn't read this website — it blocks automated visitors or returned an error page. No AI credits were used. If it's your site, allow our crawler or try again later.",
      'UPSTREAM',
      422,
    );
  }

  // 2. Deterministic analysis.
  const companyIntelligence = {
    companyName,
    industry: context.industry || 'Unknown',
    businessType: context.businessType || 'Unknown',
    targetAudience: context.targetAudience || 'General audience',
    valueProposition: context.valueProposition || 'Not specified',
    marketPosition: 'Not specified',
  };
  const signals = extractContentSignals(scrape.html, scrape.text, scrape.sitemapUrls, companyIntelligence, domain);
  const scoring = calculatePlatformScoresV2(signals, scrape.sitemapUrls.length, 0, context.industry, signals.totalPageCount || 0);
  const platformScores = scoring.platformScores;
  const lowestPlatform = (Object.entries(platformScores) as [PlatformKey, number][]).sort((a, b) => a[1] - b[1])[0][0];

  // 3. Blueprint (deterministic + free public lookups) and topics (one LLM call) in parallel.
  const [blueprintResult, topicResult] = await Promise.all([
    runBlueprintAudit({
      websiteUrl,
      html: scrape.html,
      text: scrape.text,
      sitemapUrls: scrape.sitemapUrls,
      brandName: companyName,
      companyName,
      industry: context.industry,
      primaryQuery: context.keywords[0] || '',
    }).catch(() => null),
    generateTopics({ websiteUrl, context, signals, platformScores, lowestPlatform }, apiKey, auditId, models, scrape.text),
  ]);

  const competitors = context.competitors;
  const fits = (sentence: string) => {
    const topic = adviceTopicOf(sentence);
    return !topic || isAdviceRelevant(context.industry, topic);
  };
  const strengths = generateSignalBasedStrengths(signals, companyName, competitors);
  const weaknesses = generateSignalBasedWeaknesses(signals, companyName, competitors, context.industry, signals.totalPageCount || 0).filter(fits);
  const industryBenchmark = getIndustryBenchmarks(context.industry || '');
  const recommendations = generateSignalBasedRecommendations(signals, companyName, competitors, industryBenchmark).filter(fits);
  const playbook = generatePlaybook(signals, scoring, companyIntelligence, companyName);

  // A site that links to its blog has one, even if our sitemap sample missed the posts.
  const linksToBlog = /href=["'][^"']*\/(blogs?|news|articles|journal|insights|resources)\/?["']/i.test(scrape.html);
  if (linksToBlog && signals.blogPostCount === 0) {
    playbook.actions = playbook.actions.filter((a) => adviceTopicOf(a.title) !== 'blog');
    playbook.quickWins = playbook.quickWins.filter((a) => adviceTopicOf(a.title) !== 'blog');
    for (const list of [weaknesses, recommendations]) {
      for (let i = list.length - 1; i >= 0; i--) if (adviceTopicOf(list[i]) === 'blog') list.splice(i, 1);
    }
  }

  // Blocked AI crawlers outrank every content fix: nothing else matters if they can't read the site.
  const blockedBots = blueprintResult?.botAccess?.citationBotsBlocked ?? [];
  if (blockedBots.length > 0) {
    weaknesses.unshift(`Your robots.txt blocks AI search crawlers (${blockedBots.slice(0, 5).join(', ')}${blockedBots.length > 5 ? '…' : ''}), so these assistants cannot read or cite your pages.`);
    recommendations.unshift(`Unblock AI search crawlers in robots.txt (${blockedBots.length} blocked) — use the robots.txt patch in your AEO Pack.`);
    playbook.actions.unshift({
      id: 'unblock-ai-crawlers',
      priority: 'critical',
      title: 'Unblock AI Search Crawlers in robots.txt',
      targetPlatform: 'All Platforms',
      estimatedImpact: 'Prerequisite for any AI citation',
      timeToImplement: '15 minutes',
      difficulty: 'easy',
      currentState: `${blockedBots.length} AI search crawlers blocked: ${blockedBots.slice(0, 4).join(', ')}${blockedBots.length > 4 ? '…' : ''}`,
      targetState: 'OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot and Bingbot allowed',
      stepByStep: [
        'Open your site\'s robots.txt (yoursite.com/robots.txt)',
        'Add the allow rules from robots-patch.txt in your AEO Pack above any "User-agent: *" block',
        'Keep "Disallow" rules only for private paths (admin, cart, account)',
        'Re-run this audit to confirm the crawlers are allowed',
      ],
    });
    playbook.quickWins.unshift(playbook.actions[0]);
  }

  const totalSignals = signals.tutorialCount + signals.caseStudyCount + signals.faqSectionCount + signals.dataPointCount + signals.howToGuideCount;
  const hasMinimalSignals = totalSignals === 0;
  const insights = topicResult.competitorInsights;

  const disclaimers: string[] = [];
  if (hasMinimalSignals) disclaimers.push('Limited content signals detected. Scores are based on the pages we could read.');

  const auditData: AuditData = {
    companyIntelligence,
    competitorAnalysis: competitors.length > 0
      ? {
          mainCompetitors: competitors,
          competitorStrengths: insights?.competitorStrengths ?? [],
          competitorWeaknesses: insights?.competitorWeaknesses ?? [],
          marketOpportunities: insights?.marketOpportunities ?? [],
        }
      : undefined,
    signalQuality: hasMinimalSignals ? 'minimal' : 'normal',
    scrapingStatus: {
      success: scrapingSucceeded,
      warning: scrapingSucceeded
        ? null
        : 'We could not read your website. It may block automated visitors, require JavaScript, or have been temporarily unreachable. Scores reflect only what we could access.',
      errorDetail: null,
      largeSiteDetected: scrape.timedOut,
      ...(scrape.timedOut ? { largeSiteNote: `Partial results — analysis based on ${scrape.pagesFetched} sampled pages.` } : {}),
    },
    scoreExplanation: buildScoreExplanation(signals, lowestPlatform),
    auditResults: {
      overallScore: scoring.overallScore,
      letterGrade: scoring.letterGrade as AuditData['auditResults']['letterGrade'],
      platformScores,
      strengths,
      weaknesses: weaknesses.length > 0 ? weaknesses : ['No major gaps detected in the pages we analyzed.'],
      ...(disclaimers.length ? { disclaimer: disclaimers.join(' ') } : {}),
      technicalFindings: buildTechnicalFindings(signals, scrape.sitemapUrls.length),
    },
    contentTopics: Object.fromEntries(TOPIC_CATEGORIES.map((c) => [c, topicResult.topics[c]])) as AuditData['contentTopics'],
    visibilityPotential: {
      overallPotential: band(scoring.overallScore, 'High', 'Medium', 'Low'),
      platformAlignment: {
        chatgpt: band(platformScores.chatgpt),
        perplexity: band(platformScores.perplexity),
        gemini: band(platformScores.gemini),
        claude: band(platformScores.claude),
      },
    },
    // Competitor opportunities already appear in the competitor section; show the top site actions here.
    competitorGaps: { opportunityAreas: recommendations.slice(0, 5), contentAdvantages: [] },
    disclaimers: {
      note: 'Scores indicate content alignment potential, not actual citation counts.',
      searchVolumeNote: 'Topic ideas are AI-generated suggestions based on your site and business details. No search-volume data is used.',
    },
    recommendations: recommendations.length > 0 ? recommendations : ['Keep publishing structured, question-led content.'],
    industryBenchmark,
    playbook,
    citationSnapshot: null,
    processingDetails: {
      analysisDepth: 'standard',
      competitorsAnalyzed: competitors.length,
      dataSourcesUsed: ['website content', 'sitemap', 'robots.txt', 'deterministic scoring', 'AI topic generation'],
      processingTime: `${Math.round((Date.now() - startedAt) / 1000)} seconds`,
    },
    blueprintResult: blueprintResult ?? undefined,
  };

  const aeoInputs: AeoInputs = {
    signals,
    sitemapUrls: scrape.sitemapUrls
      .filter((u) => /\/(blogs?|docs|guides?|tutorials?|faq|help|case-stud|customers?|resources?|learn|about|pricing|services?|products?|menu|locations?|contact)(\/|$)/i.test(u))
      .slice(0, 60),
    facts: extractSiteFacts(scrape.pages),
    sitemapLocation: scrape.sitemapLocation,
    hasLlmsTxt: scrape.llmsTxtFound,
  };

  return { auditData, aeoInputs };
}

// ─── Deterministic report helpers ─────────────────────────────────────────────

function band(score: number, high = 'Strong', mid = 'Moderate', low = 'Weak'): string {
  return score >= 75 ? high : score >= 50 ? mid : low;
}

function buildTechnicalFindings(s: ContentSignals, sitemapSize: number): AuditData['auditResults']['technicalFindings'] {
  const authority =
    (sitemapSize >= 1000 ? 3 : sitemapSize >= 200 ? 2 : sitemapSize >= 50 ? 1 : 0) +
    ((s.documentationPageCount ?? 0) >= 20 ? 2 : (s.documentationPageCount ?? 0) >= 5 ? 1 : 0);
  const structure =
    (s.headingHierarchyScore >= 70 ? 3 : s.headingHierarchyScore >= 40 ? 2 : s.headingHierarchyScore >= 10 ? 1 : 0) +
    (s.stepByStepListCount >= 5 ? 2 : s.stepByStepListCount >= 1 ? 1 : 0) +
    (s.blogPostCount >= 20 ? 1 : 0);
  const entity =
    (s.frameworkMentionCount >= 5 ? 3 : s.frameworkMentionCount >= 2 ? 2 : s.frameworkMentionCount >= 1 ? 1 : 0) +
    (s.caseStudyCount >= 5 ? 2 : s.caseStudyCount >= 2 ? 1 : 0) +
    (s.hasStructuredData ? 2 : 0) +
    (s.nuancedTermCount >= 8 ? 1 : 0);

  return {
    domainAuthority: authority >= 4 ? 'High' : authority >= 2 ? 'Medium' : 'Low',
    contentStructure: structure >= 5 ? 'Excellent' : structure >= 3 ? 'Good' : structure >= 1 ? 'Fair' : 'Poor',
    schemaMarkup: s.schemaTypeCount >= 4 ? 'Implemented' : s.schemaTypeCount >= 1 ? 'Partial' : 'Missing',
    entityRecognition: entity >= 6 ? 'Strong' : entity >= 3 ? 'Moderate' : 'Weak',
  };
}

function driver(found: string[], best: number, strong: string, some: string, none: string): string {
  if (found.length > 0) return `${strong}: ${found.join(', ')}.`;
  return best > 0 ? some : none;
}

function buildScoreExplanation(s: ContentSignals, lowest: PlatformKey): NonNullable<AuditData['scoreExplanation']> {
  const pick = (pairs: [boolean, string][]) => pairs.filter(([ok]) => ok).map(([, label]) => label);

  const strongest = [
    { label: 'Case Studies', score: s.caseStudyCount * 3 },
    { label: 'Data & Research', score: s.dataPointCount * 0.5 },
    { label: 'Tutorials', score: s.tutorialCount * 2 },
    { label: 'FAQ Content', score: s.faqSectionCount * 2.5 },
    { label: 'Schema Markup', score: s.schemaTypeCount * 4 },
  ].reduce((a, b) => (b.score > a.score ? b : a));

  return {
    contentSignals: {
      tutorials: s.tutorialCount,
      caseStudies: s.caseStudyCount,
      faqs: s.faqSectionCount,
      dataPoints: s.dataPointCount,
      frameworks: s.frameworkMentionCount,
      howToGuides: s.howToGuideCount,
      schemaMarkup: s.schemaTypeCount,
      externalLinks: s.externalLinkCount,
      longFormContent: s.longFormContentScore,
    },
    platformDrivers: {
      chatgpt: driver(
        pick([[s.tutorialCount >= 5, `${s.tutorialCount} tutorials`], [s.howToGuideCount >= 3, `${s.howToGuideCount} how-to guides`], [s.faqSectionCount >= 3, `${s.faqSectionCount} FAQ sections`]]),
        Math.max(s.tutorialCount, s.howToGuideCount, s.faqSectionCount),
        'Strong practical content detected',
        'Some practical content found but below benchmark. More tutorials and FAQs will improve ChatGPT visibility.',
        'No tutorials, how-to guides, or FAQ sections detected. ChatGPT favours practical step-by-step content.',
      ),
      perplexity: driver(
        pick([[s.dataPointCount >= 15, `${s.dataPointCount} data points`], [s.externalLinkCount >= 10, `${s.externalLinkCount} external citations`], [s.statisticMentionCount >= 5, `${s.statisticMentionCount} statistics`]]),
        Math.max(s.dataPointCount, s.externalLinkCount, s.statisticMentionCount),
        'Research-backed content detected',
        'Some research signals found but below benchmark. More data points and sources will improve Perplexity visibility.',
        'No data points, statistics, or external citations detected. Perplexity prioritises research-backed content.',
      ),
      gemini: driver(
        pick([[s.schemaTypeCount >= 2, `${s.schemaTypeCount} schema types`], [s.headingHierarchyScore >= 50, `heading score ${s.headingHierarchyScore}/100`], [s.imageCount >= 10, `${s.imageCount} images`]]),
        Math.max(s.schemaTypeCount, s.imageCount),
        'Good technical structure detected',
        'Some structure detected but below benchmark. Schema markup and a clear heading hierarchy will improve Gemini visibility.',
        'Minimal technical structure detected. Gemini favours well-organised pages with schema markup.',
      ),
      claude: driver(
        pick([[s.caseStudyCount >= 3, `${s.caseStudyCount} case studies`], [s.frameworkMentionCount >= 3, `${s.frameworkMentionCount} frameworks`], [s.longFormContentScore >= 40, `long-form score ${s.longFormContentScore}/100`]]),
        Math.max(s.caseStudyCount, s.frameworkMentionCount),
        'Strong analytical depth detected',
        'Some analytical content found but below benchmark. Case studies and frameworks will improve Claude visibility.',
        'Limited analytical depth detected. Claude favours long-form content with frameworks and case studies.',
      ),
    },
    weakestArea: {
      chatgpt: 'Tutorials & How-to Content',
      perplexity: 'Data & Citations',
      gemini: 'Schema & Structure',
      claude: 'Case Studies & Frameworks',
    }[lowest],
    strongestArea: strongest.score > 0 ? strongest.label : null,
  };
}
