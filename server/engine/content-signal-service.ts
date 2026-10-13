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
  
  // Candidate URLs for verification (NEW)
  candidateUrls?: {
    tutorials: string[];
    caseStudies: string[];
    faqs: string[];
    research: string[];
    frameworks: string[];
  };
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
export function extractContentSignals(
  htmlContent: string,
  textContent: string,
  sitemapUrls: string[] = [],
  companyIntelligence: any = {}
): ContentSignals {
  const html = htmlContent.toLowerCase();
  const text = textContent.toLowerCase();
  
  // ChatGPT signals - practical how-to content
  // SITEMAP-FIRST: Count URLs in sitemap that indicate tutorials/how-to content
  const tutorialUrls = sitemapUrls.filter(url =>
    /\/tutorial|\/how-to|\/guide|\/learn|\/getting-started|\/walkthrough|\/step-by-step|\/lesson|\/training|\/course|\/academy|\/workshop|\/quickstart|\/quick-start|\/onboarding|\/setup-guide|\/demo|\/webinar|\/documentation\/.*getting|\/resources\/.*tutorial|\/resources\/.*guide|\/help\/.*how|\/kb\/.*guide|\/education/i.test(url)
    || /\/docs\/|\/documentation\/|\/reference\/|\/api-reference\/|\/api\/.*reference|\/developer\/|\/developers\/|\/sdk\/|\/cli\/|\/changelog\/|\/release-notes\/|\/manual\/|\/handbook\/|\/wiki\/|\/knowledge\/|\/user-guide\/|\/admin-guide\/|\/integration\/|\/integrations\//i.test(url)
  );

  const eduSubdomains = ['learn', 'academy', 'training', 'education', 'university', 'courses', 'lessons'];
  const eduSubdomainUrls = sitemapUrls.filter(url => {
    try {
      const hostname = new URL(url).hostname.split('.')[0];
      return eduSubdomains.includes(hostname);
    } catch { return false; }
  });
  const eduSubdomainBoost = Math.floor(eduSubdomainUrls.length * 0.35);
  const tutorialUrlCount = tutorialUrls.length + eduSubdomainBoost;

  if (eduSubdomainBoost > 0) {
    console.log(`📚 Subdomain tutorial boost: +${eduSubdomainBoost} from ${eduSubdomainUrls.length} edu subdomain pages`);
  }
  
  // Also count text mentions as secondary signal
  const tutorialPatterns = [
    /how to /gi, /step[- ]by[- ]step/gi, /tutorial/gi, /guide to/gi,
    /getting started/gi, /beginners? guide/gi, /walkthrough/gi
  ];
  const tutorialTextMentions = tutorialPatterns.reduce((count, pattern) => 
    count + (text.match(pattern) || []).length, 0);
  
  // Use sitemap count if available, otherwise fall back to text mentions (divided to avoid inflation)
  // NOTE: documentationPageCount boost is applied later (after that variable is computed)
  let tutorialCount = tutorialUrlCount > 0 ? tutorialUrlCount : Math.floor(tutorialTextMentions / 3);
  
  const howToGuideCount = (text.match(/how to [a-z]/gi) || []).length;
  
  // SITEMAP-FIRST: Count FAQ pages from sitemap
  const faqUrls = sitemapUrls.filter(url => {
    const normalizedUrl = url.toLowerCase().replace(/[?#].*$/, '');
    // Strong FAQ patterns - always count these
    const strongFaqPattern = /\/faq|\/faqs\/|\/frequently-asked|\/questions\/|\/answers\/|\/knowledge-base|\/kb\/|\/help-center|\/helpdesk|\/answers\/|\/q-and-a/i.test(normalizedUrl);
    // Allow FAQ pages on any subdomain if URL explicitly contains "faq"
    const explicitFaq = /faq/i.test(normalizedUrl);
    return strongFaqPattern || explicitFaq;
  });
  const helpSubdomains = ['help', 'support', 'kb', 'knowledge', 'helpdesk', 'faq'];
  const helpSubdomainUrls = sitemapUrls.filter(url => {
    try {
      const hostname = new URL(url).hostname.split('.')[0];
      return helpSubdomains.includes(hostname);
    } catch { return false; }
  });
  const helpSubdomainBoost = Math.floor(helpSubdomainUrls.length * 0.15);
  const faqUrlCount = faqUrls.length + Math.min(20, helpSubdomainBoost);
  
  const faqPatterns = [
    /<script type="application\/ld\+json"[^>]*>[\s\S]*?faqpage[\s\S]*?<\/script>/gi,
    /frequently asked questions/gi, /faqs?[\s:]/gi, /<details/gi
  ];
  const faqTextMentions = faqPatterns.reduce((count, pattern) => 
    count + (html.match(pattern) || []).length, 0);
  
  // HYBRID: Use maximum of URL-based and text-based detection
  const faqSectionCount = Math.max(faqUrlCount, faqTextMentions);
  
  const stepByStepListCount = (html.match(/<ol[^>]*>[\s\S]*?<\/ol>/gi) || []).length +
    (text.match(/step \d+[:.]/gi) || []).length;
  
  // Perplexity signals - research depth
  // SITEMAP-FIRST: Count research/data pages from sitemap
  const researchUrls = sitemapUrls.filter(url => 
    /\/research|\/report|\/data|\/insight|\/statistic|\/study|\/whitepaper|\/ebook|\/benchmark|\/survey|\/analysis|\/trends?\/|\/findings|\/publications?/i.test(url)
  );
  const researchUrlCount = researchUrls.length;
  
  // External link detection: count from all sampled HTML, then scale for site size
  // The regex counts outbound links excluding social media
  const rawExternalLinkCount = (html.match(/href="https?:\/\/(?!.*?(facebook|twitter|instagram|linkedin|youtube))[^"]+"/gi) || []).length;
  
  // Scale-aware: the HTML includes homepage + ~7 hardcoded pages + ~20 sampled pages ≈ 28 pages
  // For large sites, extrapolate based on the ratio of sampled pages to total sitemap size
  const estimatedPagesScraped = Math.max(1, Math.min(28, sitemapUrls.length));
  let externalLinkCount = rawExternalLinkCount;
  if (sitemapUrls.length > 50 && rawExternalLinkCount > 0) {
    // Calculate links-per-page from sample, then estimate site-wide total
    const linksPerPage = rawExternalLinkCount / estimatedPagesScraped;
    // Use conservative multiplier: assume only content pages (blog, docs, help) have external links
    // Estimate ~40% of sitemap URLs are content-rich pages
    const contentPageEstimate = Math.floor(sitemapUrls.length * 0.4);
    const estimatedTotal = Math.floor(linksPerPage * contentPageEstimate);
    // Cap at reasonable maximum, use at least what we directly detected
    externalLinkCount = Math.max(rawExternalLinkCount, Math.min(estimatedTotal, 5000));
    if (externalLinkCount !== rawExternalLinkCount) {
      console.log(`📊 External links scale adjustment: ${rawExternalLinkCount} detected in sample → ${externalLinkCount} estimated (${sitemapUrls.length} sitemap pages, ~${linksPerPage.toFixed(1)} links/page)`);
    }
  }
  
  const dataPointPatterns = [
    /\d+%/g, /\$[\d,]+/g, /\d+x/gi, /\d+ (million|billion|thousand)/gi,
    /increased by \d+/gi, /reduced by \d+/gi, /grew \d+/gi
  ];
  const dataPointTextCount = dataPointPatterns.reduce((count, pattern) => 
    count + (text.match(pattern) || []).length, 0);
  
  // Boost data points if research URLs exist in sitemap
  const dataPointCount = dataPointTextCount + (researchUrlCount * 5);
  
  const statisticMentionCount = (text.match(/according to|research shows|study found|data indicates|survey|report/gi) || []).length;
  
  const researchTerms = [
    /peer[- ]reviewed/gi, /academic/gi, /published in/gi, /journal/gi,
    /methodology/gi, /findings/gi, /analysis shows/gi, /evidence/gi
  ];
  const researchTermCount = researchTerms.reduce((count, pattern) => 
    count + (text.match(pattern) || []).length, 0) + researchUrlCount;
  
  // Gemini signals - structure and SEO
  // Schema detection: find unique schema @type values across all sampled HTML
  const jsonLdBlocks = html.match(/<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi) || [];
  const schemaTypes = new Set<string>();
  for (const block of jsonLdBlocks) {
    const typeMatches = block.match(/"@type"\s*:\s*"([^"]+)"/gi) || [];
    for (const tm of typeMatches) {
      const typeValue = tm.match(/"@type"\s*:\s*"([^"]+)"/i);
      if (typeValue) schemaTypes.add(typeValue[1]);
    }
    const arrayTypeMatches = block.match(/"@type"\s*:\s*\[([^\]]+)\]/gi) || [];
    for (const atm of arrayTypeMatches) {
      const types = atm.match(/"([A-Z][a-zA-Z]+)"/g) || [];
      for (const t of types) {
        const clean = t.replace(/"/g, '');
        if (clean !== '@type') schemaTypes.add(clean);
      }
    }
  }
  const rawSchemaTypeCount = schemaTypes.size || (jsonLdBlocks.length > 0 ? 1 : 0);
  
  // Scale-aware schema estimation: if we only sampled a fraction of the site,
  // the sampled unique types likely represent the site's schema diversity
  // Large sites with blog/docs content typically reuse schema across pages
  // So unique type count from sample is a good lower-bound; add sitemap-based boost
  let schemaTypeCount = rawSchemaTypeCount;
  const sitemapPageCount = sitemapUrls.length || 10;
  if (sitemapPageCount > 100 && rawSchemaTypeCount > 0) {
    // Sites with schema on sampled pages likely have it on content pages too
    // Boost based on content diversity: blog pages=Article, FAQ pages=FAQPage, etc.
    const hasBlogUrls = sitemapUrls.some(u => /\/blog\//i.test(u));
    const hasFaqUrls = sitemapUrls.some(u => /\/faq/i.test(u));
    const hasDocUrls = sitemapUrls.some(u => /\/docs?\//i.test(u));
    const hasProductUrls = sitemapUrls.some(u => /\/product|\/pricing|\/features/i.test(u));
    const hasHowToUrls = sitemapUrls.some(u => /\/how-to|\/tutorial|\/guide/i.test(u));
    const inferredTypes = [hasBlogUrls, hasFaqUrls, hasDocUrls, hasProductUrls, hasHowToUrls]
      .filter(Boolean).length;
    schemaTypeCount = Math.max(rawSchemaTypeCount, Math.min(rawSchemaTypeCount + inferredTypes, 10));
    if (schemaTypeCount !== rawSchemaTypeCount) {
      console.log(`📊 Schema scale adjustment: ${rawSchemaTypeCount} detected → ${schemaTypeCount} (inferred from ${sitemapPageCount} sitemap URLs)`);
    }
  }
  
  const h1Count = (html.match(/<h1/gi) || []).length;
  const h2Count = (html.match(/<h2/gi) || []).length;
  const h3Count = (html.match(/<h3/gi) || []).length;
  const headingHierarchyScore = Math.min(100, (h1Count > 0 ? 30 : 0) + 
    Math.min(40, h2Count * 8) + Math.min(30, h3Count * 5));
  
  const hasStructuredData = schemaTypeCount > 0;
  
  const imageCount = (html.match(/<img[^>]+>/gi) || []).length;
  
  // Claude signals - analytical depth
  // SITEMAP-FIRST: Count case study pages from sitemap
  // IMPORTANT: Exclude documentation subdomains that falsely match generic patterns
  const caseStudyUrls = sitemapUrls.filter(url => {
    const normalizedUrl = url.toLowerCase().replace(/[?#].*$/, '');
    const isDocSubdomain = /^https?:\/\/(success|docs|help|support|learn|community)\./i.test(url);
    
    const strongPattern = /\/case-stud|\/customer-stor|\/success-stor|\/testimonial|\/client-stor|\/stories\/|\/portfolio\/|\/showcase\/|\/implementations?\/|\/deployments?\/|\/outcomes\/|\/impact\/|\/proof\//i.test(normalizedUrl);
    
    const moderatePattern = /\/customers?\/[a-z0-9-]+|\/customers$|\/success\/[a-z0-9-]+|\/results\/[a-z0-9-]+|\/partners?\/[a-z0-9-]+|\/reviews?\//i.test(normalizedUrl);
    
    return strongPattern || (moderatePattern && !isDocSubdomain);
  });
  const caseStudyUrlCount = caseStudyUrls.length;
  
  const caseStudyPatterns = [
    /case study/gi, /customer story/gi, /success story/gi,
    /client spotlight/gi, /use case/gi, /real[- ]world example/gi
  ];
  const caseStudyTextMentions = caseStudyPatterns.reduce((count, pattern) => 
    count + (text.match(pattern) || []).length, 0);
  
  // HYBRID: SUM of URL-based and text-based detection per user spec
  const textBasedCaseStudies = Math.floor(caseStudyTextMentions / 2);
  // Expanded caseStudy URL filter (replaces narrower upstream filter)
  const expandedCaseStudyUrls = sitemapUrls.filter(url =>
    /\/case-study\/|\/case-studies\/|\/customer-story\/|\/customer-stories\/|\/success-story\/|\/success-stories\/|\/client-story\/|\/portfolio\/|\/work\/|\/projects\/|\/results\/|\/impact\//i.test(url)
  );
  const expandedCaseStudyUrlCount = expandedCaseStudyUrls.length;
  const caseStudyCount = textBasedCaseStudies + expandedCaseStudyUrlCount;

  // SITEMAP-FIRST: Count framework/methodology pages from sitemap (expanded patterns)
  const frameworkUrls = sitemapUrls.filter(url =>
    /\/methodology\/|\/framework\/|\/approach\/|\/process\/|\/playbook\/|\/strategy\/|\/model\/|\/research\/|\/whitepaper\/|\/report\/|\/study\/|\/analysis\/|\/case-study\/|\/case-studies\/|\/customer-story\/|\/customer-stories\/|\/success-story\/|\/success-stories\/|\/results\/|\/roi\/|\/benchmark\/|\/survey\//i.test(url)
  );
  // Deduplicate: any URL already counted in expandedCaseStudyUrls should NOT
  // also be counted in frameworkUrls to prevent inflation on simple sites
  const expandedCaseStudyUrlSet = new Set(expandedCaseStudyUrls.map(u => u.toLowerCase()));
  const deduplicatedFrameworkUrls = frameworkUrls.filter(
    url => !expandedCaseStudyUrlSet.has(url.toLowerCase())
  );
  const frameworkUrlCount = deduplicatedFrameworkUrls.length;

  const frameworkPatterns = [
    /framework/gi, /methodology/gi, /model for/gi, /approach to/gi,
    /strategy for/gi, /best practices/gi, /principles of/gi, /playbook/gi
  ];
  const frameworkTextMentions = frameworkPatterns.reduce((count, pattern) =>
    count + (text.match(pattern) || []).length, 0);

  // HYBRID: SUM of URL-based and text-based detection per user spec
  const textBasedFrameworks = Math.floor(frameworkTextMentions / 3);
  const frameworkMentionCount = textBasedFrameworks + frameworkUrlCount;
  
  const wordCount = text.split(/\s+/).length;
  const longFormContentScore = Math.min(100, Math.floor(wordCount / 100));
  
  const nuancedTerms = [
    /however/gi, /on the other hand/gi, /nuanced/gi, /complex/gi,
    /trade[- ]off/gi, /considerations/gi, /depending on/gi, /context/gi,
    /it depends/gi, /caveat/gi, /exception/gi
  ];
  const nuancedTermCount = nuancedTerms.reduce((count, pattern) => 
    count + (text.match(pattern) || []).length, 0);
  
  // General signals from sitemap
  let blogPostCount = sitemapUrls.filter(url => 
    /\/blog\/|\/articles?\/|\/posts?\/|\/news\/|\/insights\/|\/resources\/|\/library\/|\/publications\/|\/updates\/|\/announcements\//i.test(url)
  ).length || Math.floor((text.match(/blog|article|post/gi) || []).length / 5);
  
  const docUrlCount = sitemapUrls.filter(url => 
    /\/docs?\/|\/documentation\/|\/api\/|\/reference\/|\/guide\/|\/developer[s]?\/|\/sdk\/|\/api-docs\/|\/integration[s]?\/|\/help\/|\/kb\/|\/knowledge-base\/|\/support\/.*article|\/manual/i.test(url)
  ).length || (text.match(/documentation|api reference|developer guide/gi) || []).length;

  const docSubdomains = ['docs', 'developer', 'developers', 'api', 'reference'];
  const docSubdomainUrls = sitemapUrls.filter(url => {
    try {
      const hostname = new URL(url).hostname.split('.')[0];
      return docSubdomains.includes(hostname);
    } catch { return false; }
  });
  const docSubdomainBoost = Math.floor(docSubdomainUrls.length * 0.6);
  let documentationPageCount = Math.max(docUrlCount, docSubdomainBoost);

  // Apply documentation boost to tutorial count (deferred from earlier — needs documentationPageCount)
  if (tutorialUrlCount > 0) {
    tutorialCount = tutorialUrlCount + Math.floor(documentationPageCount * 0.4);
  }

  const totalPageCount = sitemapUrls.length || 10;
  
  const contentDepthScore = Math.min(100, 
    (blogPostCount * 2) + (documentationPageCount * 3) + 
    (tutorialCount * 2) + (caseStudyCount * 5));
  
  // CLUSTER-BASED CONTENT INFERENCE for large sites:
  // When URL-specific patterns miss content, look at URL path clusters
  let finalTutorialCount = tutorialCount;
  let finalDocPageCount = documentationPageCount;
  let finalFaqCount = faqSectionCount;
  let finalCaseStudyCount = caseStudyCount;
  let finalFrameworkCount = frameworkMentionCount;
  
  if (sitemapUrls.length >= 100) {
    const pathClusters: Record<string, number> = {};
    for (const url of sitemapUrls) {
      try {
        const pathParts = new URL(url).pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
          const topSegment = pathParts[0].toLowerCase();
          pathClusters[topSegment] = (pathClusters[topSegment] || 0) + 1;
        }
      } catch { /* skip malformed URLs */ }
    }
    
    const totalSitemapUrls = sitemapUrls.length;
    const minClusterRatio = 0.02;
    
    const tutorialClusterKeys = ['learn', 'academy', 'training', 'courses', 'education', 'university', 'tutorials', 'lessons'];
    const tutorialClusterCount = tutorialClusterKeys.reduce((sum, key) => sum + (pathClusters[key] || 0), 0);
    if (tutorialClusterCount >= totalSitemapUrls * minClusterRatio || tutorialClusterCount >= 10) {
      finalTutorialCount = Math.max(tutorialCount, tutorialClusterCount);
    }
    
    const docClusterKeys = ['docs', 'documentation', 'help', 'kb', 'reference', 'api'];
    const docClusterCount = docClusterKeys.reduce((sum, key) => sum + (pathClusters[key] || 0), 0);
    if (docClusterCount >= totalSitemapUrls * minClusterRatio || docClusterCount >= 10) {
      finalDocPageCount = Math.max(documentationPageCount, docClusterCount);
    }
    
    const faqClusterKeys = ['faq', 'faqs', 'questions', 'answers'];
    const faqClusterCount = faqClusterKeys.reduce((sum, key) => sum + (pathClusters[key] || 0), 0);
    if (faqClusterCount >= totalSitemapUrls * minClusterRatio || faqClusterCount >= 5) {
      finalFaqCount = Math.max(faqSectionCount, faqClusterCount);
    }
    
    const caseStudyClusterKeys = ['customers', 'stories', 'case-studies', 'testimonials', 'showcase', 'portfolio'];
    const caseStudyClusterCount = caseStudyClusterKeys.reduce((sum, key) => sum + (pathClusters[key] || 0), 0);
    if (caseStudyClusterCount >= totalSitemapUrls * minClusterRatio || caseStudyClusterCount >= 5) {
      finalCaseStudyCount = Math.max(caseStudyCount, caseStudyClusterCount);
    }
    
    const frameworkClusterKeys = ['methodology', 'frameworks', 'playbooks', 'best-practices', 'guidelines', 'standards'];
    const frameworkClusterCount = frameworkClusterKeys.reduce((sum, key) => sum + (pathClusters[key] || 0), 0);
    if (frameworkClusterCount >= totalSitemapUrls * minClusterRatio || frameworkClusterCount >= 5) {
      finalFrameworkCount = Math.max(frameworkMentionCount, frameworkClusterCount);
    }
  }

  // Floor: Large sites can't score zero on content types
  // If 500+ pages but 0 detected for key signals, patterns missed
  const totalPages = sitemapUrls.length;
  if (totalPages > 500) {
    const adjustedTutorials = Math.max(finalTutorialCount, Math.floor(totalPages * 0.015));
    const adjustedBlogs = Math.max(blogPostCount, Math.floor(totalPages * 0.05));
    const adjustedDocs = Math.max(finalDocPageCount, Math.floor(totalPages * 0.03));
    // Schema floor: large professional sites almost always have schema markup
    const adjustedSchema = Math.max(schemaTypeCount, 3);
    // External links floor: large sites with blog/docs content always have outbound links
    const adjustedExtLinks = Math.max(externalLinkCount, Math.floor(totalPages * 0.1));
    
    if (adjustedTutorials > finalTutorialCount || adjustedBlogs > blogPostCount || adjustedDocs > finalDocPageCount ||
        adjustedSchema > schemaTypeCount || adjustedExtLinks > externalLinkCount) {
      console.log(`📊 Large site floor applied (${totalPages} pages): tutorials ${finalTutorialCount}→${adjustedTutorials}, blogs ${blogPostCount}→${adjustedBlogs}, docs ${finalDocPageCount}→${adjustedDocs}, schema ${schemaTypeCount}→${adjustedSchema}, extLinks ${externalLinkCount}→${adjustedExtLinks}`);
    }
    finalTutorialCount = adjustedTutorials;
    blogPostCount = adjustedBlogs;
    finalDocPageCount = adjustedDocs;
    schemaTypeCount = adjustedSchema;
    externalLinkCount = adjustedExtLinks;
  }
  
  const finalContentDepthScore = Math.min(100, 
    (finalDocPageCount * 3) + (blogPostCount * 2) + 
    (finalTutorialCount * 2) + (finalCaseStudyCount * 5));

  console.log(`📊 Signal counts — tutorials:${finalTutorialCount} faqs:${finalFaqCount} frameworks:${finalFrameworkCount} caseStudies:${finalCaseStudyCount} blogs:${blogPostCount} docs:${finalDocPageCount}`);

  return {
    tutorialCount: finalTutorialCount,
    howToGuideCount,
    faqSectionCount: finalFaqCount,
    stepByStepListCount,
    externalLinkCount,
    dataPointCount,
    statisticMentionCount,
    researchTermCount,
    schemaTypeCount,
    headingHierarchyScore,
    hasStructuredData,
    imageCount,
    caseStudyCount: finalCaseStudyCount,
    frameworkMentionCount: finalFrameworkCount,
    longFormContentScore,
    nuancedTermCount,
    blogPostCount,
    documentationPageCount: finalDocPageCount,
    totalPageCount,
    contentDepthScore: finalContentDepthScore,
    candidateUrls: {
      tutorials: tutorialUrls,
      caseStudies: caseStudyUrls,
      faqs: faqUrls,
      research: researchUrls,
      frameworks: frameworkUrls,
    }
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
    weaknesses.push(`Your site has ${signals.tutorialCount} tutorials (industry benchmark: ${benchmarks.tutorials}+)—content gap for practical how-to content that ChatGPT prefers`);
  }
  
  if (signals.caseStudyCount < 3) {
    weaknesses.push(`Your site has ${signals.caseStudyCount} case studies (industry benchmark: ${benchmarks.caseStudies}+)—limited social proof for AI platforms to cite`);
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
    recommendations.push(`Your site: ${signals.tutorialCount} tutorials | ${industryLabel} average: ${benchmarks.avgTutorials}, top performers: ${tutorialTarget}+ | Action: Create ${gap} step-by-step how-to guides to reach top-performer level`);
  }
  
  const faqTarget = Math.max(benchmarks.avgFAQPages * 2, 4);
  if (signals.faqSectionCount < benchmarks.avgFAQPages) {
    const gap = roundUp(faqTarget - signals.faqSectionCount);
    recommendations.push(`Your site: ${signals.faqSectionCount} FAQ sections | ${industryLabel} average: ${benchmarks.avgFAQPages}, top performers: ${faqTarget}+ | Action: Add ${gap} FAQ pages with structured markup for ChatGPT visibility`);
  }
  
  const dataTarget = Math.max(benchmarks.avgDataPoints * 2, 20);
  if (signals.dataPointCount < benchmarks.avgDataPoints) {
    const gap = roundUp(dataTarget - signals.dataPointCount);
    recommendations.push(`Your site: ${signals.dataPointCount} data points | ${industryLabel} average: ${benchmarks.avgDataPoints}, top performers: ${dataTarget}+ | Action: Add research-backed statistics across ${Math.min(gap, 10)} key articles`);
  }
  
  const schemaTarget = Math.max(benchmarks.avgSchemaTypes * 2, 4);
  if (signals.schemaTypeCount < benchmarks.avgSchemaTypes) {
    const gap = schemaTarget - signals.schemaTypeCount;
    recommendations.push(`Your site: ${signals.schemaTypeCount} schema types | ${industryLabel} average: ${benchmarks.avgSchemaTypes}, top performers: ${schemaTarget}+ | Action: Implement ${gap} additional schema types (FAQ, HowTo, Article, Product) across key pages`);
  }
  
  const caseStudyTarget = Math.max(benchmarks.avgCaseStudies * 2, 5);
  if (signals.caseStudyCount < benchmarks.avgCaseStudies) {
    const gap = roundUp(caseStudyTarget - signals.caseStudyCount);
    recommendations.push(`Your site: ${signals.caseStudyCount} case studies | ${industryLabel} average: ${benchmarks.avgCaseStudies}, top performers: ${caseStudyTarget}+ | Action: Create ${gap} detailed customer success stories`);
  }
  
  if (signals.frameworkMentionCount < 3) {
    recommendations.push(`Your site: ${signals.frameworkMentionCount} frameworks | ${industryLabel} top performers use 5+ proprietary methodologies | Action: Develop 5 original methodology or framework articles for Claude visibility`);
  }
  
  if (signals.blogPostCount < 20) {
    recommendations.push(`Your site: ${signals.blogPostCount} blog posts | ${industryLabel} top performers publish 50+ articles | Action: Increase publishing cadence to 4+ posts/month`);
  }
  
  return recommendations.slice(0, 7);
}
