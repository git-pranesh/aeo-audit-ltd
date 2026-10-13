/**
 * World-Class AI Citation Scoring Service
 * 
 * Zero-based, earned-points model with competitor benchmarking.
 * Sites must EARN their score through actual content signals.
 * 
 * Score Distribution:
 * - 0-20: Critical - almost no AI visibility signals
 * - 20-40: Poor - major content gaps, unlikely to be cited
 * - 40-60: Average - some signals present but significant work needed
 * - 60-80: Good - solid foundation, competitive in many queries
 * - 80-100: Excellent - comprehensive coverage, high citation potential
 */

import { ContentSignals } from './content-signal-service';

export interface PlatformScores {
  chatgpt: number;
  perplexity: number;
  gemini: number;
  claude: number;
}

export interface ScoreBreakdown {
  contentDepth: number;      // 0-35 points
  structureTechnical: number; // 0-25 points
  researchCitations: number;  // 0-25 points
  authority: number;          // 0-15 points
  total: number;              // 0-100 points
}

export interface ScoringResult {
  overallScore: number;
  letterGrade: string;
  platformScores: PlatformScores;
  breakdown: ScoreBreakdown;
  signals: ContentSignals;
}

// Industry-aware benchmarks. Base values are SaaS-level top-performer numbers;
// per-industry overrides relax expectations for non-tech verticals.
import { BASE_BENCHMARKS, getBenchmarks } from './benchmarks';
export { getBenchmarks };


/**
 * Calculate score as percentage of benchmark (0-100%)
 * Capped at 100% - you can't score higher than benchmark
 */
function percentOfBenchmark(actual: number, benchmark: number): number {
  if (benchmark === 0) return 0;
  return Math.min(100, (actual / benchmark) * 100);
}

/**
 * Apply penalty curve for weak signals
 * Returns a multiplier 0-1 that gets harsher below benchmark thresholds
 */
function getPenaltyMultiplier(percentOfBenchmark: number): number {
  if (percentOfBenchmark >= 60) {
    // Normal scoring: 60-100% of benchmark = full credit
    return 1.0;
  } else if (percentOfBenchmark >= 30) {
    // Moderate penalty: 30-60% of benchmark = 70% credit
    return 0.7;
  } else if (percentOfBenchmark >= 10) {
    // Harsh penalty: 10-30% of benchmark = 40% credit
    return 0.4;
  } else {
    // Very harsh: <10% of benchmark = 15% credit
    return 0.15;
  }
}

/**
 * Calculate Content Depth score (0-35 points max)
 * Measures practical how-to content, tutorials, case studies
 */
function calculateContentDepth(signals: ContentSignals, benchmarks: typeof BASE_BENCHMARKS): number {
  // Weights within this category (sum to 35)
  const WEIGHTS = {
    tutorials: 10,      // max 10 points
    howToGuides: 8,     // max 8 points
    faqs: 7,            // max 7 points
    caseStudies: 6,     // max 6 points
    blogPosts: 4        // max 4 points
  };
  
  // Calculate each sub-score
  const tutorialPct = percentOfBenchmark(signals.tutorialCount, benchmarks.tutorials);
  const tutorialMult = getPenaltyMultiplier(tutorialPct);
  const tutorialScore = (tutorialPct / 100) * WEIGHTS.tutorials * tutorialMult;
  
  const howToPct = percentOfBenchmark(signals.howToGuideCount, benchmarks.howToGuides);
  const howToMult = getPenaltyMultiplier(howToPct);
  const howToScore = (howToPct / 100) * WEIGHTS.howToGuides * howToMult;
  
  const faqPct = percentOfBenchmark(signals.faqSectionCount, benchmarks.faqSections);
  const faqMult = getPenaltyMultiplier(faqPct);
  const faqScore = (faqPct / 100) * WEIGHTS.faqs * faqMult;
  
  const casePct = percentOfBenchmark(signals.caseStudyCount, benchmarks.caseStudies);
  const caseMult = getPenaltyMultiplier(casePct);
  const caseScore = (casePct / 100) * WEIGHTS.caseStudies * caseMult;
  
  const blogPct = percentOfBenchmark(signals.blogPostCount, benchmarks.blogPosts);
  const blogMult = getPenaltyMultiplier(blogPct);
  const blogScore = (blogPct / 100) * WEIGHTS.blogPosts * blogMult;
  
  const total = tutorialScore + howToScore + faqScore + caseScore + blogScore;
  return Math.min(35, total);
}

/**
 * Calculate Structure & Technical score (0-25 points max)
 * Measures schema markup, heading hierarchy, content organization
 */
function calculateStructureTechnical(signals: ContentSignals, benchmarks: typeof BASE_BENCHMARKS): number {
  // Weights within this category (sum to 25)
  const WEIGHTS = {
    schema: 10,         // max 10 points
    headings: 8,        // max 8 points
    stepLists: 4,       // max 4 points
    images: 3           // max 3 points
  };
  
  const schemaPct = percentOfBenchmark(signals.schemaTypeCount, benchmarks.schemaTypes);
  const schemaMult = getPenaltyMultiplier(schemaPct);
  const schemaScore = (schemaPct / 100) * WEIGHTS.schema * schemaMult;
  
  const headingPct = percentOfBenchmark(signals.headingHierarchyScore, benchmarks.headingScore);
  const headingMult = getPenaltyMultiplier(headingPct);
  const headingScore = (headingPct / 100) * WEIGHTS.headings * headingMult;
  
  const stepPct = percentOfBenchmark(signals.stepByStepListCount, benchmarks.stepByStepLists);
  const stepMult = getPenaltyMultiplier(stepPct);
  const stepScore = (stepPct / 100) * WEIGHTS.stepLists * stepMult;
  
  const imagePct = percentOfBenchmark(signals.imageCount, benchmarks.images);
  const imageMult = getPenaltyMultiplier(imagePct);
  const imageScore = (imagePct / 100) * WEIGHTS.images * imageMult;
  
  const total = schemaScore + headingScore + stepScore + imageScore;
  return Math.min(25, total);
}

/**
 * Calculate Research & Citations score (0-25 points max)
 * Measures data points, statistics, external links, research depth
 */
function calculateResearchCitations(signals: ContentSignals, benchmarks: typeof BASE_BENCHMARKS): number {
  // Weights within this category (sum to 25)
  const WEIGHTS = {
    dataPoints: 10,     // max 10 points
    statistics: 7,      // max 7 points
    externalLinks: 5,   // max 5 points
    researchTerms: 3    // max 3 points
  };
  
  const dataPct = percentOfBenchmark(signals.dataPointCount, benchmarks.dataPoints);
  const dataMult = getPenaltyMultiplier(dataPct);
  const dataScore = (dataPct / 100) * WEIGHTS.dataPoints * dataMult;
  
  const statPct = percentOfBenchmark(signals.statisticMentionCount, benchmarks.statistics);
  const statMult = getPenaltyMultiplier(statPct);
  const statScore = (statPct / 100) * WEIGHTS.statistics * statMult;
  
  const linkPct = percentOfBenchmark(signals.externalLinkCount, benchmarks.externalLinks);
  const linkMult = getPenaltyMultiplier(linkPct);
  const linkScore = (linkPct / 100) * WEIGHTS.externalLinks * linkMult;
  
  const researchPct = percentOfBenchmark(signals.researchTermCount, benchmarks.researchTerms);
  const researchMult = getPenaltyMultiplier(researchPct);
  const researchScore = (researchPct / 100) * WEIGHTS.researchTerms * researchMult;
  
  const total = dataScore + statScore + linkScore + researchScore;
  return Math.min(25, total);
}

/**
 * Calculate Authority score (0-15 points max)
 * Measures frameworks, long-form content, analytical depth
 */
function calculateAuthority(signals: ContentSignals, benchmarks: typeof BASE_BENCHMARKS): number {
  // Weights within this category (sum to 15)
  const WEIGHTS = {
    frameworks: 6,      // max 6 points
    longForm: 5,        // max 5 points
    nuanced: 4          // max 4 points
  };
  
  const frameworkPct = percentOfBenchmark(signals.frameworkMentionCount, benchmarks.frameworkMentions);
  const frameworkMult = getPenaltyMultiplier(frameworkPct);
  const frameworkScore = (frameworkPct / 100) * WEIGHTS.frameworks * frameworkMult;
  
  const longPct = percentOfBenchmark(signals.longFormContentScore, benchmarks.longFormScore);
  const longMult = getPenaltyMultiplier(longPct);
  const longScore = (longPct / 100) * WEIGHTS.longForm * longMult;
  
  const nuancePct = percentOfBenchmark(signals.nuancedTermCount, benchmarks.nuancedTerms);
  const nuanceMult = getPenaltyMultiplier(nuancePct);
  const nuanceScore = (nuancePct / 100) * WEIGHTS.nuanced * nuanceMult;
  
  const total = frameworkScore + longScore + nuanceScore;
  return Math.min(15, total);
}

// Platform-specific weight adjustments
// Each platform weighs the 4 categories differently
// Weights must sum to 1.0
const PLATFORM_WEIGHTS = {
  chatgpt: {
    contentDepth: 0.45,      // Heavy on tutorials, FAQs, how-to
    structureTechnical: 0.25,
    researchCitations: 0.15,
    authority: 0.15
  },
  perplexity: {
    contentDepth: 0.15,
    structureTechnical: 0.20,
    researchCitations: 0.45, // Heavy on data, citations, research
    authority: 0.20
  },
  gemini: {
    contentDepth: 0.25,
    structureTechnical: 0.40, // Heavy on schema, structure
    researchCitations: 0.20,
    authority: 0.15
  },
  claude: {
    contentDepth: 0.20,
    structureTechnical: 0.15,
    researchCitations: 0.25,
    authority: 0.40          // Heavy on frameworks, nuance, long-form
  }
};

/**
 * Calculate platform-specific score using weighted categories
 * Category scores are first normalized to 0-100 scale, then weighted
 */
function calculatePlatformScore(
  contentDepth: number,
  structureTechnical: number,
  researchCitations: number,
  authority: number,
  platform: 'chatgpt' | 'perplexity' | 'gemini' | 'claude'
): number {
  const weights = PLATFORM_WEIGHTS[platform];
  
  // Normalize category scores to 0-100 scale
  // contentDepth: 0-35 → 0-100
  // structureTechnical: 0-25 → 0-100
  // researchCitations: 0-25 → 0-100
  // authority: 0-15 → 0-100
  const normalizedContent = (contentDepth / 35) * 100;
  const normalizedStructure = (structureTechnical / 25) * 100;
  const normalizedResearch = (researchCitations / 25) * 100;
  const normalizedAuthority = (authority / 15) * 100;
  
  const weightedScore = 
    normalizedContent * weights.contentDepth +
    normalizedStructure * weights.structureTechnical +
    normalizedResearch * weights.researchCitations +
    normalizedAuthority * weights.authority;
  
  return weightedScore;
}

/**
 * Apply small tie-breakers to ensure distinct scores.
 * Uses a symmetric search (±1, ±2, ...) so low-scoring platforms that
 * are all tied near 0 can spread upward instead of collapsing together.
 * Max offset applied: ±3 points.
 */
function ensureDistinctScores(scores: PlatformScores): PlatformScores {
  const platforms: ('chatgpt' | 'perplexity' | 'gemini' | 'claude')[] =
    ['chatgpt', 'perplexity', 'gemini', 'claude'];

  // Process highest-scoring platform first so it keeps the "true" value
  const sorted = platforms
    .map(p => ({ platform: p, score: scores[p] }))
    .sort((a, b) => b.score - a.score);

  const result: PlatformScores = { chatgpt: 0, perplexity: 0, gemini: 0, claude: 0 };
  const usedScores = new Set<number>();

  for (const item of sorted) {
    const base = Math.round(item.score);
    let finalScore = base;

    // Symmetric search: 0, -1, +1, -2, +2, -3, +3
    if (usedScores.has(finalScore)) {
      let found = false;
      for (let step = 1; step <= 3; step++) {
        for (const delta of [-step, +step]) {
          const candidate = Math.max(0, Math.min(100, base + delta));
          if (!usedScores.has(candidate)) {
            finalScore = candidate;
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    usedScores.add(finalScore);
    result[item.platform] = finalScore;
  }

  return result;
}

/**
 * Calculate letter grade from overall score
 * Stricter grading aligned with professional SEO tools
 */
function calculateLetterGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'B-';
  if (score >= 60) return 'C+';
  if (score >= 55) return 'C';
  if (score >= 50) return 'C-';
  if (score >= 45) return 'D+';
  if (score >= 40) return 'D';
  if (score >= 35) return 'D-';
  return 'F';
}

/**
 * Main scoring function - zero-based, earned-points model
 */
export function calculatePlatformScoresV2(signals: ContentSignals, sitemapSize: number = 0, subdomainCount: number = 0, industry: string = '', totalPageCount: number = 0): ScoringResult {
  // Resolve industry-aware benchmarks (passed explicitly into helpers — concurrency-safe).
  const COMPETITOR_BENCHMARKS = getBenchmarks(industry, totalPageCount || signals.totalPageCount || 0);
  // Calculate category scores (earned from 0)
  const contentDepth = calculateContentDepth(signals, COMPETITOR_BENCHMARKS);
  const structureTechnical = calculateStructureTechnical(signals, COMPETITOR_BENCHMARKS);
  const researchCitations = calculateResearchCitations(signals, COMPETITOR_BENCHMARKS);
  const authority = calculateAuthority(signals, COMPETITOR_BENCHMARKS);
  
  // Total base score (sum of categories, max 100)
  const totalBase = contentDepth + structureTechnical + researchCitations + authority;
  
  // SCALE-AWARE CONFIDENCE FLOOR:
  // When a site has a large sitemap but detected signals are near-zero,
  // the scoring system failed to detect content, not the site failed to have content.
  // Apply a minimum score floor based on site scale.
  let adjustedTotalBase = totalBase;
  
  if (sitemapSize >= 500 && totalBase < 50) {
    const scaleFloor = sitemapSize >= 5000 ? 55 : sitemapSize >= 1000 ? 50 : 45;
    if (totalBase < scaleFloor) {
      adjustedTotalBase = scaleFloor;
    } else {
      const taperTarget = Math.min(scaleFloor + 10, 60);
      const taperAmount = (taperTarget - totalBase) * 0.5;
      if (taperAmount > 0) {
        adjustedTotalBase = totalBase + taperAmount;
      }
    }
    console.log(`📊 Scale-aware floor applied: ${totalBase.toFixed(1)} → ${adjustedTotalBase.toFixed(1)} (sitemap: ${sitemapSize} URLs, ${subdomainCount} subdomains)`);
  } else if (sitemapSize >= 100 && totalBase < 25) {
    adjustedTotalBase = Math.max(totalBase, 30);
    console.log(`📊 Medium scale floor applied: ${totalBase.toFixed(1)} → ${adjustedTotalBase.toFixed(1)} (sitemap: ${sitemapSize} URLs)`);
  }
  
  if (subdomainCount >= 3 && adjustedTotalBase < 40) {
    adjustedTotalBase = Math.max(adjustedTotalBase, 45);
    console.log(`📊 Subdomain authority floor applied: → ${adjustedTotalBase} (${subdomainCount} subdomains)`);
  }
  
  // Calculate platform-specific scores (each platform weights categories differently)
  const rawPlatformScores: PlatformScores = {
    chatgpt: calculatePlatformScore(contentDepth, structureTechnical, researchCitations, authority, 'chatgpt'),
    perplexity: calculatePlatformScore(contentDepth, structureTechnical, researchCitations, authority, 'perplexity'),
    gemini: calculatePlatformScore(contentDepth, structureTechnical, researchCitations, authority, 'gemini'),
    claude: calculatePlatformScore(contentDepth, structureTechnical, researchCitations, authority, 'claude')
  };
  
  // Apply small tie-breakers to ensure distinct scores
  const platformScores = ensureDistinctScores(rawPlatformScores);
  
  // Apply scale-aware minimum to platform scores too
  if (adjustedTotalBase > totalBase) {
    const platformFloor = adjustedTotalBase * 0.85;
    const platforms: ('chatgpt' | 'perplexity' | 'gemini' | 'claude')[] = ['chatgpt', 'perplexity', 'gemini', 'claude'];
    for (const platform of platforms) {
      if (platformScores[platform] < platformFloor) {
        platformScores[platform] = Math.round(platformFloor);
      }
    }
    const flooredScores = ensureDistinctScores(platformScores);
    platformScores.chatgpt = flooredScores.chatgpt;
    platformScores.perplexity = flooredScores.perplexity;
    platformScores.gemini = flooredScores.gemini;
    platformScores.claude = flooredScores.claude;
  }
  
  // Overall score is the adjusted total base score
  const overallScore = Math.round(adjustedTotalBase);
  
  const letterGrade = calculateLetterGrade(overallScore);
  
  console.log('📊 Zero-Based Scoring Breakdown:', {
    contentDepth: `${contentDepth.toFixed(1)}/35`,
    structureTechnical: `${structureTechnical.toFixed(1)}/25`,
    researchCitations: `${researchCitations.toFixed(1)}/25`,
    authority: `${authority.toFixed(1)}/15`,
    totalBase: `${totalBase.toFixed(1)}/100`,
    rawPlatformScores: {
      chatgpt: rawPlatformScores.chatgpt.toFixed(1),
      perplexity: rawPlatformScores.perplexity.toFixed(1),
      gemini: rawPlatformScores.gemini.toFixed(1),
      claude: rawPlatformScores.claude.toFixed(1)
    },
    finalPlatformScores: platformScores,
    overallScore,
    letterGrade
  });
  
  return {
    overallScore,
    letterGrade,
    platformScores,
    breakdown: {
      contentDepth: Math.round(contentDepth),
      structureTechnical: Math.round(structureTechnical),
      researchCitations: Math.round(researchCitations),
      authority: Math.round(authority),
      total: Math.round(adjustedTotalBase)
    },
    signals
  };
}
