/**
 * Reproducible runtime proof for Task #14 (scoring engine verification).
 * Run from the project root:  npx tsx docs/proofs/verify-scoring.ts
 *
 * Exercises the real scoring engine on fixed inputs so the ledger's
 * runtime evidence (SC-01..SC-10) can be re-generated exactly by any auditor.
 */
import { calculatePlatformScoresV2 } from '../../server/scoring-service';
import { getBenchmarks } from '../../server/benchmarks';

const signals: any = {
  tutorialCount: 15, howToGuideCount: 10, faqSectionCount: 5, stepByStepListCount: 20,
  externalLinkCount: 50, dataPointCount: 30, statisticMentionCount: 15, researchTermCount: 10,
  schemaTypeCount: 5, headingHierarchyScore: 80, hasStructuredData: true, imageCount: 30,
  caseStudyCount: 8, frameworkMentionCount: 8, longFormContentScore: 60, nuancedTermCount: 15,
  blogPostCount: 50, documentationPageCount: 10, totalPageCount: 200, contentDepthScore: 90,
};

const out = (label: string, r: any) =>
  console.log(label, JSON.stringify({
    overallScore: r.overallScore,
    letterGrade: r.letterGrade,
    platformScores: r.platformScores,
    breakdown: r.breakdown,
  }));

// PERFECT: every signal meets its benchmark -> expect 100 / A+ and category maxes 35/25/25/15.
out('PERFECT:', calculatePlatformScoresV2(signals, 0, 0, '', 200));

// EMPTY: 5-page site with zero signals -> expect 0 / F.
const weak: any = { ...signals };
for (const k of Object.keys(weak)) if (typeof weak[k] === 'number') weak[k] = 0;
weak.totalPageCount = 5;
out('EMPTY:', calculatePlatformScoresV2(weak, 0, 0, '', 5));

// Benchmarks: base (>=50 pages) vs small-site (<50 pages) scaling.
console.log('BENCH base:', JSON.stringify(getBenchmarks('', 200)));
console.log('BENCH small10pg:', JSON.stringify(getBenchmarks('', 10)));
