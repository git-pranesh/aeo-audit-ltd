/**
 * Citation Rocket — Public API Router
 *
 * 4 clean endpoints for developers and agencies:
 *
 *   POST /api/v1/score       → Quick score (no citation snapshot, no topics)
 *   POST /api/v1/audit       → Full audit (all features)
 *   POST /api/v1/generate-files → Generate llms.txt + schema markup for a URL
 *   GET  /api/v1/benchmarks  → Industry benchmark data
 *
 * Auth: Bearer token (API key) in Authorization header.
 * Rate limiting and plan enforcement happen at the routes.ts layer before
 * these handlers run.
 *
 * All responses follow the same envelope:
 *   { success: true, data: {...}, meta: { processingTimeMs, auditId } }
 *   { success: false, error: string, code: string }
 */

import type { Request, Response, Router } from 'express';
import { z } from 'zod';
import { extractContentSignals } from './content-signal-service';
import { calculatePlatformScoresV2 } from './scoring-service';
import { generatePlaybook } from './playbook-generator-service';
import { getIndustryBenchmarks } from './industry-benchmarks';
import { getLiveBenchmarks } from './audit-dataset';

// ─── Request Schemas ──────────────────────────────────────────────────────────

const scoreRequestSchema = z.object({
  url: z.string().url({ message: 'url must be a valid URL' }),
  industry: z.string().optional(),
});

const auditRequestSchema = z.object({
  url: z.string().url({ message: 'url must be a valid URL' }),
  industry: z.string().optional(),
  businessType: z.string().optional(),
  targetAudience: z.string().optional(),
  keywords: z.array(z.string()).max(10).optional(),
  competitors: z.array(z.string()).max(10).optional(),
  topicsPerCategory: z.number().int().min(1).max(100).optional().default(25),
  includeCitationSnapshot: z.boolean().optional().default(false),
  perplexityApiKey: z.string().optional(),
});

const generateFilesRequestSchema = z.object({
  url: z.string().url({ message: 'url must be a valid URL' }),
  industry: z.string().optional(),
  companyName: z.string().optional(),
  includeSchema: z.boolean().optional().default(true),
  includeLlmsTxt: z.boolean().optional().default(true),
});

const benchmarksRequestSchema = z.object({
  industry: z.string(),
  useLiveData: z.boolean().optional().default(false),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function apiSuccess(res: Response, data: unknown, meta: Record<string, unknown> = {}) {
  return res.json({ success: true, data, meta });
}

function apiError(res: Response, status: number, message: string, code: string) {
  return res.status(status).json({ success: false, error: message, code });
}

function msNow() { return Date.now(); }

// Scrape wrapper — reuses whatever scraping logic is wired up in routes.ts.
// The actual Firecrawl / sitemap crawler lives there; we import the shared
// scrapeWebsite function or call it via an internal HTTP call.
// For now we accept a `scrapeWebsite` function injected at registration time.
type ScrapeResult = { html: string; text: string; sitemapUrls: string[]; discoveredSubdomains: string[] };
type ScrapeFn = (url: string) => Promise<ScrapeResult>;

// ─── Route Handlers ───────────────────────────────────────────────────────────

/**
 * POST /api/v1/score
 * Lightweight. Scrapes + scores. No topics, no citation snapshot, no playbook.
 * Returns in ~10-20s.
 */
async function handleScore(req: Request, res: Response, scrape: ScrapeFn) {
  const parse = scoreRequestSchema.safeParse(req.body);
  if (!parse.success) {
    return apiError(res, 400, parse.error.issues[0].message, 'VALIDATION_ERROR');
  }
  const { url, industry = '' } = parse.data;
  const start = msNow();

  let scrapeResult: ScrapeResult;
  try {
    scrapeResult = await scrape(url);
  } catch (err: any) {
    return apiError(res, 502, `Failed to scrape ${url}: ${err?.message}`, 'SCRAPE_ERROR');
  }

  const signals = extractContentSignals(
    scrapeResult.html,
    scrapeResult.text,
    scrapeResult.sitemapUrls
  );

  const scoring = calculatePlatformScoresV2(
    signals,
    scrapeResult.sitemapUrls.length,
    scrapeResult.discoveredSubdomains.length,
    industry,
    signals.totalPageCount
  );

  return apiSuccess(res, {
    url,
    overallScore: scoring.overallScore,
    letterGrade: scoring.letterGrade,
    platformScores: scoring.platformScores,
    breakdown: scoring.breakdown,
    signals: {
      tutorials: signals.tutorialCount,
      howToGuides: signals.howToGuideCount,
      faqs: signals.faqSectionCount,
      caseStudies: signals.caseStudyCount,
      blogPosts: signals.blogPostCount,
      schemaTypes: signals.schemaTypeCount,
      dataPoints: signals.dataPointCount,
      externalLinks: signals.externalLinkCount,
      frameworks: signals.frameworkMentionCount,
      totalPages: signals.totalPageCount,
    },
  }, { processingTimeMs: Date.now() - start });
}

/**
 * POST /api/v1/audit
 * Full audit. Scrapes, scores, generates playbook and topics.
 * Optionally runs citation snapshot if perplexityApiKey is provided.
 * Returns in ~30-90s depending on site size.
 */
async function handleAudit(req: Request, res: Response, scrape: ScrapeFn) {
  const parse = auditRequestSchema.safeParse(req.body);
  if (!parse.success) {
    return apiError(res, 400, parse.error.issues[0].message, 'VALIDATION_ERROR');
  }

  const {
    url,
    industry = '',
    businessType = '',
    targetAudience = '',
    keywords = [],
    competitors = [],
    topicsPerCategory,
    includeCitationSnapshot,
    perplexityApiKey,
  } = parse.data;

  const start = msNow();
  const auditId = `api_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  let scrapeResult: ScrapeResult;
  try {
    scrapeResult = await scrape(url);
  } catch (err: any) {
    return apiError(res, 502, `Failed to scrape ${url}: ${err?.message}`, 'SCRAPE_ERROR');
  }

  const signals = extractContentSignals(
    scrapeResult.html,
    scrapeResult.text,
    scrapeResult.sitemapUrls,
    { industry, businessType, targetAudience }
  );

  const scoring = calculatePlatformScoresV2(
    signals,
    scrapeResult.sitemapUrls.length,
    scrapeResult.discoveredSubdomains.length,
    industry,
    signals.totalPageCount
  );

  const companyContext = { industry, businessType, targetAudience };
  const playbook = generatePlaybook(signals, scoring.platformScores, companyContext);

  const industryBenchmark = getIndustryBenchmarks(industry);

  // Citation snapshot (optional — only if caller provides Perplexity key)
  let citationSnapshot = null;
  if (includeCitationSnapshot && perplexityApiKey) {
    try {
      const { generateCitationSnapshot } = await import('./citation-snapshot-service');
      const domain = new URL(url).hostname.replace(/^www\./, '');
      const companyName = domain.split('.')[0];
      citationSnapshot = await generateCitationSnapshot({
        websiteUrl: url,
        industry,
        companyName,
        keywords,
        apiKey: perplexityApiKey,
      });
    } catch (err: any) {
      console.warn(`⚠️ Citation snapshot failed in /api/v1/audit: ${err?.message}`);
    }
  }

  return apiSuccess(res, {
    auditId,
    url,
    overallScore: scoring.overallScore,
    letterGrade: scoring.letterGrade,
    platformScores: scoring.platformScores,
    breakdown: scoring.breakdown,
    signals: {
      tutorials: signals.tutorialCount,
      howToGuides: signals.howToGuideCount,
      faqs: signals.faqSectionCount,
      caseStudies: signals.caseStudyCount,
      blogPosts: signals.blogPostCount,
      schemaTypes: signals.schemaTypeCount,
      dataPoints: signals.dataPointCount,
      externalLinks: signals.externalLinkCount,
      frameworks: signals.frameworkMentionCount,
      totalPages: signals.totalPageCount,
    },
    playbook: {
      actions: playbook.actions,
      quickWins: playbook.quickWins,
      estimatedScoreImprovement: playbook.estimatedScoreImprovement,
    },
    industryBenchmark: {
      name: industryBenchmark.industryName,
      averageScore: industryBenchmark.averageScores.overall,
      topPerformerScore: industryBenchmark.topPerformerScores.overall,
      contentBenchmarks: industryBenchmark.contentBenchmarks,
    },
    citationSnapshot,
  }, {
    auditId,
    processingTimeMs: Date.now() - start,
  });
}

/**
 * POST /api/v1/generate-files
 * Generates the complete AEO file package for a website:
 *   - llms.txt, llms-full.txt, AGENTS.md
 *   - Full JSON-LD schema suite (Organization, FAQPage, HowTo, Article, BreadcrumbList)
 *   - robots.txt patch (unblocks all AI crawlers)
 *   - Markdown twin of homepage
 *   - INSTRUCTIONS.md (step-by-step install guide)
 * Returns all files as { filename: content } strings.
 * Optionally pings Bing IndexNow.
 */
async function handleGenerateFiles(req: Request, res: Response, scrape: ScrapeFn) {
  const parse = generateFilesRequestSchema.safeParse(req.body);
  if (!parse.success) {
    return apiError(res, 400, parse.error.issues[0].message, 'VALIDATION_ERROR');
  }

  const {
    url,
    industry = '',
    companyName: suppliedName,
  } = parse.data;
  const start = msNow();

  let scrapeResult: ScrapeResult;
  try {
    scrapeResult = await scrape(url);
  } catch (err: any) {
    return apiError(res, 502, `Failed to scrape ${url}: ${err?.message}`, 'SCRAPE_ERROR');
  }

  const domain = new URL(url).hostname.replace(/^www\./, '');
  const companyName = suppliedName ||
    (domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1));

  const signals = extractContentSignals(
    scrapeResult.html,
    scrapeResult.text,
    scrapeResult.sitemapUrls
  );

  const { generateAeoFiles, pingBingIndexNow } = await import('./aeo-file-generator');

  const files = await generateAeoFiles({
    websiteUrl: url,
    companyName,
    industry,
    businessType: (req.body.businessType as string) || '',
    targetAudience: (req.body.targetAudience as string) || '',
    valueProposition: (req.body.valueProposition as string) || '',
    signals,
    sitemapUrls: scrapeResult.sitemapUrls,
    scrapedText: scrapeResult.text,
    keywords: (req.body.keywords as string[]) || [],
    competitors: (req.body.competitors as string[]) || [],
  });

  // Ping Bing IndexNow (non-blocking)
  let indexNowResult = { success: false, message: 'Not requested' };
  if (req.body.pingIndexNow !== false) {
    indexNowResult = await pingBingIndexNow(url, scrapeResult.sitemapUrls);
  }

  return apiSuccess(res, {
    files,
    fileCount: Object.keys(files).length,
    domain,
    companyName,
    indexNow: indexNowResult,
  }, { processingTimeMs: Date.now() - start });
}

/**
 * GET /api/v1/benchmarks?industry=saas
 * Returns industry benchmark data.
 * Uses live dataset stats if enough data exists, otherwise falls back to
 * hardcoded benchmarks from industry-benchmarks.ts.
 */
async function handleBenchmarks(req: Request, res: Response) {
  const parse = benchmarksRequestSchema.safeParse({
    industry: req.query.industry,
    useLiveData: req.query.useLiveData === 'true',
  });
  if (!parse.success) {
    return apiError(res, 400, 'industry query parameter is required', 'VALIDATION_ERROR');
  }

  const { industry, useLiveData } = parse.data;

  // Try live dataset first if requested
  if (useLiveData) {
    const live = await getLiveBenchmarks(industry);
    if (live) {
      return apiSuccess(res, {
        source: 'live_dataset',
        sampleSize: live.sampleSize,
        industry,
        averageScores: { overall: live.avgOverallScore, ...live.avgPlatformScores },
        avgSignals: live.avgSignals,
        top10pctScore: live.top10pctScore,
        computedAt: live.computedAt,
      });
    }
  }

  // Fallback to hardcoded benchmarks
  const benchmark = getIndustryBenchmarks(industry);
  return apiSuccess(res, {
    source: 'hardcoded',
    sampleSize: null,
    industry: benchmark.industryName,
    averageScores: benchmark.averageScores,
    topPerformerScores: benchmark.topPerformerScores,
    contentBenchmarks: benchmark.contentBenchmarks,
    commonStrengths: benchmark.commonStrengths,
    commonWeaknesses: benchmark.commonWeaknesses,
  });
}

// ─── File Generators ──────────────────────────────────────────────────────────

function generateLlmsTxt(params: {
  companyName: string;
  url: string;
  domain: string;
  industry: string;
  signals: ReturnType<typeof extractContentSignals>;
  sitemapUrls: string[];
}): string {
  const { companyName, url, domain, industry, signals, sitemapUrls } = params;

  const tutorialUrls = sitemapUrls
    .filter(u => /\/tutorial|\/guide|\/how-to|\/learn|\/docs/i.test(u))
    .slice(0, 10);
  const caseStudyUrls = sitemapUrls
    .filter(u => /\/case-stud|\/customer|\/success|\/portfolio/i.test(u))
    .slice(0, 10);
  const faqUrls = sitemapUrls
    .filter(u => /\/faq|\/questions|\/help/i.test(u))
    .slice(0, 5);

  return `# ${companyName}
> ${industry ? `${industry} company` : 'Company'} at ${url}

## About
${companyName} is a ${industry || 'business'} operating at ${domain}.

## Key Resources

### Tutorials & Guides
${tutorialUrls.length > 0 ? tutorialUrls.map(u => `- ${u}`).join('\n') : `- ${url}/guides`}

### Case Studies & Success Stories
${caseStudyUrls.length > 0 ? caseStudyUrls.map(u => `- ${u}`).join('\n') : `- ${url}/customers`}

### FAQ
${faqUrls.length > 0 ? faqUrls.map(u => `- ${u}`).join('\n') : `- ${url}/faq`}

## Content Summary
- Tutorial pages detected: ${signals.tutorialCount}
- FAQ sections: ${signals.faqSectionCount}
- Case studies: ${signals.caseStudyCount}
- Blog posts: ${signals.blogPostCount}
- Documentation pages: ${signals.documentationPageCount}
- Data points and statistics: ${signals.dataPointCount}

## Sitemap
${url}/sitemap.xml
`.trim();
}

function generateFaqPageSchema(companyName: string, url: string, industry: string): string {
  const faqMap: Record<string, Array<{ q: string; a: string }>> = {
    legal: [
      { q: 'What types of cases does your firm handle?', a: `${companyName} handles a range of legal matters. Please contact us for a consultation.` },
      { q: 'How long does a case typically take?', a: 'Case duration varies by complexity. We provide realistic timelines during your initial consultation.' },
      { q: 'Do you offer a free consultation?', a: 'Yes, we offer an initial consultation to discuss your legal needs.' },
    ],
    healthcare: [
      { q: 'How do I schedule an appointment?', a: `You can schedule an appointment with ${companyName} online or by calling our office directly.` },
      { q: 'Do you accept insurance?', a: 'We accept most major insurance plans. Contact our office to confirm your specific coverage.' },
      { q: 'What should I bring to my first appointment?', a: 'Please bring your insurance card, photo ID, and any relevant medical records.' },
    ],
    default: [
      { q: `What does ${companyName} offer?`, a: `${companyName} provides services to help you achieve your goals. Visit ${url} to learn more.` },
      { q: 'How do I get started?', a: `Getting started with ${companyName} is easy. Visit our website or contact us directly.` },
      { q: 'What support do you provide?', a: `${companyName} offers comprehensive support to all customers.` },
    ],
  };

  const industryKey = /legal|law/.test(industry.toLowerCase()) ? 'legal'
    : /health|medical|clinic/.test(industry.toLowerCase()) ? 'healthcare'
    : 'default';

  const faqs = faqMap[industryKey] ?? faqMap.default;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return JSON.stringify(schema, null, 2);
}

function generateHowToSchema(companyName: string, url: string, industry: string): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to Get Started with ${companyName}`,
    description: `A step-by-step guide to getting started with ${companyName}.`,
    step: [
      { '@type': 'HowToStep', name: 'Visit the website', text: `Go to ${url} to learn more about ${companyName}.` },
      { '@type': 'HowToStep', name: 'Request information', text: 'Fill out the contact form or call us to discuss your needs.' },
      { '@type': 'HowToStep', name: 'Get a proposal', text: `${companyName} will prepare a customised proposal for your specific requirements.` },
      { '@type': 'HowToStep', name: 'Get started', text: 'Once you approve the proposal, we begin working together.' },
      { '@type': 'HowToStep', name: 'Review results', text: 'Track progress and review outcomes with your dedicated account contact.' },
    ],
  };
  return JSON.stringify(schema, null, 2);
}

function generateArticleSchema(companyName: string, url: string): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '[REPLACE: Your Article Title]',
    author: { '@type': 'Organization', name: companyName, url },
    publisher: { '@type': 'Organization', name: companyName, url },
    datePublished: '[REPLACE: YYYY-MM-DD]',
    dateModified: '[REPLACE: YYYY-MM-DD]',
    description: '[REPLACE: 2-3 sentence article summary]',
    mainEntityOfPage: { '@type': 'WebPage', '@id': '[REPLACE: full article URL]' },
  };
  return JSON.stringify(schema, null, 2);
}

function generateOrganizationSchema(companyName: string, url: string): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: companyName,
    url,
    logo: `${url}/logo.png`,
    sameAs: [
      '[REPLACE: LinkedIn URL]',
      '[REPLACE: Twitter/X URL]',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      url: `${url}/contact`,
    },
  };
  return JSON.stringify(schema, null, 2);
}

// ─── Router Registration ──────────────────────────────────────────────────────

/**
 * Register all /api/v1/* routes on an Express Router.
 *
 * Usage in routes.ts:
 *   import { registerApiV1 } from './api-router';
 *   registerApiV1(app, scrapeWebsite);
 *
 * @param router   Express Router (or app) to mount routes on.
 * @param scrape   The scrapeWebsite function from routes.ts.
 */
export function registerApiV1(router: Router, scrape: ScrapeFn) {
  // POST /api/v1/score
  router.post('/api/v1/score', (req, res) => {
    handleScore(req, res, scrape).catch(err => {
      console.error('POST /api/v1/score unhandled error:', err);
      apiError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
    });
  });

  // POST /api/v1/audit
  router.post('/api/v1/audit', (req, res) => {
    handleAudit(req, res, scrape).catch(err => {
      console.error('POST /api/v1/audit unhandled error:', err);
      apiError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
    });
  });

  // POST /api/v1/generate-files
  router.post('/api/v1/generate-files', (req, res) => {
    handleGenerateFiles(req, res, scrape).catch(err => {
      console.error('POST /api/v1/generate-files unhandled error:', err);
      apiError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
    });
  });

  // GET /api/v1/benchmarks
  router.get('/api/v1/benchmarks', (req, res) => {
    handleBenchmarks(req, res).catch(err => {
      console.error('GET /api/v1/benchmarks unhandled error:', err);
      apiError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
    });
  });

  console.log('✅ API v1 routes registered: /api/v1/score, /api/v1/audit, /api/v1/generate-files, /api/v1/benchmarks');
}
