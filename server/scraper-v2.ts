/**
 * Scraper V2 — Smart SaaS-Optimized Scraper
 *
 * REPLACES scrapeWebsiteContent() in routes.ts.
 *
 * What changed vs the old scraper:
 * - Hard cap at 15 pages (old: tried to crawl everything → timeouts)
 * - Smart page selection (old: random sampling → missed key pages)
 * - Firecrawl primary → Jina Reader fallback → basic fetch last resort
 * - No subdomain probing for basic SaaS sites (adds 30s+ for no gain)
 * - Sitemap used for URL counting only, not mass crawling
 * - 45 second total time cap (old: 3 minutes)
 * - Returns same ScrapeResult shape — zero changes to signal extraction
 *
 * Page selection priority (in order):
 * 1.  /                        — homepage (always)
 * 2.  /llms.txt                — AI readiness signal
 * 3.  /robots.txt              — crawler access signal
 * 4.  /sitemap.xml             — URL count only (not full crawl)
 * 5.  /pricing                 — SaaS key page
 * 6.  /features OR /product    — SaaS key page
 * 7.  /about                   — company context
 * 8.  /blog (index)            — blog existence
 * 9.  /blog/[first post]       — actual content sample
 * 10. /case-studies OR /customers — social proof
 * 11. /faq OR /help            — FAQ signal
 * 12. /docs OR /documentation  — docs signal
 * 13-15. Top 3 sitemap URLs not already fetched (by URL priority scoring)
 */

import axios from 'axios';

export interface ScrapeResult {
  html: string;
  text: string;
  sitemapUrls: string[];
  discoveredSubdomains: string[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_PAGES = 15;
const PAGE_TIMEOUT_MS = 8000;
const TOTAL_TIMEOUT_MS = 45000;
const USER_AGENT = 'Mozilla/5.0 (compatible; CitationRocketBot/2.0; +https://citationrocket.com/bot)';

// Priority paths to attempt (in order). We stop at MAX_PAGES.
const PRIORITY_PATHS = [
  '/',
  '/pricing',
  '/features',
  '/product',
  '/platform',
  '/about',
  '/about-us',
  '/blog',
  '/case-studies',
  '/customers',
  '/success-stories',
  '/faq',
  '/help',
  '/docs',
  '/documentation',
  '/getting-started',
  '/resources',
  '/integrations',
  '/solutions',
  '/why-us',
  '/how-it-works',
];

// Pages that almost always have the richest AEO signal content
const HIGH_SIGNAL_URL_PATTERNS = [
  /\/blog\//,
  /\/tutorial/,
  /\/guide/,
  /\/how-to/,
  /\/case-stud/,
  /\/customer/,
  /\/success/,
  /\/faq/,
  /\/docs?\//,
  /\/learn/,
  /\/resources?\//,
];

// ─── Main export — drop-in replacement ───────────────────────────────────────

export async function scrapeWebsiteV2(
  websiteUrl: string,
  signal?: AbortSignal,
  options?: { skipFirecrawl?: boolean }
): Promise<ScrapeResult> {
  const startTime = Date.now();
  const normalizedUrl = websiteUrl.startsWith('http')
    ? websiteUrl
    : `https://${websiteUrl}`;

  let domain: string;
  try {
    domain = new URL(normalizedUrl).hostname.replace(/^www\./, '');
  } catch {
    return emptyResult();
  }

  console.log(`\n🔍 Scraper V2: ${domain}`);

  const result: ScrapeResult = {
    html: '',
    text: '',
    sitemapUrls: [],
    discoveredSubdomains: [],
  };

  const timeLeft = () => TOTAL_TIMEOUT_MS - (Date.now() - startTime);
  const aborted = () => signal?.aborted || timeLeft() <= 0;

  // ─── Step 1: Fetch sitemap for URL counting (not full crawl) ───────────────
  const sitemapUrls = await fetchSitemapUrlsOnly(domain);
  result.sitemapUrls = sitemapUrls;
  console.log(`📊 Sitemap: ${sitemapUrls.length} URLs found (counting only)`);

  if (aborted()) return result;

  // ─── Step 2: Detect if site is JS-rendered ────────────────────────────────
  const isJsRendered = await detectJsRendering(normalizedUrl);
  console.log(`🔎 JS rendering: ${isJsRendered ? 'YES — using Firecrawl' : 'NO — using direct fetch'}`);

  if (aborted()) return result;

  // ─── Step 3: Collect pages using the right strategy ───────────────────────
  let fetchedPages: Array<{ url: string; html: string; text: string }> = [];

  if (isJsRendered) {
    if (options?.skipFirecrawl) {
      // BYOK/Lifetime users: never use paid Firecrawl — go straight to free Jina Reader
      console.log(`🎁 skipFirecrawl — using free Jina Reader for JS-rendered site`);
      fetchedPages = await fetchWithJina(normalizedUrl, domain, sitemapUrls, MAX_PAGES);
    } else {
      // Firecrawl handles JS-rendered sites (Webflow, Framer, Next.js)
      fetchedPages = await fetchWithFirecrawl(normalizedUrl, domain, sitemapUrls, MAX_PAGES);

      // Fallback to Jina if Firecrawl fails
      if (fetchedPages.length === 0) {
        console.log(`⚠️ Firecrawl returned 0 pages — falling back to Jina Reader`);
        fetchedPages = await fetchWithJina(normalizedUrl, domain, sitemapUrls, MAX_PAGES);
      }
    }
  } else {
    // Direct fetch for static/SSR sites
    fetchedPages = await fetchDirectly(normalizedUrl, domain, sitemapUrls, MAX_PAGES, signal);
  }

  if (fetchedPages.length === 0) {
    // Last resort: try Jina on the homepage at minimum
    console.log(`⚠️ All strategies failed — last resort Jina on homepage`);
    const jinaResult = await jinaFetchSingle(normalizedUrl);
    if (jinaResult) fetchedPages = [{ url: normalizedUrl, ...jinaResult }];
  }

  console.log(`📄 Total pages fetched: ${fetchedPages.length}`);

  // ─── Step 4: Combine all page content ─────────────────────────────────────
  result.html = fetchedPages.map(p => p.html).join('\n\n');
  result.text = fetchedPages.map(p => p.text).join('\n\n');

  // ─── Step 5: Check for llms.txt (bonus AEO signal) ────────────────────────
  const llmsTxt = await fetchOptional(`https://${domain}/llms.txt`);
  if (llmsTxt) {
    result.text += '\n\n[llms.txt]\n' + llmsTxt;
    console.log(`✅ llms.txt found — added to signals`);
  }

  console.log(`✅ Scrape complete: ${fetchedPages.length} pages, ${result.sitemapUrls.length} sitemap URLs, ${Math.round(result.text.length / 1000)}KB text, ${Math.round((Date.now() - startTime) / 1000)}s`);

  return result;
}

// ─── Sitemap fetcher (URL counting only) ─────────────────────────────────────

async function fetchSitemapUrlsOnly(domain: string): Promise<string[]> {
  const urls: string[] = [];

  try {
    // Try sitemap.xml
    const sitemapRes = await axios.get(`https://${domain}/sitemap.xml`, {
      timeout: 8000,
      headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 3,
    });

    const data = sitemapRes.data as string;

    // Sitemap index?
    const childSitemaps = Array.from(data.matchAll(/<loc>([^<]+sitemap[^<]*\.xml[^<]*)<\/loc>/gi))
      .map(m => m[1]).slice(0, 10);

    if (childSitemaps.length > 0) {
      // Fetch child sitemaps in parallel
      const childResults = await Promise.allSettled(
        childSitemaps.map(url =>
          axios.get(url, { timeout: 5000, headers: { 'User-Agent': USER_AGENT } })
            .then(r => (Array.from((r.data as string).matchAll(/<loc>([^<]+)<\/loc>/gi)).map(m => m[1])))
            .catch(() => [] as string[])
        )
      );
      for (const r of childResults) {
        if (r.status === 'fulfilled') urls.push(...r.value);
      }
    } else {
      // Regular sitemap
      const locs = Array.from(data.matchAll(/<loc>([^<]+)<\/loc>/gi)).map(m => m[1]);
      urls.push(...locs);
    }
  } catch {
    // Try robots.txt for sitemap reference
    try {
      const robots = await axios.get(`https://${domain}/robots.txt`, {
        timeout: 5000, headers: { 'User-Agent': USER_AGENT }
      });
      const sitemapMatch = (robots.data as string).match(/Sitemap:\s*(\S+)/i);
      if (sitemapMatch) {
        const sitemapRes = await axios.get(sitemapMatch[1], {
          timeout: 5000, headers: { 'User-Agent': USER_AGENT }
        });
        const locs = Array.from((sitemapRes.data as string).matchAll(/<loc>([^<]+)<\/loc>/gi)).map(m => m[1]);
        urls.push(...locs);
      }
    } catch { /* sitemap completely unavailable */ }
  }

  return Array.from(new Set(urls)).slice(0, 5000); // dedupe, cap at 5000 for memory
}

// ─── JS rendering detection ───────────────────────────────────────────────────

async function detectJsRendering(url: string): Promise<boolean> {
  try {
    const res = await axios.get(url, {
      timeout: PAGE_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 3,
    });
    const html = (res.data as string) || '';

    const jsSignatures = [
      '__NEXT_DATA__', '/_next/', // Next.js
      '__NUXT__', '/_nuxt/',      // Nuxt
      'ng-version',               // Angular
      'data-reactroot',           // React
      'ember',                    // Ember
      '__GATSBY',                 // Gatsby
      'webflow-badge',            // Webflow
      'framer-badge',             // Framer
    ];

    return jsSignatures.some(sig => html.includes(sig));
  } catch {
    return true; // If fetch fails, assume JS — use Firecrawl
  }
}

// ─── Firecrawl strategy ───────────────────────────────────────────────────────

async function fetchWithFirecrawl(
  url: string,
  domain: string,
  sitemapUrls: string[],
  maxPages: number
): Promise<Array<{ url: string; html: string; text: string }>> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ No FIRECRAWL_API_KEY — skipping Firecrawl');
    return [];
  }

  const pages: Array<{ url: string; html: string; text: string }> = [];

  try {
    // Use Firecrawl /scrape for the homepage first (fast, reliable)
    const homeResult = await firecrawlScrape(url, apiKey);
    if (homeResult) pages.push({ url, ...homeResult });

    if (pages.length >= maxPages) return pages;

    // Then crawl smart-selected priority pages
    const priorityUrls = selectPriorityUrls(url, domain, sitemapUrls, maxPages - pages.length);

    // Batch scrape priority pages (5 at a time)
    const batchSize = 5;
    for (let i = 0; i < priorityUrls.length && pages.length < maxPages; i += batchSize) {
      const batch = priorityUrls.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(u => firecrawlScrape(u, apiKey))
      );
      for (let j = 0; j < batchResults.length; j++) {
        const r = batchResults[j];
        if (r.status === 'fulfilled' && r.value) {
          pages.push({ url: batch[j], ...r.value });
        }
      }
    }

    console.log(`🔥 Firecrawl: fetched ${pages.length} pages`);
  } catch (err: any) {
    console.error(`❌ Firecrawl error: ${err?.message}`);
  }

  return pages;
}

async function firecrawlScrape(
  url: string,
  apiKey: string
): Promise<{ html: string; text: string } | null> {
  try {
    const res = await axios.post(
      'https://api.firecrawl.dev/v1/scrape',
      {
        url,
        formats: ['html', 'markdown'],
        excludeTags: ['nav', 'footer', 'script', 'style', 'header'],
        timeout: 20000,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 25000,
      }
    );

    const data = res.data?.data || res.data;
    if (!data) return null;

    const html = data.html || '';
    const text = data.markdown || data.text || cleanHtml(html);

    return { html, text };
  } catch (err: any) {
    // Don't log 409 (duplicate URL) — that's Firecrawl deduplication, not an error
    if (err?.response?.status !== 409) {
      console.warn(`⚠️ Firecrawl scrape failed for ${url}: ${err?.message}`);
    }
    return null;
  }
}

// ─── Jina Reader strategy (free fallback) ────────────────────────────────────

async function fetchWithJina(
  url: string,
  domain: string,
  sitemapUrls: string[],
  maxPages: number
): Promise<Array<{ url: string; html: string; text: string }>> {
  const pages: Array<{ url: string; html: string; text: string }> = [];

  const urlsToFetch = [url, ...selectPriorityUrls(url, domain, sitemapUrls, maxPages - 1)];

  // Jina free tier: 20 RPM — fetch sequentially with small delay
  for (const u of urlsToFetch) {
    if (pages.length >= maxPages) break;
    const result = await jinaFetchSingle(u);
    if (result) pages.push({ url: u, ...result });
    await sleep(200); // stay under 20 RPM
  }

  console.log(`📖 Jina Reader: fetched ${pages.length} pages`);
  return pages;
}

export async function jinaFetchSingle(
  url: string
): Promise<{ html: string; text: string } | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const res = await axios.get(jinaUrl, {
      timeout: PAGE_TIMEOUT_MS,
      headers: {
        'Accept': 'text/plain',
        'User-Agent': USER_AGENT,
        // Use API key if available for higher rate limits
        ...(process.env.JINA_API_KEY ? { Authorization: `Bearer ${process.env.JINA_API_KEY}` } : {}),
      },
    });

    const text = (res.data as string) || '';
    if (text.length < 100) return null;

    // Jina returns markdown — use as both text and html (signal extraction handles both)
    return { html: text, text };
  } catch {
    return null;
  }
}

// ─── Direct fetch strategy (static/SSR sites) ─────────────────────────────────

async function fetchDirectly(
  baseUrl: string,
  domain: string,
  sitemapUrls: string[],
  maxPages: number,
  signal?: AbortSignal
): Promise<Array<{ url: string; html: string; text: string }>> {
  const pages: Array<{ url: string; html: string; text: string }> = [];

  const urlsToFetch = [baseUrl, ...selectPriorityUrls(baseUrl, domain, sitemapUrls, maxPages - 1)];

  const results = await Promise.allSettled(
    urlsToFetch.slice(0, maxPages).map(url =>
      fetchPageDirect(url).then(result => result ? { url, ...result } : null)
    )
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      pages.push(r.value);
    }
  }

  console.log(`📡 Direct fetch: fetched ${pages.length} pages`);
  return pages;
}

async function fetchPageDirect(url: string): Promise<{ html: string; text: string } | null> {
  try {
    const res = await axios.get(url, {
      timeout: PAGE_TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
      },
      maxRedirects: 3,
      maxContentLength: 2 * 1024 * 1024, // 2MB cap
    });

    const html = (res.data as string) || '';
    if (html.length < 200) return null;

    const text = cleanHtml(html);
    return { html, text };
  } catch {
    return null;
  }
}

// ─── Smart page selection ─────────────────────────────────────────────────────

function selectPriorityUrls(
  baseUrl: string,
  domain: string,
  sitemapUrls: string[],
  count: number
): string[] {
  const selected = new Set<string>();
  const base = baseUrl.replace(/\/$/, '');

  // 1. Try known high-value paths
  for (const path of PRIORITY_PATHS) {
    if (selected.size >= count) break;
    const url = `${base}${path}`;
    if (url !== baseUrl) selected.add(url);
  }

  if (selected.size >= count) return Array.from(selected).slice(0, count);

  // 2. Fill remaining slots with high-signal sitemap URLs
  const highSignalUrls = sitemapUrls
    .filter(u => {
      try {
        const parsed = new URL(u);
        // Only same domain or subdomains
        if (!parsed.hostname.includes(domain)) return false;
        // Must match a high-signal pattern
        return HIGH_SIGNAL_URL_PATTERNS.some(p => p.test(u));
      } catch { return false; }
    })
    .slice(0, count * 3); // oversample then pick

  // Score by URL quality (more specific = better)
  const scored = highSignalUrls.map(u => ({
    url: u,
    score: scoreUrl(u),
  })).sort((a, b) => b.score - a.score);

  for (const { url } of scored) {
    if (selected.size >= count) break;
    selected.add(url);
  }

  return Array.from(selected).slice(0, count);
}

function scoreUrl(url: string): number {
  let score = 0;
  // Penalize very long URLs (likely pagination or parameters)
  if (url.length > 100) score -= 2;
  if (url.includes('?')) score -= 3;
  if (url.includes('#')) score -= 3;
  // Reward key patterns
  if (/\/blog\//i.test(url)) score += 2;
  if (/\/case-stud|\/customer|\/success/i.test(url)) score += 3;
  if (/\/tutorial|\/guide|\/how-to/i.test(url)) score += 3;
  if (/\/faq|\/help/i.test(url)) score += 2;
  if (/\/docs?\//i.test(url)) score += 2;
  // Penalize paginated/tagged/categorised URLs
  if (/\/page\/\d|\/tag\/|\/category\//i.test(url)) score -= 3;
  return score;
}

// ─── Utility functions ────────────────────────────────────────────────────────

function cleanHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchOptional(url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': USER_AGENT },
      maxRedirects: 2,
    });
    return typeof res.data === 'string' ? res.data : null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function emptyResult(): ScrapeResult {
  return { html: '', text: '', sitemapUrls: [], discoveredSubdomains: [] };
}

// ─── Lightweight single-page scrape (for pre-classification grounding) ────────

export interface LiteScrapeResult {
  title: string;
  metaDescription: string;
  h1s: string[];
  text: string;
  success: boolean;
}

const LITE_BODY_CHAR_CAP = 2000;

/**
 * Fetches just the homepage (no sitemap crawl, no Firecrawl/Jina cascade) and
 * extracts title/meta description/H1s/body text. Used to ground company
 * classification prompts in real page content before the full multi-page
 * scrape runs, so the LLM never has to guess industry from the domain name.
 */
export async function scrapeHomepageLite(websiteUrl: string): Promise<LiteScrapeResult> {
  const normalizedUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
  const empty: LiteScrapeResult = { title: '', metaDescription: '', h1s: [], text: '', success: false };

  try {
    const res = await axios.get(normalizedUrl, {
      timeout: PAGE_TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
      },
      maxRedirects: 3,
      maxContentLength: 2 * 1024 * 1024,
    });

    const html = (res.data as string) || '';
    if (html.length < 50) return empty;

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';

    const metaMatch =
      html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i);
    const metaDescription = metaMatch ? metaMatch[1].replace(/\s+/g, ' ').trim() : '';

    const h1s = Array.from(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
      .map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 5);

    const bodyText = cleanHtml(html).slice(0, LITE_BODY_CHAR_CAP);

    return {
      title,
      metaDescription,
      h1s,
      text: bodyText,
      success: (title.length + metaDescription.length + bodyText.length) >= 50,
    };
  } catch {
    return empty;
  }
}
