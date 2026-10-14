/**
 * Off-Site Authority Scanner — Module 4 (0–30 points)
 *
 * Brand mentions on third-party sites: r=0.664 with AI citation probability.
 * Brands are 6.5x more likely to be cited through third-party sources than own site.
 *
 * Three tiers:
 *   Entity Foundation (0–10): KG, Wikidata, Wikipedia, Crunchbase, LinkedIn
 *   Review Platforms  (0–10): G2, Capterra, Trustpilot
 *   Review sites and Reddit are not checked: they block automated requests.
 *
 * APIs: All free.
 *   Google KG: 100K req/day free
 *   Wikidata:  completely free
 *   Wikipedia: completely free
 *   Others:    URL existence checks only (no API needed)
 */

import type { OffsiteSignals } from './blueprint-signals';
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
  const [entityResults] = await Promise.allSettled([
    checkEntityFoundation(brandName, domain, companyName, clientWikidataQid),
  ]);

  const entity = entityResults.status === 'fulfilled' ? entityResults.value : defaultEntityResult();
  // Review platforms and Reddit block automated checks: reported as "not checked", never as absent.
  const reviews = { g2Exists: null, g2ReviewCount: null, capteRraExists: null, trustpilotExists: null, reviewPlatformScore: 0 };
  const reddit = { brandMentionCount: null, relevantSubredditsForCategory: [] as string[], brandPresentInSubreddits: [] as string[], communityScore: 0 };

  // Category-aware off-site authority (max 30). Each tier is scored as a fraction
  // of its own reachable max, then weighted. For entities that would NOT plausibly
  // appear on product-review platforms (hospitals, news outlets, government,
  // schools, etc.) the review weight is folded into entity authority — so the
  // 30-point maximum stays reachable and we never penalize the absence of a signal
  // that does not apply to the entity's category.
  const entityFrac = entity.entityFoundationScore / 10;
  const reviewFrac = reviews.reviewPlatformScore / 10;
  const communityFrac = reddit.communityScore / 10;

  // Only the verifiable tier (Wikidata, Wikipedia, LinkedIn, optional Google KG) is scored.
  void reviewFrac; void communityFrac; void reviewsApply;
  const offsiteScore = Math.min(30, Math.round(entityFrac * 30));

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
  // Crunchbase, G2, Capterra, Trustpilot and Reddit answer 403 to every server
  // request, so checking them would report "not found" for brands that are there.
  const [kgResult, wikidataResult, linkedinResult] =
    await Promise.allSettled([
      verifyKnowledgeGraph(brandName, domain, process.env.GOOGLE_KG_API_KEY),
      verifyWikidataByDomain(brandName, domain, clientWikidataQid),
      checkUrlState(`https://www.linkedin.com/company/${slugify(brandName)}`),
    ]);

  const kg = kgResult.status === 'fulfilled' ? kgResult.value : null;
  const wikidata = wikidataResult.status === 'fulfilled'
    ? wikidataResult.value
    : { qNumber: null, wikipediaExists: false };
  const wikipediaExists = wikidata.wikipediaExists;
  const linkedinExists = linkedinResult.status === 'fulfilled' ? linkedinResult.value : null;

  // Reachable to the full 10 WITHOUT the Google KG API (which needs a key that may
  // be absent): strong Wikipedia/Wikidata/Crunchbase presence alone can earn the
  // maximum, so authoritative non-commercial entities are not silently capped.
  let entityFoundationScore = 0;
  if (kg?.found || wikidata.qNumber) entityFoundationScore += 4;
  if (wikidata.qNumber) entityFoundationScore += 1;
  if (wikipediaExists) entityFoundationScore += 3;
  if (linkedinExists) entityFoundationScore += 2;

  return {
    entityType: kg?.entityType ?? null,
    wikidataQNumber: wikidata.qNumber,
    wikipediaExists,
    crunchbaseExists: null,
    linkedinExists,
    entityFoundationScore: Math.min(10, entityFoundationScore),
  };
}



// ─── Utilities ────────────────────────────────────────────────────────────────

/** true = page exists, false = definitely not found (404/410), null = blocked or unreachable. */
async function checkUrlState(url: string): Promise<boolean | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CitationRocketBot/1.0)' },
      redirect: 'follow',
    });
    if (res.ok) return true;
    return res.status === 404 || res.status === 410 ? false : null;
  } catch {
    return null;
  }
}


function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── Default values ───────────────────────────────────────────────────────────

function defaultEntityResult() {
  return { entityType: null, wikidataQNumber: null, wikipediaExists: false, crunchbaseExists: false, linkedinExists: false, entityFoundationScore: 0 };
}


