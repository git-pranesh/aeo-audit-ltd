/**
 * Off-Site Authority Scanner — Module 4 (0–30 points)
 *
 * Brand mentions on third-party sites: r=0.664 with AI citation probability.
 * Brands are 6.5x more likely to be cited through third-party sources than own site.
 *
 * Three tiers:
 *   Entity Foundation (0–10): KG, Wikidata, Wikipedia, Crunchbase, LinkedIn
 *   Review Platforms  (0–10): G2, Capterra, Trustpilot
 *   Community         (0–10): Reddit presence (via community-scanner.ts)
 *
 * APIs: All free.
 *   Google KG: 100K req/day free
 *   Wikidata:  completely free
 *   Wikipedia: completely free
 *   Others:    URL existence checks only (no API needed)
 */

import type { OffsiteSignals } from './blueprint-signals';
import { scanRedditPresence } from './community-scanner';
import { verifyWikidataByDomain, verifyKnowledgeGraph } from './entity-verify';

export async function scanOffsitePresence(
  brandName: string,
  domain: string,
  industry: string,
  companyName: string,
  clientWikidataQid?: string | null,
  reviewsApply: boolean = true
): Promise<OffsiteSignals> {
  // Run all checks in parallel (with individual timeouts)
  const [entityResults, reviewResults, redditResults] = await Promise.allSettled([
    checkEntityFoundation(brandName, domain, companyName, clientWikidataQid),
    checkReviewPlatforms(brandName, domain),
    scanRedditPresence(brandName, domain, industry),
  ]);

  const entity = entityResults.status === 'fulfilled' ? entityResults.value : defaultEntityResult();
  const reviews = reviewResults.status === 'fulfilled' ? reviewResults.value : defaultReviewResult();
  const reddit = redditResults.status === 'fulfilled' ? redditResults.value : defaultRedditResult();

  // Category-aware off-site authority (max 30). Each tier is scored as a fraction
  // of its own reachable max, then weighted. For entities that would NOT plausibly
  // appear on product-review platforms (hospitals, news outlets, government,
  // schools, etc.) the review weight is folded into entity authority — so the
  // 30-point maximum stays reachable and we never penalize the absence of a signal
  // that does not apply to the entity's category.
  const entityFrac = entity.entityFoundationScore / 10;
  const reviewFrac = reviews.reviewPlatformScore / 10;
  const communityFrac = reddit.communityScore / 10;

  const offsiteScore = Math.min(30, Math.round(
    reviewsApply
      ? entityFrac * 10 + reviewFrac * 10 + communityFrac * 10
      : entityFrac * 20 + communityFrac * 10
  ));

  return {
    // Entity
    knowledgeGraphEntityType: entity.entityType,
    wikidataQNumber: entity.wikidataQNumber,
    wikipediaArticleExists: entity.wikipediaExists,
    crunchbaseProfileExists: entity.crunchbaseExists,
    linkedinCompanyPageExists: entity.linkedinExists,
    entityFoundationScore: entity.entityFoundationScore,

    // Reviews
    g2ProfileExists: reviews.g2Exists,
    g2ReviewCount: reviews.g2ReviewCount,
    capteRraProfileExists: reviews.capteRraExists,
    trustpilotProfileExists: reviews.trustpilotExists,
    reviewPlatformScore: reviews.reviewPlatformScore,

    // Community
    redditBrandMentionCount: reddit.brandMentionCount,
    redditRelevantSubreddits: reddit.relevantSubredditsForCategory,
    redditBrandPresentInSubreddits: reddit.brandPresentInSubreddits,
    communityScore: reddit.communityScore,

    offsiteScore,
  };
}

// ─── Entity Foundation ────────────────────────────────────────────────────────

async function checkEntityFoundation(
  brandName: string,
  domain: string,
  companyName: string,
  clientWikidataQid?: string | null
) {
  const [kgResult, wikidataResult, crunchbaseResult, linkedinResult] =
    await Promise.allSettled([
      verifyKnowledgeGraph(brandName, domain, process.env.GOOGLE_KG_API_KEY),
      verifyWikidataByDomain(brandName, domain, clientWikidataQid),
      checkUrlExists(`https://www.crunchbase.com/organization/${slugify(brandName)}`),
      checkUrlExists(`https://www.linkedin.com/company/${slugify(brandName)}`),
    ]);

  const kg = kgResult.status === 'fulfilled' ? kgResult.value : null;
  const wikidata = wikidataResult.status === 'fulfilled'
    ? wikidataResult.value
    : { qNumber: null, wikipediaExists: false };
  const wikipediaExists = wikidata.wikipediaExists;
  const crunchbaseExists = crunchbaseResult.status === 'fulfilled' ? crunchbaseResult.value : false;
  const linkedinExists = linkedinResult.status === 'fulfilled' ? linkedinResult.value : false;

  // Reachable to the full 10 WITHOUT the Google KG API (which needs a key that may
  // be absent): strong Wikipedia/Wikidata/Crunchbase presence alone can earn the
  // maximum, so authoritative non-commercial entities are not silently capped.
  let entityFoundationScore = 0;
  if (kg?.found) entityFoundationScore += 4;
  if (wikidata.qNumber) entityFoundationScore += 4;
  if (wikipediaExists) entityFoundationScore += 3;
  if (crunchbaseExists) entityFoundationScore += 2;
  if (linkedinExists) entityFoundationScore += 1;

  return {
    entityType: kg?.entityType ?? null,
    wikidataQNumber: wikidata.qNumber,
    wikipediaExists,
    crunchbaseExists,
    linkedinExists,
    entityFoundationScore: Math.min(10, entityFoundationScore),
  };
}

// ─── Review Platforms ─────────────────────────────────────────────────────────

async function checkReviewPlatforms(brandName: string, domain: string) {
  const slug = slugify(brandName);
  const domainSlug = domain.split('.')[0];

  const [g2Result, capteRraResult, trustpilotResult] = await Promise.allSettled([
    checkG2Profile(slug, domainSlug),
    checkUrlExists(`https://www.capterra.com/p/search/?q=${encodeURIComponent(brandName)}`),
    checkUrlExists(`https://www.trustpilot.com/review/${domain}`),
  ]);

  const g2 = g2Result.status === 'fulfilled' ? g2Result.value : { exists: false, reviewCount: null };
  const capteRraExists = capteRraResult.status === 'fulfilled' ? capteRraResult.value : false;
  const trustpilotExists = trustpilotResult.status === 'fulfilled' ? trustpilotResult.value : false;

  // Blueprint: 4.6–6.3 citations for sites on multiple review platforms vs 1.8 for absent
  let reviewPlatformScore = 0;
  if (g2.exists) reviewPlatformScore += 4;
  if (capteRraExists) reviewPlatformScore += 3;
  if (trustpilotExists) reviewPlatformScore += 3;

  return {
    g2Exists: g2.exists,
    g2ReviewCount: g2.reviewCount,
    capteRraExists,
    trustpilotExists,
    reviewPlatformScore: Math.min(10, reviewPlatformScore),
  };
}

async function checkG2Profile(slug: string, domainSlug: string): Promise<{ exists: boolean; reviewCount: number | null }> {
  try {
    // Try common G2 URL patterns
    const urls = [
      `https://www.g2.com/products/${slug}/reviews`,
      `https://www.g2.com/products/${domainSlug}/reviews`,
    ];

    for (const url of urls) {
      const exists = await checkUrlExists(url);
      if (exists) return { exists: true, reviewCount: null }; // count requires scraping
    }

    return { exists: false, reviewCount: null };
  } catch {
    return { exists: false, reviewCount: null };
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

async function checkUrlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CitationRocketBot/1.0)' },
      redirect: 'follow',
    });
    return res.ok && res.status < 400;
  } catch {
    return false;
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── Default values ───────────────────────────────────────────────────────────

function defaultEntityResult() {
  return { entityType: null, wikidataQNumber: null, wikipediaExists: false, crunchbaseExists: false, linkedinExists: false, entityFoundationScore: 0 };
}

function defaultReviewResult() {
  return { g2Exists: false, g2ReviewCount: null, capteRraExists: false, trustpilotExists: false, reviewPlatformScore: 0 };
}

function defaultRedditResult() {
  return { brandMentionCount: 0, relevantSubredditsForCategory: [], brandPresentInSubreddits: [], communityScore: 0 };
}
