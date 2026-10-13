/**
 * Community Gap Scanner — Reddit Brand Presence Check
 *
 * Uses Reddit's public JSON search endpoints. No API key required for basic use.
 * Rate limit: ~60 req/min on public endpoints.
 * At 2-3 Reddit calls per audit, free tier handles thousands of audits/day.
 *
 * What it checks:
 *   1. Does the brand appear in Reddit search results?
 *   2. Which subreddits cover the brand's category (but may not mention the brand)?
 *   3. Which of those subreddits do mention the brand?
 *   4. Top-cited threads AI platforms are likely pulling from
 *
 * For Community Gap Scanner (blueprint Module 10), these are Phase 2 additions.
 * Core scoring (offsite score) uses results from this module.
 */

export interface RedditPresenceResult {
  brandMentionCount: number;
  brandPresentInSubreddits: string[];
  relevantSubredditsForCategory: string[];
  gapSubreddits: string[];             // relevant but brand NOT mentioned
  topCitedThreads: RedditThread[];     // threads AI likely cites for category queries
  communityScore: number;              // 0–10
}

export interface RedditThread {
  title: string;
  subreddit: string;
  url: string;
  score: number;                       // Reddit upvotes
  commentCount: number;
  createdAt: string;
  mentionsBrand: boolean;
}

// ─── Industry → Subreddit mapping ─────────────────────────────────────────────

const INDUSTRY_SUBREDDITS: Record<string, string[]> = {
  saas: ['r/SaaS', 'r/startups', 'r/entrepreneur', 'r/ProductManagement', 'r/webdev', 'r/Entrepreneur'],
  legal: ['r/legaladvice', 'r/law', 'r/Lawyertalk', 'r/legaladviceofftopic'],
  healthcare: ['r/medicine', 'r/HealthIT', 'r/EHR', 'r/healthcare', 'r/medical'],
  marketing: ['r/marketing', 'r/SEO', 'r/digital_marketing', 'r/PPC', 'r/ContentMarketing'],
  realestate: ['r/realestate', 'r/RealEstateTechnology', 'r/FirstTimeHomeBuyer', 'r/REBubble'],
  ecommerce: ['r/ecommerce', 'r/dropshipping', 'r/shopify', 'r/FulfillmentByAmazon', 'r/AmazonSeller'],
  general: ['r/entrepreneur', 'r/startups', 'r/smallbusiness', 'r/business'],
};

function normalizeIndustry(industry: string): string {
  const lower = (industry || '').toLowerCase();
  if (/saas|software|tech|platform|cloud|api|developer/i.test(lower)) return 'saas';
  if (/legal|law|attorney|lawyer/i.test(lower)) return 'legal';
  if (/health|medical|clinic|hospital|ehr|rcm/i.test(lower)) return 'healthcare';
  if (/marketing|agency|seo|advertising/i.test(lower)) return 'marketing';
  if (/real estate|property|realtor/i.test(lower)) return 'realestate';
  if (/ecommerce|e-commerce|retail|shop/i.test(lower)) return 'ecommerce';
  return 'general';
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanRedditPresence(
  brandName: string,
  domain: string,
  industry: string
): Promise<RedditPresenceResult> {
  const industryKey = normalizeIndustry(industry);
  const relevantSubreddits = INDUSTRY_SUBREDDITS[industryKey] || INDUSTRY_SUBREDDITS.general;

  // Check 1: Brand mention count across all Reddit
  const brandMentions = await searchReddit(brandName, null, 10);
  const brandMentionCount = brandMentions.length;

  // Check 2: Which relevant subreddits mention the brand
  const brandPresentInSubreddits: string[] = [];
  const topCitedThreads: RedditThread[] = [];

  // Check top 3 subreddits (rate limit conscious)
  const subredditsToCheck = relevantSubreddits.slice(0, 3).map(s => s.replace('r/', ''));

  for (const subreddit of subredditsToCheck) {
    const results = await searchRedditInSubreddit(brandName, subreddit, 3);
    if (results.length > 0) {
      brandPresentInSubreddits.push(`r/${subreddit}`);
      topCitedThreads.push(...results);
    }
    // Small delay to respect rate limits
    await sleep(300);
  }

  // Check 3: Category-level threads AI might cite (high upvote threads in category subreddits)
  const categoryThreads = await getTopCategoryThreads(industryKey, brandName);
  topCitedThreads.push(...categoryThreads);

  const gapSubreddits = relevantSubreddits.filter(s => !brandPresentInSubreddits.includes(s));

  // ── Score calculation ──────────────────────────────────────────────────────
  // Blueprint: 1.8 avg citations with minimal Reddit presence, 7.0 with high presence
  let communityScore = 0;

  // Brand appears in general Reddit search = +2
  if (brandMentionCount > 0) communityScore += 2;
  if (brandMentionCount >= 5) communityScore += 1;
  if (brandMentionCount >= 20) communityScore += 1;

  // Brand present in relevant subreddits = +2 per subreddit (max 6)
  communityScore += Math.min(6, brandPresentInSubreddits.length * 2);

  communityScore = Math.max(0, Math.min(10, communityScore));

  return {
    brandMentionCount,
    brandPresentInSubreddits,
    relevantSubredditsForCategory: relevantSubreddits,
    gapSubreddits,
    topCitedThreads: topCitedThreads.slice(0, 10),
    communityScore,
  };
}

// ─── Reddit API functions (public JSON, no auth required) ─────────────────────

async function searchReddit(
  query: string,
  subreddit: string | null,
  limit: number
): Promise<RedditThread[]> {
  try {
    const url = subreddit
      ? `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=top&t=year&limit=${limit}`
      : `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=top&t=year&limit=${limit}&type=link`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CitationRocketBot/1.0 (brand-mention-checker; contact: hello@citationrocket.com)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data = await res.json() as any;
    const posts = data?.data?.children ?? [];

    return posts.map((p: any) => ({
      title: p.data.title,
      subreddit: `r/${p.data.subreddit}`,
      url: `https://reddit.com${p.data.permalink}`,
      score: p.data.score,
      commentCount: p.data.num_comments,
      createdAt: new Date(p.data.created_utc * 1000).toISOString(),
      mentionsBrand: p.data.title?.toLowerCase().includes(query.toLowerCase()) ||
                     p.data.selftext?.toLowerCase().includes(query.toLowerCase()),
    }));
  } catch {
    return [];
  }
}

async function searchRedditInSubreddit(
  brandName: string,
  subreddit: string,
  limit: number
): Promise<RedditThread[]> {
  return searchReddit(brandName, subreddit, limit);
}

async function getTopCategoryThreads(
  industryKey: string,
  brandName: string
): Promise<RedditThread[]> {
  // Get high-traffic category threads that AI platforms commonly cite
  const categoryQueries: Record<string, string> = {
    saas: 'best SaaS tools recommendations',
    legal: 'best legal software recommendations',
    healthcare: 'best EHR software recommendations',
    marketing: 'best marketing tools recommendations',
    realestate: 'best real estate software',
    ecommerce: 'best ecommerce platform recommendations',
    general: 'best business software tools',
  };

  const query = categoryQueries[industryKey] || categoryQueries.general;
  const threads = await searchReddit(query, null, 5);

  // Mark which ones mention the brand
  return threads.map(t => ({
    ...t,
    mentionsBrand: t.title.toLowerCase().includes(brandName.toLowerCase()),
  }));
}

/**
 * Generate reply template for a Reddit thread
 * Used by Community Gap Scanner's "Generate Reply" feature
 */
export function generateReplyTemplate(
  thread: RedditThread,
  brandName: string,
  valueProposition: string,
  industry: string
): string {
  return `Based on my experience with ${industry} tools, ${brandName} might be worth checking out.

${valueProposition || `It's specifically designed for this use case.`}

I've found it particularly useful for [specific problem mentioned in the thread]. Happy to answer questions if anyone wants more details.

(Disclaimer: I work with ${brandName})`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
