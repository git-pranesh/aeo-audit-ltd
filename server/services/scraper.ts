/**
 * Website scraper (LTD edition).
 *
 *  - Max 10 pages, hard 50s budget.
 *  - Direct HTTP first. Jina Reader (free) only when direct fetching returns
 *    too little text (JS-rendered sites, bot walls). No Firecrawl, no headless
 *    browser — zero paid scraping.
 *  - Sitemap URLs are counted, never mass-fetched. No subdomain probing.
 *  - Every request goes through safeGet(), which blocks private/internal
 *    addresses on every hop (SSRF protection).
 *  - Partial failures produce a partial result, never an exception.
 */

import axios from 'axios';
import { assertPublicUrl, safeGetText, BOT_USER_AGENT } from '../security/ssrf';

export interface ScrapedPage {
  url: string;
  html: string;
  text: string;
}

export interface ScrapeResult {
  html: string;
  text: string;
  pages: ScrapedPage[];
  sitemapFound: boolean;
  sitemapLocation: string | null;
  llmsTxtFound: boolean;
  sitemapUrls: string[];
  discoveredSubdomains: string[];
  pagesFetched: number;
  usedJina: boolean;
  timedOut: boolean;
}

const MAX_PAGES = 10;
const PAGE_TIMEOUT_MS = 8000;
const TOTAL_BUDGET_MS = 50_000;
const MIN_USEFUL_TEXT = 1500; // below this (all pages combined) we try Jina
const SITEMAP_URL_CAP = 5000;

// Candidate paths, in priority order. The first MAX_PAGES that exist are used.
const PRIORITY_PATHS = [
  '/pricing',
  '/about',
  '/features',
  '/product',
  '/faq',
  '/docs',
  '/help',
  '/blog',
  '/case-studies',
  '/customers',
];

const HIGH_SIGNAL_URL_PATTERNS = [
  /\/blog\//, /\/tutorial/, /\/guide/, /\/how-to/, /\/case-stud/, /\/customer/,
  /\/success/, /\/faq/, /\/docs?\//, /\/learn/, /\/resources?\//,
];

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function scrapeWebsite(websiteUrl: string): Promise<ScrapeResult> {
  const startedAt = Date.now();
  const timeLeft = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);
  const result: ScrapeResult = {
    html: '', text: '', pages: [], sitemapFound: false, sitemapLocation: null, llmsTxtFound: false, sitemapUrls: [], discoveredSubdomains: [],
    pagesFetched: 0, usedJina: false, timedOut: false,
  };

  const baseUrl = (await assertPublicUrl(websiteUrl)).replace(/\/$/, '');
  const origin = new URL(baseUrl).origin;
  const domain = new URL(baseUrl).hostname.replace(/^www\./, '');

  // 1. Sitemap (count only) — capped at 10s.
  const sitemap = await withTimeout(fetchSitemapUrls(origin), Math.min(10_000, timeLeft()), { urls: [], location: null });
  result.sitemapUrls = sitemap.urls;
  result.sitemapLocation = sitemap.location;
  result.sitemapFound = sitemap.urls.length > 0;

  // 2. Direct fetch: homepage + prioritized pages, in parallel.
  const urls = [baseUrl, ...selectPriorityUrls(origin, domain, result.sitemapUrls, MAX_PAGES - 1)];
  let pages = await withTimeout(fetchDirect(urls), Math.max(1000, timeLeft() - 5000), []);

  // 3. Jina fallback when direct fetching produced too little readable text.
  const directText = pages.reduce((n, p) => n + p.text.length, 0);
  if (directText < MIN_USEFUL_TEXT && timeLeft() > 5000) {
    const jinaPages = await withTimeout(fetchWithJina(urls.slice(0, 5), timeLeft), Math.max(1000, timeLeft() - 2000), []);
    if (jinaPages.reduce((n, p) => n + p.text.length, 0) > directText) {
      // Keep the raw homepage HTML (if any) for schema/meta detection, add Jina text.
      pages = [...pages.filter((p) => p.url === baseUrl), ...jinaPages];
      result.usedJina = true;
    }
  }

  // 4. llms.txt (AEO readiness signal).
  if (timeLeft() > 2000) {
    const llmsTxt = await safeGetText(`${origin}/llms.txt`, { timeoutMs: Math.min(5000, timeLeft()) });
    if (llmsTxt && !/<html/i.test(llmsTxt)) {
      result.llmsTxtFound = true;
      result.text += '\n\n[llms.txt]\n' + llmsTxt.slice(0, 20_000);
    }
  }

  result.pagesFetched = pages.length;
  result.pages = pages;
  result.html = pages.map((p) => p.html).join('\n\n');
  result.text = pages.map((p) => p.text).join('\n\n') + result.text;
  result.timedOut = timeLeft() <= 0;

  console.log(`🔍 Scraped ${domain}: ${pages.length} pages, ${result.sitemapUrls.length} sitemap URLs, ${Math.round(result.text.length / 1000)}KB text${result.usedJina ? ' (Jina)' : ''} in ${Math.round((Date.now() - startedAt) / 1000)}s`);
  return result;
}

// ─── Strategies ───────────────────────────────────────────────────────────────

type Page = ScrapedPage;

// Error and bot-wall pages that some sites serve with a 200 status.
const SOFT_404 = /<title[^>]*>[^<]*(\b40[34]\b|not found|page (does not|doesn't) exist|couldn.t find|could not find|access denied|forbidden|just a moment|attention required|are you a (robot|human)|captcha|request unsuccessful|pardon our interruption|security check)[^<]*<\/title>/i;

async function fetchDirect(urls: string[]): Promise<Page[]> {
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const html = await safeGetText(url, { timeoutMs: PAGE_TIMEOUT_MS, accept: 'text/html,application/xhtml+xml' });
      // Error pages served with 200 would otherwise be scored as real content.
      if (!html || html.length < 200 || SOFT_404.test(html.slice(0, 20_000))) return null;
      return { url, html, text: cleanHtml(html) };
    }),
  );
  return dedupePages(results.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : [])));
}

/** Several guessed paths often redirect to the same page (e.g. /docs → /). Count each page once. */
function dedupePages(pages: Page[]): Page[] {
  const seen = new Set<string>();
  return pages.filter((p) => {
    const fingerprint = p.text.slice(0, 4000);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

async function fetchWithJina(urls: string[], timeLeft: () => number): Promise<Page[]> {
  const pages: Page[] = [];
  for (const url of urls) {
    if (timeLeft() < 3000) break;
    // Rendered HTML keeps headings, images and JSON-LD visible to the signal extractor.
    const html = await jinaFetch(url, 'html');
    if (html && !SOFT_404.test(html.slice(0, 20_000))) pages.push({ url, html, text: cleanHtml(html) });
  }
  return dedupePages(pages);
}

/** Jina Reader fetches the page from its own servers; the target was already SSRF-validated. */
async function jinaFetch(url: string, format: 'markdown' | 'html' = 'markdown'): Promise<string | null> {
  try {
    const res = await axios.get<string>(`https://r.jina.ai/${url}`, {
      timeout: 15_000,
      responseType: 'text',
      maxContentLength: 3 * 1024 * 1024,
      headers: {
        Accept: 'text/plain',
        ...(format === 'html' ? { 'X-Return-Format': 'html' } : {}),
        'User-Agent': BOT_USER_AGENT,
        ...(process.env.JINA_API_KEY ? { Authorization: `Bearer ${process.env.JINA_API_KEY}` } : {}),
      },
    });
    const text = typeof res.data === 'string' ? res.data : '';
    return text.length >= 100 ? text : null;
  } catch {
    return null;
  }
}

async function fetchSitemapUrls(origin: string): Promise<{ urls: string[]; location: string | null }> {
  const locs = (xml: string) => Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((m) => m[1]);
  const urls: string[] = [];
  const isXml = (x: string | null): x is string => !!x && /<(urlset|sitemapindex)\b/i.test(x);

  let location: string | null = `${origin}/sitemap.xml`;
  let xml = await safeGetText(location, { timeoutMs: 6000, maxBytes: 5 * 1024 * 1024 });
  if (!isXml(xml)) {
    const robots = await safeGetText(`${origin}/robots.txt`, { timeoutMs: 4000 });
    location = robots?.match(/^\s*sitemap:\s*(\S+)/im)?.[1] ?? null;
    xml = location ? await safeGetText(location, { timeoutMs: 6000, maxBytes: 5 * 1024 * 1024 }) : null;
  }
  if (!isXml(xml)) return { urls: [], location: null };

  if (/<sitemapindex/i.test(xml)) {
    // Prefer content sitemaps (posts, pages, guides) over product/image/tag ones.
    const all = locs(xml);
    const score = (u: string) => (/post|blog|article|page|guide|case|faq|help|doc|learn|resource|news|stor/i.test(u) ? 0 : /product|image|video|tag|author|categor|collection/i.test(u) ? 2 : 1);
    const children = [...all].sort((a, b) => score(a) - score(b)).slice(0, 8);
    const results = await Promise.allSettled(
      children.map((u) => safeGetText(u, { timeoutMs: 5000, maxBytes: 5 * 1024 * 1024 })),
    );
    for (const r of results) if (r.status === 'fulfilled' && r.value) urls.push(...locs(r.value));
  } else {
    urls.push(...locs(xml));
  }
  return { urls: Array.from(new Set(urls)).slice(0, SITEMAP_URL_CAP), location };
}

// ─── Page selection ───────────────────────────────────────────────────────────

function selectPriorityUrls(origin: string, domain: string, sitemapUrls: string[], count: number): string[] {
  const selected = new Set<string>();
  const sameSite = (u: string) => {
    try {
      const host = new URL(u).hostname.replace(/^www\./, '');
      return host === domain;
    } catch {
      return false;
    }
  };

  // Prefer real sitemap URLs that match priority paths, then guess the path.
  for (const path of PRIORITY_PATHS) {
    if (selected.size >= Math.ceil(count * 0.6)) break;
    const fromSitemap = sitemapUrls.find((u) => sameSite(u) && new RegExp(`^${path}/?$`, 'i').test(safePath(u)));
    selected.add(fromSitemap || `${origin}${path}`);
  }

  // Fill the rest with the highest-signal content pages from the sitemap.
  const scored = sitemapUrls
    .filter((u) => sameSite(u) && HIGH_SIGNAL_URL_PATTERNS.some((p) => p.test(u)))
    .slice(0, 500)
    .map((url) => ({ url, score: scoreUrl(url) }))
    .sort((a, b) => b.score - a.score);
  for (const { url } of scored) {
    if (selected.size >= count) break;
    selected.add(url);
  }

  // Still short (no sitemap)? use the remaining guessed paths.
  for (const path of PRIORITY_PATHS) {
    if (selected.size >= count) break;
    selected.add(`${origin}${path}`);
  }
  return Array.from(selected).slice(0, count);
}

function safePath(u: string): string {
  try {
    return new URL(u).pathname;
  } catch {
    return '';
  }
}

function scoreUrl(url: string): number {
  let score = 0;
  if (url.length > 100) score -= 2;
  if (url.includes('?') || url.includes('#')) score -= 3;
  if (/\/blog\//i.test(url)) score += 2;
  if (/\/case-stud|\/customer|\/success/i.test(url)) score += 3;
  if (/\/tutorial|\/guide|\/how-to/i.test(url)) score += 3;
  if (/\/faq|\/help/i.test(url)) score += 2;
  if (/\/docs?\//i.test(url)) score += 2;
  if (/\/page\/\d|\/tag\/|\/category\//i.test(url)) score -= 3;
  return score;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function cleanHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), Math.max(0, ms));
  });
  try {
    return await Promise.race([promise.catch(() => fallback), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Homepage-only scrape (grounds the company-context step) ─────────────────

export interface LiteScrapeResult {
  title: string;
  metaDescription: string;
  h1s: string[];
  text: string;
  success: boolean;
}

export async function scrapeHomepageLite(websiteUrl: string): Promise<LiteScrapeResult> {
  const empty: LiteScrapeResult = { title: '', metaDescription: '', h1s: [], text: '', success: false };
  let html = await safeGetText(websiteUrl, { timeoutMs: PAGE_TIMEOUT_MS, accept: 'text/html,application/xhtml+xml' });

  // JS-rendered or blocked homepage: fall back to Jina's readable text.
  if (!html || cleanHtml(html).length < 200) {
    const jina = await jinaFetch(websiteUrl);
    if (jina) {
      const title = jina.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || '';
      const text = jina.replace(/^(Title|URL Source|Markdown Content):.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 2000);
      return { title, metaDescription: '', h1s: [], text, success: text.length >= 50 };
    }
    if (!html) return empty;
  }

  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '';
  const metaDescription = (
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i)
  )?.[1]?.replace(/\s+/g, ' ').trim() || '';
  const h1s = Array.from(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 5);
  const text = cleanHtml(html).slice(0, 2000);

  return { title, metaDescription, h1s, text, success: title.length + metaDescription.length + text.length >= 50 };
}
