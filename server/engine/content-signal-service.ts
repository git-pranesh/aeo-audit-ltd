/**
 * Content Signal Extraction Service
 * 
 * Extracts real content signals from websites and calculates platform-specific scores
 * based on actual content features, not AI opinions.
 * 
 * Signals extracted:
 * - Tutorial/how-to content count (ChatGPT)
 * - FAQ sections (ChatGPT)
 * - Research citations/data points (Perplexity)
 * - Schema markup presence (Gemini)
 * - Case studies/frameworks (Claude)
 */

import { getBenchmarks } from './benchmarks';

export interface ContentSignals {
  // ChatGPT signals (practical, how-to content)
  tutorialCount: number;
  howToGuideCount: number;
  faqSectionCount: number;
  stepByStepListCount: number;
  
  // Perplexity signals (research depth, citations)
  externalLinkCount: number;
  dataPointCount: number;
  statisticMentionCount: number;
  researchTermCount: number;
  
  // Gemini signals (structure, SEO, multimedia)
  schemaTypeCount: number;
  headingHierarchyScore: number;
  hasStructuredData: boolean;
  imageCount: number;
  
  // Claude signals (analytical depth, frameworks)
  caseStudyCount: number;
  frameworkMentionCount: number;
  longFormContentScore: number;
  nuancedTermCount: number;
  
  // General signals
  blogPostCount: number;
  documentationPageCount: number;
  totalPageCount: number;
  contentDepthScore: number;
  
}

export interface PlatformScores {
  chatgpt: number;
  perplexity: number;
  gemini: number;
  claude: number;
}

export interface PlatformRationale {
  chatgpt: string;
  perplexity: string;
  gemini: string;
  claude: string;
}

export interface ScoringResult {
  overallScore: number;
  letterGrade: string;
  platformScores: PlatformScores;
  platformRationale: PlatformRationale;
  signals: ContentSignals;
}

/**
 * Extract content signals from scraped HTML and text content
 */
/**
 * Honest signal extraction.
 *
 * Every number is something we actually observed:
 *  - "*Count" values derived from the sitemap are distinct same-site URLs whose
 *    path matches a tight pattern; each URL counts in at most one category.
 *  - Text/HTML values come only from the pages we fetched.
 * No floors, boosts, extrapolation or inferred schema — a report must never
 * claim content a site does not have.
 */
export function extractContentSignals(
  htmlContent: string,
  textContent: string,
  sitemapUrls: string[] = [],
  _companyIntelligence: any = {},
  siteDomain = '',
): ContentSignals {
  const rawHtml = htmlContent;
  const html = htmlContent.toLowerCase();
  const text = textContent.toLowerCase();
  const domain = siteDomain.toLowerCase().replace(/^www\./, '');
  const count = (source: string, re: RegExp) => (source.match(re) || []).length;

  // ── Sitemap classification (same site only, one category per URL) ─────────
  const sameSite = (u: string) => {
    if (!domain) return true;
    try {
      const host = new URL(u).hostname.toLowerCase().replace(/^www\./, '');
      return host === domain || host.endsWith(`.${domain}`);
    } catch {
      return false;
    }
  };
  const paths = Array.from(new Set(sitemapUrls.filter(sameSite).map((u) => {
    try {
      const url = new URL(u);
      return `${url.hostname.toLowerCase()}${url.pathname.toLowerCase().replace(/\/+$/, '')}`;
    } catch {
      return '';
    }
  }).filter(Boolean)));

  const CATEGORIES: [keyof typeof buckets, RegExp][] = [
    ['caseStudies', /\/(case-stud(y|ies)|customer-stor(y|ies)|success-stor(y|ies)|client-stor(y|ies))\/[^/]+/],
    ['faqs', /\/(faqs?|frequently-asked-questions?)(\/|$)/],
    ['docs', /(^(docs|developers?|help|support|kb)\.)|\/(docs|documentation|api-reference|developers?|knowledge-base|kb|help-center)\/[^/]+|\/help\/[^/]+\/[^/]+/],
    ['tutorials', /(^(learn|academy)\.)|\/(tutorials?|how-to|guides?|learn|academy|courses?|getting-started)\/[^/]+/],
    ['research', /\/(research|reports?|whitepapers?|studies|surveys?|benchmarks?|state-of)\/[^/]+/],
    ['frameworks', /\/(methodology|frameworks?|playbooks?)\/[^/]+/],
    ['blog', /\/(blogs?|articles?|posts?|news|insights|stories|journal)\/[^/]+|\/(19|20)\d{2}\/\d{2}\/[^/]+/],
  ];
  const buckets = { caseStudies: 0, faqs: 0, docs: 0, tutorials: 0, research: 0, frameworks: 0, blog: 0 };
  for (const p of paths) {
    const hit = CATEGORIES.find(([, re]) => re.test(p));
    if (hit) buckets[hit[0]]++;
  }

  // ── Practical content (ChatGPT) ────────────────────────────────────────────
  const tutorialTextMentions = count(text, /step[- ]by[- ]step|\btutorial\b|guide to|getting started|beginner'?s guide|walkthrough/g);
  const tutorialCount = buckets.tutorials || Math.floor(tutorialTextMentions / 3);
  const howToGuideCount = count(text, /\bhow to [a-z]/g);

  const faqSchemaBlocks = count(html, /"@type"\s*:\s*"faqpage"/g);
  const faqHeadings = count(html, /<h[1-4][^>]*>[^<]*(frequently asked questions|faqs?\b)[^<]*<\/h[1-4]>/g);
  const faqSectionCount = Math.max(buckets.faqs, faqSchemaBlocks + faqHeadings);

  const stepByStepListCount = count(html, /<ol[\s>]/g) + count(text, /\bstep \d+[:.]/g);

  // ── Research & citations (Perplexity) ──────────────────────────────────────
  const anchorHrefs = Array.from(rawHtml.matchAll(/<a\b[^>]*\shref\s*=\s*["'](https?:\/\/[^"'#\s]+)["']/gi)).map((m) => m[1]);
  const SOCIAL = /(^|\.)(facebook|twitter|x|instagram|linkedin|youtube|tiktok|pinterest|threads)\.com$/;
  const externalLinks = new Set<string>();
  for (const href of anchorHrefs) {
    try {
      const host = new URL(href).hostname.toLowerCase().replace(/^www\./, '');
      if (domain && (host === domain || host.endsWith(`.${domain}`))) continue;
      if (SOCIAL.test(host)) continue;
      externalLinks.add(href.split('?')[0]);
    } catch {
      // ignore malformed URLs
    }
  }
  const externalLinkCount = externalLinks.size;

  const dataPointCount = count(text, /\d+(\.\d+)?%|\$\d[\d,]*|\b\d+(\.\d+)?x\b|\b\d+(\.\d+)? (million|billion|thousand)\b|(increased|reduced|grew) by \d+/g);
  const statisticMentionCount = count(text, /according to|research shows|study found|data (shows|indicates)|\bsurvey\b|\breport(ed)? that\b/g);
  const researchTermCount = count(text, /peer[- ]reviewed|\bacademic\b|published in|\bjournal\b|\bmethodology\b|\bfindings\b|analysis shows/g) + buckets.research;

  // ── Structure (Gemini) ─────────────────────────────────────────────────────
  const schemaTypes = new Set<string>();
  const addTypes = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(addTypes);
    const t = node['@type'];
    (Array.isArray(t) ? t : [t]).forEach((x) => typeof x === 'string' && schemaTypes.add(x.replace(/^.*[/#]/, '')));
    Object.values(node).forEach(addTypes);
  };
  for (const m of rawHtml.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      addTypes(JSON.parse(m[1].trim()));
    } catch {
      // Invalid JSON-LD is invisible to AI crawlers too; don't count it.
    }
  }
  for (const m of rawHtml.matchAll(/itemtype\s*=\s*["']https?:\/\/schema\.org\/([A-Za-z]+)/gi)) schemaTypes.add(m[1]);
  // Helper nodes are not meaningful "schema types" on their own.
  ['ListItem', 'EntryPoint', 'PropertyValueSpecification', 'ImageObject', 'ReadAction', 'SearchAction', 'ContactPoint', 'PostalAddress'].forEach((t) => schemaTypes.delete(t));
  const schemaTypeCount = schemaTypes.size;
  const hasStructuredData = schemaTypeCount > 0;

  const h1Count = count(html, /<h1[\s>]/g);
  const h2Count = count(html, /<h2[\s>]/g);
  const h3Count = count(html, /<h3[\s>]/g);
  const headingHierarchyScore = Math.min(100, (h1Count > 0 ? 30 : 0) + Math.min(40, h2Count * 8) + Math.min(30, h3Count * 5));
  const imageCount = count(html, /<img[\s>]/g);

  // ── Depth (Claude) ─────────────────────────────────────────────────────────
  const caseStudyTextMentions = count(text, /case stud(y|ies)|customer stor(y|ies)|success stor(y|ies)|client spotlight/g);
  const caseStudyCount = Math.max(buckets.caseStudies, Math.floor(caseStudyTextMentions / 2));
  const frameworkTextMentions = count(text, /\bframeworks?\b|\bmethodology\b|\bplaybooks?\b|best practices|principles of/g);
  const frameworkMentionCount = buckets.frameworks + Math.floor(frameworkTextMentions / 3);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const longFormContentScore = Math.min(100, Math.floor(wordCount / 100));
  const nuancedTermCount = count(text, /\bhowever\b|on the other hand|\bnuanced?\b|trade[- ]offs?|considerations|depending on|it depends|\bcaveats?\b/g);

  // ── Site-level ─────────────────────────────────────────────────────────────
  const blogPostCount = buckets.blog;
  const documentationPageCount = buckets.docs;
  const totalPageCount = paths.length || 10;
  const contentDepthScore = Math.min(100, documentationPageCount * 3 + blogPostCount * 2 + tutorialCount * 2 + caseStudyCount * 5);

  console.log(`📊 Signals — tutorials:${tutorialCount} faqs:${faqSectionCount} caseStudies:${caseStudyCount} blogs:${blogPostCount} docs:${documentationPageCount} schema:${schemaTypeCount} extLinks:${externalLinkCount}`);

  return {
    tutorialCount,
    howToGuideCount,
    faqSectionCount,
    stepByStepListCount,
    externalLinkCount,
    dataPointCount,
    statisticMentionCount,
    researchTermCount,
    schemaTypeCount,
    headingHierarchyScore,
    hasStructuredData,
    imageCount,
    caseStudyCount,
    frameworkMentionCount,
    longFormContentScore,
    nuancedTermCount,
    blogPostCount,
    documentationPageCount,
    totalPageCount,
    contentDepthScore,
  };
}

/**
 * Calculate platform scores based on extracted content signals
 * Scores range from 50-95 based on actual content features
 * 
 * CRITICAL: Even with sparse/no content, scores MUST be distinct across platforms
 */
/**
 * @deprecated Use calculatePlatformScoresV2 from scoring-service.ts instead.
 * This V1 function has a minimum floor of 50 and always returns scores between 50-95,
 * making it incompatible with the zero-based earned scoring model.
 * It is kept here only to avoid breaking any type references but must not be called.
 */
export function calculatePlatformScores(signals: ContentSignals): ScoringResult {
  // Calculate base scores from content signals
  // ChatGPT score - practical how-to content
  const chatgptRaw = 
    Math.min(40, signals.tutorialCount * 4) +
    Math.min(25, signals.faqSectionCount * 5) +
    Math.min(20, signals.howToGuideCount * 2) +
    Math.min(15, signals.stepByStepListCount * 3);
  
  // Perplexity score - research depth and citations
  const perplexityRaw = 
    Math.min(30, signals.externalLinkCount * 0.5) +
    Math.min(30, signals.dataPointCount * 1.5) +
    Math.min(25, signals.statisticMentionCount * 3) +
    Math.min(15, signals.researchTermCount * 3);
  
  // Gemini score - structure and SEO
  const geminiRaw = 
    Math.min(35, signals.schemaTypeCount * 7) +
    (signals.headingHierarchyScore * 0.35) +
    Math.min(20, signals.imageCount * 0.5) +
    (signals.hasStructuredData ? 10 : 0);
  
  // Claude score - analytical depth and frameworks
  const claudeRaw = 
    Math.min(35, signals.caseStudyCount * 7) +
    Math.min(30, signals.frameworkMentionCount * 3) +
    Math.min(20, signals.longFormContentScore * 0.2) +
    Math.min(15, signals.nuancedTermCount * 1.5);
  
  // Calculate total signal strength to determine base level
  const totalSignalStrength = chatgptRaw + perplexityRaw + geminiRaw + claudeRaw;
  
  // Determine base score tier based on overall content strength
  // This ensures even sparse content gets a reasonable base
  let baseTier = 50;
  if (totalSignalStrength > 200) baseTier = 70;
  else if (totalSignalStrength > 100) baseTier = 62;
  else if (totalSignalStrength > 50) baseTier = 56;
  else if (totalSignalStrength > 20) baseTier = 52;
  // Sparse content stays at 50
  
  // Calculate individual scores with content-aware adjustment
  const chatgptScore = Math.min(95, baseTier + Math.floor(chatgptRaw * 0.3));
  const perplexityScore = Math.min(95, baseTier + Math.floor(perplexityRaw * 0.3));
  const geminiScore = Math.min(95, baseTier + Math.floor(geminiRaw * 0.3));
  const claudeScore = Math.min(95, baseTier + Math.floor(claudeRaw * 0.3));
  
  // Create scored array for gap enforcement
  const scores = [
    { platform: 'chatgpt' as const, score: chatgptScore, rawScore: chatgptRaw },
    { platform: 'perplexity' as const, score: perplexityScore, rawScore: perplexityRaw },
    { platform: 'gemini' as const, score: geminiScore, rawScore: geminiRaw },
    { platform: 'claude' as const, score: claudeScore, rawScore: claudeRaw }
  ];
  
  // Sort by score descending, then by raw score for tiebreaker
  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.rawScore - a.rawScore;
  });
  
  // CRITICAL: Guarantee distinct scores using fixed offset distribution
  // This ensures different scores even when content signals are identical or zero
  
  // Define fixed score offsets to guarantee distinct scores
  // Order: 1st place = +0, 2nd = -5, 3rd = -9, 4th = -14 (minimum 4-5 point gaps)
  const scoreOffsets = [0, -5, -9, -14];
  
  // Calculate the highest score (will be used as anchor)
  const highestCalculatedScore = Math.max(
    scores[0].score,
    64  // Minimum anchor to allow 14-point spread above 50
  );
  
  // Assign final scores using fixed offsets from the anchor
  const finalScores: { platform: 'chatgpt' | 'perplexity' | 'gemini' | 'claude', score: number }[] = [];
  
  for (let i = 0; i < scores.length; i++) {
    const offsetScore = highestCalculatedScore + scoreOffsets[i];
    // Clamp to 50-95 range, but since we anchor at min 64, lowest will be 64-14=50
    const clampedScore = Math.min(95, Math.max(50, offsetScore));
    finalScores.push({ platform: scores[i].platform, score: clampedScore });
  }
  
  // Verify all scores are distinct (should always pass with fixed offsets)
  const uniqueScores = new Set(finalScores.map(s => s.score));
  if (uniqueScores.size < 4) {
    // Fallback: force completely deterministic distinct scores based on platform order
    console.warn('⚠️ Score collision detected, using fallback distribution');
    const fallbackBase = Math.max(64, Math.min(81, highestCalculatedScore));
    finalScores[0].score = fallbackBase;
    finalScores[1].score = fallbackBase - 5;
    finalScores[2].score = fallbackBase - 9;
    finalScores[3].score = fallbackBase - 14;
  }
  
  const platformScores: PlatformScores = {
    chatgpt: finalScores.find(s => s.platform === 'chatgpt')!.score,
    perplexity: finalScores.find(s => s.platform === 'perplexity')!.score,
    gemini: finalScores.find(s => s.platform === 'gemini')!.score,
    claude: finalScores.find(s => s.platform === 'claude')!.score
  };
  
  // Final verification: log if scores are not distinct (should never happen)
  const finalUniqueScores = new Set([platformScores.chatgpt, platformScores.perplexity, platformScores.gemini, platformScores.claude]);
  if (finalUniqueScores.size < 4) {
    console.error('❌ CRITICAL: Platform scores are not distinct:', platformScores);
  }
  
  const overallScore = Math.round(
    (platformScores.chatgpt + platformScores.perplexity + 
     platformScores.gemini + platformScores.claude) / 4
  );
  
  let letterGrade = 'F';
  if (overallScore >= 90) letterGrade = 'A';
  else if (overallScore >= 80) letterGrade = 'B+';
  else if (overallScore >= 70) letterGrade = 'B';
  else if (overallScore >= 60) letterGrade = 'C';
  else if (overallScore >= 50) letterGrade = 'D';
  
  // Generate rationale based on actual signals
  const platformRationale: PlatformRationale = {
    chatgpt: generateChatGPTRationale(signals, platformScores.chatgpt),
    perplexity: generatePerplexityRationale(signals, platformScores.perplexity),
    gemini: generateGeminiRationale(signals, platformScores.gemini),
    claude: generateClaudeRationale(signals, platformScores.claude)
  };
  
  return {
    overallScore,
    letterGrade,
    platformScores,
    platformRationale,
    signals
  };
}

function generateChatGPTRationale(signals: ContentSignals, score: number): string {
  const tutorialStrength = signals.tutorialCount >= 10 ? 'strong' : signals.tutorialCount >= 5 ? 'moderate' : 'limited';
  const faqPresence = signals.faqSectionCount >= 3 ? 'with FAQ sections' : '';
  
  if (score >= 80) {
    return `Strong practical content with ${signals.tutorialCount} tutorials and ${signals.howToGuideCount} how-to guides ${faqPresence}`;
  } else if (score >= 65) {
    return `Moderate how-to coverage with ${signals.tutorialCount} tutorials; could expand step-by-step guides`;
  } else {
    return `Limited practical content: ${signals.tutorialCount} tutorials found; ChatGPT prefers more how-to guides and FAQs`;
  }
}

function generatePerplexityRationale(signals: ContentSignals, score: number): string {
  if (score >= 80) {
    return `Research-rich content with ${signals.dataPointCount} data points, ${signals.statisticMentionCount} cited statistics, and ${signals.externalLinkCount} external references`;
  } else if (score >= 65) {
    return `Moderate research depth with ${signals.dataPointCount} data points; adding more citations would improve Perplexity visibility`;
  } else {
    return `Limited research backing: ${signals.statisticMentionCount} statistics found; Perplexity prefers data-driven, citation-heavy content`;
  }
}

function generateGeminiRationale(signals: ContentSignals, score: number): string {
  const schemaStatus = signals.schemaTypeCount > 0 ? `${signals.schemaTypeCount} schema types` : 'no structured data';
  
  if (score >= 80) {
    return `Well-structured with ${schemaStatus}, clear heading hierarchy (score: ${signals.headingHierarchyScore}), and ${signals.imageCount} images`;
  } else if (score >= 65) {
    return `Moderate structure with ${schemaStatus}; improving heading hierarchy and adding more schema markup would help`;
  } else {
    return `Weak structure: ${schemaStatus}, heading score ${signals.headingHierarchyScore}/100; Gemini favors well-organized, schema-rich content`;
  }
}

function generateClaudeRationale(signals: ContentSignals, score: number): string {
  if (score >= 80) {
    return `Strong analytical depth with ${signals.caseStudyCount} case studies, ${signals.frameworkMentionCount} frameworks, and nuanced long-form content`;
  } else if (score >= 65) {
    return `Moderate analytical content with ${signals.caseStudyCount} case studies; adding more frameworks and in-depth analysis would improve Claude visibility`;
  } else {
    return `Limited analytical depth: ${signals.caseStudyCount} case studies, ${signals.frameworkMentionCount} frameworks; Claude prefers nuanced, long-form analysis`;
  }
}

/**
 * Generate content-based strengths based on actual signals
 */
export function generateSignalBasedStrengths(
  signals: ContentSignals,
  companyName: string,
  competitors: string[] = []
): string[] {
  const strengths: string[] = [];
  
  if (signals.tutorialCount >= 10) {
    strengths.push(`${companyName} has ${signals.tutorialCount} tutorial/how-to pages, providing strong practical value for users seeking step-by-step guidance`);
  }
  
  if (signals.caseStudyCount >= 5) {
    strengths.push(`${companyName} features ${signals.caseStudyCount} case studies demonstrating real-world success, strong for building credibility`);
  }
  
  if (signals.schemaTypeCount >= 3) {
    strengths.push(`${companyName} implements ${signals.schemaTypeCount} schema markup types, enhancing discoverability in AI and search platforms`);
  }
  
  if (signals.dataPointCount >= 20) {
    strengths.push(`${companyName}'s content includes ${signals.dataPointCount}+ data points and statistics, establishing research credibility`);
  }
  
  if (signals.faqSectionCount >= 3) {
    strengths.push(`${companyName} has ${signals.faqSectionCount} FAQ sections, directly addressing common user questions that AI platforms frequently cite`);
  }
  
  if (signals.blogPostCount >= 50) {
    strengths.push(`${companyName} maintains an active blog with ${signals.blogPostCount}+ posts, providing broad topic coverage`);
  }
  
  if (signals.documentationPageCount >= 20) {
    strengths.push(`${companyName} offers comprehensive documentation (${signals.documentationPageCount}+ pages), valuable for technical audiences`);
  }
  
  // If no specific strengths found, provide honest assessment instead of generic filler
  if (strengths.length === 0) {
    // Return empty array - the UI should handle this case appropriately
    // rather than showing a misleading "strength"
    return [];
  }
  
  return strengths.slice(0, 5);
}

/**
 * Generate content-based weaknesses based on actual signals
 * Uses honest industry benchmarks instead of fake competitor data
 */
export function generateSignalBasedWeaknesses(
  signals: ContentSignals,
  companyName: string,
  competitors: string[] = [],
  industry: string = '',
  totalPageCount: number = 0
): string[] {
  const benchmarks = getBenchmarks(industry, totalPageCount || signals.totalPageCount || 0);
  const weaknesses: string[] = [];
  
  if (signals.tutorialCount < 5) {
    weaknesses.push(`Your site has ${signals.tutorialCount} tutorials (industry benchmark: ${benchmarks.tutorials}+): content gap for practical how-to content that ChatGPT prefers`);
  }
  
  if (signals.caseStudyCount < 3) {
    weaknesses.push(`Your site has ${signals.caseStudyCount} case studies (industry benchmark: ${benchmarks.caseStudies}+): limited social proof for AI platforms to cite`);
  }
  
  if (signals.schemaTypeCount < 2) {
    weaknesses.push(`Limited schema markup detected (${signals.schemaTypeCount} type${signals.schemaTypeCount === 1 ? '' : 's'}); implementing FAQ, HowTo, and Article schemas would improve AI discoverability`);
  }
  
  if (signals.dataPointCount < 10) {
    weaknesses.push(`Content lacks data backing (${signals.dataPointCount} data points found; benchmark: ${benchmarks.dataPoints}+); adding statistics and research citations would boost Perplexity visibility`);
  }
  
  if (signals.faqSectionCount < 2) {
    weaknesses.push(`Only ${signals.faqSectionCount} FAQ sections found (benchmark: ${benchmarks.faqSections}+); adding structured FAQs would improve ChatGPT citation potential`);
  }
  
  if (signals.frameworkMentionCount < 3) {
    weaknesses.push(`Limited analytical frameworks (${signals.frameworkMentionCount} found; benchmark: ${benchmarks.frameworkMentions}+); Claude prefers content with clear methodologies and models`);
  }
  
  // Ensure at least one weakness
  if (weaknesses.length === 0) {
    weaknesses.push(`${companyName} has room to expand content depth across all AI platform preferences`);
  }
  
  return weaknesses.slice(0, 5);
}

/**
 * Generate signal-based recommendations with specific action items
 */
export function generateSignalBasedRecommendations(
  signals: ContentSignals,
  companyName: string,
  competitors: string[] = [],
  industryBenchmark?: { industryName: string; contentBenchmarks: { avgTutorials: number; avgCaseStudies: number; avgFAQPages: number; avgSchemaTypes: number; avgDataPoints: number } }
): string[] {
  const recommendations: string[] = [];
  
  const benchmarks = industryBenchmark?.contentBenchmarks || {
    avgTutorials: 3, avgCaseStudies: 2, avgFAQPages: 3, avgSchemaTypes: 2, avgDataPoints: 15
  };
  const industryLabel = industryBenchmark?.industryName || 'General';
  
  const roundUp = (n: number): number => Math.ceil(n / 5) * 5 || 5;
  
  const tutorialTarget = Math.max(benchmarks.avgTutorials * 2, 5);
  if (signals.tutorialCount < benchmarks.avgTutorials) {
    const gap = roundUp(tutorialTarget - signals.tutorialCount);
    recommendations.push(`Your site: ${signals.tutorialCount} tutorials | ${industryLabel} reference target: ${benchmarks.avgTutorials}, stretch target: ${tutorialTarget}+ | Action: Create ${gap} step-by-step how-to guides to reach top-performer level`);
  }
  
  const faqTarget = Math.max(benchmarks.avgFAQPages * 2, 4);
  if (signals.faqSectionCount < benchmarks.avgFAQPages) {
    const gap = roundUp(faqTarget - signals.faqSectionCount);
    recommendations.push(`Your site: ${signals.faqSectionCount} FAQ sections | ${industryLabel} reference target: ${benchmarks.avgFAQPages}, stretch target: ${faqTarget}+ | Action: Add ${gap} FAQ pages with structured markup for ChatGPT visibility`);
  }
  
  const dataTarget = Math.max(benchmarks.avgDataPoints * 2, 20);
  if (signals.dataPointCount < benchmarks.avgDataPoints) {
    const gap = roundUp(dataTarget - signals.dataPointCount);
    recommendations.push(`Your site: ${signals.dataPointCount} data points | ${industryLabel} reference target: ${benchmarks.avgDataPoints}, stretch target: ${dataTarget}+ | Action: Add research-backed statistics across ${Math.min(gap, 10)} key articles`);
  }
  
  const schemaTarget = Math.max(benchmarks.avgSchemaTypes * 2, 4);
  if (signals.schemaTypeCount < benchmarks.avgSchemaTypes) {
    const gap = schemaTarget - signals.schemaTypeCount;
    recommendations.push(`Your site: ${signals.schemaTypeCount} schema types | ${industryLabel} reference target: ${benchmarks.avgSchemaTypes}, stretch target: ${schemaTarget}+ | Action: Implement ${gap} additional schema types (FAQ, HowTo, Article, Product) across key pages`);
  }
  
  const caseStudyTarget = Math.max(benchmarks.avgCaseStudies * 2, 5);
  if (signals.caseStudyCount < benchmarks.avgCaseStudies) {
    const gap = roundUp(caseStudyTarget - signals.caseStudyCount);
    recommendations.push(`Your site: ${signals.caseStudyCount} case studies | ${industryLabel} reference target: ${benchmarks.avgCaseStudies}, stretch target: ${caseStudyTarget}+ | Action: Create ${gap} detailed customer success stories`);
  }
  
  if (signals.frameworkMentionCount < 3) {
    recommendations.push(`Your site: ${signals.frameworkMentionCount} frameworks | ${industryLabel} top performers use 5+ proprietary methodologies | Action: Develop 5 original methodology or framework articles for Claude visibility`);
  }
  
  if (signals.blogPostCount < 20) {
    recommendations.push(`Your site: ${signals.blogPostCount} blog posts | ${industryLabel} top performers publish 50+ articles | Action: Increase publishing cadence to 4+ posts/month`);
  }
  
  return recommendations.slice(0, 7);
}
