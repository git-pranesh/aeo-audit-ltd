/**
 * Blueprint Orchestrator
 *
 * Single entry point that runs all 8 blueprint modules in parallel where possible,
 * collects results, scores them, and returns a BlueprintResult.
 *
 * Call this from routes.ts after scraping, in parallel with the existing audit:
 *
 *   const [auditData, blueprintResult] = await Promise.all([
 *     runExistingAudit(...),
 *     runBlueprintAudit(url, html, text, sitemapUrls, companyContext),
 *   ]);
 *
 * The combined score = 0.6 * existingScore + 0.4 * blueprintResult.normalizedScore
 * (gradually shift weight toward blueprint as confidence increases)
 */

import type { BlueprintResult, CriticalGap, BlueprintQuickWin } from './blueprint-signals';
import { emptyBlueprintResult } from './blueprint-signals';
import { analyzeAnswerCapsule } from './answer-capsule-engine';
import { detectEEAT } from './eeat-detector';
import { auditBotAccess } from './ai-bot-auditor';
import { scanOffsitePresence } from './offsite-scanner';

export interface BlueprintInput {
  websiteUrl: string;
  html: string;
  text: string;
  sitemapUrls: string[];
  brandName: string;
  companyName: string;
  industry: string;
  primaryQuery?: string;          // optional: the main keyword the site targets
  clientWikidataQid?: string | null;  // pre-checked QID from browser extension
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function runBlueprintAudit(input: BlueprintInput): Promise<BlueprintResult> {
  const { websiteUrl, html, text, sitemapUrls, brandName, companyName, industry, primaryQuery } = input;

  const result = emptyBlueprintResult();

  // ── Parallel Phase 1: On-page analysis (no external APIs) ─────────────────
  const [answerCapsule, botAccess] = await Promise.all([
    Promise.resolve(analyzeAnswerCapsule(html, text, primaryQuery)),
    safeRun(() => auditBotAccess(websiteUrl, html), result.botAccess),
  ]);
  result.answerCapsule = answerCapsule;
  result.botAccess = botAccess;

  // Freshness and schema from page content
  result.freshness = analyzeFreshness(html, text);
  result.schemaCompleteness = analyzeSchemaCompleteness(html, brandName);
  result.fanOut = analyzeFanOut(html, text, primaryQuery);
  result.entityConsistency.brandNameOnSite = extractBrandName(html, companyName);

  // ── Parallel Phase 2: External API calls (all free) ───────────────────────
  const domain = extractDomain(websiteUrl);

  const reviewsApply = reviewsApplyToCategory(industry, html, domain);

  const [eeat, offsite] = await Promise.all([
    safeRun(() => detectEEAT(html, text, websiteUrl, brandName), result.eeat),
    safeRun(() => scanOffsitePresence(brandName, domain, industry, companyName, input.clientWikidataQid, reviewsApply, html), result.offsite),
  ]);
  result.eeat = eeat;
  result.offsite = offsite;

  // ── Entity consistency (uses off-site data) ────────────────────────────────
  result.entityConsistency = analyzeEntityConsistency(result, brandName, companyName);

  // ── Calculate totals ───────────────────────────────────────────────────────
  const rawScore =
    result.answerCapsule.answerCapsuleScore +
    result.eeat.eeAtScore +
    result.botAccess.botAccessScore +
    result.offsite.offsiteScore +
    result.freshness.freshnessScore +
    result.schemaCompleteness.schemaCompletenessScore +
    result.fanOut.fanOutScore +
    result.entityConsistency.entityConsistencyScore;

  result.rawScore = Math.max(0, Math.min(150, rawScore));
  result.normalizedScore = Math.round((result.rawScore / 150) * 100);

  // ── Generate gaps and quick wins ───────────────────────────────────────────
  result.criticalGaps = identifyCriticalGaps(result);
  result.quickWins = identifyQuickWins(result);

  console.log(`📊 Blueprint audit: rawScore=${result.rawScore}/150, normalized=${result.normalizedScore}/100`);

  return result;
}

// ─── Module 5: Content Freshness (inline — page content only) ─────────────────

function analyzeFreshness(html: string, text: string) {
  const dateModifiedPattern = /"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"/;
  const articleModifiedPattern = /property="article:modified_time"\s+content="(\d{4}-\d{2}-\d{2})/;
  const visibleLastUpdatedPattern = /\b(last updated|updated on|revised on)\s*:?\s*(\w+ \d{1,2},?\s*\d{4}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i;
  const changelogPattern = /\b(changelog|what'?s new|release notes|update history)\b/i;
  const indexNowPattern = /IndexNow|indexnow/;

  let dateModifiedInSchema: string | null = null;
  let dateModifiedInHttp: string | null = null;

  const schemaMatch = html.match(dateModifiedPattern) || html.match(articleModifiedPattern);
  if (schemaMatch) dateModifiedInSchema = schemaMatch[1];

  let daysSinceModified: number | null = null;
  if (dateModifiedInSchema) {
    const modified = new Date(dateModifiedInSchema);
    if (!isNaN(modified.getTime())) {
      daysSinceModified = Math.floor((Date.now() - modified.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  const hasVisibleLastUpdatedAnnotation = visibleLastUpdatedPattern.test(text);
  const hasChangelogSection = changelogPattern.test(html + text);
  const indexNowConfigured = indexNowPattern.test(html);

  // Freshness is substantive if we found a dateModified and it changed the content meaningfully
  // We can't know this without a baseline, so we check for word count as a proxy
  const isSubstantiveUpdate = dateModifiedInSchema !== null && (text.split(/\s+/).length > 300);

  let freshnessScore = 0;

  if (daysSinceModified !== null) {
    if (daysSinceModified <= 30) freshnessScore += 7;
    else if (daysSinceModified <= 90) freshnessScore += 5;
    else if (daysSinceModified <= 180) freshnessScore += 3;
    else freshnessScore += 1;
  }

  if (hasVisibleLastUpdatedAnnotation) freshnessScore += 4;
  if (hasChangelogSection) freshnessScore += 3;
  if (indexNowConfigured) freshnessScore += 1;

  const freshnessStatus =
    freshnessScore >= 10 ? 'green' :
    freshnessScore >= 5  ? 'yellow' : 'red';

  return {
    dateModifiedInSchema,
    dateModifiedInHttp,
    daysSinceModified,
    hasVisibleLastUpdatedAnnotation,
    hasChangelogSection,
    sitemapLastModMatchesPage: false, // requires sitemap re-check — skip for now
    isSubstantiveUpdate,
    indexNowConfigured,
    freshnessScore: Math.min(15, freshnessScore),
    freshnessStatus: freshnessStatus as 'green' | 'yellow' | 'red',
  };
}

// ─── Module 6: Schema Completeness (inline) ────────────────────────────────────

// Flatten a parsed JSON-LD value into a list of schema objects, unwrapping the
// `@graph` wrapper that Yoast / RankMath / most pro sites use.
function flattenJsonLdNodes(node: any): any[] {
  const out: any[] = [];
  const visit = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (Array.isArray(n['@graph'])) n['@graph'].forEach(visit);
    if (n['@type']) out.push(n);
  };
  visit(node);
  return out;
}

// schema.org type families — a valid specific subtype (NewsArticle, MedicalWebPage,
// MedicalOrganization, etc.) is legitimate, authoritative markup and must earn the
// same credit as the generic parent, never be scored as if no schema were present.
const ORGANIZATION_TYPES = [
  'Organization', 'Corporation', 'LocalBusiness', 'OnlineBusiness',
  'MedicalOrganization', 'MedicalBusiness', 'Hospital', 'Physician', 'Dentist',
  'GovernmentOrganization', 'EducationalOrganization', 'CollegeOrUniversity',
  'School', 'NGO', 'NonprofitOrganization', 'NewsMediaOrganization',
  'LegalService', 'ProfessionalService', 'FinancialService', 'ResearchOrganization',
  'Airline',
];
const ARTICLE_TYPES = [
  'Article', 'BlogPosting', 'NewsArticle', 'TechArticle', 'ScholarlyArticle',
  'MedicalScholarlyArticle', 'Report', 'AnalysisNewsArticle', 'OpinionNewsArticle',
  'ReportageNewsArticle', 'ReviewNewsArticle', 'BackgroundNewsArticle',
  'AskPublicNewsArticle', 'MedicalWebPage', 'AdvertiserContentArticle',
  'SatiricalArticle',
];

// Institutional / informational entities (hospitals, news outlets, government,
// schools, museums, etc.) are not listed on product-review platforms (G2/Capterra/
// Trustpilot), so the absence of a review profile says nothing about them.
const INSTITUTIONAL_SCHEMA_RE = /"@type"\s*:\s*"(Medical[A-Za-z]*|Hospital|Physician|Dentist|Pharmacy|[A-Za-z]*Clinic|Government[A-Za-z]*|Educational[A-Za-z]*|CollegeOrUniversity|[A-Za-z]*School|Library|Museum|NewsMediaOrganization|NGO|NonprofitOrganization|ResearchOrganization|GovernmentService)"/i;
const NON_REVIEWABLE_INDUSTRY = [
  'health', 'medical', 'healthcare', 'hospital', 'clinic', 'medicine', 'pharma',
  'news', 'media', 'journalism', 'magazine', 'newspaper', 'press', 'publish',
  'government', 'gov ', 'municipal', 'public sector', 'federal', 'politic',
  'education', 'university', 'college', 'school', 'academ', 'research', 'institute',
  'nonprofit', 'non-profit', 'charity', 'ngo', 'foundation',
  'encyclopedia', 'reference', 'museum', 'library', 'wiki',
];

// Government / education / military TLDs are unambiguously institutional, e.g.
// nih.gov, harvard.edu, cam.ac.uk, abc.edu.au, army.mil. Used as a fallback so the
// extension (which often sends an empty industry) still classifies these correctly.
const INSTITUTIONAL_TLD_RE = /\.(gov|edu|mil|int)$/i;
const INSTITUTIONAL_TLD_CC_RE = /\.(gov|edu|ac|mil)\.[a-z]{2,3}$/i;

// Decide whether product-review-platform presence is a meaningful signal for this
// entity. Default true (most businesses/products plausibly have review profiles);
// false only for institutional/informational categories detected via on-page schema,
// an institutional TLD, or the industry descriptor — so their off-site max stays
// reachable from authority alone rather than penalizing absent review profiles.
function reviewsApplyToCategory(industry: string, html: string, domain: string): boolean {
  if (domain && (INSTITUTIONAL_TLD_RE.test(domain) || INSTITUTIONAL_TLD_CC_RE.test(domain))) return false;
  if (INSTITUTIONAL_SCHEMA_RE.test(html)) return false;
  const s = (industry || '').toLowerCase();
  if (s && NON_REVIEWABLE_INDUSTRY.some(k => s.includes(k))) return false;
  return true;
}

function analyzeSchemaCompleteness(html: string, brandName: string) {
  const jsonLdBlocks = Array.from(
    html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
  ).map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);

  const flatSchemas = jsonLdBlocks.flatMap((j: any) => flattenJsonLdNodes(j));
  const findSchema = (type: string) => flatSchemas.find((s: any) => s['@type'] === type || (Array.isArray(s['@type']) && s['@type'].includes(type)));
  // Match any type in a family (specific subtypes count the same as the parent).
  const findSchemaInFamily = (types: string[]) => flatSchemas.find((s: any) => {
    const t = s['@type'];
    if (Array.isArray(t)) return t.some((x: string) => types.includes(x));
    return types.includes(t);
  });

  // Organization
  const orgSchema = findSchemaInFamily(ORGANIZATION_TYPES);
  const orgCriticalProps = ['name', 'url', 'logo', 'sameAs'];
  const orgImportantProps = ['foundingDate', 'address', 'contactPoint', 'description'];
  const orgPropsFound = orgSchema ? [...orgCriticalProps, ...orgImportantProps].filter(p => orgSchema[p]) : [];
  const orgCriticalMissing = orgCriticalProps.filter(p => !orgSchema?.[p]);
  const orgSameAsValid = Array.isArray(orgSchema?.sameAs) && orgSchema.sameAs.length > 0;
  const orgScore = orgSchema ? Math.min(5, Math.round(orgPropsFound.length / (orgCriticalProps.length + orgImportantProps.length) * 5)) : 0;

  // Person
  const personSchema = findSchema('Person');
  const personProps = ['name', 'jobTitle', 'alumniOf', 'knowsAbout', 'sameAs', 'image'];
  const personPropsFound = personSchema ? personProps.filter(p => personSchema[p]) : [];
  const personScore = personSchema ? Math.min(5, Math.round(personPropsFound.length / personProps.length * 5)) : 0;

  // Article
  const articleSchema = findSchemaInFamily(ARTICLE_TYPES);
  const articleHasDateModified = !!(articleSchema?.dateModified);
  const articleAuthorIsEntityRef = typeof articleSchema?.author === 'object' && articleSchema.author?.['@id'];
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  const h1Text = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : '';
  const articleHeadlineMatchesH1 = articleSchema?.headline && h1Text &&
    articleSchema.headline.toLowerCase().trim() === h1Text.toLowerCase().trim();
  const articleScore = articleSchema ?
    (articleHasDateModified ? 2 : 0) + (articleAuthorIsEntityRef ? 1 : 0) + (articleHeadlineMatchesH1 ? 1 : 0) : 0;

  // FAQPage
  const faqSchema = findSchema('FAQPage');
  const faqQuestions = faqSchema?.mainEntity ?? [];
  const avgAnswerWordCount = faqQuestions.length > 0
    ? faqQuestions.reduce((sum: number, q: any) => {
        const answer = q?.acceptedAnswer?.text ?? '';
        return sum + answer.split(/\s+/).length;
      }, 0) / faqQuestions.length
    : 0;
  const answersInOptimalRange = avgAnswerWordCount >= 40 && avgAnswerWordCount <= 80;
  const faqScore = faqSchema ? (answersInOptimalRange ? 3 : 1) : 0;

  // Breadcrumb
  const breadcrumbSchema = findSchema('BreadcrumbList');
  const breadcrumbScore = breadcrumbSchema ? 3 : 0;

  const schemaCompletenessScore = Math.min(20, orgScore + personScore + articleScore + faqScore + breadcrumbScore);

  return {
    organization: { present: !!orgSchema, propertiesFound: orgPropsFound, criticalMissing: orgCriticalMissing, sameAsLinksValid: orgSameAsValid, score: orgScore },
    person: { present: !!personSchema, propertiesFound: personPropsFound, hasJobTitle: !!personSchema?.jobTitle, hasKnowsAbout: !!personSchema?.knowsAbout, hasSameAs: !!personSchema?.sameAs, linkedToArticle: !!articleAuthorIsEntityRef, score: personScore },
    article: { present: !!articleSchema, hasDateModified: articleHasDateModified, authorIsEntityRef: !!articleAuthorIsEntityRef, headlineMatchesH1: !!articleHeadlineMatchesH1, score: articleScore },
    faqPage: { present: !!faqSchema, avgAnswerWordCount: Math.round(avgAnswerWordCount), answersInOptimalRange, score: faqScore },
    breadcrumb: { present: !!breadcrumbSchema, score: breadcrumbScore },
    schemaCompletenessScore,
  };
}

// ─── Module 7: Fan-Out Coverage (inline) ──────────────────────────────────────

function analyzeFanOut(html: string, text: string, primaryQuery?: string) {
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  const h1Text = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim().toLowerCase() : '';

  const QUESTION_STARTERS = /^(how|what|why|when|which|who|where)\b/i;

  const h1ContainsPrimaryQuery = primaryQuery ?
    h1Text.includes(primaryQuery.toLowerCase().trim()) : false;
  const h1IsQuestionStyle = QUESTION_STARTERS.test(h1Text);

  const allHeadings = Array.from(html.matchAll(/<h[2-6][^>]*>(.*?)<\/h[2-6]>/gi))
    .map(m => m[1].replace(/<[^>]+>/g, '').trim());

  const h2h3MatchPrimaryQuery = primaryQuery ?
    allHeadings.some(h => h.toLowerCase().includes(primaryQuery.toLowerCase().trim())) : false;

  // Word count between headings
  const sections = text.split(/\n{2,}/).filter(s => s.trim().length > 20);
  const sectionWordCounts = sections.map(s => s.split(/\s+/).length);
  const avgWordsBetweenHeadings = sectionWordCounts.length > 0
    ? Math.round(sectionWordCounts.reduce((a, b) => a + b, 0) / sectionWordCounts.length)
    : 0;

  // Count answer blocks (40-60 words under headings)
  const headingParagraphPairs = Array.from(html.matchAll(/<h[23][^>]*>[\s\S]*?<\/h[23]>\s*<p[^>]*>([\s\S]*?)<\/p>/gi));
  const headingsWithAnswerBlockBelow = headingParagraphPairs.filter(m => {
    const words = m[1].replace(/<[^>]+>/g, '').split(/\s+/).length;
    return words >= 40 && words <= 150;
  }).length;

  const distinctSubtopicCount = allHeadings.length;
  const answerDensityScore = allHeadings.length > 0
    ? headingsWithAnswerBlockBelow / allHeadings.length
    : 0;

  let fanOutScore = 0;
  if (h1ContainsPrimaryQuery) fanOutScore += 3;
  if (h1Text.length > 0) fanOutScore += 1; // H1 present — question-style H1s are NOT penalized (they match how users query AI)
  if (!h2h3MatchPrimaryQuery) fanOutScore += 1; // no over-optimisation
  if (avgWordsBetweenHeadings >= 100 && avgWordsBetweenHeadings <= 200) fanOutScore += 2;
  fanOutScore += Math.min(3, headingsWithAnswerBlockBelow);

  return {
    h1ContainsPrimaryQuery, h1IsQuestionStyle, h2h3MatchPrimaryQuery,
    avgWordsBetweenHeadings, headingsWithAnswerBlockBelow,
    totalHeadingCount: allHeadings.length,
    distinctSubtopicCount,
    answerDensityScore: Math.round(answerDensityScore * 100) / 100,
    fanOutScore: Math.min(10, fanOutScore),
  };
}

// ─── Module 8: Entity Consistency (inline) ────────────────────────────────────

function analyzeEntityConsistency(result: BlueprintResult, brandName: string, companyName: string) {
  const nameMismatchCount = 0; // Deep comparison requires storing external names
  // For now: use KG and Wikidata existence as proxy for consistency
  const entityCoherenceRating =
    result.eeat.knowledgeGraphEntityFound && result.eeat.wikidataEntityFound ? 'strong' :
    result.eeat.knowledgeGraphEntityFound || result.eeat.wikidataEntityFound ? 'moderate' : 'weak';

  const entityConsistencyScore =
    entityCoherenceRating === 'strong' ? 5 :
    entityCoherenceRating === 'moderate' ? 3 : 1;

  return {
    brandNameOnSite: brandName,
    brandNameOnLinkedIn: null,
    brandNameOnG2: null,
    brandNameOnCrunchbase: null,
    brandNameOnWikidata: result.eeat.wikidataEntityFound ? brandName : null,
    nameMismatchCount,
    foundingYearConsistent: null,
    hqLocationConsistent: null,
    categoryConsistent: null,
    entityConsistencyScore,
    entityCoherenceRating: entityCoherenceRating as 'strong' | 'moderate' | 'weak',
  };
}

// ─── Gap and Quick Win generators ─────────────────────────────────────────────

function identifyCriticalGaps(result: BlueprintResult): CriticalGap[] {
  const gaps: CriticalGap[] = [];

  if (result.botAccess.citationBotsBlocked.length > 0) {
    gaps.push({ module: 'AI Bot Access', signal: 'Citation bots blocked', impact: 'critical',
      fix: `Unblock in robots.txt: ${result.botAccess.citationBotsBlocked.join(', ')}`, estimatedScoreGain: 5 });
  }

  if (!result.eeat.hasAuthorByline) {
    gaps.push({ module: 'E-E-A-T', signal: 'No author byline', impact: 'critical',
      fix: 'Add visible author byline with name and link to bio page on all content pages', estimatedScoreGain: 4 });
  }

  if (!result.eeat.knowledgeGraphEntityFound && !result.eeat.wikidataEntityFound) {
    gaps.push({ module: 'E-E-A-T', signal: 'No entity recognition', impact: 'high',
      fix: 'Create Wikidata entry and complete Organization schema with sameAs links', estimatedScoreGain: 7 });
  }

  if (!result.schemaCompleteness.organization.present) {
    gaps.push({ module: 'Schema', signal: 'No Organization schema', impact: 'high',
      fix: 'Add Organization schema to homepage with name, url, logo, sameAs properties', estimatedScoreGain: 3 });
  }

  if (!result.freshness.dateModifiedInSchema && result.freshness.daysSinceModified === null) {
    gaps.push({ module: 'Content Freshness', signal: 'No dateModified in schema', impact: 'medium',
      fix: 'Add dateModified to Article/BlogPosting schema on all content pages', estimatedScoreGain: 3 });
  }

  return gaps.sort((a, b) => b.estimatedScoreGain - a.estimatedScoreGain);
}

function identifyQuickWins(result: BlueprintResult): BlueprintQuickWin[] {
  const wins: BlueprintQuickWin[] = [];

  if (!result.botAccess.llmsTxtPresent) {
    wins.push({ action: 'Add llms.txt to your domain root', timeEstimate: '30 minutes', module: 'AI Bot Access', scoreGain: 2, difficulty: 'easy' });
  }

  if (!result.schemaCompleteness.faqPage.present && result.schemaCompleteness.faqPage.avgAnswerWordCount === 0) {
    wins.push({ action: 'Add FAQPage schema to your FAQ section', timeEstimate: '1 hour', module: 'Schema', scoreGain: 3, difficulty: 'easy' });
  }

  if (!result.eeat.hasAuthorByline) {
    wins.push({ action: 'Add author byline to content pages', timeEstimate: '2 hours', module: 'E-E-A-T', scoreGain: 4, difficulty: 'easy' });
  }

  if (!result.answerCapsule.hasDefinitionFirstPattern) {
    wins.push({ action: 'Rewrite opening paragraph as a direct definition-first answer', timeEstimate: '1 hour per page', module: 'Answer Capsule', scoreGain: 6, difficulty: 'medium' });
  }

  return wins.sort((a, b) => b.scoreGain - a.scoreGain);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

async function safeRun<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    console.warn(`⚠️ Blueprint module failed: ${err?.message}`);
    return fallback;
  }
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]; }
}

function extractBrandName(html: string, companyName: string): string {
  // Try OG site_name first
  const ogSiteName = html.match(/property="og:site_name"\s+content="([^"]+)"/i);
  if (ogSiteName) return ogSiteName[1];
  return companyName;
}
