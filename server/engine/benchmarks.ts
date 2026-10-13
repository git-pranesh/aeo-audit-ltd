/**
 * Industry-Aware Benchmark Definitions
 *
 * BASE_BENCHMARKS = SaaS-level top-performer targets.
 * getBenchmarks() returns relaxed values for non-tech verticals and
 * scales targets down for small sites (< 50 pages) so new/thin sites
 * are not permanently crushed against enterprise baselines.
 */

import { detectIndustryKey } from './industry';

export interface Benchmarks {
  // Content Depth
  tutorials: number;
  howToGuides: number;
  faqSections: number;
  caseStudies: number;
  blogPosts: number;
  // Structure & Technical
  schemaTypes: number;
  headingScore: number;
  stepByStepLists: number;
  images: number;
  // Research & Citations
  dataPoints: number;
  statistics: number;
  externalLinks: number;
  researchTerms: number;
  // Authority
  frameworkMentions: number;
  longFormScore: number;
  nuancedTerms: number;
}

/** Default top-performer targets (SaaS / tech). */
export const BASE_BENCHMARKS: Benchmarks = {
  tutorials: 15,
  howToGuides: 10,
  faqSections: 5,
  caseStudies: 8,
  blogPosts: 50,
  schemaTypes: 5,
  headingScore: 80,
  stepByStepLists: 20,
  images: 30,
  dataPoints: 30,
  statistics: 15,
  externalLinks: 50,
  researchTerms: 10,
  frameworkMentions: 8,
  longFormScore: 60,
  nuancedTerms: 15,
};

/** Used when the industry can't be classified. */
const GENERAL_MULTIPLIERS: Partial<Record<keyof Benchmarks, number>> = {
  tutorials: 0.4,
  howToGuides: 0.5,
  caseStudies: 0.5,
  blogPosts: 0.5,
  dataPoints: 0.6,
  externalLinks: 0.6,
  frameworkMentions: 0.4,
};

/**
 * Per-industry override multipliers (applied to BASE_BENCHMARKS).
 * Values < 1.0 = lower bar for that industry, values > 1.0 = higher bar.
 */
const INDUSTRY_MULTIPLIERS: Record<string, Partial<Record<keyof Benchmarks, number>>> = {
  legal: {
    tutorials: 0.2,      // law firms rarely publish tutorials
    howToGuides: 0.3,
    caseStudies: 0.6,    // matter-write-ups count but are rare
    blogPosts: 0.5,
    schemaTypes: 0.6,
    dataPoints: 0.5,
    frameworkMentions: 0.5,
  },
  marketing: {
    tutorials: 0.7,
    caseStudies: 0.8,
    blogPosts: 0.8,
    dataPoints: 1.1,     // marketing teams love stats
  },
  healthcare: {
    tutorials: 0.2,
    caseStudies: 0.5,
    faqSections: 1.2,    // patient FAQs are common
    dataPoints: 0.8,
    frameworkMentions: 0.4,
  },
  realestate: {
    tutorials: 0.1,
    caseStudies: 0.2,
    howToGuides: 0.4,
    blogPosts: 0.4,
    schemaTypes: 0.4,
    dataPoints: 0.5,
    frameworkMentions: 0.2,
    externalLinks: 0.5,
  },
  // Restaurants, trades, salons, gyms, hotels: no tutorials/case studies/research expected.
  local: {
    tutorials: 0.1,
    howToGuides: 0.2,
    caseStudies: 0.1,
    blogPosts: 0.2,
    schemaTypes: 0.6,
    stepByStepLists: 0.2,
    dataPoints: 0.3,
    statistics: 0.3,
    externalLinks: 0.3,
    researchTerms: 0.3,
    frameworkMentions: 0.1,
    nuancedTerms: 0.5,
  },
  ecommerce: {
    tutorials: 0.2,
    caseStudies: 0.2,
    howToGuides: 0.5,
    schemaTypes: 0.8,    // product schema is common
    dataPoints: 0.6,
    frameworkMentions: 0.2,
    blogPosts: 0.4,
  },
};

/**
 * Returns benchmarks tuned for the given industry and site size.
 *
 * @param industry   Detected industry string (can be empty).
 * @param totalPages Total sitemap URL count (0 = unknown).
 */
export function getBenchmarks(industry: string = '', totalPages: number = 0): Benchmarks {
  const key = detectIndustryKey(industry);
  // Unknown industries get a moderate profile, not the strict SaaS one.
  const multipliers = key ? INDUSTRY_MULTIPLIERS[key] ?? {} : GENERAL_MULTIPLIERS;

  // Apply multipliers to BASE_BENCHMARKS
  const adjusted: Benchmarks = { ...BASE_BENCHMARKS };
  for (const [prop, mult] of Object.entries(multipliers)) {
    const k = prop as keyof Benchmarks;
    adjusted[k] = Math.max(1, Math.round(BASE_BENCHMARKS[k] * (mult as number)));
  }

  // Small-site scaling: sites with < 50 pages shouldn't be judged against
  // enterprise content volumes. Scale down proportionally, floor at 1.
  if (totalPages > 0 && totalPages < 50) {
    const scale = Math.max(0.15, totalPages / 50);
    const scaleKeys: (keyof Benchmarks)[] = [
      'tutorials', 'howToGuides', 'faqSections', 'caseStudies', 'blogPosts',
      'dataPoints', 'statistics', 'externalLinks', 'frameworkMentions',
    ];
    for (const k of scaleKeys) {
      adjusted[k] = Math.max(1, Math.round(adjusted[k] * scale));
    }
  }

  return adjusted;
}
