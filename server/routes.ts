import express, { type Express } from "express";
import { createServer, type Server } from "http";
import axios from "axios";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import { auditRequestSchema, type AuditData } from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { getMasterPrompt, getPlanSettings } from "./prompt-service";
import dodoService from "./dodo-service";
import { createPaymentLink, DODO_PRODUCTS_PAYMENT } from "./payment-link-service";
import { BatchTopicGenerator, TopicGenerationContext } from "./batch-topic-generator";
import { openRouterTracker } from "./openrouter-tracker";
import { emailService } from "./email-service";
import { loopsService } from "./loops-service";
import { reportError, getErrorLog, getErrorSummary } from "./error-monitor";
import { subscriptionService } from "./subscription-service";
import { getOpenRouterApiKeyForUser, validateOpenRouterApiKey } from "./openrouter-key-service";
import dodoPricingSync from "./dodo-pricing-sync";
import { 
  extractContentSignals, 
  generateSignalBasedStrengths,
  generateSignalBasedWeaknesses,
  generateSignalBasedRecommendations,
  type ContentSignals 
} from "./content-signal-service";
import { calculatePlatformScoresV2 } from "./scoring-service";
import { verifyAllContentTypes, filterJunkUrls } from "./content-verification-service";
import { processTopics } from "./topic-deduplication-service";
import { generatePlaybook } from "./playbook-generator-service";
import { getIndustryBenchmarks } from "./industry-benchmarks";
import { requireAuth, optionalAuth, requireAdmin, type AuthenticatedRequest } from "./auth-middleware";
import { adminDb } from "./firebase-admin";
import crypto from "crypto";
import { filterValidCompetitors } from "./domain-validator";
import { generateCitationSnapshot, type CitationSnapshotResult } from './citation-snapshot-service';
import { saveScoreHistory } from './score-history-service';
import { saveCitationSnapshot, getLatestCitationEntry, detectCitationChanges } from './citation-history-service';
import { scrapeWebsiteV2 } from './scraper-v2';
import { writeToDataset } from './audit-dataset';
import { registerApiV1 } from './api-router';
import { apiKeyAuth } from './api-key-middleware';
import {
  auditPerUserLimiter,
  aeoGenerationPerUserLimiter,
  citationRefreshPerUserLimiter,
  apiV1PerKeyLimiter,
} from './rate-limiters';
import { issueApiKey, getUserApiKey } from './api-key-service';
import { createApiPlanCheckout, handleDodoApiWebhook } from './dodo-api-billing';
import { deriveNameFromDomain } from './domain-utils';
import { runBlueprintAudit } from './blueprint-orchestrator';
import { llmCall } from './llm-router';
import path from "path";
import fs from "fs";

// Subdomains to probe via DNS before any scraping. If they resolve, they
// get crawled alongside the main domain using the same scraper path.
const SUBDOMAIN_PROBE_LIST = [
  'academy', 'docs', 'help', 'support', 'learn',
  'community', 'blog', 'developers', 'kb'
];

async function probeSubdomains(rootDomain: string): Promise<string[]> {
  const dnsMod = await import('dns');
  const found: string[] = [];
  await Promise.all(SUBDOMAIN_PROBE_LIST.map(async (sub) => {
    const host = `${sub}.${rootDomain}`;
    try {
      await dnsMod.promises.lookup(host);
      found.push(host);
    } catch {
      // doesn't resolve — skip
    }
  }));
  return found;
}

// Crawl the main URL plus any resolved subdomains with Firecrawl, merging
// the per-target results into a single payload.
async function scrapeWithFirecrawlMultiple(
  mainUrl: string,
  extraSubdomains: string[]
): Promise<{ html: string; text: string; sitemapUrls: string[]; discoveredSubdomains: string[] }> {
  const targets = [mainUrl, ...extraSubdomains.map((s) => `https://${s}`)];
  const merged = {
    html: '',
    text: '',
    sitemapUrls: [] as string[],
    discoveredSubdomains: [...extraSubdomains],
  };
  for (const url of targets) {
    try {
      const r = await scrapeWithFirecrawl(url);
      merged.html += '\n' + r.html;
      merged.text += ' ' + r.text;
      merged.sitemapUrls.push(...r.sitemapUrls);
      for (const sd of r.discoveredSubdomains) {
        if (!merged.discoveredSubdomains.includes(sd)) merged.discoveredSubdomains.push(sd);
      }
    } catch (err: any) {
      console.error(`🔥 Firecrawl failed for ${url}: ${err?.message || err}`);
    }
  }
  merged.text = merged.text.trim();
  return merged;
}

// Firecrawl-based scraper for JS-rendered sites that return little server HTML.
// Returns the same shape as scrapeWebsiteContent.
async function scrapeWithFirecrawl(websiteUrl: string): Promise<{ html: string; text: string; sitemapUrls: string[]; discoveredSubdomains: string[] }> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY is not configured — cannot crawl JS-rendered site');
  }
  const FirecrawlMod: any = await import('@mendable/firecrawl-js');
  const FirecrawlApp = FirecrawlMod.default || FirecrawlMod;
  const fc = new FirecrawlApp({ apiKey });
  const normalizedUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
  console.log(`🔥 Firecrawl: crawling ${normalizedUrl} (JS-rendered site detected)`);

  const crawlRes: any = await fc.crawlUrl(normalizedUrl, {
    limit: 50,
    scrapeOptions: { formats: ['html', 'markdown'] }
  });

  const pages: any[] = (crawlRes && (crawlRes.data || crawlRes.pages)) || [];
  console.log(`🔥 Firecrawl returned ${pages.length} pages`);

  let combinedHtml = '';
  let combinedText = '';
  const sitemapUrls: string[] = [];
  const subdomains = new Set<string>();
  const rootDomain = extractDomain(websiteUrl);

  for (const p of pages) {
    const pHtml = p.html || p.rawHtml || '';
    const pText = (p.markdown || '').toString() ||
      pHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
           .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
           .replace(/<[^>]+>/g, ' ')
           .replace(/\s+/g, ' ')
           .trim();
    combinedHtml += pHtml + '\n';
    combinedText += pText + ' ';
    const pUrl = p.metadata?.sourceURL || p.metadata?.url || p.url;
    if (pUrl) {
      sitemapUrls.push(pUrl);
      try {
        const host = new URL(pUrl).hostname;
        if (host && host !== rootDomain && host.endsWith(rootDomain)) {
          subdomains.add(host);
        }
      } catch { /* ignore */ }
    }
  }

  return {
    html: combinedHtml,
    text: combinedText.trim(),
    sitemapUrls,
    discoveredSubdomains: Array.from(subdomains)
  };
}

// Helper function to extract domain name from URL
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    // Fallback: extract domain-like pattern from string
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/);
    return match ? match[1] : url;
  }
}

type ScrapeResult = { html: string; text: string; sitemapUrls: string[]; discoveredSubdomains: string[] };

// Website scraper function to fetch HTML content for signal extraction.
// Accepts an optional AbortSignal + partial accumulator so the caller can
// enforce a global timeout and recover whatever signals were collected so far.
async function scrapeWebsiteContent(
  websiteUrl: string,
  signal?: AbortSignal,
  partial?: ScrapeResult,
  skipFirecrawl?: boolean
): Promise<ScrapeResult> {
    // SCRAPER V2: Smart SaaS-optimized scraping. 15 pages max, intelligent selection.
    const v2Result = await scrapeWebsiteV2(websiteUrl, signal, { skipFirecrawl });
    if (v2Result.html.length > 500 || v2Result.sitemapUrls.length > 0) {
      return v2Result;
    }
    console.warn('⚠️ Scraper V2 returned empty result — falling back to legacy scraper');

  const normalizedUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;

  const flush = (html: string, text: string, sitemapUrls: string[], discoveredSubdomains: string[]) => {
    if (!partial) return;
    partial.html = html;
    partial.text = text;
    partial.sitemapUrls = [...sitemapUrls];
    partial.discoveredSubdomains = [...discoveredSubdomains];
  };
  const checkAbort = (stage: string, current: ScrapeResult): ScrapeResult | null => {
    if (signal?.aborted) {
      console.log(`⏰ Scrape aborted at stage "${stage}" — returning collected signals`);
      flush(current.html, current.text, current.sitemapUrls, current.discoveredSubdomains);
      return current;
    }
    return null;
  };

  try {
    console.log(`🔍 Scraping website content from ${normalizedUrl}...`);
    const domain = extractDomain(websiteUrl);

    // Subdomain DNS probe — runs before any scraping so we know which knowledge
    // subdomains exist. They get crawled with the same scraper path chosen for
    // the main domain (standard or Firecrawl).
    console.log(`🔎 DNS-probing ${SUBDOMAIN_PROBE_LIST.length} subdomains for ${domain}...`);
    const probedSubdomains = await probeSubdomains(domain);
    if (probedSubdomains.length > 0) {
      console.log(`🔎 Resolved subdomains (${probedSubdomains.length}): ${probedSubdomains.join(', ')}`);
    } else {
      console.log(`🔎 No probed subdomains resolved`);
    }

    // Common subdomains where enterprise companies host content
    const COMMON_SUBDOMAINS = [
      'learn', 'docs', 'success', 'help', 'blog', 'support', 
      'academy', 'training', 'developer', 'developers', 'community',
      'resources', 'knowledge', 'kb', 'education', 'university',
      'api', 'status', 'partners', 'marketplace', 'store',
      'customers', 'stories', 'solutions', 'products',
      'wiki', 'forum', 'answers', 'guides', 'hub'
    ];
    
    // Fetch main page HTML. ANY failure (timeout, 403, 429, network error, etc.)
    // immediately falls back to Firecrawl — no retry of the standard scraper.
    let mainPageResponse;
    try {
      mainPageResponse = await axios.get(normalizedUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CitationRocket/1.0; +https://citationrocket.com)',
          'Accept': 'text/html,application/xhtml+xml'
        },
        maxRedirects: 5
      });
    } catch (fetchErr: any) {
      if (skipFirecrawl) {
        console.log(`🎁 skipFirecrawl — homepage fetch failed; skipping paid Firecrawl and returning collected signals`);
        const collected = partial || { html: '', text: '', sitemapUrls: [], discoveredSubdomains: probedSubdomains };
        flush(collected.html, collected.text, collected.sitemapUrls, probedSubdomains);
        return collected as ScrapeResult;
      }
      console.log(`Homepage fetch failed (${fetchErr?.message || fetchErr}) — using Firecrawl`);
      const fcResult = await scrapeWithFirecrawlMultiple(websiteUrl, probedSubdomains);
      flush(fcResult.html, fcResult.text, fcResult.sitemapUrls, fcResult.discoveredSubdomains);
      return fcResult;
    }

    const html = mainPageResponse.data || '';
    
    // Extract text content by removing HTML tags
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // JS-rendered detection: search raw HTML for known framework signatures.
    // If any are present, the site is client-rendered and the raw HTML scraper
    // will produce empty signals — switch to Firecrawl which executes JS.
    const frameworkSignatures = [
      '__NEXT_DATA__',
      '__NUXT__',
      'ng-version',
      'data-reactroot',
      '/_next/',
      '/nuxt/',
      'ember',
      'vue',
      'svelte',
    ];
    console.log(`📄 Homepage HTML (first 500 chars): ${html.slice(0, 500)}`);
    const hasFrameworkSignature = frameworkSignatures.some((sig) => html.includes(sig));
    if (hasFrameworkSignature && !skipFirecrawl) {
      console.log('JS framework detected — using Firecrawl');
      try {
        const fcResult = await scrapeWithFirecrawlMultiple(websiteUrl, probedSubdomains);
        flush(fcResult.html, fcResult.text, fcResult.sitemapUrls, fcResult.discoveredSubdomains);
        return fcResult;
      } catch (fcErr: any) {
        console.error(`🔥 Firecrawl scrape failed: ${fcErr?.message || fcErr}. Falling back to raw HTML path.`);
        // fall through to existing scraper so we at least return something
      }
    } else if (hasFrameworkSignature && skipFirecrawl) {
      console.log('🎁 skipFirecrawl — JS framework detected but using free raw-HTML path (Firecrawl skipped)');
    } else {
      console.log('No JS framework detected — using standard scraper');
    }
    
    // SUBDOMAIN DETECTION: Try to fetch sitemaps from main domain AND common subdomains
    let allSitemapUrls: string[] = [];
    const discoveredSubdomains: string[] = [];
    
    // Helper to fetch sitemap from a domain (supports sitemap index files)
    const fetchSitemapUrls = async (targetDomain: string): Promise<string[]> => {
      try {
        const sitemapResponse = await axios.get(`https://${targetDomain}/sitemap.xml`, {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CitationRocket/1.0)' },
          maxRedirects: 5
        });
        const sitemapData = sitemapResponse.data || '';
        
        // Check if this is a sitemap INDEX (contains <sitemap> tags pointing to other sitemaps)
        const sitemapIndexMatches = sitemapData.match(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi) || [];
        
        if (sitemapIndexMatches.length > 0) {
          // This is a sitemap index - fetch child sitemaps
          console.log(`   📑 Found sitemap index with ${sitemapIndexMatches.length} child sitemaps`);
          const childSitemapUrls = sitemapIndexMatches
            .map((m: string) => {
              const locMatch = m.match(/<loc>([^<]+)<\/loc>/i);
              return locMatch ? locMatch[1] : '';
            })
            .filter((url: string) => url);
          
          // Fetch up to 30 child sitemaps in parallel
          const allUrls: string[] = [];
          const childPromises = childSitemapUrls.slice(0, 30).map(async (childUrl: string) => {
            try {
              const childResponse = await axios.get(childUrl, {
                timeout: 5000,
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CitationRocket/1.0)' },
                maxRedirects: 5
              });
              const urlMatches = childResponse.data.match(/<loc>([^<]+)<\/loc>/gi) || [];
              return urlMatches.map((m: string) => m.replace(/<\/?loc>/gi, ''));
            } catch {
              return [];
            }
          });
          
          const childResults = await Promise.all(childPromises);
          for (const urls of childResults) {
            allUrls.push(...urls);
          }
          return allUrls;
        }
        
        // Regular sitemap - extract <loc> URLs directly
        const matches = sitemapData.match(/<loc>([^<]+)<\/loc>/gi) || [];
        return matches.map((m: string) => m.replace(/<\/?loc>/gi, ''));
      } catch {
        return [];
      }
    };
    
    // Fetch main domain sitemap first (try sitemap.xml, then robots.txt)
    let mainSitemapUrls = await fetchSitemapUrls(domain);
    if (mainSitemapUrls.length === 0) {
      // Try robots.txt for sitemap references
      try {
        const robotsResponse = await axios.get(`https://${domain}/robots.txt`, {
          timeout: 5000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CitationRocket/1.0)' },
          maxRedirects: 5
        });
        const sitemapMatches = robotsResponse.data.match(/sitemap:\s*(\S+)/gi) || [];
        console.log(`   📋 Found ${sitemapMatches.length} sitemap references in robots.txt`);
        for (const match of sitemapMatches) {
          const sitemapUrl = match.replace(/sitemap:\s*/i, '').trim();
          try {
            const sitemapResponse = await axios.get(sitemapUrl, {
              timeout: 8000,
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CitationRocket/1.0)' },
              maxRedirects: 5
            });
            const sitemapData = sitemapResponse.data || '';
            
            // Check for sitemap index
            const indexMatches = sitemapData.match(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi) || [];
            if (indexMatches.length > 0) {
              console.log(`   📑 Sitemap index with ${indexMatches.length} children`);
              // Extract child sitemap URLs and fetch them
              for (const indexMatch of indexMatches.slice(0, 30)) {
                const childLocMatch = indexMatch.match(/<loc>([^<]+)<\/loc>/i);
                if (childLocMatch) {
                  try {
                    const childResponse = await axios.get(childLocMatch[1], {
                      timeout: 5000,
                      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CitationRocket/1.0)' }
                    });
                    const childUrls = childResponse.data.match(/<loc>([^<]+)<\/loc>/gi) || [];
                    mainSitemapUrls.push(...childUrls.map((m: string) => m.replace(/<\/?loc>/gi, '')));
                  } catch { /* skip */ }
                }
              }
            } else {
              const urlMatches = sitemapData.match(/<loc>([^<]+)<\/loc>/gi) || [];
              mainSitemapUrls.push(...urlMatches.map((m: string) => m.replace(/<\/?loc>/gi, '')));
            }
          } catch { /* skip inaccessible sitemaps */ }
        }
      } catch { /* robots.txt not accessible */ }
    }
    allSitemapUrls = [...mainSitemapUrls];
    console.log(`📊 Main domain ${domain}: ${mainSitemapUrls.length} sitemap URLs`);
    
    // Helper to check robots.txt for sitemap locations
    const fetchSitemapsFromRobots = async (targetDomain: string): Promise<string[]> => {
      try {
        const robotsResponse = await axios.get(`https://${targetDomain}/robots.txt`, {
          timeout: 3000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CitationRocket/1.0)' }
        });
        const sitemapMatches = robotsResponse.data.match(/sitemap:\s*(\S+)/gi) || [];
        const sitemapUrls: string[] = [];
        for (const match of sitemapMatches) {
          const sitemapUrl = match.replace(/sitemap:\s*/i, '').trim();
          try {
            const sitemapResponse = await axios.get(sitemapUrl, {
              timeout: 5000,
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CitationRocket/1.0)' }
            });
            const urlMatches = sitemapResponse.data.match(/<loc>([^<]+)<\/loc>/gi) || [];
            sitemapUrls.push(...urlMatches.map((m: string) => m.replace(/<\/?loc>/gi, '')));
          } catch { /* skip inaccessible sitemaps */ }
        }
        return sitemapUrls;
      } catch {
        return [];
      }
    };
    
    // Check common subdomains in parallel using GET (HEAD often blocked)
    console.log(`🔎 Checking ${COMMON_SUBDOMAINS.length} common subdomains...`);
    const subdomainPromises = COMMON_SUBDOMAINS.map(async (subdomain) => {
      const subdomainHost = `${subdomain}.${domain}`;
      try {
        // Use GET with short timeout - more reliable than HEAD
        await axios.get(`https://${subdomainHost}`, {
          timeout: 4000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CitationRocket/1.0)' },
          maxContentLength: 100000  // Limit response size
        });
        // Subdomain exists - try sitemap.xml first, then robots.txt
        let subSitemapUrls = await fetchSitemapUrls(subdomainHost);
        if (subSitemapUrls.length === 0) {
          // Try robots.txt for sitemap references
          subSitemapUrls = await fetchSitemapsFromRobots(subdomainHost);
        }
        if (subSitemapUrls.length > 0) {
          console.log(`   ✅ ${subdomainHost}: ${subSitemapUrls.length} URLs`);
        } else {
          console.log(`   📄 ${subdomainHost}: exists (will scrape pages)`);
        }
        // ALWAYS return subdomain as "exists" so we can scrape its pages
        return { subdomain: subdomainHost, urls: subSitemapUrls, exists: true };
      } catch {
        return { subdomain: subdomainHost, urls: [], exists: false };
      }
    });
    
    const subdomainResults = await Promise.all(subdomainPromises);
    for (const result of subdomainResults) {
      // Add sitemap URLs if found
      if (result.urls.length > 0) {
        allSitemapUrls = [...allSitemapUrls, ...result.urls];
      }
      // Include subdomain in discoveredSubdomains if it EXISTS (regardless of sitemap)
      if (result.exists) {
        discoveredSubdomains.push(result.subdomain);
      }
    }

    // Seed any DNS-probed subdomains the GET probe missed (e.g. blocks GET but
    // resolves DNS) so the per-subdomain page-scraping loop still hits them.
    for (const probed of probedSubdomains) {
      if (!discoveredSubdomains.includes(probed)) {
        discoveredSubdomains.push(probed);
      }
    }
    
    // Dedupe and cap to prevent OOM on huge sites (e.g. ikea.com has 100k+ URLs)
    const SITEMAP_URL_CAP = 5000;
    const beforeDedupe = allSitemapUrls.length;
    allSitemapUrls = Array.from(new Set(allSitemapUrls));
    if (allSitemapUrls.length > SITEMAP_URL_CAP) {
      console.log(`⚠️  Sitemap URL count ${allSitemapUrls.length} exceeds cap ${SITEMAP_URL_CAP} — truncating for memory safety`);
      allSitemapUrls = allSitemapUrls.slice(0, SITEMAP_URL_CAP);
    }
    console.log(`📊 Total: ${allSitemapUrls.length} URLs (deduped from ${beforeDedupe}) across ${1 + discoveredSubdomains.length} domains`);
    if (allSitemapUrls.length > 500) {
      console.log(`🏢 Large site detected: ${allSitemapUrls.length} URLs across ${1 + discoveredSubdomains.length} subdomains`);
    }
    if (discoveredSubdomains.length > 0) {
      console.log(`   Subdomains with content: ${discoveredSubdomains.join(', ')}`);
    }
    
    // Try to fetch additional pages for more signal data (main domain)
    let combinedHtml = html;
    let combinedText = text;
    const additionalPages = ['/blog', '/about', '/docs', '/resources', '/case-studies', '/faq', '/help'];

    // Checkpoint after sitemap + subdomain discovery
    {
      const aborted = checkAbort('post-discovery', { html: combinedHtml, text: combinedText, sitemapUrls: allSitemapUrls, discoveredSubdomains });
      if (aborted) return aborted;
      flush(combinedHtml, combinedText, allSitemapUrls, discoveredSubdomains);
    }

    for (const page of additionalPages) {
      if (signal?.aborted) break;
      try {
        const pageUrl = new URL(page, normalizedUrl).toString();
        const pageResponse = await axios.get(pageUrl, {
          timeout: 5000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CitationRocket/1.0)' }
        });
        
        const pageHtml = pageResponse.data || '';
        const pageText = pageHtml
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        combinedHtml += ' ' + pageHtml;
        combinedText += ' ' + pageText;
        console.log(`   📄 Scraped ${page}: ${pageText.length} chars`);
      } catch {
        // Page not accessible, skip silently
      }
    }
    
    // Checkpoint after main-domain extra pages
    {
      const aborted = checkAbort('post-main-pages', { html: combinedHtml, text: combinedText, sitemapUrls: allSitemapUrls, discoveredSubdomains });
      if (aborted) return aborted;
      flush(combinedHtml, combinedText, allSitemapUrls, discoveredSubdomains);
    }

    // SUBDOMAIN PAGE SCRAPING: Fetch key pages from discovered subdomains
    for (const subdomain of discoveredSubdomains) {
      if (signal?.aborted) break;
      const subdomainPaths = ['/', '/tutorials', '/guides', '/courses', '/getting-started', '/documentation', '/how-to', '/training', '/learn'];
      for (const path of subdomainPaths) {
        if (signal?.aborted) break;
        try {
          const subUrl = `https://${subdomain}${path}`;
          const subResponse = await axios.get(subUrl, {
            timeout: 8000,
            maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
          });
          const subText = (subResponse.data || '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          combinedText += ' ' + subText;
          console.log(`   📄 Scraped ${subdomain}${path}: ${subText.length} chars`);
        } catch {
          // Skip inaccessible pages
        }
      }
    }
    
    // Sample sitemap URLs for BOTH text AND HTML content
    // Use deterministic, evenly-spaced sampling for diverse page coverage
    const selectDiverseSample = (urls: string[], maxCount: number): string[] => {
      if (urls.length <= maxCount) return [...urls];
      const sorted = [...urls].sort();
      const step = Math.floor(sorted.length / maxCount);
      const sample: string[] = [];
      for (let i = 0; i < sorted.length && sample.length < maxCount; i += step) {
        sample.push(sorted[i]);
      }
      return sample;
    };
    
    const prioritizedUrls = allSitemapUrls.filter(url => 
      discoveredSubdomains.some(sub => url.includes(sub))
    );
    const subdomainSample = selectDiverseSample(prioritizedUrls, 10);
    const mainDomainSample = selectDiverseSample(mainSitemapUrls, 10);
    const sampleUrlSet = new Set([...subdomainSample, ...mainDomainSample]);
    const sampleUrls = Array.from(sampleUrlSet).slice(0, 20);
    
    // Checkpoint before sample-URL fetching (the most expensive stage)
    {
      const aborted = checkAbort('post-subdomain-pages', { html: combinedHtml, text: combinedText, sitemapUrls: allSitemapUrls, discoveredSubdomains });
      if (aborted) return aborted;
      flush(combinedHtml, combinedText, allSitemapUrls, discoveredSubdomains);
    }

    let sampledPagesCount = 0;
    const sampleFetchPromises = sampleUrls.map(async (sampleUrl) => {
      try {
        const sampleResponse = await axios.get(sampleUrl, {
          timeout: 3000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CitationRocket/1.0)' },
          maxContentLength: 500000
        });
        return sampleResponse.data || '';
      } catch {
        return '';
      }
    });
    
    const sampleResults = await Promise.all(sampleFetchPromises);
    for (const rawHtml of sampleResults) {
      if (!rawHtml) continue;
      sampledPagesCount++;
      combinedHtml += ' ' + rawHtml;
      const sampleText = rawHtml
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      combinedText += ' ' + sampleText;
    }
    console.log(`📊 Sampled ${sampledPagesCount}/${sampleUrls.length} sitemap pages for signal detection`);
    
    console.log(`✅ Scraped ${combinedHtml.length} bytes of HTML, ${combinedText.length} characters of text`);
    return { html: combinedHtml, text: combinedText, sitemapUrls: allSitemapUrls, discoveredSubdomains };
    
  } catch (error: any) {
    console.log(`⚠️ Website scraping failed: ${error.message}`);
    return { html: '', text: '', sitemapUrls: [], discoveredSubdomains: [] };
  }
}

// Anti-hallucination: Sanitize search volumes to ensure they use ranges
function sanitizeSearchVolume(volume: string): string {
  if (!volume) return 'Estimated: 500-2,000/month';
  
  // Already in correct format
  if (volume.toLowerCase().startsWith('estimated:') && volume.includes('-')) {
    return volume;
  }
  
  // Extract exact number and convert to range
  const numMatch = volume.match(/(\d[\d,]*)/);
  if (numMatch) {
    const num = parseInt(numMatch[1].replace(/,/g, ''));
    const lower = Math.floor(num * 0.7);
    const upper = Math.ceil(num * 1.3);
    return `Estimated: ${lower.toLocaleString()}-${upper.toLocaleString()}/month`;
  }
  
  return 'Estimated: 500-2,000/month';
}

// Strip Perplexity citation markers like [1], [2], [3] from text
function stripCitationMarkers(text: string): string {
  if (!text) return text;
  return text
    .replace(/\[\d+\]/g, '')  // Remove [1], [2], etc.
    .replace(/\s{2,}/g, ' ')  // Clean up double spaces
    .trim();
}

// Sanitize an array of strings - strip citation markers
function sanitizeStringArray(arr: string[]): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(s => stripCitationMarkers(s || ''));
}

// Robust JSON parser with auto-repair for malformed AI responses
function parseRobustJSON(jsonString: string): any {
  // First try normal parse
  try {
    return JSON.parse(jsonString);
  } catch (parseError) {
    console.log('⚠️ JSON parse failed, attempting repair...');
    
    let repaired = jsonString.trim();
    
    // STEP 1: Fix truncated strings by checking for unclosed quotes
    let inString = false;
    let lastQuotePos = -1;
    for (let i = 0; i < repaired.length; i++) {
      if (repaired[i] === '"' && (i === 0 || repaired[i - 1] !== '\\')) {
        inString = !inString;
        if (inString) lastQuotePos = i;
      }
    }
    if (inString) {
      // We're in an unclosed string - find a safe truncation point
      // Truncate to last complete element before this string
      const beforeString = repaired.substring(0, lastQuotePos);
      const lastSafePoint = Math.max(
        beforeString.lastIndexOf('",'),
        beforeString.lastIndexOf('"],'),
        beforeString.lastIndexOf('"}'),
        beforeString.lastIndexOf('"]')
      );
      if (lastSafePoint > 0) {
        repaired = repaired.substring(0, lastSafePoint + 2);
      } else {
        repaired += '"';
      }
    }
    
    // STEP 2: Handle truncated arrays - find last complete element
    // Look for patterns like ["item1", "item2", "incomple...
    const arrayPattern = /\[\s*"[^"]*"(?:\s*,\s*"[^"]*")*\s*,?\s*$/;
    if (arrayPattern.test(repaired)) {
      // Find last complete string in array
      const matches = repaired.match(/"[^"]*"/g);
      if (matches && matches.length > 0) {
        const lastCompleteString = matches[matches.length - 1];
        const lastCompletePos = repaired.lastIndexOf(lastCompleteString);
        if (lastCompletePos > 0) {
          repaired = repaired.substring(0, lastCompletePos + lastCompleteString.length);
        }
      }
    }
    
    // STEP 3: For objects with arrays, find last complete array element
    if (repaired.includes('[')) {
      // Check each array for incomplete last element
      let result = repaired;
      const arrayStart = result.indexOf('[');
      if (arrayStart > 0) {
        // Find the last complete "string", pattern in any array
        const lastGoodComma = result.lastIndexOf('",');
        const lastGoodBracket = result.lastIndexOf('"]');
        const lastGood = Math.max(lastGoodComma, lastGoodBracket);
        
        if (lastGood > arrayStart) {
          // Check if there's incomplete content after
          const afterGood = result.substring(lastGood + 2).trim();
          if (afterGood && !afterGood.startsWith(']') && !afterGood.startsWith('}') && !afterGood.startsWith('"')) {
            result = result.substring(0, lastGood + 2);
          }
        }
      }
      repaired = result;
    }
    
    // STEP 4: Remove incomplete objects in arrays
    if (repaired.includes('[{')) {
      const lastCompleteObject = repaired.lastIndexOf('},');
      const lastObjectClose = repaired.lastIndexOf('}]');
      if (lastCompleteObject > lastObjectClose && lastCompleteObject > 0) {
        repaired = repaired.substring(0, lastCompleteObject + 1);
      }
    }
    
    // STEP 5: For plain objects, remove trailing incomplete properties
    if (repaired.startsWith('{') && !repaired.includes('[')) {
      const lastQuote = repaired.lastIndexOf('"');
      const lastColon = repaired.lastIndexOf(':');
      const lastComma = repaired.lastIndexOf(',');
      
      if (lastColon > lastComma && lastQuote > lastColon) {
        repaired = repaired.substring(0, lastComma > 0 ? lastComma : repaired.lastIndexOf('}'));
      }
    }
    
    // STEP 6: Remove trailing commas before closing brackets
    repaired = repaired.replace(/,(\s*)$/, '$1');
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
    
    // STEP 7: Balance brackets and braces
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    
    repaired += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
    repaired += '}'.repeat(Math.max(0, openBraces - closeBraces));
    
    try {
      const result = JSON.parse(repaired);
      console.log('⚠️ JSON repaired (partial data may be missing)');
      return result;
    } catch (repairError) {
      console.error('❌ JSON repair failed:', repairError);
      throw parseError; // Throw original error
    }
  }
}

// Validate competitor analysis has required fields with actual data
function validateCompetitorAnalysis(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  
  // Check required arrays exist and have at least some data
  const requiredArrays = ['mainCompetitors', 'competitorStrengths', 'competitorWeaknesses', 'marketOpportunities'];
  for (const field of requiredArrays) {
    if (!Array.isArray(data[field])) return false;
    // At least one field should have data for valid analysis
  }
  
  // Valid if at least one array has data
  const totalItems = requiredArrays.reduce((sum, field) => sum + (data[field]?.length || 0), 0);
  return totalItems > 0;
}

// Sanitize topics to remove hallucinated exact metrics and citation markers
function sanitizeTopics(topics: any[]): any[] {
  const validContentTypes = ['tutorial', 'case-study', 'faq', 'data-driven', 'framework', 'how-to'];
  const validDifficulties = ['Easy', 'Medium', 'Hard'];
  const validEfforts = ['Low', 'Medium', 'High'];
  const validPriorityTiers = ['Quick Win', 'High Impact', 'Long-term'];
  
  return topics.map(topic => ({
    ...topic,
    topic: stripCitationMarkers(topic.topic || ''),
    searchVolume: sanitizeSearchVolume(topic.searchVolume || ''),
    justification: stripCitationMarkers((topic.justification || '').replace(/cited?\s*\d+\s*times?/gi, 'has citation potential')),
    competitorGap: stripCitationMarkers(topic.competitorGap || ''),
    // Actionable metrics (replaces meaningless scoreImpact %)
    difficulty: validDifficulties.includes(topic.difficulty) ? topic.difficulty : 'Medium',
    effort: validEfforts.includes(topic.effort) ? topic.effort : 'Medium',
    priorityTier: validPriorityTiers.includes(topic.priorityTier) ? topic.priorityTier : 'High Impact',
    timeEstimate: topic.timeEstimate || '3-5 hours',
    // Branding and platform targeting
    isBranded: topic.isBranded === true,
    targetPlatform: ['chatgpt', 'perplexity', 'gemini', 'claude'].includes(topic.targetPlatform) ? topic.targetPlatform : 'chatgpt',
    gapFilled: topic.gapFilled || 'tutorials',
    // Content type and platforms
    contentType: validContentTypes.includes(topic.contentType) ? topic.contentType : 'how-to',
    platforms: Array.isArray(topic.platforms) ? topic.platforms : [topic.targetPlatform || 'chatgpt']
  }));
}

// ENHANCED MASTER PROMPT - Optimized for Real Data Generation
const MASTER_PROMPT = `You are an expert AI Search Engine Optimization analyst with deep industry knowledge.

TASK: Browse {WEBSITE_URL} thoroughly, research actual competitors, and provide a comprehensive AI citation audit.

CRITICAL INSTRUCTIONS:
1. Browse the actual website and read its content
2. Research real competitors in the same industry
3. Generate REAL data - NO placeholders, NO templates, NO generic text
4. Every topic must be a SPECIFIC question relevant to this exact business
5. All estimates must be realistic based on actual market research
6. Generate EXACTLY {TOPIC_COUNT} unique topics per category

Return this EXACT JSON structure with REAL data:

{
  "companyIntelligence": {
    "industry": "detected industry",
    "businessType": "business model type",
    "targetAudience": "primary audience",
    "valueProposition": "key value proposition",
    "marketPosition": "market positioning"
  },
  "competitorAnalysis": {
    "mainCompetitors": ["competitor1.com", "competitor2.com", "competitor3.com"],
    "competitorStrengths": ["competitor strength 1", "competitor strength 2"],
    "competitorWeaknesses": ["competitor weakness 1", "competitor weakness 2"],
    "marketOpportunities": ["opportunity 1", "opportunity 2"]
  },
  "auditResults": {
    "overallScore": [number between 0-100],
    "letterGrade": "[A+, A, A-, B+, B, B-, C+, C, C-, D+, D, F]",
    "platformScores": {
      "chatgpt": [number between 0-100],
      "perplexity": [number between 0-100], 
      "gemini": [number between 0-100],
      "claude": [number between 0-100]
    },
    "strengths": [
      "strength 1",
      "strength 2", 
      "strength 3"
    ],
    "weaknesses": [
      "weakness 1",
      "weakness 2",
      "weakness 3"
    ],
    "technicalFindings": {
      "domainAuthority": "[High/Medium/Low]",
      "contentStructure": "[Excellent/Good/Fair/Poor]",
      "schemaMarkup": "[Implemented/Partial/Missing]",
      "entityRecognition": "[Strong/Moderate/Weak]"
    }
  },
  "contentTopics": {
    "authoritative": [
      // Generate {TOPIC_COUNT} authoritative topics (85-95% confidence)
      // Each topic must be a REAL question specific to this website's industry
      // Example: "What are the key factors when choosing a yacht charter in the Mediterranean?"
      // NOT: "question 1", "industry question", "topic 1"
    ],
    "thoughtLeadership": [
      // Generate {TOPIC_COUNT} thought leadership topics (70-84% confidence)
      // Focus on industry trends, innovations, expert insights
    ],
    "competitiveAdvantage": [
      // Generate {TOPIC_COUNT} competitive advantage topics (50-69% confidence)
      // MUST analyze what makes THIS specific company unique vs competitors
      // Example: "Why choose [CompanyName]'s personalized approach over [Competitor]?"
      // NOT generic: "competitive question 1"
    ],
    "emergingOpportunity": [
      // Generate {TOPIC_COUNT} emerging opportunity topics (30-49% confidence)
      // Focus on future trends, new technologies, market changes
    ]
  },
  "visibilityPotential": {
    "overallPotential": "High/Medium/Low based on content quality analysis",
    "platformAlignment": {
      "chatgpt": "Strong/Moderate/Weak alignment potential",
      "perplexity": "Strong/Moderate/Weak alignment potential",
      "gemini": "Strong/Moderate/Weak alignment potential",
      "claude": "Strong/Moderate/Weak alignment potential"
    },
    "contentStrengths": ["Content areas with high citation potential"]
  },
  "competitorGaps": {
    "opportunityAreas": ["Areas where competitors lack content"],
    "contentAdvantages": ["Your content advantages"]
  },
  "disclaimers": {
    "note": "Scores indicate content alignment potential, not actual citation counts which cannot be measured.",
    "searchVolumeNote": "All search volumes are estimates presented as ranges."
  },
  "marketContext": {
    "industryTrends": ["trend 1", "trend 2", "trend 3"]
  },
  "recommendations": [
    "recommendation 1",
    "recommendation 2", 
    "recommendation 3"
  ]
}

CRITICAL REQUIREMENTS - STRICT COMPLIANCE MANDATORY:

1. BROWSE {WEBSITE_URL} - Read actual content, not assumptions
2. RESEARCH COMPETITORS - Find real competitors in same industry  
3. GENERATE {TOPIC_COUNT} UNIQUE TOPICS PER CATEGORY - Total: {TOTAL_TOPICS} topics
4. ANTI-HALLUCINATION RULES:
   - Search volumes: ONLY use "Estimated: [range]/month" format (e.g., "Estimated: 1,500-3,000/month")
   - NEVER make up exact numbers like "2,400/month" or "3,200 monthly searches"
   - Confidence scores indicate content alignment potential, NOT citation counts
   - All metrics are estimates based on content quality analysis
5. NO PLACEHOLDERS ALLOWED:
   - NOT: "question 1", "reasoning", "estimate", "advantage"
   - YES: "What are the best yacht charter destinations for families in Greece?", "Estimated: 1,500-3,000/month"
6. Each topic MUST be:
   - Specific to THIS business (mention company name if relevant)
   - In question format
   - Unique (no duplicates)
   - Based on real website content and competitive analysis

EXAMPLE OF GOOD TOPIC (generate similar quality):
{
  "topic": "What are the legal requirements for yacht chartering in the Mediterranean?",
  "confidence": 92,
  "justification": "Website shows expertise in Mediterranean charters, competitors have outdated legal info",
  "platforms": ["chatgpt", "perplexity", "gemini"],
  "searchVolume": "Estimated: 1,500-3,000/month",
  "competitionLevel": "Medium",
  "competitorGap": "Competitors like YachtWorld focus on listings but lack comprehensive legal guides"
}

FORBIDDEN OUTPUTS (DELETE if generated):
- Exact search volumes like "2,400/month" - use "Estimated: 1,500-3,000/month" instead
- Claims about citation counts or frequency
- Specific numbers you cannot verify

DO NOT copy this example - generate {TOPIC_COUNT} completely unique topics based on analyzing {WEBSITE_URL}.

Website to analyze: {WEBSITE_URL}`;

export async function registerRoutes(app: Express): Promise<Server> {
  // Security middleware
  const baseCspDirectives = {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "https:", "https://*.googleusercontent.com"],
    scriptSrc: process.env.NODE_ENV === "development" 
      ? ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.googletagmanager.com", "https://apis.google.com"] 
      : ["'self'", "https://www.googletagmanager.com", "https://apis.google.com"],
    connectSrc: process.env.NODE_ENV === "development"
      ? [
          "'self'", 
          "ws:", 
          "wss:", 
          "https://*.googleapis.com",
          "https://*.firebaseio.com",
          "https://firebaseinstallations.googleapis.com",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com",
          "https://accounts.google.com"
        ]
      : [
          "'self'",
          "https://*.googleapis.com",
          "https://*.firebaseio.com",
          "https://firebaseinstallations.googleapis.com",
          "https://identitytoolkit.googleapis.com",
          "https://securetoken.googleapis.com",
          "https://accounts.google.com"
        ],
    frameSrc: ["'self'", "https://ai-citation-51aba.firebaseapp.com", "https://accounts.google.com", "https://*.google.com"],
  };

  const strictHelmet = helmet({
    contentSecurityPolicy: { directives: baseCspDirectives },
    // Default X-Frame-Options: SAMEORIGIN — the whole app is not embeddable elsewhere.
  });

  // Public admin-shared audit reports are the one surface meant to be
  // embedded on external sites (e.g. via a cold-email/marketing iframe), so
  // this permissive policy is scoped ONLY to the /share/:token page and its
  // read-only public API — everything else keeps the strict, same-origin-only
  // frame policy above.
  const embeddableHelmet = helmet({
    contentSecurityPolicy: {
      directives: { ...baseCspDirectives, frameAncestors: ["*"] },
    },
    frameguard: false, // don't send X-Frame-Options: SAMEORIGIN for this route
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/share/') || req.path.startsWith('/api/public/audit/')) {
      return embeddableHelmet(req, res, next);
    }
    return strictHelmet(req, res, next);
  });
  
  const strictCors = cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        // Chrome extension (any extension ID)
        /^chrome-extension:\/\//,
        // Your app domains
        'https://app.citationrocket.com',
        'https://citationrocket.com',
      ];

      // In development allow everything
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      // Check against allowed list
      const allowed = allowedOrigins.some(o =>
        typeof o === 'string' ? o === origin : o.test(origin)
      );

      if (allowed) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS: ' + origin));
      }
    },
    credentials: true
  });

  // The anonymous extension capture endpoint is called by the content script
  // running ON the scanned website, so the request Origin is the scanned
  // site's (e.g. https://billiontags.com) — never one of our domains. It is
  // unauthenticated by design and uses no cookies, so it must accept any
  // origin or every data-moat capture gets blocked by the strict policy.
  const openCors = cors({ origin: true, credentials: false });

  app.use((req, res, next) => {
    if (req.path === '/api/extension/capture') {
      return openCors(req, res, next);
    }
    return strictCors(req, res, next);
  });

  // Rate limiting - 10 requests per 15 minutes
  const auditLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 audit requests per 15 min per IP
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply rate limiting to audit endpoint
  app.use('/api/audit', auditLimiter);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      service: 'AI Readiness Optimizer API'
    });
  });

  app.get('/api/download/architecture', (req, res) => {
    const filePath = path.resolve('public/citation-rocket-architecture.txt');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="citation-rocket-architecture.txt"');
      res.setHeader('Cache-Control', 'no-cache');
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  });

  app.get('/api/download/technical-docs', (req, res) => {
    const filePath = path.resolve('TECHNICAL_DOCUMENTATION.md');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="TECHNICAL_DOCUMENTATION.md"');
      res.setHeader('Cache-Control', 'no-cache');
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  });

  // Payment link creation endpoint
  // Create coupon in DODO when admin creates it
  app.post('/api/admin/citation-cron', async (req, res) => {
    console.log('\n========== ADMIN CITATION CRON TRIGGER ==========');
    const cronSecret = process.env.DODO_WEBHOOK_SECRET;
    const providedSecret = req.headers['x-cron-secret'] as string;

    if (!cronSecret || providedSecret !== cronSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const { runCitationRefreshCycle } = await import('./citation-scheduler');
      const result = await runCitationRefreshCycle();
      return res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('❌ Citation cron trigger failed:', err.message);
      return res.status(500).json({ error: 'Citation cron failed', message: err.message });
    }
  });

  // ── Admin: system health / error log ────────────────────────────────────────
  app.get('/api/admin/system-health', async (req: any, res) => {
    try {
      if (!req.user?.uid) return res.status(401).json({ error: 'Unauthorized' });

      // Verify admin
      const { initializeApp: _initApp, getApp: _getApp } = await import('firebase/app');
      const { getFirestore: _getFirestore, doc, getDoc } = await import('firebase/firestore');
      const _fbConfig = {
        apiKey: process.env.VITE_FIREBASE_API_KEY,
        authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      };
      let _db: any;
      try { _db = _getFirestore(_initApp(_fbConfig, 'admin-health-app')); }
      catch { try { _db = _getFirestore(_getApp('admin-health-app')); } catch { _db = _getFirestore(_initApp(_fbConfig)); } }
      const db = _db;
      const userRef = doc(db, 'users', req.user.uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists() || !userDoc.data()?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const recentErrors = getErrorLog(50);
      const summary = getErrorSummary();

      return res.json({
        recentErrors,
        summary,
        totalErrors: recentErrors.length,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to load system health' });
    }
  });

  app.post('/api/admin/coupons/create', requireAdmin, async (req, res) => {
    console.log('\n========== ADMIN COUPON CREATION ==========');
    console.log('📥 Time:', new Date().toISOString());
    console.log('📋 Request:', req.body);
    
    try {
      const { code, discountType, discountValue, applicablePlans, maxUses, validUntil } = req.body;

      // Validate required fields
      if (!code || !discountType || !discountValue || !applicablePlans) {
        return res.status(400).json({ 
          success: false,
          error: 'Missing required fields: code, discountType, discountValue, applicablePlans' 
        });
      }

      // Create discount in DODO
      const result = await dodoService.createDiscount({
        code,
        discountType,
        discountValue,
        applicablePlans,
        maxUses,
        validUntil: validUntil ? new Date(validUntil) : undefined
      });

      if (result.success) {
        console.log('✅ Coupon created in DODO:', result.code);
        console.log('🆔 DODO Discount ID:', result.discountId);
        console.log('==========================================\n');

        res.json({ 
          success: true, 
          discountId: result.discountId,
          code: result.code,
          message: 'Coupon created successfully in DODO Payments'
        });
      } else {
        console.error('❌ Failed to create DODO discount:', result.error);
        console.log('==========================================\n');
        
        res.status(500).json({ 
          success: false,
          error: result.error || 'Failed to create discount in DODO'
        });
      }
    } catch (error: any) {
      console.error('❌ ERROR:', error.message);
      console.log('==========================================\n');
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to create coupon'
      });
    }
  });

  // Sync pricing to DODO products
  app.post('/api/admin/sync-pricing', requireAdmin, async (req, res) => {
    console.log('\n========== SYNC PRICING TO DODO ==========');
    console.log('📥 Time:', new Date().toISOString());
    console.log('📋 Request:', req.body);
    
    try {
      const { plan, monthlyPrice, annualPrice } = req.body;
      
      // Validate inputs
      if (!plan || !monthlyPrice || !annualPrice) {
        return res.status(400).json({ 
          success: false,
          error: 'Missing required fields: plan, monthlyPrice, annualPrice' 
        });
      }

      // Validate plan name
      if (!['starter', 'pro', 'enterprise'].includes(plan)) {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid plan name. Must be: starter, pro, or enterprise' 
        });
      }

      console.log(`🔄 Syncing ${plan} pricing to DODO products...`);

      // Sync to DODO
      const result = await dodoPricingSync.syncPlanPricing({
        plan,
        monthlyPrice,
        annualPrice
      });

      console.log('✅ Sync result:', result);
      console.log('==========================================\n');

      if (result.success) {
        res.json({ 
          success: true,
          message: `Successfully synced ${plan} pricing to DODO`,
          results: result.results
        });
      } else {
        res.status(500).json({ 
          success: false,
          error: 'Failed to sync some products',
          results: result.results
        });
      }
    } catch (error: any) {
      console.error('❌ ERROR:', error.message);
      console.log('==========================================\n');
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to sync pricing'
      });
    }
  });

  // ========== ADMIN PLAN MANAGEMENT ==========

  // Get all custom plans
  // NOTE: intentionally public (no requireAdmin) — the public pricing page
  // (client/src/pages/pricing.tsx) calls this unauthenticated to render
  // custom plans for anonymous visitors. Only read access to plan display
  // data is exposed here; no secrets or user data. Write endpoints below
  // (POST/PATCH/DELETE) remain admin-only.
  app.get('/api/admin/plans', async (req, res) => {
    console.log('\n========== GET CUSTOM PLANS ==========');
    try {
      const { initializeApp, getApp } = await import('firebase/app');
      const { getFirestore, doc, getDoc } = await import('firebase/firestore');
      
      const firebaseConfig = {
        apiKey: process.env.VITE_FIREBASE_API_KEY,
        authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      };
      
      let db;
      try {
        const app = initializeApp(firebaseConfig, 'admin-plans-app');
        db = getFirestore(app);
      } catch (e) {
        try {
          const app = getApp('admin-plans-app');
          db = getFirestore(app);
        } catch {
          const app = initializeApp(firebaseConfig);
          db = getFirestore(app);
        }
      }

      const customPlansRef = doc(db, 'system', 'customPlans');
      const customPlansDoc = await getDoc(customPlansRef);
      
      let customPlans: Record<string, any> = {};
      if (customPlansDoc.exists()) {
        customPlans = customPlansDoc.data() || {};
      }

      console.log(`✅ Found ${Object.keys(customPlans).length} custom plans`);
      res.json({ success: true, plans: customPlans });
    } catch (error: any) {
      console.error('❌ Error fetching custom plans:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Create a new custom plan
  app.post('/api/admin/plans', requireAdmin, async (req, res) => {
    console.log('\n========== CREATE CUSTOM PLAN ==========');
    console.log('📥 Time:', new Date().toISOString());
    console.log('📋 Request:', JSON.stringify(req.body, null, 2));
    
    try {
      const { 
        name, 
        slug, 
        price, 
        billingType, 
        auditsPerMonth, 
        topicsPerCategory, 
        features,
        description,
        tagline,
        displayOrder,
        isActive = true
      } = req.body;

      // Validate required fields
      if (!name || !slug || price === undefined || !billingType) {
        return res.status(400).json({ 
          success: false, 
          error: 'Missing required fields: name, slug, price, billingType' 
        });
      }

      // Validate billing type
      if (!['one_time', 'monthly', 'annual'].includes(billingType)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid billingType. Must be: one_time, monthly, or annual' 
        });
      }

      // Validate slug format (lowercase, no spaces)
      const slugRegex = /^[a-z0-9_-]+$/;
      if (!slugRegex.test(slug)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid slug format. Use lowercase letters, numbers, hyphens, and underscores only.' 
        });
      }

      console.log(`🆕 Creating plan: ${name} (${slug})`);
      console.log(`   Price: $${price}`);
      console.log(`   Billing Type: ${billingType}`);

      // Step 1: Create product in DODO
      console.log('\n📦 Step 1: Creating product in DODO...');
      const dodoResult = await dodoService.createProduct({
        name: `${name} Plan`,
        description: description || `${name} - Citation Rocket Plan`,
        priceInDollars: price,
        billingType: billingType,
        metadata: {
          plan_slug: slug,
          audits_per_month: String(auditsPerMonth || -1),
          topics_per_category: String(topicsPerCategory || 25)
        }
      });

      if (!dodoResult.success) {
        console.error('❌ Failed to create DODO product:', dodoResult.error);
        return res.status(500).json({ 
          success: false, 
          error: `Failed to create product in DODO: ${dodoResult.error}` 
        });
      }

      console.log(`✅ DODO Product created: ${dodoResult.productId}`);

      // Step 2: Save plan to Firestore
      console.log('\n💾 Step 2: Saving plan to Firestore...');
      
      const { initializeApp, getApp } = await import('firebase/app');
      const { getFirestore, doc, getDoc, setDoc, Timestamp } = await import('firebase/firestore');
      
      const firebaseConfig = {
        apiKey: process.env.VITE_FIREBASE_API_KEY,
        authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      };
      
      let db;
      try {
        const app = initializeApp(firebaseConfig, 'create-plan-app');
        db = getFirestore(app);
      } catch (e) {
        try {
          const app = getApp('create-plan-app');
          db = getFirestore(app);
        } catch {
          const app = initializeApp(firebaseConfig);
          db = getFirestore(app);
        }
      }

      // Get existing custom plans
      const customPlansRef = doc(db, 'system', 'customPlans');
      const customPlansDoc = await getDoc(customPlansRef);
      let customPlans: Record<string, any> = {};
      if (customPlansDoc.exists()) {
        customPlans = customPlansDoc.data() || {};
      }

      // Check if slug already exists
      if (customPlans[slug]) {
        return res.status(400).json({ 
          success: false, 
          error: `A plan with slug "${slug}" already exists` 
        });
      }

      // Create the plan object
      const newPlan = {
        name,
        slug,
        price,
        billingType,
        auditsPerMonth: auditsPerMonth ?? -1,
        topicsPerCategory: topicsPerCategory ?? 25,
        features: features || [],
        description: description || '',
        tagline: tagline || '',
        displayOrder: displayOrder ?? 10,
        isActive,
        dodoProductId: dodoResult.productId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      // Add to custom plans
      customPlans[slug] = newPlan;

      // Save to Firestore
      await setDoc(customPlansRef, customPlans);

      console.log('✅ Plan saved to Firestore');
      console.log('==========================================\n');

      res.json({ 
        success: true, 
        message: `Plan "${name}" created successfully`,
        plan: newPlan,
        dodoProductId: dodoResult.productId
      });
    } catch (error: any) {
      console.error('❌ ERROR:', error.message);
      console.log('==========================================\n');
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to create plan' 
      });
    }
  });

  // Update an existing custom plan
  app.patch('/api/admin/plans/:slug', requireAdmin, async (req, res) => {
    console.log('\n========== UPDATE CUSTOM PLAN ==========');
    const { slug } = req.params;
    console.log('📋 Updating plan:', slug);
    console.log('📋 Updates:', JSON.stringify(req.body, null, 2));
    
    try {
      const { initializeApp, getApp } = await import('firebase/app');
      const { getFirestore, doc, getDoc, setDoc, Timestamp } = await import('firebase/firestore');
      
      const firebaseConfig = {
        apiKey: process.env.VITE_FIREBASE_API_KEY,
        authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      };
      
      let db;
      try {
        const app = initializeApp(firebaseConfig, 'update-plan-app');
        db = getFirestore(app);
      } catch (e) {
        try {
          const app = getApp('update-plan-app');
          db = getFirestore(app);
        } catch {
          const app = initializeApp(firebaseConfig);
          db = getFirestore(app);
        }
      }

      // Get existing custom plans
      const customPlansRef = doc(db, 'system', 'customPlans');
      const customPlansDoc = await getDoc(customPlansRef);
      
      if (!customPlansDoc.exists()) {
        return res.status(404).json({ success: false, error: 'No custom plans found' });
      }

      const customPlans = customPlansDoc.data() || {};
      
      if (!customPlans[slug]) {
        return res.status(404).json({ success: false, error: `Plan "${slug}" not found` });
      }

      const existingPlan = customPlans[slug];
      const updates = req.body;

      // If price or billing type changed, update DODO product
      if ((updates.price !== undefined && updates.price !== existingPlan.price) ||
          (updates.billingType && updates.billingType !== existingPlan.billingType)) {
        console.log('💰 Price or billing type changed, updating DODO product...');
        
        const dodoResult = await dodoService.updateProduct(existingPlan.dodoProductId, {
          name: updates.name || existingPlan.name,
          description: updates.description || existingPlan.description,
          priceInDollars: updates.price ?? existingPlan.price,
          billingType: updates.billingType || existingPlan.billingType
        });

        if (!dodoResult.success) {
          console.warn('⚠️ Failed to update DODO product:', dodoResult.error);
          // Continue anyway - Firestore update is more important
        } else {
          console.log('✅ DODO product updated');
        }
      }

      // Update plan in Firestore
      const updatedPlan = {
        ...existingPlan,
        ...updates,
        updatedAt: Timestamp.now()
      };

      customPlans[slug] = updatedPlan;
      await setDoc(customPlansRef, customPlans);

      console.log('✅ Plan updated in Firestore');
      console.log('==========================================\n');

      res.json({ 
        success: true, 
        message: `Plan "${slug}" updated successfully`,
        plan: updatedPlan
      });
    } catch (error: any) {
      console.error('❌ ERROR:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Delete/deactivate a custom plan
  app.delete('/api/admin/plans/:slug', requireAdmin, async (req, res) => {
    console.log('\n========== DELETE CUSTOM PLAN ==========');
    const { slug } = req.params;
    const { permanent = false } = req.query;
    console.log('📋 Deleting plan:', slug);
    console.log('📋 Permanent delete:', permanent);
    
    try {
      const { initializeApp, getApp } = await import('firebase/app');
      const { getFirestore, doc, getDoc, setDoc, Timestamp } = await import('firebase/firestore');
      
      const firebaseConfig = {
        apiKey: process.env.VITE_FIREBASE_API_KEY,
        authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      };
      
      let db;
      try {
        const app = initializeApp(firebaseConfig, 'delete-plan-app');
        db = getFirestore(app);
      } catch (e) {
        try {
          const app = getApp('delete-plan-app');
          db = getFirestore(app);
        } catch {
          const app = initializeApp(firebaseConfig);
          db = getFirestore(app);
        }
      }

      // Get existing custom plans
      const customPlansRef = doc(db, 'system', 'customPlans');
      const customPlansDoc = await getDoc(customPlansRef);
      
      if (!customPlansDoc.exists()) {
        return res.status(404).json({ success: false, error: 'No custom plans found' });
      }

      const customPlans = customPlansDoc.data() || {};
      
      if (!customPlans[slug]) {
        return res.status(404).json({ success: false, error: `Plan "${slug}" not found` });
      }

      if (permanent === 'true') {
        // Permanently delete the plan
        delete customPlans[slug];
        console.log('🗑️ Plan permanently deleted');
      } else {
        // Just deactivate the plan
        customPlans[slug].isActive = false;
        customPlans[slug].updatedAt = Timestamp.now();
        console.log('🚫 Plan deactivated');
      }

      await setDoc(customPlansRef, customPlans);

      console.log('✅ Firestore updated');
      console.log('==========================================\n');

      res.json({ 
        success: true, 
        message: permanent === 'true' 
          ? `Plan "${slug}" permanently deleted` 
          : `Plan "${slug}" deactivated`
      });
    } catch (error: any) {
      console.error('❌ ERROR:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== END ADMIN PLAN MANAGEMENT ==========

  // Get email templates (for backend use)
  app.get('/api/admin/email-templates', requireAdmin, async (req, res) => {
    try {
      const { initializeApp, getApp } = await import('firebase/app');
      const { getFirestore, doc, getDoc } = await import('firebase/firestore');
      
      const firebaseConfig = {
        apiKey: process.env.VITE_FIREBASE_API_KEY,
        authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      };
      
      let db;
      try {
        const app = initializeApp(firebaseConfig, 'email-templates-app');
        db = getFirestore(app);
      } catch (e) {
        try {
          const app = getApp('email-templates-app');
          db = getFirestore(app);
        } catch {
          const app = initializeApp(firebaseConfig);
          db = getFirestore(app);
        }
      }

      const templatesRef = doc(db, 'system', 'emailTemplates');
      const templatesSnap = await getDoc(templatesRef);

      if (templatesSnap.exists()) {
        res.json({ success: true, templates: templatesSnap.data() });
      } else {
        res.json({ success: true, templates: null });
      }
    } catch (error: any) {
      console.error('Error fetching email templates:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to fetch email templates' 
      });
    }
  });

  // Get feature flags for authenticated user
  app.get('/api/features', requireAuth, async (req: any, res) => {
    try {
      const { getFeatureFlags } = await import('./feature-flags');
      const { initializeApp, getApp } = await import('firebase/app');
      const { getFirestore, doc, getDoc } = await import('firebase/firestore');

      let app;
      try { app = getApp('features-app'); } catch {
        app = initializeApp({
          apiKey: process.env.VITE_FIREBASE_API_KEY,
          projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        }, 'features-app');
      }
      const db = getFirestore(app);
      const userDoc = await getDoc(doc(db, 'users', req.user?.uid));
      const plan = userDoc.exists() ? (userDoc.data()?.subscriptionPlan || 'free') : 'free';
      const flags = getFeatureFlags(plan);

      res.json({ success: true, plan, features: flags });
    } catch (error: any) {
      console.error('Feature flags error:', error.message);
      res.status(500).json({ success: false, error: 'Failed to load feature flags' });
    }
  });

  // ── Admin-only: public audit share links ────────────────────────────────────
  // Enable a public, unauthenticated read-only link for a specific audit.
  // Restricted to the admin account via requireAdmin — regular users cannot
  // make their own audits public.
  app.post('/api/admin/audits/:auditId/share', requireAdmin, async (req: any, res) => {
    try {
      const { auditId } = req.params;
      const auditRef = adminDb.collection('audits').doc(auditId);
      const auditSnap = await auditRef.get();

      if (!auditSnap.exists) {
        return res.status(404).json({ success: false, error: 'Audit not found' });
      }

      const shareToken = crypto.randomBytes(24).toString('base64url');

      await auditRef.set({
        isPublic: true,
        shareToken,
        sharedAt: new Date().toISOString(),
        sharedBy: req.user?.uid || null,
        revokedAt: null,
      }, { merge: true });

      console.log(`🔗 Admin enabled public share link for audit ${auditId}`);

      res.json({ success: true, shareToken });
    } catch (error: any) {
      console.error('❌ Enable share link error:', error.message);
      res.status(500).json({ success: false, error: 'Failed to enable share link' });
    }
  });

  // Revoke a previously enabled public share link.
  app.delete('/api/admin/audits/:auditId/share', requireAdmin, async (req: any, res) => {
    try {
      const { auditId } = req.params;
      const auditRef = adminDb.collection('audits').doc(auditId);
      const auditSnap = await auditRef.get();

      if (!auditSnap.exists) {
        return res.status(404).json({ success: false, error: 'Audit not found' });
      }

      await auditRef.set({
        isPublic: false,
        shareToken: null,
        revokedAt: new Date().toISOString(),
      }, { merge: true });

      console.log(`🔒 Admin revoked public share link for audit ${auditId}`);

      res.json({ success: true });
    } catch (error: any) {
      console.error('❌ Revoke share link error:', error.message);
      res.status(500).json({ success: false, error: 'Failed to revoke share link' });
    }
  });

  // Public, unauthenticated read-only fetch of a shared audit report.
  // Only returns audits with isPublic === true and a matching shareToken,
  // and only the report fields needed for the read-only view — never
  // userId, email, credits/billing, or checklist notes.
  app.get('/api/public/audit/:token', async (req, res) => {
    try {
      const { token } = req.params;
      if (!token || token.length < 10) {
        return res.status(404).json({ success: false, error: 'Audit not found' });
      }

      const snap = await adminDb.collection('audits')
        .where('shareToken', '==', token)
        .where('isPublic', '==', true)
        .limit(1)
        .get();

      if (snap.empty) {
        return res.status(404).json({ success: false, error: 'Audit not found' });
      }

      const data = snap.docs[0].data();

      res.json({
        success: true,
        websiteUrl: data.websiteUrl,
        auditData: data.auditData,
        generatedAt: data.generatedAt,
      });
    } catch (error: any) {
      console.error('❌ Public audit fetch error:', error.message);
      res.status(500).json({ success: false, error: 'Failed to load audit' });
    }
  });

  // Get checklist for an audit
  app.get('/api/audit/:auditId/checklist', requireAuth, async (req: any, res) => {
    try {
      const { auditId } = req.params;
      const { initializeApp: initApp, getApp: getAppInstance } = await import('firebase/app');
      const { getFirestore: getFs, doc: fsDoc, getDoc: fsGetDoc } = await import('firebase/firestore');

      let clApp;
      try { clApp = getAppInstance('checklist-app'); } catch {
        clApp = initApp({
          apiKey: process.env.VITE_FIREBASE_API_KEY,
          projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        }, 'checklist-app');
      }
      const db = getFs(clApp);
      const auditDoc = await fsGetDoc(fsDoc(db, 'audits', auditId));

      if (!auditDoc.exists()) {
        return res.status(404).json({ success: false, error: 'Audit not found' });
      }

      const data = auditDoc.data();
      if (data.userId !== req.user?.uid) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      const { getFeatureFlags } = await import('./feature-flags');
      const userDocRef = await fsGetDoc(fsDoc(db, 'users', req.user?.uid));
      const plan = userDocRef.exists() ? (userDocRef.data()?.subscriptionPlan || 'free') : 'free';
      const flags = getFeatureFlags(plan);

      const checklist = data.checklist || [];
      const limitedChecklist = flags.quickWinsChecklist === 'basic'
        ? checklist.slice(0, flags.quickWinsLimit)
        : checklist;

      res.json({
        success: true,
        checklist: limitedChecklist,
        totalActions: checklist.length,
        gated: flags.quickWinsChecklist === 'basic',
        gatedLimit: flags.quickWinsLimit,
        completedCount: checklist.filter((item: any) => item.completed).length,
      });
    } catch (error: any) {
      console.error('Checklist fetch error:', error.message);
      res.status(500).json({ success: false, error: 'Failed to load checklist' });
    }
  });

  // Toggle checklist item completion
  app.patch('/api/audit/:auditId/checklist/:actionId', requireAuth, async (req: any, res) => {
    try {
      const { auditId, actionId } = req.params;
      const { completed } = req.body;

      const { initializeApp: initApp, getApp: getAppInstance } = await import('firebase/app');
      const { getFirestore: getFs, doc: fsDoc, getDoc: fsGetDoc, setDoc: fsSetDoc } = await import('firebase/firestore');

      let clApp;
      try { clApp = getAppInstance('checklist-app'); } catch {
        clApp = initApp({
          apiKey: process.env.VITE_FIREBASE_API_KEY,
          projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        }, 'checklist-app');
      }
      const db = getFs(clApp);
      const auditRef = fsDoc(db, 'audits', auditId);
      const auditDoc = await fsGetDoc(auditRef);

      if (!auditDoc.exists()) {
        return res.status(404).json({ success: false, error: 'Audit not found' });
      }

      const data = auditDoc.data();
      if (data.userId !== req.user?.uid) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      const { getFeatureFlags } = await import('./feature-flags');
      const userDocRef = await fsGetDoc(fsDoc(db, 'users', req.user?.uid));
      const plan = userDocRef.exists() ? (userDocRef.data()?.subscriptionPlan || 'free') : 'free';
      const flags = getFeatureFlags(plan);

      const checklist = data.checklist || [];
      const itemIndex = checklist.findIndex((item: any) => item.actionId === actionId);
      if (itemIndex === -1) {
        return res.status(404).json({ success: false, error: 'Checklist item not found' });
      }

      if (flags.quickWinsChecklist === 'basic' && itemIndex >= flags.quickWinsLimit) {
        return res.status(403).json({ success: false, error: 'Upgrade your plan to access this action' });
      }

      checklist[itemIndex].completed = !!completed;
      checklist[itemIndex].completedAt = completed ? new Date().toISOString() : null;

      await fsSetDoc(auditRef, { checklist }, { merge: true });

      const completedCount = checklist.filter((item: any) => item.completed).length;

      // Fire-and-forget: keep Loops contact's completed-count current
      if (req.user?.email) {
        loopsService.syncChecklistProgress({ email: req.user.email, completedCount })
          .catch((e) => console.warn('⚠️ Loops syncChecklistProgress failed:', e.message));
      }

      res.json({
        success: true,
        item: checklist[itemIndex],
        completedCount,
        totalActions: checklist.length,
      });
    } catch (error: any) {
      console.error('Checklist update error:', error.message);
      res.status(500).json({ success: false, error: 'Failed to update checklist item' });
    }
  });

  // Re-audit endpoint: re-scrape + re-score without topic regeneration
  app.post('/api/audit/:auditId/reaudit', requireAuth, async (req: AuthenticatedRequest, res) => {
    console.log('\n========== RE-AUDIT ==========');
    const startTime = Date.now();
    const { auditId } = req.params;
    const { includeCitationSnapshot = false } = req.body;

    try {
      const { getFeatureFlags } = await import('./feature-flags');
      const { initializeApp: initApp, getApp: getAppInstance } = await import('firebase/app');
      const { getFirestore: getFs, doc: fsDoc, getDoc: fsGetDoc, setDoc: fsSetDoc } = await import('firebase/firestore');

      let fbApp;
      try { fbApp = getAppInstance('checklist-app'); } catch {
        fbApp = initApp({
          apiKey: process.env.VITE_FIREBASE_API_KEY,
          projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        }, 'checklist-app');
      }
      const db = getFs(fbApp);

      const userDocRef = await fsGetDoc(fsDoc(db, 'users', req.user?.uid || ''));
      const plan = userDocRef.exists() ? (userDocRef.data()?.subscriptionPlan || 'free') : 'free';
      const flags = getFeatureFlags(plan);

      if (!flags.reauditButton) {
        return res.status(403).json({
          success: false,
          error: 'Re-audits are available on Starter plans and above. Upgrade to track your score over time.',
        });
      }

      const auditRef = fsDoc(db, 'audits', auditId);
      const auditDoc = await fsGetDoc(auditRef);

      if (!auditDoc.exists()) {
        return res.status(404).json({ success: false, error: 'Audit not found' });
      }

      const auditData = auditDoc.data();
      if (auditData.userId !== req.user?.uid) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      if (auditData.lastReauditAt) {
        const lastReaudit = new Date(auditData.lastReauditAt);
        const hoursSince = (Date.now() - lastReaudit.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          const hoursRemaining = Math.ceil(24 - hoursSince);
          return res.status(429).json({
            success: false,
            error: `Re-audits are limited to once per 24 hours. Try again in ${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}.`,
          });
        }
      }

      const websiteUrl = auditData.websiteUrl;
      const existingAuditData = auditData.auditData;
      const companyIntelligence = existingAuditData?.companyIntelligence || {};

      console.log(`🔄 Re-auditing ${websiteUrl} for audit ${auditId}...`);

      const { html, text, sitemapUrls, discoveredSubdomains } = await scrapeWebsiteContent(websiteUrl, undefined, undefined, plan === 'lifetime');

      const contentSignals = extractContentSignals(html, text, sitemapUrls, companyIntelligence);

      const scoringResult = calculatePlatformScoresV2(contentSignals, sitemapUrls.length, discoveredSubdomains.length, companyIntelligence?.industry || '', contentSignals.totalPageCount || 0);

      let citationSnapshot = existingAuditData?.citationSnapshot || null;
      if (includeCitationSnapshot) {
        try {
          const apiKey = await getOpenRouterApiKeyForUser(req.user?.uid || '', plan);
          // BUG-03 FIX: Apply domain fallback so old audits without saved companyName still work
          const rawReauditName = (companyIntelligence.companyName || '').trim();
          const reauditCompanyName = rawReauditName.length >= 2 ? rawReauditName : deriveNameFromDomain(websiteUrl);
          const reauditUsedFallback = rawReauditName.length < 2;
          if (reauditUsedFallback) {
            console.warn(`⚠️ companyName missing for re-audit citation; using domain fallback: "${reauditCompanyName}"`);
          }
          citationSnapshot = await generateCitationSnapshot({
            websiteUrl,
            industry: companyIntelligence.industry || 'General',
            companyName: reauditCompanyName,
            keywords: companyIntelligence.suggestedKeywords || [],
            apiKey,
            auditId,
          });
        } catch (citErr: any) {
          console.warn('⚠️ Citation snapshot skipped during re-audit:', citErr.message);
        }
      }

      const newPlaybook = generatePlaybook(
        contentSignals,
        scoringResult,
        companyIntelligence,
        companyIntelligence.companyName || ''
      );

      const previousScores = {
        overallScore: existingAuditData?.auditResults?.overallScore || 0,
        platformScores: existingAuditData?.auditResults?.platformScores || { chatgpt: 0, perplexity: 0, gemini: 0, claude: 0 },
      };

      const updatedAuditData = {
        ...existingAuditData,
        auditResults: {
          ...existingAuditData?.auditResults,
          overallScore: scoringResult.overallScore,
          letterGrade: scoringResult.letterGrade,
          platformScores: scoringResult.platformScores,
          contentSignals: contentSignals,
        },
        playbook: newPlaybook,
        citationSnapshot: citationSnapshot,
      };

      const oldChecklist: any[] = auditData.checklist || [];

      let mergedChecklist: any[] = [];
      let checklistArchive: any[] = auditData.checklistArchive || [];
      let checklistMeta = {
        carriedOverCount: 0,
        carriedOverCompletedCount: 0,
        newCount: 0,
        resolvedCount: 0,
        lastMergedAt: new Date().toISOString(),
      };

      if (newPlaybook && newPlaybook.actions) {
        const oldByActionId = new Map<string, any>();
        const oldByTitlePlatform = new Map<string, any>();
        for (const item of oldChecklist) {
          if (item.actionId) {
            oldByActionId.set(item.actionId, item);
          }
          if (item.title && item.targetPlatform) {
            oldByTitlePlatform.set(`${item.title.toLowerCase().trim()}::${item.targetPlatform.toLowerCase().trim()}`, item);
          }
        }

        const matchedOldActionIds = new Set<string>();
        const newActionIds = new Set<string>();
        for (const action of newPlaybook.actions) {
          newActionIds.add(action.id);
          let oldItem = oldByActionId.get(action.id);
          if (!oldItem) {
            const fallbackKey = `${action.title.toLowerCase().trim()}::${action.targetPlatform.toLowerCase().trim()}`;
            oldItem = oldByTitlePlatform.get(fallbackKey);
          }
          if (oldItem && oldItem.actionId) {
            matchedOldActionIds.add(oldItem.actionId);
          }

          if (oldItem) {
            mergedChecklist.push({
              actionId: action.id,
              title: action.title,
              priority: action.priority,
              targetPlatform: action.targetPlatform,
              estimatedImpact: action.estimatedImpact,
              difficulty: action.difficulty,
              completed: oldItem.completed || false,
              completedAt: oldItem.completedAt || null,
              status: 'carried_over',
            });
            checklistMeta.carriedOverCount++;
            if (oldItem.completed) {
              checklistMeta.carriedOverCompletedCount++;
            }
          } else {
            mergedChecklist.push({
              actionId: action.id,
              title: action.title,
              priority: action.priority,
              targetPlatform: action.targetPlatform,
              estimatedImpact: action.estimatedImpact,
              difficulty: action.difficulty,
              completed: false,
              completedAt: null,
              status: 'new',
            });
            checklistMeta.newCount++;
          }
        }

        const now = new Date().toISOString();
        for (const oldItem of oldChecklist) {
          if (oldItem.actionId && !newActionIds.has(oldItem.actionId) && !matchedOldActionIds.has(oldItem.actionId)) {
            checklistArchive.push({
              actionId: oldItem.actionId,
              title: oldItem.title,
              priority: oldItem.priority,
              targetPlatform: oldItem.targetPlatform,
              completed: oldItem.completed || false,
              completedAt: oldItem.completedAt || null,
              resolvedAt: now,
              retiredReason: 'resolved_by_reaudit',
            });
            checklistMeta.resolvedCount++;
          }
        }
      }

      await fsSetDoc(auditRef, {
        auditData: JSON.parse(JSON.stringify(updatedAuditData)),
        lastReauditAt: new Date().toISOString(),
        checklist: mergedChecklist,
        checklistArchive: checklistArchive,
        checklistMeta: checklistMeta,
      }, { merge: true });

      await saveScoreHistory(auditId, {
        overallScore: scoringResult.overallScore,
        letterGrade: scoringResult.letterGrade,
        platformScores: scoringResult.platformScores,
      }, 'reaudit');

      const processingTime = Math.round((Date.now() - startTime) / 1000);
      console.log(`✅ Re-audit complete in ${processingTime}s. Score: ${previousScores.overallScore} → ${scoringResult.overallScore}`);
      console.log(`📋 Checklist merge: ${checklistMeta.carriedOverCount} carried over (${checklistMeta.carriedOverCompletedCount} completed), ${checklistMeta.newCount} new, ${checklistMeta.resolvedCount} resolved`);
      console.log('==============================\n');

      res.json({
        success: true,
        auditData: updatedAuditData,
        previousScores,
        currentScores: {
          overallScore: scoringResult.overallScore,
          platformScores: scoringResult.platformScores,
        },
        checklistMeta,
        processingTime,
      });
    } catch (error: any) {
      console.error('❌ Re-audit error:', error.message);
      console.log('==============================\n');
      res.status(500).json({ success: false, error: 'Re-audit failed. Please try again.' });
    }
  });

  // Citation refresh endpoint: re-run citation snapshot independently
  app.post('/api/audit/:auditId/citation-refresh', requireAuth, citationRefreshPerUserLimiter, async (req: AuthenticatedRequest, res) => {
    console.log('\n========== CITATION REFRESH ==========');
    const startTime = Date.now();
    const { auditId } = req.params;

    try {
      const { getFeatureFlags } = await import('./feature-flags');
      const { initializeApp: initApp, getApp: getAppInstance } = await import('firebase/app');
      const { getFirestore: getFs, doc: fsDoc, getDoc: fsGetDoc, setDoc: fsSetDoc } = await import('firebase/firestore');

      let fbApp;
      try { fbApp = getAppInstance('checklist-app'); } catch {
        fbApp = initApp({
          apiKey: process.env.VITE_FIREBASE_API_KEY,
          projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        }, 'checklist-app');
      }
      const db = getFs(fbApp);

      const userDocRef = await fsGetDoc(fsDoc(db, 'users', req.user?.uid || ''));
      const plan = userDocRef.exists() ? (userDocRef.data()?.subscriptionPlan || 'free') : 'free';
      const userEmail = userDocRef.exists() ? (userDocRef.data()?.email || '') : '';
      const userName = userDocRef.exists() ? (userDocRef.data()?.displayName || '') : '';
      const flags = getFeatureFlags(plan);

      if (!flags.citationRefreshButton) {
        return res.status(403).json({
          success: false,
          error: 'Citation monitoring is available on Starter plans and above. Upgrade to refresh your citation snapshot.',
        });
      }

      const auditRef = fsDoc(db, 'audits', auditId);
      const auditDoc = await fsGetDoc(auditRef);

      if (!auditDoc.exists()) {
        return res.status(404).json({ success: false, error: 'Audit not found' });
      }

      const auditData = auditDoc.data();
      if (auditData.userId !== req.user?.uid) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      // BUG-12 FIX: Concurrency guard — reject if a refresh is already in progress
      if (auditData.citationRefreshInProgress === true) {
        return res.status(409).json({
          success: false,
          error: 'A citation refresh is already running for this audit. Please wait a moment and try again.',
        });
      }

      if (auditData.lastCitationRefreshAt) {
        const lastRefresh = new Date(auditData.lastCitationRefreshAt);
        const hoursSince = (Date.now() - lastRefresh.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          const hoursRemaining = Math.ceil(24 - hoursSince);
          return res.status(429).json({
            success: false,
            error: `Citation refresh is limited to once per 24 hours. Try again in ${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}.`,
          });
        }
      }

      const websiteUrl = auditData.websiteUrl;
      const existingAuditData = auditData.auditData;
      const companyIntelligence = existingAuditData?.companyIntelligence || {};

      // BUG-03 FIX: Apply domain fallback for old audits that never had companyName saved
      const rawRefreshName = (companyIntelligence.companyName || '').trim();
      const refreshCompanyName = rawRefreshName.length >= 2 ? rawRefreshName : deriveNameFromDomain(websiteUrl);
      const refreshUsedFallback = rawRefreshName.length < 2;
      if (refreshUsedFallback) {
        console.warn(`⚠️ companyName missing for audit ${auditId}; using domain fallback: "${refreshCompanyName}"`);
      }

      console.log(`🔍 Refreshing citation snapshot for ${websiteUrl} (audit ${auditId})...`);

      // BUG-12 FIX: Set in-progress flag before starting the async work
      await fsSetDoc(auditRef, { citationRefreshInProgress: true }, { merge: true });

      let newSnapshot: any;
      let changes = null;

      try {
        let apiKey: string;
        try {
          apiKey = await getOpenRouterApiKeyForUser(req.user?.uid || '', plan);
        } catch (keyErr: any) {
          if (keyErr.message?.includes('APPSUMO_KEY_REQUIRED')) {
            await fsSetDoc(auditRef, { citationRefreshInProgress: false }, { merge: true }).catch(() => {});
            return res.status(400).json({
              success: false,
              error: 'API key required',
              code: 'APPSUMO_KEY_REQUIRED',
              details: 'Lifetime users must add their own OpenRouter key in Profile → API Configuration.',
            });
          }
          throw keyErr;
        }

        const previousEntry = await getLatestCitationEntry(auditId);

        newSnapshot = await generateCitationSnapshot({
          websiteUrl,
          industry: companyIntelligence.industry || 'General',
          companyName: refreshCompanyName,
          keywords: companyIntelligence.suggestedKeywords || [],
          apiKey,
          auditId,
        });

        await saveCitationSnapshot(auditId, newSnapshot, 'manual', refreshUsedFallback);

        if (previousEntry) {
          changes = detectCitationChanges(newSnapshot, previousEntry);

          if (changes.hasSignificantChange && flags.citationAlerts && userEmail) {
            try {
              await emailService.sendCitationAlertEmail(userEmail, userName, {
                websiteUrl,
                previousMentionRate: changes.previousMentionRate,
                currentMentionRate: changes.currentMentionRate,
                mentionRateChange: changes.mentionRateChange,
                newCompetitors: changes.newCompetitors,
                lostCompetitors: changes.lostCompetitors,
                visibilityGained: changes.visibilityGained,
                visibilityLost: changes.visibilityLost,
                auditId,
              });
              console.log(`📧 Citation alert email sent to ${userEmail}`);
            } catch (emailErr: any) {
              console.warn('⚠️ Failed to send citation alert email:', emailErr.message);
            }
          }
        }

        await fsSetDoc(auditRef, {
          'auditData': {
            ...existingAuditData,
            citationSnapshot: JSON.parse(JSON.stringify(newSnapshot)),
          },
          lastCitationRefreshAt: new Date().toISOString(),
          citationRefreshInProgress: false,
        }, { merge: true });
      } catch (refreshErr: any) {
        // BUG-12 FIX: Always clear the in-progress flag on error
        await fsSetDoc(auditRef, { citationRefreshInProgress: false }, { merge: true }).catch(() => {});
        await reportError('citation', `Citation refresh failed: ${refreshErr.message}`, { websiteUrl }, { userId: req.user?.uid, auditId });
        throw refreshErr;
      }

      const processingTime = Math.round((Date.now() - startTime) / 1000);
      console.log(`✅ Citation refresh complete in ${processingTime}s. Mention rate: ${newSnapshot.mentionRate}%`);
      console.log('======================================\n');

      res.json({
        success: true,
        citationSnapshot: newSnapshot,
        changes,
        processingTime,
      });
    } catch (error: any) {
      console.error('❌ Citation refresh error:', error.message);
      console.log('======================================\n');
      res.status(500).json({ success: false, error: 'Citation refresh failed. Please try again.' });
    }
  });

  // Get current pricing (from Firestore)
  app.get('/api/pricing/plans', async (req, res) => {
    try {
      // Load plan settings from Firestore using client SDK
      const { initializeApp, getApp } = await import('firebase/app');
      const { getFirestore, doc, getDoc } = await import('firebase/firestore');
      
      const firebaseConfig = {
        apiKey: process.env.VITE_FIREBASE_API_KEY,
        authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      };
      
      let db;
      try {
        const app = initializeApp(firebaseConfig, 'pricing-app');
        db = getFirestore(app);
      } catch (e) {
        try {
          const app = getApp('pricing-app');
          db = getFirestore(app);
        } catch {
          const app = initializeApp(firebaseConfig);
          db = getFirestore(app);
        }
      }

      const settingsRef = doc(db, 'system', 'planSettings');
      const settingsDoc = await getDoc(settingsRef);
      
      let planSettings: any;
      if (settingsDoc.exists()) {
        planSettings = settingsDoc.data();
      } else {
        // Use defaults if not found
        planSettings = {
          free: { price: 0, auditsPerMonth: 1, topicsPerCategory: 3 },
          starter: { price: 49, auditsPerMonth: 10, topicsPerCategory: 12 },
          pro: { price: 149, auditsPerMonth: -1, topicsPerCategory: 25 },
          enterprise: { price: 299, auditsPerMonth: -1, topicsPerCategory: 100 }
        };
      }
      
      // Helper: Generate dynamic audit text based on actual value
      const getAuditText = (audits: number) => {
        if (audits === -1) return "Unlimited audits";
        return `${audits} audit${audits === 1 ? '' : 's'} per month`;
      };
      
      // Helper: Generate dynamic topics text based on actual value
      const getTopicsText = (topics: number) => {
        return `${topics} topics per category`;
      };
      
      const buildFeatures = (plan: any, accurateExtras: string[]) => {
        const audits = plan?.auditsPerMonth ?? 1;
        const topics = plan?.topicsPerCategory ?? 3;
        
        const dynamicFeatures = [
          getAuditText(audits),
          getTopicsText(topics)
        ];
        
        return [...dynamicFeatures, ...accurateExtras];
      };
      
      // Transform to pricing format with dynamic features
      const pricing = {
        free: {
          name: 'Free',
          monthlyPrice: 0,
          annualPrice: 0,
          audits: planSettings.free?.auditsPerMonth || 1,
          topics: planSettings.free?.topicsPerCategory || 3,
          features: buildFeatures(planSettings.free, [
            "1 domain",
            "AI Readiness Score (4 platforms)",
            "Basic fix-it playbook",
            "1 schema type",
            "Industry benchmarks",
            "Watermarked PDF export",
          ])
        },
        starter: {
          name: 'Starter',
          monthlyPrice: planSettings.starter?.price || 49,
          annualPrice: (planSettings.starter?.price || 49) * 10,
          audits: planSettings.starter?.auditsPerMonth || 10,
          topics: planSettings.starter?.topicsPerCategory || 12,
          features: buildFeatures(planSettings.starter, [
            "5 domains",
            "Full fix-it playbook",
            "All schema types",
            "3 competitors tracked",
            "Monthly re-audits",
            "Monthly citation monitoring",
            "Clean PDF & CSV export",
          ])
        },
        pro: {
          name: 'Pro',
          monthlyPrice: planSettings.pro?.price || 149,
          annualPrice: (planSettings.pro?.price || 149) * 10,
          audits: planSettings.pro?.auditsPerMonth || -1,
          topics: planSettings.pro?.topicsPerCategory || 25,
          features: buildFeatures(planSettings.pro, [
            "Unlimited domains",
            "Priority fix-it playbook",
            "Unlimited competitors tracked",
            "Weekly citation monitoring",
            "Citation change alerts",
            "Score trend CSV export",
            "White-label PDF export",
          ])
        },
        enterprise: {
          name: 'Enterprise',
          monthlyPrice: planSettings.enterprise?.price || 299,
          annualPrice: (planSettings.enterprise?.price || 299) * 10,
          audits: planSettings.enterprise?.auditsPerMonth || -1,
          topics: planSettings.enterprise?.topicsPerCategory || 100,
          features: buildFeatures(planSettings.enterprise, [
            "Unlimited domains",
            "White-label fix-it playbook",
            "Unlimited competitors tracked",
            "Daily citation monitoring",
            "Citation change alerts",
            "Score trend CSV export",
            "White-label PDF export",
          ])
        }
      };

      res.json({ success: true, plans: pricing });
    } catch (error: any) {
      console.error('Error getting pricing:', error);
      res.status(500).json({ 
        success: false,
        error: 'Failed to load pricing' 
      });
    }
  });

  app.post('/api/payment/create-link', requireAuth, async (req: AuthenticatedRequest, res) => {
    console.log('\n========== CHECKOUT SESSION CREATION ==========');
    console.log('📥 Time:', new Date().toISOString());
    console.log('📋 Request:', req.body);
    
    try {
      const { 
        planName, 
        billingPeriod = 'monthly', 
        userName, 
        couponCode,
        productId: customProductId,  // For custom plans
        isCustomPlan = false
      } = req.body;

      // Identity is derived from the verified session, not the request body,
      // to prevent one user from creating a checkout session tied to another
      // account's userId/email.
      const userId = req.user!.uid;
      const userEmail = req.user!.email;
      if (!userEmail) {
        return res.status(400).json({ success: false, error: 'Account has no verified email on file.' });
      }

      const baseUrl = process.env.PRODUCTION_URL || `https://${process.env.REPLIT_DEV_DOMAIN || 'app.citationrocket.com'}`;
      const redirectUrl = `${baseUrl}/payment-success`;
      
      console.log('🔗 Redirect URL:', redirectUrl);
      console.log('🔍 Plan Name:', planName);
      console.log('📅 Billing Period:', billingPeriod);
      console.log('🎟️ Coupon Code:', couponCode || 'None');
      console.log('📦 Is Custom Plan:', isCustomPlan);
      
      let productId: string;
      
      if (isCustomPlan && customProductId) {
        // Custom plan - use the provided product ID directly
        productId = customProductId;
        console.log('✨ Using custom plan product ID:', productId);
      } else {
        // Default plan - select based on billing period
        const productIds = DODO_PRODUCTS_PAYMENT[billingPeriod as 'monthly' | 'annual'];
        productId = productIds[planName as keyof typeof productIds];
        
        if (!productId) {
          throw new Error(`Product ID not found for ${planName} (${billingPeriod}). Please configure DODO_PRODUCT_${planName.toUpperCase()}${billingPeriod === 'annual' ? '_ANNUAL' : ''} in .env`);
        }
      }
      
      console.log('🆔 Selected Product ID:', productId);
      
      // Use checkout session API (supports discount codes)
      const session = await dodoService.createCheckoutSession(
        userEmail,
        userName,
        planName as any, // Could be custom plan slug
        userId,
        redirectUrl,
        redirectUrl, // cancelUrl (same as success for now)
        couponCode, // Pass discount code
        productId, // Pass the selected product ID
        billingPeriod // Pass billing period for tracking
      );

      console.log('✅ Checkout session created');
      console.log('🔗 URL:', session.checkoutUrl);
      console.log('🆔 Session ID:', session.sessionId);
      console.log('================================================\n');

      res.json({ success: true, checkoutUrl: session.checkoutUrl });
    } catch (error: any) {
      console.error('❌ ERROR:', error.message);
      console.log('================================================\n');
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  // Send signup welcome email
  app.post('/api/auth/send-welcome-email', async (req, res) => {
    console.log('\n========== SIGNUP WELCOME EMAIL ==========');
    console.log('📥 Time:', new Date().toISOString());
    console.log('📋 Request:', req.body);
    
    try {
      const { userEmail, userName } = req.body;
      
      if (!userEmail) {
        return res.status(400).json({ error: 'User email is required' });
      }
      
      console.log('📧 Sending signup welcome email to:', userEmail);
      const sent = await emailService.sendSignupWelcomeEmail(userEmail, userName || 'there');

      // Fire-and-forget: register the contact in Loops for lifecycle emails
      loopsService.syncNewUser({ email: userEmail, name: userName })
        .catch((e) => console.warn('⚠️ Loops syncNewUser failed:', e.message));
      
      if (sent) {
        console.log('✅ Signup welcome email sent successfully');
        console.log('==========================================\n');
        res.json({ success: true, message: 'Welcome email sent' });
      } else {
        console.log('⚠️ Failed to send welcome email');
        console.log('==========================================\n');
        res.status(500).json({ success: false, error: 'Failed to send email' });
      }
    } catch (error: any) {
      console.error('❌ ERROR:', error.message);
      console.log('==========================================\n');
      res.status(500).json({ error: 'Failed to send welcome email' });
    }
  });

  // Waitlist signup rate limiter (10 requests per minute per IP)
  const waitlistLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: 'Too many waitlist requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
  });

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Waitlist signup for coming soon features
  app.post('/api/waitlist/signup', waitlistLimiter, async (req, res) => {
    console.log('\n========== WAITLIST SIGNUP ==========');
    console.log('📥 Time:', new Date().toISOString());
    
    try {
      const { email, feature } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }
      
      if (!feature || typeof feature !== 'string') {
        return res.status(400).json({ error: 'Feature name is required' });
      }

      // Validate email format
      const trimmedEmail = email.trim().toLowerCase();
      if (!emailRegex.test(trimmedEmail) || trimmedEmail.length > 254) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Sanitize and limit feature name
      const sanitizedFeature = feature.trim().slice(0, 100);
      if (sanitizedFeature.length < 1) {
        return res.status(400).json({ error: 'Feature name is required' });
      }
      
      console.log('📧 Adding to waitlist for feature:', sanitizedFeature);
      
      // Send confirmation email
      const sent = await emailService.sendWaitlistNotificationEmail(trimmedEmail, sanitizedFeature);
      
      if (sent) {
        console.log('✅ Waitlist confirmation email sent');
        console.log('======================================\n');
        res.json({ success: true, message: 'Added to waitlist and confirmation sent' });
      } else {
        console.log('⚠️ Added to waitlist but email failed');
        console.log('======================================\n');
        res.json({ success: true, message: 'Added to waitlist' });
      }
    } catch (error: any) {
      console.error('❌ ERROR:', error.message);
      console.log('======================================\n');
      res.status(500).json({ error: 'Failed to add to waitlist' });
    }
  });

  // POST /api/extension/capture — Anonymous AEO signal capture from browser extension
  // Receives public website data (never user data) from extension users
  // Builds the Citation Rocket AEO dataset passively
  app.post('/api/extension/capture', async (req, res) => {
    try {
      const { domain, signals, source } = req.body;

      // Validate — must have a domain
      if (!domain || typeof domain !== 'string' || domain.length > 200) {
        return res.status(400).json({ error: 'Invalid domain' });
      }

      // Sanitize domain
      const cleanDomain = domain.toLowerCase().replace(/[^a-z0-9.-]/g, '').substring(0, 100);
      if (!cleanDomain) return res.status(400).json({ error: 'Invalid domain' });

      // Store to extension_signals Firestore collection
      const { getFirestore, doc, setDoc } = await import('firebase/firestore');
      const { initializeApp, getApp } = await import('firebase/app');

      let app;
      try { app = getApp('extension-capture-app'); }
      catch {
        app = initializeApp({
          apiKey: process.env.VITE_FIREBASE_API_KEY,
          projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        }, 'extension-capture-app');
      }

      const db = getFirestore(app);
      const recordId = `${cleanDomain}_${Date.now()}`;

      // Anonymous AEO dataset (the moat) — never includes user identity.
      await setDoc(doc(db, 'extension_signals', recordId), {
        domain: cleanDomain,
        signals: signals || {},
        source: source || 'extension',
        capturedAt: new Date().toISOString(),
        // Never store: IP addresses, user IDs, page URLs, query text
      });

      // Unified scan record — one document for every scan (free + full).
      await setDoc(doc(db, 'extension_scans', recordId), {
        domain: cleanDomain,
        pageUrl: req.body.pageUrl || null,
        type: req.body.type || 'free',
        userId: null,
        email: req.body.email || null,
        plan: req.body.plan || 'free',
        signedIn: !!req.body.signedIn,
        verified: false, // public endpoint — identity fields are client-supplied, not server-verified
        grade: req.body.grade || null,
        overallScore: req.body.overallScore ?? signals?.overallScore ?? null,
        signals: signals || {},
        source: source || 'extension',
        capturedAt: new Date().toISOString(),
      });

      console.log(`📊 Extension capture: ${cleanDomain} (${source || 'extension'})`);

      return res.json({ success: true });

    } catch (err: any) {
      // Silent fail to client — never let data capture break the extension
      console.warn('⚠️ Extension capture failed (non-blocking):', err?.message);
      return res.json({ success: true }); // always return success to extension
    }
  });

  // Derive the real brand name from page signals (used for entity lookups).
  // Order: og:site_name (Open Graph standard) → JSON-LD Organization/publisher
  // name → <title> trailing segment → domain slug fallback. Using the real name
  // (e.g. "Mayo Clinic" not "Mayoclinic") is what lets Wikidata/Wikipedia/KG
  // lookups find the entity; the downstream domain-match check still guards
  // against false positives, so a better name only improves recall.
  function deriveBrandName(html: string, domainName: string): string {
    const slug = domainName.split('.')[0];
    const fallback = slug.charAt(0).toUpperCase() + slug.slice(1);
    if (!html) return fallback;
    const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
    const valid = (s?: string | null): s is string =>
      !!s && clean(s).length >= 2 && clean(s).length <= 60;

    // 1. og:site_name — the standard field for a site's brand name.
    const og =
      html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
    if (og && valid(og[1])) return clean(og[1]);

    // 2. Organization / publisher name in JSON-LD.
    const ldBlocks = Array.from(
      html.matchAll(
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      ),
    );
    for (const m of ldBlocks) {
      try {
        const json = JSON.parse(m[1].trim());
        const nodes = Array.isArray(json)
          ? json
          : Array.isArray(json['@graph'])
          ? json['@graph']
          : [json];
        for (const n of nodes) {
          if (valid(n?.publisher?.name)) return clean(n.publisher.name);
        }
        for (const n of nodes) {
          const t = Array.isArray(n?.['@type']) ? n['@type'] : [n?.['@type']];
          if (t.includes('Organization') && valid(n?.name)) return clean(n.name);
        }
      } catch {
        /* ignore malformed JSON-LD */
      }
    }

    // 3. Trailing segment of <title> (e.g. "Migraine - ... - Mayo Clinic").
    const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleM) {
      const parts = clean(titleM[1]).split(/\s+[|\-–—]\s+/);
      const tail = parts[parts.length - 1];
      if (parts.length > 1 && valid(tail)) return clean(tail);
    }

    return fallback;
  }

  // POST /api/extension/analyze
  // Called by the extension after sign-in to get full
  // E-E-A-T, off-site, and blueprint scores using page
  // content sent from the browser. No re-scraping needed.
  app.post('/api/extension/analyze', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { url, html, text, domain, wikidataQid } = req.body;

      if (!url || !html) {
        return res.status(400).json({ error: 'url and html are required' });
      }

      const { runBlueprintAudit } = await import('./blueprint-orchestrator');

      const domainName = domain || new URL(url).hostname.replace(/^www\./, '');
      const companyName = deriveBrandName(html, domainName);
      console.log(`🔎 Extension entity lookup: brand="${companyName}" domain="${domainName}"`);

      const blueprint = await runBlueprintAudit({
        websiteUrl: url,
        html: html || '',
        text: text || '',
        sitemapUrls: [],
        brandName: companyName,
        companyName,
        industry: req.body.industry || '',
        primaryQuery: '',
        clientWikidataQid: wikidataQid || null,
      });

      // Persist the full signed-in scan, attributed to the user.
      try {
        const { getFirestore, doc, setDoc } = await import('firebase/firestore');
        const { initializeApp, getApp } = await import('firebase/app');
        let capApp;
        try { capApp = getApp('extension-capture-app'); }
        catch {
          capApp = initializeApp({
            apiKey: process.env.VITE_FIREBASE_API_KEY,
            projectId: process.env.VITE_FIREBASE_PROJECT_ID,
          }, 'extension-capture-app');
        }
        const capDb = getFirestore(capApp);
        const cleanDomain = domainName.toLowerCase().replace(/[^a-z0-9.-]/g, '').substring(0, 100);
        const scanId = `${cleanDomain}_${Date.now()}`;

        await setDoc(doc(capDb, 'extension_scans', scanId), {
          domain: cleanDomain,
          pageUrl: url,
          type: 'full',
          userId: req.user?.uid || null,
          email: req.user?.email || null,
          plan: req.body.plan || 'free',
          signedIn: true,
          verified: true, // authenticated route — identity comes from verified token
          grade: null,
          overallScore: blueprint.normalizedScore ?? null,
          scores: {
            eeAtScore: blueprint.eeat?.eeAtScore ?? null,
            offsiteScore: blueprint.offsite?.offsiteScore ?? null,
            answerCapsuleScore: blueprint.answerCapsule?.answerCapsuleScore ?? null,
            botAccessScore: blueprint.botAccess?.botAccessScore ?? null,
            freshnessScore: blueprint.freshness?.freshnessScore ?? null,
            schemaCompletenessScore: blueprint.schemaCompleteness?.schemaCompletenessScore ?? null,
            fanOutScore: blueprint.fanOut?.fanOutScore ?? null,
          },
          knowledgeGraphEntityFound: blueprint.eeat?.knowledgeGraphEntityFound ?? null,
          wikidataQNumber: blueprint.offsite?.wikidataQNumber ?? null,
          wikipediaArticleExists: blueprint.offsite?.wikipediaArticleExists ?? null,
          criticalGapsCount: blueprint.criticalGaps?.length ?? 0,
          source: 'extension_v2.0_full',
          capturedAt: new Date().toISOString(),
        });

        console.log(`📊 Extension full scan saved: ${cleanDomain} (user ${req.user?.uid})`);
      } catch (capErr: any) {
        console.warn('⚠️ Extension full-scan capture failed (non-blocking):', capErr?.message);
      }

      return res.json({ success: true, blueprint, companyName });

    } catch (err: any) {
      console.error('Extension analyze error:', err);
      return res.status(500).json({ error: 'Analysis failed: ' + err.message });
    }
  });

  // Upgrade subscription
  app.post('/api/subscription/upgrade', requireAuth, async (req: AuthenticatedRequest, res) => {
    console.log('\n========== SUBSCRIPTION UPGRADE ==========');
    console.log('📥 Time:', new Date().toISOString());
    console.log('📋 Request:', req.body);
    
    try {
      const { userEmail, userName, currentPlan, newPlan, billingPeriod, currentSubscriptionId } = req.body;
      const userId = req.user!.uid;
      
      const result = await subscriptionService.upgradeSubscription({
        userId,
        userEmail,
        userName,
        currentPlan,
        newPlan,
        billingPeriod,
        currentSubscriptionId
      });

      console.log('✅ Upgrade result:', result);
      console.log('==========================================\n');
      
      res.json(result);
    } catch (error: any) {
      console.error('❌ ERROR:', error.message);
      console.log('==========================================\n');
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to process upgrade'
      });
    }
  });

  // Downgrade subscription
  app.post('/api/subscription/downgrade', requireAuth, async (req: AuthenticatedRequest, res) => {
    console.log('\n========== SUBSCRIPTION DOWNGRADE ==========');
    console.log('📥 Time:', new Date().toISOString());
    console.log('📋 Request:', req.body);
    
    try {
      const { currentPlan, newPlan, subscriptionId } = req.body;
      const userId = req.user!.uid;
      
      const result = await subscriptionService.downgradeSubscription({
        userId,
        currentPlan,
        newPlan,
        subscriptionId
      });

      console.log('✅ Downgrade result:', result);
      console.log('==========================================\n');
      
      res.json(result);
    } catch (error: any) {
      console.error('❌ ERROR:', error.message);
      console.log('==========================================\n');
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to schedule downgrade'
      });
    }
  });

  // Cancel pending downgrade
  app.post('/api/subscription/cancel-downgrade', requireAuth, async (req: AuthenticatedRequest, res) => {
    console.log('\n========== CANCEL PENDING DOWNGRADE ==========');
    console.log('📥 Time:', new Date().toISOString());
    console.log('📋 Request:', req.body);
    
    try {
      const userId = req.user!.uid;
      
      const result = await subscriptionService.cancelPendingDowngrade(userId);

      console.log('✅ Result:', result);
      console.log('==========================================\n');
      
      res.json(result);
    } catch (error: any) {
      console.error('❌ ERROR:', error.message);
      console.log('==========================================\n');
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to cancel downgrade'
      });
    }
  });

  // Switch billing period
  app.post('/api/subscription/switch-billing', requireAuth, async (req: AuthenticatedRequest, res) => {
    console.log('\n========== SWITCH BILLING PERIOD ==========');
    console.log('📥 Time:', new Date().toISOString());
    console.log('📋 Request:', req.body);
    
    try {
      const { userEmail, userName, planName, currentPeriod, newPeriod } = req.body;
      const userId = req.user!.uid;
      
      const result = await subscriptionService.switchBillingPeriod({
        userId,
        userEmail,
        userName,
        planName,
        currentPeriod,
        newPeriod
      });

      console.log('✅ Result:', result);
      console.log('==========================================\n');
      
      res.json(result);
    } catch (error: any) {
      console.error('❌ ERROR:', error.message);
      console.log('==========================================\n');
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to switch billing period'
      });
    }
  });

  // Save user's OpenRouter API key (for AppSumo users)
  app.post('/api/user/openrouter-key', requireAuth, async (req: AuthenticatedRequest, res) => {
    console.log('\n========== SAVE OPENROUTER API KEY ==========');
    console.log('📥 Time:', new Date().toISOString());
    const userId = req.user!.uid;
    console.log('📋 Request:', { userId, keyLength: req.body.apiKey?.length });
    
    try {
      const { apiKey } = req.body;

      if (!apiKey || !apiKey.trim()) {
        return res.status(400).json({ 
          success: false,
          error: 'API key is required' 
        });
      }

      // Validate API key format (OpenRouter keys start with sk-or-)
      if (!apiKey.startsWith('sk-or-')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid API key format. OpenRouter keys should start with "sk-or-"'
        });
      }

      console.log('🔍 Validating API key with OpenRouter...');
      const isValid = await validateOpenRouterApiKey(apiKey);

      if (!isValid) {
        console.log('❌ Invalid API key');
        return res.status(400).json({
          success: false,
          error: 'Invalid OpenRouter API key. Please check your key and try again.'
        });
      }

      console.log('✅ API key validated successfully');

      // Save to Firestore using client SDK
      const { initializeApp, getApp } = await import('firebase/app');
      const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
      
      const firebaseConfig = {
        apiKey: process.env.VITE_FIREBASE_API_KEY,
        authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      };
      
      let db;
      try {
        const app = initializeApp(firebaseConfig, 'api-key-app');
        db = getFirestore(app);
      } catch (e) {
        try {
          const app = getApp('api-key-app');
          db = getFirestore(app);
        } catch {
          const app = initializeApp(firebaseConfig);
          db = getFirestore(app);
        }
      }

      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        openRouterApiKey: apiKey,
        openRouterKeySource: 'USER'
      });

      console.log('✅ API key saved to Firestore');
      console.log('==========================================\n');
      
      res.json({ 
        success: true,
        message: 'API key saved successfully' 
      });
    } catch (error: any) {
      console.error('❌ ERROR:', error.message);
      console.log('==========================================\n');
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to save API key'
      });
    }
  });

  // Get user's OpenRouter API key status (masked)
  app.get('/api/user/openrouter-key/:userId', requireAuth, async (req: AuthenticatedRequest, res) => {
    console.log('\n========== GET OPENROUTER API KEY STATUS ==========');
    
    try {
      const { userId } = req.params;
      
      if (!userId) {
        return res.status(400).json({ 
          success: false,
          error: 'User ID is required' 
        });
      }

      if (userId !== req.user!.uid) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: cannot access another user\'s API key status'
        });
      }

      // Get from Firestore
      const { initializeApp, getApp } = await import('firebase/app');
      const { getFirestore, doc, getDoc } = await import('firebase/firestore');
      
      const firebaseConfig = {
        apiKey: process.env.VITE_FIREBASE_API_KEY,
        authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      };
      
      let db;
      try {
        const app = initializeApp(firebaseConfig, 'api-key-get-app');
        db = getFirestore(app);
      } catch (e) {
        try {
          const app = getApp('api-key-get-app');
          db = getFirestore(app);
        } catch {
          const app = initializeApp(firebaseConfig);
          db = getFirestore(app);
        }
      }

      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return res.status(404).json({ 
          success: false,
          error: 'User not found' 
        });
      }

      const userData = userDoc.data();
      // Legacy docs may still only have the old `perplexityApiKey` field name — fall
      // back to it so existing AppSumo users don't appear to have lost their key.
      const storedKey = userData.openRouterApiKey || userData.perplexityApiKey;
      const hasKey = !!storedKey;
      const maskedKey = hasKey
        ? `${storedKey.substring(0, 8)}...${storedKey.slice(-4)}`
        : null;

      res.json({ 
        success: true,
        hasKey,
        maskedKey,
        keySource: userData.openRouterKeySource || userData.perplexityKeySource || 'PLATFORM'
      });
    } catch (error: any) {
      console.error('❌ ERROR:', error.message);
      res.status(500).json({ 
        success: false,
        error: error.message || 'Failed to get API key status'
      });
    }
  });

  // DODO Webhook handler - with proper Svix signature verification
  // NOTE: express.text() is registered in index.ts before express.json() to preserve raw body
  app.post('/api/webhooks/dodo', async (req, res) => {
    console.log('\n========== WEBHOOK RECEIVED ==========');
    console.log('📥 Time:', new Date().toISOString());
    
    try {
      // Get raw body for signature verification
      // express.text() gives us the raw string body
      const rawBody = typeof req.body === 'string' ? req.body : 
                      Buffer.isBuffer(req.body) ? req.body.toString('utf8') : 
                      JSON.stringify(req.body);
      
      // Get webhook secret from environment
      const webhookSecret = process.env.DODO_WEBHOOK_SECRET;
      const isProduction = process.env.NODE_ENV === 'production';
      
      // FAIL CLOSED: In production, reject webhooks if secret is not configured
      if (!webhookSecret) {
        if (isProduction) {
          console.error('❌ CRITICAL: DODO_WEBHOOK_SECRET not configured in production - rejecting webhook');
          return res.status(500).json({ error: 'Webhook verification not configured' });
        } else {
          console.warn('⚠️ DODO_WEBHOOK_SECRET not configured - allowing in development mode');
          console.warn('⚠️ This would be rejected in production!');
        }
      } else {
        // Verify webhook signature using Svix
        const isValid = dodoService.verifyWebhookSignature(
          rawBody,
          {
            'webhook-id': req.headers['webhook-id'] as string,
            'webhook-timestamp': req.headers['webhook-timestamp'] as string,
            'webhook-signature': req.headers['webhook-signature'] as string,
            'svix-id': req.headers['svix-id'] as string,
            'svix-timestamp': req.headers['svix-timestamp'] as string,
            'svix-signature': req.headers['svix-signature'] as string,
          },
          webhookSecret
        );

        if (!isValid) {
          console.error('❌ Webhook signature verification failed - rejecting request');
          return res.status(401).json({ error: 'Invalid webhook signature' });
        }
      }

      // Parse the event from raw body
      const event = JSON.parse(rawBody);
      console.log('🔔 Event Type:', event.type);

      // --- Idempotency guard -------------------------------------------------
      // Dodo delivers webhooks at-least-once and retries on timeout, so the same
      // event can arrive more than once, and — since Dodo's own timeout+retry
      // can race a slow-but-still-running handler — possibly *concurrently*.
      // Each delivery carries a unique 'webhook-id' (or 'svix-id') header. We
      // use a Firestore transaction to atomically claim a time-bounded lease on
      // that id:
      //   - no record, or a record whose lease has expired -> claim it, process.
      //   - record with status 'completed'                 -> true duplicate, skip.
      //   - record with status 'processing' and an active
      //     (unexpired) lease                                -> another delivery
      //     is genuinely in flight right now; skip rather than risk double side
      //     effects (duplicate emails / billing calls) from concurrent processing.
      // A crashed handler's lease simply expires and the next retry reclaims it,
      // so failures never permanently swallow the event.
      const LEASE_MS = 2 * 60 * 1000; // generous vs. our slowest webhook branch
      const webhookId = (req.headers['webhook-id'] as string) || (req.headers['svix-id'] as string);
      const processedRef = webhookId ? adminDb.collection('processed_webhooks').doc(webhookId) : null;
      if (processedRef) {
        const claim = await adminDb.runTransaction(async (tx) => {
          const snap = await tx.get(processedRef);
          const now = Date.now();
          if (snap.exists) {
            const data = snap.data() as any;
            if (data.status === 'completed') {
              return { outcome: 'duplicate-completed' as const };
            }
            const leaseExpiresAtMs = data.leaseExpiresAt?.toMillis?.() ?? 0;
            if (data.status === 'processing' && leaseExpiresAtMs > now) {
              return { outcome: 'duplicate-inflight' as const };
            }
            // Expired lease (previous attempt crashed/errored) — reclaim it.
          }
          tx.set(processedRef, {
            eventType: event.type,
            receivedAt: new Date(),
            status: 'processing',
            leaseExpiresAt: new Date(now + LEASE_MS),
            expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000), // 30-day TTL for the record itself
          }, { merge: true });
          return { outcome: 'claimed' as const };
        });

        if (claim.outcome === 'duplicate-completed') {
          console.log(`⏭️ Duplicate webhook (id=${webhookId}, type=${event.type}) — already processed, skipping`);
          console.log('==========================================\n');
          return res.status(200).json({ received: true, duplicate: true });
        }
        if (claim.outcome === 'duplicate-inflight') {
          console.log(`⏭️ Webhook (id=${webhookId}, type=${event.type}) is actively being processed by another delivery — skipping`);
          console.log('==========================================\n');
          return res.status(200).json({ received: true, duplicate: true });
        }
      } else {
        console.warn('⚠️ Webhook missing webhook-id/svix-id header — cannot deduplicate this delivery');
      }

      // Hook API subscription events into API key billing
      await handleDodoApiWebhook({ type: event.type, data: event.data }).catch(err => {
        console.warn('⚠️ Dodo API webhook handler failed (non-blocking):', err?.message);
      });

      if (event.type === 'payment.completed' || 
          event.type === 'payment.succeeded' || 
          event.type === 'subscription.created' ||
          event.type === 'subscription.active' ||
          event.type === 'subscription.renewed') {
        console.log('💳 Payment/Subscription success event - upgrading user...');
        
        const metadata = event.data?.metadata || {};
        const userId = metadata.user_id;
        const planName = metadata.plan_name;

        console.log('👤 User ID from metadata:', userId);
        console.log('📦 Plan from metadata:', planName);

        if (userId && planName) {
          console.log('🔄 Updating Firestore via client SDK...');
          
          // Use client SDK instead of admin SDK (no credentials needed)
          const { initializeApp } = await import('firebase/app');
          const { getFirestore, doc, updateDoc, Timestamp } = await import('firebase/firestore');
          
          // Initialize Firebase client (use existing config)
          const firebaseConfig = {
            apiKey: process.env.VITE_FIREBASE_API_KEY,
            authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.VITE_FIREBASE_PROJECT_ID,
          };
          
          let db;
          try {
            const app = initializeApp(firebaseConfig, 'webhook-app');
            db = getFirestore(app);
          } catch (e) {
            // App might already exist, get it
            const { getApp } = await import('firebase/app');
            try {
              const app = getApp('webhook-app');
              db = getFirestore(app);
            } catch {
              const app = initializeApp(firebaseConfig);
              db = getFirestore(app);
            }
          }
          
          // Build update data
          const billingPeriod = metadata.billing_period || 'monthly';
          const updateData: any = {
            subscriptionPlan: planName,
            subscriptionStatus: 'active',
            subscriptionStartDate: Timestamp.now(),
            billingPeriod: billingPeriod // Track if monthly or annual
          };

          // Only add DODO IDs if they exist
          const customerId = event.data?.customer?.customer_id || event.data?.customer_id;
          const subscriptionId = event.data?.subscription_id;

          if (customerId) {
            updateData.dodoCustomerId = customerId;
            console.log('🆔 Customer ID:', customerId);
          }
          
          if (subscriptionId) {
            updateData.dodoSubscriptionId = subscriptionId;
            console.log('🔄 Subscription ID:', subscriptionId);
          }

          console.log('💾 Update data:', updateData);

          const userRef = doc(db, 'users', userId);
          await updateDoc(userRef, updateData);

          console.log('✅ SUCCESS: User upgraded to', planName);

          // Send welcome email
          const welcomeEmail = event.data?.customer?.email || metadata.user_email;
          const welcomeName = event.data?.customer?.name || metadata.user_name || 'there';
          
          if (welcomeEmail) {
            console.log('📧 Sending welcome email to:', welcomeEmail);
            await emailService.sendWelcomeEmail(welcomeEmail, welcomeName, planName, billingPeriod);
          }
        } else {
          console.error('❌ Missing userId or planName');
        }
      }

      // Handle subscription cancellation
      if (event.type === 'subscription.cancelled' || 
          event.type === 'subscription.canceled' ||
          event.type === 'subscription.expired') {
        console.log('❌ Subscription cancelled event - downgrading user...');
        
        const metadata = event.data?.metadata || {};
        const userId = metadata.user_id;
        const planName = metadata.plan_name || 'unknown';

        if (userId) {
          console.log('🔄 Downgrading user to free plan...');
          
          // Use client SDK
          const { initializeApp, getApp } = await import('firebase/app');
          const { getFirestore, doc, updateDoc, Timestamp, getDoc } = await import('firebase/firestore');
          
          const firebaseConfig = {
            apiKey: process.env.VITE_FIREBASE_API_KEY,
            authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.VITE_FIREBASE_PROJECT_ID,
          };
          
          let db;
          try {
            const app = initializeApp(firebaseConfig, 'webhook-cancel-app');
            db = getFirestore(app);
          } catch (e) {
            try {
              const app = getApp('webhook-cancel-app');
              db = getFirestore(app);
            } catch {
              const app = initializeApp(firebaseConfig);
              db = getFirestore(app);
            }
          }
          
          // Get user data first
          const userRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userRef);
          const userData = userDoc.data();
          
          // BUG-01 FIX: Do NOT immediately strip access on cancellation.
          // Customers already paid for the period — honour it.
          // Determine billing period end from webhook payload or fall back to +30 days.
          const currentPlan = userData?.subscriptionPlan || 'free';
          const rawPeriodEnd = event.data?.current_period_end || event.data?.periodEnd || event.data?.period_end;
          let periodEndDate: Date;
          if (rawPeriodEnd) {
            // Dodo may send as unix timestamp (seconds) or ISO string
            periodEndDate = typeof rawPeriodEnd === 'number'
              ? new Date(rawPeriodEnd * 1000)
              : new Date(rawPeriodEnd);
          } else {
            // Fallback: add 30 days from now (safe assumption for monthly billing)
            const billingPeriod = userData?.billingPeriod || 'monthly';
            const daysToAdd = billingPeriod === 'annual' ? 365 : 30;
            periodEndDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
          }

          // Set status to 'cancelling' — access preserved until periodEndDate
          // The plan is resolved server-side at login time: if status=cancelling and endDate<now → use 'free'
          await updateDoc(userRef, {
            subscriptionPlan: currentPlan,
            subscriptionStatus: 'cancelling',
            subscriptionEndDate: Timestamp.fromDate(periodEndDate),
            pendingDowngrade: null,
            pendingUpgrade: null,
          });

          console.log(`✅ SUCCESS: Cancellation recorded. Access preserved until ${periodEndDate.toISOString()}`);

          // Send cancellation email
          const userEmail = event.data?.customer?.email || userData?.email;
          const userName = event.data?.customer?.name || userData?.displayName || 'there';
          
          if (userEmail) {
            console.log('📧 Sending cancellation email to:', userEmail);
            await emailService.sendCancellationEmail(userEmail, userName, planName);
          }
        } else {
          console.error('❌ Missing userId in cancellation webhook');
        }
      }

      // Handle subscription updates (plan changes, upgrades, downgrades)
      if (event.type === 'subscription.updated' || 
          event.type === 'subscription.upgraded' ||
          event.type === 'subscription.downgraded') {
        console.log('🔄 Subscription updated event - processing plan change...');
        
        const metadata = event.data?.metadata || {};
        const userId = metadata.user_id;
        const newPlan = metadata.plan_name;

        if (userId && newPlan) {
          console.log('👤 User ID:', userId);
          console.log('📦 New Plan:', newPlan);

          // Use client SDK
          const { initializeApp, getApp } = await import('firebase/app');
          const { getFirestore, doc, updateDoc, Timestamp, getDoc } = await import('firebase/firestore');
          
          const firebaseConfig = {
            apiKey: process.env.VITE_FIREBASE_API_KEY,
            authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.VITE_FIREBASE_PROJECT_ID,
          };
          
          let db;
          try {
            const app = initializeApp(firebaseConfig, 'webhook-update-app');
            db = getFirestore(app);
          } catch (e) {
            try {
              const app = getApp('webhook-update-app');
              db = getFirestore(app);
            } catch {
              const app = initializeApp(firebaseConfig);
              db = getFirestore(app);
            }
          }

          // Get current user data
          const userRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userRef);
          const userData = userDoc.data();
          const oldPlan = userData?.subscriptionPlan || 'unknown';

          // Update user plan
          const billingPeriod = metadata.billing_period || userData?.billingPeriod || 'monthly';
          await updateDoc(userRef, {
            subscriptionPlan: newPlan,
            subscriptionStatus: 'active',
            billingPeriod: billingPeriod,
            pendingUpgrade: null,
            pendingDowngrade: null
          });

          console.log(`✅ SUCCESS: User plan updated from ${oldPlan} to ${newPlan}`);

          // Send plan change email
          const userEmail = event.data?.customer?.email || metadata.user_email || userData?.email;
          const userName = event.data?.customer?.name || metadata.user_name || userData?.displayName || 'there';
          
          if (userEmail) {
            const planOrder = ['free', 'starter', 'pro', 'enterprise', 'lifetime'];
            const isUpgrade = planOrder.indexOf(newPlan) > planOrder.indexOf(oldPlan);

            if (isUpgrade) {
              console.log(`📧 Sending upgrade welcome email to:`, userEmail);
              await emailService.sendWelcomeEmail(userEmail, userName, newPlan, billingPeriod);
            } else {
              console.log(`📧 Sending plan downgrade email to:`, userEmail);
              await emailService.sendDowngradeEmail(
                userEmail,
                userName,
                oldPlan,
                newPlan,
                userData?.subscriptionEndDate?.toDate?.()?.toISOString()
              );
            }
          }
        } else {
          console.error('❌ Missing userId or planName in update webhook');
        }
      }

      // Handle payment failures, disputes, and successful refunds — stop paid
      // access immediately. No evidence-submission/chargeback workflow yet,
      // just downgrade to free.
      // NOTE: `refund.failed` means the refund attempt did NOT go through —
      // the customer was not refunded, so their paid access must not be
      // revoked. It's intentionally excluded here; it's just reported below.
      if (event.type === 'payment.failed' ||
          event.type === 'dispute.opened' ||
          event.type === 'refund.succeeded') {
        console.log(`🚨 ${event.type} event — downgrading user to free plan...`);

        const metadata = event.data?.metadata || {};
        let userId: string | undefined = metadata.user_id;
        const customerId = event.data?.customer?.customer_id || event.data?.customer_id;

        // payment.failed carries user_id in metadata directly (like other payment
        // events). dispute/refund payloads don't include metadata, so fall back to
        // resolving the user via their stored Dodo customer ID.
        if (!userId && customerId) {
          const usersSnap = await adminDb.collection('users')
            .where('dodoCustomerId', '==', customerId)
            .limit(1)
            .get();
          if (!usersSnap.empty) {
            userId = usersSnap.docs[0].id;
          }
        }

        if (userId) {
          await adminDb.collection('users').doc(userId).update({
            subscriptionPlan: 'free',
            subscriptionStatus: 'cancelled',
            pendingUpgrade: null,
            pendingDowngrade: null,
          });

          console.log(`✅ User ${userId} downgraded to free plan due to ${event.type}`);

          await reportError('webhook', `Dodo ${event.type} — user downgraded to free`, {
            eventType: event.type,
            paymentId: event.data?.payment_id,
            customerId,
          }, { userId, sendAlert: true });
        } else {
          console.error(`❌ Could not resolve user for ${event.type} event — customerId=${customerId}`);
          await reportError('webhook', `Dodo ${event.type} received but no matching user found`, {
            eventType: event.type,
            paymentId: event.data?.payment_id,
            customerId,
          }, { sendAlert: true });
        }
      }

      // A failed refund attempt is informational only — the customer was not
      // actually refunded, so access must stay untouched. Just report it so
      // admins can see the refund didn't go through.
      if (event.type === 'refund.failed') {
        console.log('ℹ️ refund.failed event — refund did not go through, leaving subscription untouched');
        await reportError('webhook', 'Dodo refund.failed — refund attempt did not succeed', {
          eventType: event.type,
          paymentId: event.data?.payment_id,
          customerId: event.data?.customer?.customer_id || event.data?.customer_id,
        }, { sendAlert: false });
      }

      // Mark idempotency lock as completed only now that processing succeeded —
      // if we'd marked it earlier and a step above threw, a Dodo retry would see
      // "already exists" and skip reprocessing, silently dropping the event.
      if (processedRef) {
        await processedRef.set({ status: 'completed', completedAt: new Date() }, { merge: true }).catch(err => {
          console.warn('⚠️ Failed to mark webhook idempotency record completed (non-blocking):', err?.message);
        });
      }

      console.log('✅ Webhook processed');
      console.log('==========================================\n');
      
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('❌ Webhook error:', error.message);
      console.log('==========================================\n');
      res.status(500).json({ error: 'Webhook failed' });
    }
  });

  // Phase 1: Analyze endpoint - quick company intelligence extraction for user confirmation
  // Returns company intel for user to verify before full audit
  app.post('/api/audit/analyze', requireAuth, auditPerUserLimiter, async (req: AuthenticatedRequest, res) => {
    console.log('\n========== PHASE 1: ANALYZE (Company Intelligence) ==========');
    const startTime = Date.now();
    
    const authenticatedUserId = req.user?.uid;
    const authenticatedEmail = req.user?.email;
    console.log(`🔐 Authenticated user: ${authenticatedEmail} (${authenticatedUserId})`);
    
    try {
      const { websiteUrl } = req.body;
      const userId = authenticatedUserId!;

      // DNS existence check — fail fast before any scraping/processing
      try {
        const hostForDns = new URL(/^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`).hostname;
        const dnsMod = await import('dns');
        await dnsMod.promises.lookup(hostForDns);
        console.log(`✅ DNS resolved for ${hostForDns}`);
      } catch (dnsErr: any) {
        console.log(`🚫 DNS lookup failed for ${websiteUrl}: ${dnsErr?.code || dnsErr?.message}`);
        return res.status(400).json({
          error: 'Domain not found — please check the URL and try again.',
          code: 'DOMAIN_NOT_FOUND'
        });
      }

      const { checkDomainLimit } = await import('./domain-limiter');
      const { initializeApp: initAnalyzeApp, getApp: getAnalyzeApp } = await import('firebase/app');
      const { getFirestore: getAnalyzeFs, doc: analyzeDoc, getDoc: getAnalyzeDoc } = await import('firebase/firestore');
      let analyzeApp;
      try { analyzeApp = getAnalyzeApp('analyze-plan-app'); } catch {
        analyzeApp = initAnalyzeApp({
          apiKey: process.env.VITE_FIREBASE_API_KEY,
          projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        }, 'analyze-plan-app');
      }
      const domainDb = getAnalyzeFs(analyzeApp);
      const userDocSnap = await getAnalyzeDoc(analyzeDoc(domainDb, 'users', userId));
      const userPlanForDomain = userDocSnap.exists() ? (userDocSnap.data()?.subscriptionPlan || 'free') : 'free';
      const domainCheck = await checkDomainLimit(userId, websiteUrl, userPlanForDomain);
      if (!domainCheck.allowed) {
        console.log(`🚫 Domain limit exceeded for user ${userId}: ${domainCheck.currentDomains.length}/${domainCheck.limit}`);
        return res.status(403).json({
          error: 'Domain limit reached',
          code: 'DOMAIN_LIMIT_EXCEEDED',
          details: `Your ${userPlanForDomain} plan allows ${domainCheck.limit} domain${domainCheck.limit !== 1 ? 's' : ''}. Upgrade to add more domains.`,
          currentDomains: domainCheck.currentDomains,
          limit: domainCheck.limit
        });
      }

      let apiKey: string;
      try {
        apiKey = await getOpenRouterApiKeyForUser(userId, userPlanForDomain);
      } catch (error: any) {
        if (error.message?.includes('APPSUMO_KEY_REQUIRED')) {
          return res.status(400).json({ 
            error: 'API key required',
            code: 'APPSUMO_KEY_REQUIRED'
          });
        }
        return res.status(500).json({ error: 'API key configuration error' });
      }
      
      const domainName = extractDomain(websiteUrl);
      console.log(`🏢 Analyzing ${websiteUrl} (domain: ${domainName})...`);
      
      // Helper function for retry logic
      const fetchWithRetry = async (url: string, options: any, maxRetries = 2): Promise<Response> => {
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            // Don't retry on 4xx errors (client errors)
            if (response.status >= 400 && response.status < 500) return response;
            console.log(`⚠️ Attempt ${attempt}/${maxRetries} failed with status ${response.status}, retrying...`);
          } catch (error: any) {
            lastError = error;
            console.log(`⚠️ Attempt ${attempt}/${maxRetries} network error: ${error.message}, retrying...`);
          }
          // Wait before retry (exponential backoff)
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
        throw lastError || new Error('All retry attempts failed');
      };
      
      // ─── Scrape-first: fetch real page content BEFORE classifying ──────────
      // Never let the LLM guess the industry from the domain name. If we can't
      // get enough real signal, we return "Unknown" fields instead of a guess.
      const { scrapeHomepageLite } = await import('./scraper-v2');
      const liteScrape = await scrapeHomepageLite(websiteUrl);
      const scrapedContentBlock = [
        liteScrape.title && `Title: ${liteScrape.title}`,
        liteScrape.metaDescription && `Meta description: ${liteScrape.metaDescription}`,
        liteScrape.h1s.length > 0 && `Headings: ${liteScrape.h1s.join(' | ')}`,
        liteScrape.text && `Page text: ${liteScrape.text}`,
      ].filter(Boolean).join('\n');

      const MIN_CONTENT_LENGTH_FOR_CLASSIFICATION = 100;
      console.log(`📄 Scraped content for classification: ${scrapedContentBlock.length} chars (fetch success=${liteScrape.success})`);

      let companyIntelligence: any;
      let rawCompetitors: string[] = [];

      if (scrapedContentBlock.length < MIN_CONTENT_LENGTH_FOR_CLASSIFICATION) {
        // Not enough real signal to classify anything — return Unknown, don't guess.
        console.warn(`⚠️ Insufficient scraped content (${scrapedContentBlock.length} chars, need ${MIN_CONTENT_LENGTH_FOR_CLASSIFICATION}) — returning Unknown fields instead of guessing from the URL`);
        companyIntelligence = {
          companyName: deriveNameFromDomain(websiteUrl) || '',
          industry: 'Unknown',
          businessType: 'Unknown',
          targetAudience: 'Unknown',
          valueProposition: 'Unknown',
          marketPosition: 'Unknown',
          suggestedIndustries: [],
          suggestedKeywords: [],
          evidenceQuote: null,
          signalQuality: 'minimal',
        };
      } else {
        // Generate company intelligence — grounded ONLY in the scraped content above.
        const prompt = `You are extracting business facts for ${websiteUrl} using ONLY the scraped page content below. Do not use any other knowledge of this website or domain.

<SCRAPED_CONTENT>
${scrapedContentBlock}
</SCRAPED_CONTENT>

Return REAL business intelligence in this EXACT JSON format:
{
  "companyName": "official brand/company name as shown in the scraped content (e.g., 'Arcade', 'HubSpot', 'Stripe')",
  "industry": "specific industry/sector, based ONLY on the scraped content (e.g., 'Luxury Yacht Brokerage', 'SaaS Marketing', 'E-commerce Fashion')",
  "businessType": "specific business model (e.g., 'B2B Marketplace', 'D2C Retailer', 'Service Provider')",
  "targetAudience": "specific primary customer (e.g., 'High-net-worth yacht buyers', 'Small business owners', 'Tech startups')",
  "valueProposition": "unique value in 10 words max",
  "marketPosition": "competitive position, only if evidenced by the content, otherwise 'Unknown'",
  "suggestedIndustries": ["industry1", "industry2", "industry3"],
  "suggestedKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "evidenceQuote": "a short quote (max 20 words) COPIED VERBATIM from the SCRAPED_CONTENT above that supports the industry/businessType classification"
}

CRITICAL RULES:
- Use ONLY the text inside <SCRAPED_CONTENT> above. Do NOT infer or guess from the domain name or any outside knowledge — domain names and prior assumptions are often misleading.
- evidenceQuote MUST be copied verbatim from SCRAPED_CONTENT. If you cannot find a supporting quote, set industry, businessType, and evidenceQuote to "Unknown"/null rather than guessing.
- If the scraped content doesn't clearly indicate a field, use "Unknown" for that field. Never fabricate a plausible-sounding answer.
- Be SPECIFIC, not generic.
- suggestedIndustries: provide up to 3 alternative industry classifications based ONLY on the scraped content (empty array if none fit).
- suggestedKeywords: provide up to 5 main keywords/topics based ONLY on the scraped content.
- Return ONLY valid JSON, no explanation`;

        const llmResult1 = await llmCall({
          task: 'companyIntelligence',
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 900,
          temperature: 0.2,
          byokKey: apiKey,
        });

        const content = llmResult1.content;

        if (!content) {
          console.error(`❌ Empty response from AI.`);
          throw new Error('Empty response from AI service. Please try again.');
        }

        console.log(`📝 LLM response (first 300 chars): ${content.substring(0, 300)}...`);

        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
          console.error(`❌ No valid JSON found in response. Content: ${content.substring(0, 500)}`);
          throw new Error('Unable to parse website analysis. Please try again.');
        }

        companyIntelligence = parseRobustJSON(jsonMatch[0]);
        companyIntelligence.signalQuality = 'grounded';

        // Competitor auto-discovery — SEPARATE call, kept on live web search (Sonar).
        // DeepSeek (used above for classification) has no web access and would
        // hallucinate; this call needs to actually search who AI platforms cite.
        try {
          const competitorPrompt = `${websiteUrl} operates in the "${companyIntelligence.industry || 'Unknown'}" industry (business type: "${companyIntelligence.businessType || 'Unknown'}"), with keywords: ${(companyIntelligence.suggestedKeywords || []).join(', ') || 'none provided'}.

Search for these keywords/topics and identify which websites are being CITED by AI platforms (ChatGPT, Perplexity, Gemini, Claude) when users ask about this industry.

Return ONLY this exact JSON: {"suggestedCompetitors": ["competitor1.com", "competitor2.com", "competitor3.com"]}

STRICT RULES:
- Return domains that AI platforms currently cite/reference for this industry/these keywords — these are "AI visibility competitors" the user needs to outrank.
- Each competitor must be a REAL, EXISTING website domain you verified exists.
- If you cannot find websites being cited by AI for these topics, return an EMPTY array [].
- DO NOT guess or hallucinate competitor names — only return domains found in actual search results.
- Output ONLY the JSON, no explanation.`;

          const competitorLlmResult = await llmCall({
            task: 'competitorDiscovery',
            messages: [{ role: 'user', content: competitorPrompt }],
            maxTokens: 300,
            temperature: 0.2,
            byokKey: apiKey,
          });

          const competitorJsonMatch = competitorLlmResult.content?.match(/\{[\s\S]*\}/);
          if (competitorJsonMatch) {
            const parsedCompetitors = parseRobustJSON(competitorJsonMatch[0]);
            rawCompetitors = parsedCompetitors.suggestedCompetitors || [];
          }
        } catch (competitorErr: any) {
          console.warn('⚠️ Competitor auto-discovery failed (non-blocking):', competitorErr.message);
        }
      }

      // Validate competitor domains actually exist (filter out hallucinated ones)
      let validatedCompetitors: string[] = [];
      if (rawCompetitors.length > 0) {
        console.log(`🔍 Validating ${rawCompetitors.length} suggested competitors...`);
        const { valid, invalid } = await filterValidCompetitors(rawCompetitors);
        validatedCompetitors = valid;
        if (invalid.length > 0) {
          console.log(`⚠️ Filtered out ${invalid.length} invalid/non-existent domains: ${invalid.join(', ')}`);
        }
        console.log(`✅ ${validatedCompetitors.length} valid competitors: ${validatedCompetitors.join(', ') || '(none)'}`);
      }
      
      const processingTime = Math.round((Date.now() - startTime) / 1000);
      
      console.log(`✅ Company intelligence extracted in ${processingTime}s:`, companyIntelligence);
      console.log('==========================================\n');
      
      res.json({
        success: true,
        websiteUrl,
        companyIntelligence: {
          industry: companyIntelligence.industry || 'Unknown',
          businessType: companyIntelligence.businessType || 'Unknown',
          targetAudience: companyIntelligence.targetAudience || 'General audience',
          valueProposition: companyIntelligence.valueProposition || 'Not specified',
          marketPosition: companyIntelligence.marketPosition || 'Not specified'
        },
        suggestedIndustries: companyIntelligence.suggestedIndustries || [],
        suggestedKeywords: companyIntelligence.suggestedKeywords || [],
        suggestedCompetitors: validatedCompetitors,
        signalQuality: companyIntelligence.signalQuality || 'grounded',
        evidenceQuote: companyIntelligence.evidenceQuote || null,
        scrapedContent: {
          // Reused by Phase 2 (/api/audit/batch) so it doesn't need to re-fetch
          // the homepage or re-guess classification for the same site.
          title: liteScrape.title,
          metaDescription: liteScrape.metaDescription,
          h1s: liteScrape.h1s,
          text: liteScrape.text,
        },
        processingTime
      });
      
    } catch (error: any) {
      console.error('❌ Analysis failed:', error.message);
      console.log('==========================================\n');
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Analysis failed' 
      });
    }
  });

  // Batch audit endpoint with high-quality topic generation
  // Protected route - requires valid Firebase auth token
  app.post('/api/audit/batch', requireAuth, auditPerUserLimiter, async (req: AuthenticatedRequest, res) => {
    console.log('\n========== BATCH AUDIT (100 Topics) ==========');
    const startTime = Date.now();
    
    // Generate unique audit ID
    const auditId = openRouterTracker.generateAuditId();
    console.log(`🆔 Audit ID: ${auditId}`);
    
    // Get authenticated user from middleware
    const authenticatedUserId = req.user?.uid;
    const authenticatedEmail = req.user?.email;
    console.log(`🔐 Authenticated user: ${authenticatedEmail} (${authenticatedUserId})`);
    
    try {
      const { websiteUrl, userPlan, topicsPerCategory: requestedTopics, confirmedContext, phase1ScrapedContent } = req.body;
      
      const userId = authenticatedUserId!;
      const userEmail = authenticatedEmail;

      const { checkDomainLimit: checkBatchDomain } = await import('./domain-limiter');
      const { initializeApp: initBatchApp, getApp: getBatchApp } = await import('firebase/app');
      const { getFirestore: getBatchFs, doc: batchDoc, getDoc: getBatchDoc, collection: batchCollection, query: batchQuery, where: batchWhere, getDocs: getBatchDocs } = await import('firebase/firestore');
      let batchApp;
      try { batchApp = getBatchApp('batch-plan-app'); } catch {
        batchApp = initBatchApp({
          apiKey: process.env.VITE_FIREBASE_API_KEY,
          projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        }, 'batch-plan-app');
      }
      const batchDb = getBatchFs(batchApp);
      const batchUserDoc = await getBatchDoc(batchDoc(batchDb, 'users', userId));
      const serverPlan = batchUserDoc.exists() ? (batchUserDoc.data()?.subscriptionPlan || 'free') : 'free';
      const batchDomainCheck = await checkBatchDomain(userId, websiteUrl, serverPlan);
      if (!batchDomainCheck.allowed) {
        console.log(`🚫 Domain limit exceeded for user ${userId}: ${batchDomainCheck.currentDomains.length}/${batchDomainCheck.limit}`);
        return res.status(403).json({
          error: 'Domain limit reached',
          code: 'DOMAIN_LIMIT_EXCEEDED',
          details: `Your ${serverPlan} plan allows ${batchDomainCheck.limit} domain${batchDomainCheck.limit !== 1 ? 's' : ''}. Upgrade to add more domains.`,
          currentDomains: batchDomainCheck.currentDomains,
          limit: batchDomainCheck.limit
        });
      }

      // SERVER-SIDE MONTHLY AUDIT LIMIT ENFORCEMENT
      // Reads the same source as client-side canUserRunAudit: system/planSettings.<plan>.auditsPerMonth (-1 = unlimited)
      try {
        const planSettingsDoc = await getBatchDoc(batchDoc(batchDb, 'system', 'planSettings'));
        const monthlyLimit = planSettingsDoc.exists()
          ? planSettingsDoc.data()?.[serverPlan]?.auditsPerMonth
          : undefined;

        if (typeof monthlyLimit === 'number' && monthlyLimit !== -1) {
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);

          const userAuditsSnap = await getBatchDocs(
            batchQuery(batchCollection(batchDb, 'audits'), batchWhere('userId', '==', userId))
          );
          let auditsThisMonth = 0;
          userAuditsSnap.forEach((d) => {
            const ts = d.data()?.timestamp;
            const tsDate = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
            if (tsDate && tsDate >= monthStart) auditsThisMonth++;
          });

          if (auditsThisMonth >= monthlyLimit) {
            console.log(`🚫 Monthly audit limit reached for user ${userId}: ${auditsThisMonth}/${monthlyLimit} (${serverPlan})`);
            return res.status(403).json({
              error: 'Monthly audit limit reached',
              code: 'AUDIT_LIMIT_REACHED',
              details: `You've reached your monthly limit of ${monthlyLimit} audits on the ${serverPlan} plan. Upgrade to continue.`,
              used: auditsThisMonth,
              limit: monthlyLimit
            });
          }
          console.log(`✅ Audit limit check passed: ${auditsThisMonth}/${monthlyLimit} used this month (${serverPlan})`);
        }
      } catch (limitErr) {
        console.error('⚠️ Audit limit check failed (allowing audit to proceed):', limitErr);
      }

      const { getFeatureFlags: getFlags } = await import('./feature-flags');
      const planFlags = getFlags(serverPlan);
      const topicsPerCategory = Math.min(requestedTopics || planFlags.topicsPerCategory, planFlags.topicsPerCategory);
      
      const hasConfirmedContext = confirmedContext && confirmedContext.industry;
      if (hasConfirmedContext) {
        console.log('✅ Using USER-CONFIRMED business context (no AI inference)');
        console.log('📋 Confirmed context:', confirmedContext);
      }
      
      let apiKey: string;
      try {
        apiKey = await getOpenRouterApiKeyForUser(userId, serverPlan);
      } catch (error: any) {
        if (error.message?.includes('APPSUMO_KEY_REQUIRED')) {
          return res.status(400).json({ 
            error: 'API key required',
            details: 'AppSumo lifetime users must add their own Perplexity API key in Profile → API Configuration before running audits.',
            code: 'APPSUMO_KEY_REQUIRED'
          });
        }
        return res.status(500).json({ error: 'API key configuration error' });
      }

      console.log(`🎯 Batch generation for ${userPlan} plan - ${topicsPerCategory} topics per category`);
      
      // Create audit record in Firestore (use serverPlan — never trust client-supplied plan)
      await openRouterTracker.createAudit({
        auditId,
        userId: userId || 'anonymous',
        userEmail: userEmail,
        websiteUrl,
        planName: serverPlan
      });
      
      const domainName = extractDomain(websiteUrl);
      
      // EARLY SCRAPING: Scrape website content first for signal extraction (runs in parallel with company intel)
      console.log('🌐 Starting early website scraping for content signals...');

      // 3-minute global cap on scraping. If exceeded, abort and use whatever
      // signals were collected so far; flag the audit as a large site so the
      // report can show a "sampled pages" note.
      const SCRAPE_TIMEOUT_MS = 3 * 60 * 1000;
      const partialScrape: ScrapeResult = { html: '', text: '', sitemapUrls: [], discoveredSubdomains: [] };
      const scrapeAbort = new AbortController();
      let largeSiteDetected = false;
      const scrapeTimeoutHandle = setTimeout(() => {
        console.log(`⏰ Scrape exceeded ${SCRAPE_TIMEOUT_MS / 1000}s cap — aborting and using collected signals`);
        largeSiteDetected = true;
        scrapeAbort.abort();
      }, SCRAPE_TIMEOUT_MS);

      const scrapingPromise = scrapeWebsiteContent(websiteUrl, scrapeAbort.signal, partialScrape, serverPlan === 'lifetime')
        .then((result) => {
          clearTimeout(scrapeTimeoutHandle);
          // If timeout already fired, prefer the partial accumulator (may be richer than aborted-stage return)
          return largeSiteDetected ? partialScrape : result;
        })
        .catch((err) => {
          clearTimeout(scrapeTimeoutHandle);
          if (largeSiteDetected) return partialScrape;
          throw err;
        });

      // Generate company intelligence and topics in parallel
      console.log('📦 Starting parallel generation: company intelligence + topics...');

      // Build a scraped-content block to ground classification, preferring
      // Phase 1's already-scraped homepage (no re-fetch) and falling back to
      // waiting on the in-flight full scrape above if Phase 1 content wasn't sent.
      const buildScrapedBlock = (source: { title?: string; metaDescription?: string; h1s?: string[]; text?: string } | null | undefined) => {
        if (!source) return '';
        return [
          source.title && `Title: ${source.title}`,
          source.metaDescription && `Meta description: ${source.metaDescription}`,
          source.h1s && source.h1s.length > 0 && `Headings: ${source.h1s.join(' | ')}`,
          source.text && `Page text: ${source.text.slice(0, 2000)}`,
        ].filter(Boolean).join('\n');
      };

      // Generate company intelligence (or use confirmed context if provided)
      const companyIntelligencePromise = (async () => {
        // If user confirmed context from Phase 1, use it directly (no AI call needed)
        if (hasConfirmedContext) {
          console.log('✅ Using USER-CONFIRMED company intelligence (skipping AI generation)');
          return {
            companyName: confirmedContext.companyName || deriveNameFromDomain(websiteUrl) || '',
            industry: confirmedContext.industry,
            businessType: confirmedContext.businessType,
            targetAudience: confirmedContext.targetAudience,
            valueProposition: confirmedContext.valueProposition || 'Not specified',
            marketPosition: confirmedContext.marketPosition || 'Not specified',
            suggestedKeywords: confirmedContext.selectedKeywords || [],
            signalQuality: 'user-confirmed',
          };
        }

        // No confirmed context — ground classification in real scraped content.
        // Reuse Phase 1's scrape if the client sent it; otherwise wait for the
        // full multi-page scrape kicked off above (re-sequenced: scrape THEN classify).
        let scrapedContentBlock = buildScrapedBlock(phase1ScrapedContent);
        if (!scrapedContentBlock) {
          console.log('⏳ No Phase 1 scraped content provided — waiting on full scrape before classifying...');
          try {
            const scrapeResultForClassification = await scrapingPromise;
            scrapedContentBlock = buildScrapedBlock({ text: scrapeResultForClassification.text?.slice(0, 2000) });
          } catch {
            // scrapingPromise's own .catch() handles logging; treat as no content here.
            scrapedContentBlock = '';
          }
        } else {
          console.log('♻️ Reusing Phase 1 scraped content for classification (no re-scrape needed)');
        }

        const MIN_CONTENT_LENGTH_FOR_CLASSIFICATION = 100;
        console.log(`📄 Scraped content for classification: ${scrapedContentBlock.length} chars`);

        if (scrapedContentBlock.length < MIN_CONTENT_LENGTH_FOR_CLASSIFICATION) {
          console.warn(`⚠️ Insufficient scraped content (${scrapedContentBlock.length} chars) — returning Unknown fields instead of guessing`);
          return {
            companyName: deriveNameFromDomain(websiteUrl) || '',
            industry: 'Unknown',
            businessType: 'Unknown',
            targetAudience: 'Unknown',
            valueProposition: 'Unknown',
            marketPosition: 'Unknown',
            suggestedKeywords: [],
            evidenceQuote: null,
            signalQuality: 'minimal',
          };
        }

        const callStartTime = Date.now();
        try {
          console.log('🏢 Generating company intelligence (grounded in scraped content, no confirmed context provided)...');
          const prompt = `You are extracting business facts for ${websiteUrl} using ONLY the scraped page content below. Do not use any other knowledge of this website or domain.

<SCRAPED_CONTENT>
${scrapedContentBlock}
</SCRAPED_CONTENT>

Return REAL business intelligence in this EXACT JSON format:
{
  "companyName": "official brand/company name as shown in the scraped content (e.g., 'Arcade', 'HubSpot', 'Stripe')",
  "industry": "specific industry/sector, based ONLY on the scraped content (e.g., 'Luxury Yacht Brokerage', 'SaaS Marketing', 'E-commerce Fashion')",
  "businessType": "specific business model (e.g., 'B2B Marketplace', 'D2C Retailer', 'Service Provider')",
  "targetAudience": "specific primary customer (e.g., 'High-net-worth yacht buyers', 'Small business owners', 'Tech startups')",
  "valueProposition": "unique value in 10 words max",
  "marketPosition": "competitive position, only if evidenced by the content, otherwise 'Unknown'",
  "suggestedKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "evidenceQuote": "a short quote (max 20 words) COPIED VERBATIM from the SCRAPED_CONTENT above that supports the industry/businessType classification"
}

CRITICAL RULES:
- Use ONLY the text inside <SCRAPED_CONTENT> above. Do NOT infer or guess from the domain name or any outside knowledge.
- evidenceQuote MUST be copied verbatim from SCRAPED_CONTENT. If you cannot find a supporting quote, set industry, businessType, and evidenceQuote to "Unknown"/null rather than guessing.
- If the scraped content doesn't clearly indicate a field, use "Unknown" for that field. Never fabricate a plausible-sounding answer.
- Be SPECIFIC, not generic. Keep each field concise (max 15 words, except evidenceQuote).
- Return ONLY valid JSON, no explanation`;

          const llmResult2 = await llmCall({
            task: 'companyIntelligence',
            messages: [{ role: 'user', content: prompt }],
            maxTokens: 800,
            temperature: 0.2,
            byokKey: apiKey,
            auditId,
          });

          const content = llmResult2.content;
          const jsonMatch = content.match(/\{[\s\S]*\}/);

          // Log API call
          await openRouterTracker.logApiCall({
            auditId,
            type: 'company_intel',
            model: 'via-llm-router',
            tokens: {
              input: llmResult2.inputTokens,
              output: llmResult2.outputTokens,
              total: llmResult2.inputTokens + llmResult2.outputTokens
            },
            userId: userId || 'anonymous',
            websiteUrl,
            responseTime: Date.now() - callStartTime,
            status: 'success',
            promptLength: prompt.length,
            responseLength: content.length
          });
          
          if (jsonMatch) {
            const parsed = parseRobustJSON(jsonMatch[0]);
            parsed.signalQuality = 'grounded';
            console.log('✅ Company intelligence generated:', parsed);
            return parsed;
          }
          
          throw new Error('No JSON found in response');
        } catch (error) {
          // Log failed API call
          await openRouterTracker.logApiCall({
            auditId,
            type: 'company_intel',
            model: 'via-llm-router',
            tokens: { input: 0, output: 0, total: 0 },
            userId: userId || 'anonymous',
            websiteUrl,
            responseTime: Date.now() - callStartTime,
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Unknown error'
          });
          console.error('❌ Company intelligence generation failed:', error);
          throw error; // Don't use fallback - fail the request if AI can't analyze
        }
      })();
      
      // Generate competitor analysis - skip if user already confirmed competitors
      const hasConfirmedCompetitors = confirmedContext?.confirmedCompetitors && confirmedContext.confirmedCompetitors.length > 0;
      
      const competitorAnalysisPromise = (async () => {
        const callStartTime = Date.now();
        
        // If user confirmed competitors, analyze THOSE specific competitors (not find new ones)
        if (hasConfirmedCompetitors) {
          const userCompetitors = confirmedContext.confirmedCompetitors.map((c: string) => 
            c.replace(/^https?:\/\//, '').replace(/\/$/, '') // Clean URLs to domains
          );
          console.log('🎯 Analyzing USER-CONFIRMED competitors:', userCompetitors);
          
          const competitorList = userCompetitors.join(', ');
          const prompt = `Analyze the competitive landscape for ${websiteUrl} against these specific competitors: ${competitorList}

Return ONLY this exact JSON structure with no other text:
{"competitorStrengths":["strength1","strength2","strength3","strength4","strength5"],"competitorWeaknesses":["weakness1","weakness2","weakness3","weakness4","weakness5"],"marketOpportunities":["opportunity1","opportunity2","opportunity3","opportunity4","opportunity5"]}

STRICT RULES:
1. Analyze ONLY the competitors listed above: ${competitorList}
2. competitorStrengths: What these specific competitors do well that ${websiteUrl} should learn from
3. competitorWeaknesses: Where these competitors fall short that ${websiteUrl} can exploit
4. marketOpportunities: Content gaps and opportunities to outrank these competitors
5. Return EXACTLY 5 items per array (no more, no less)
6. Each item must be under 12 words
7. Output ONLY the JSON - no explanation, no markdown, no text before or after`;

          try {
            const llmResult3 = await llmCall({
              task: 'competitorAnalysis',
              messages: [{ role: 'user', content: prompt }],
              maxTokens: 1500,
              temperature: 0.1,
              byokKey: apiKey,
              auditId,
            });

            const content = llmResult3.content;
            const jsonMatch = content.match(/\{[\s\S]*\}/);

            await openRouterTracker.logApiCall({
              auditId,
              type: 'competitor',
              model: 'via-llm-router',
              tokens: {
                input: llmResult3.inputTokens,
                output: llmResult3.outputTokens,
                total: llmResult3.inputTokens + llmResult3.outputTokens
              },
              userId: userId || 'anonymous',
              websiteUrl,
              responseTime: Date.now() - callStartTime,
              status: 'success',
              promptLength: prompt.length,
              responseLength: content.length
            });
            
            if (jsonMatch) {
              const parsed = parseRobustJSON(jsonMatch[0]);
              
              // Validate parsed data has actual content (mirrors auto-discovered path)
              const hasStrengths = Array.isArray(parsed.competitorStrengths) && parsed.competitorStrengths.length > 0;
              const hasWeaknesses = Array.isArray(parsed.competitorWeaknesses) && parsed.competitorWeaknesses.length > 0;
              const hasOpportunities = Array.isArray(parsed.marketOpportunities) && parsed.marketOpportunities.length > 0;
              
              if (hasStrengths || hasWeaknesses || hasOpportunities) {
                console.log('✅ User-confirmed competitor analysis complete:', parsed);
                return {
                  mainCompetitors: userCompetitors,
                  competitorStrengths: parsed.competitorStrengths || [],
                  competitorWeaknesses: parsed.competitorWeaknesses || [],
                  marketOpportunities: parsed.marketOpportunities || [],
                  _userConfirmed: true
                };
              }
              console.warn('⚠️ User-confirmed competitor analysis parsed but arrays empty, retrying...');
            } else {
              console.warn('⚠️ No JSON found in user-confirmed competitor response, retrying. Raw:', content.substring(0, 200));
            }
          } catch (err) {
            console.warn('⚠️ User-confirmed competitor analysis first attempt failed:', err);
          }
          
          // RETRY with simpler prompt (mirrors auto-discovered retry path)
          try {
            const retryStartTime = Date.now();
            const simplePrompt = `List strengths, weaknesses, and opportunities for ${websiteUrl} vs ${competitorList}. Return ONLY JSON: {"competitorStrengths":["s1","s2","s3","s4","s5"],"competitorWeaknesses":["w1","w2","w3","w4","w5"],"marketOpportunities":["o1","o2","o3","o4","o5"]}`;

            const llmRetry4 = await llmCall({
              task: 'competitorAnalysis',
              messages: [{ role: 'user', content: simplePrompt }],
              maxTokens: 1000,
              temperature: 0.1,
              byokKey: apiKey,
              auditId,
            });

            const retryContent = llmRetry4.content;
            const retryJsonMatch = retryContent.match(/\{[\s\S]*\}/);

            await openRouterTracker.logApiCall({
              auditId,
              type: 'competitor',
              model: 'via-llm-router',
              tokens: {
                input: llmRetry4.inputTokens,
                output: llmRetry4.outputTokens,
                total: llmRetry4.inputTokens + llmRetry4.outputTokens
              },
              userId: userId || 'anonymous',
              websiteUrl,
              responseTime: Date.now() - retryStartTime,
              status: 'success',
              promptLength: simplePrompt.length,
              responseLength: retryContent.length
            });

            if (retryJsonMatch) {
              const parsed = parseRobustJSON(retryJsonMatch[0]);
              const hasData = (parsed.competitorStrengths?.length > 0) || (parsed.competitorWeaknesses?.length > 0) || (parsed.marketOpportunities?.length > 0);
              if (hasData) {
                console.log('✅ User-confirmed competitor analysis succeeded on retry:', parsed);
                return {
                  mainCompetitors: userCompetitors,
                  competitorStrengths: parsed.competitorStrengths || [],
                  competitorWeaknesses: parsed.competitorWeaknesses || [],
                  marketOpportunities: parsed.marketOpportunities || [],
                  _userConfirmed: true
                };
              }
            }
            console.warn('⚠️ User-confirmed competitor retry also returned empty data');
          } catch (retryErr) {
            console.warn('⚠️ User-confirmed competitor analysis retry failed:', retryErr);
          }
          
          // Deterministic fallback: generate basic analysis from what we know
          // Every company has competitors — never return empty arrays
          console.log('🔧 Generating deterministic competitor analysis fallback for:', competitorList);
          return {
            mainCompetitors: userCompetitors,
            competitorStrengths: [
              `Strong brand recognition in ${domainName.replace(/\..+/, '')} market`,
              'Established customer base and market presence',
              'Comprehensive product/service documentation',
              'Active content marketing and SEO strategy',
              'Regular product updates and feature releases'
            ],
            competitorWeaknesses: [
              'May lack specialized content for niche audiences',
              'Slower response to emerging industry trends',
              'Less personalized customer engagement content',
              'Limited thought leadership in specific sub-topics',
              'Gaps in long-form educational content'
            ],
            marketOpportunities: [
              'Create in-depth comparison content vs competitors',
              'Publish original research and industry benchmarks',
              'Build comprehensive FAQ and knowledge base content',
              'Develop case studies highlighting unique advantages',
              'Target underserved long-tail content topics'
            ],
            _userConfirmed: true,
            _fallbackGenerated: true
          };
        }
        
        try {
          console.log('🎯 Generating competitor analysis (no user-confirmed competitors)...');

          // Ground the auto-discovery search in the real classification (industry +
          // keywords) instead of a bare URL, so the live search targets the right
          // market. This still needs live web search (who does AI actually cite?),
          // so it stays on Perplexity Sonar — DeepSeek has no web access.
          let groundingLine = '';
          try {
            const groundingIntel = await companyIntelligencePromise;
            if (groundingIntel?.industry && groundingIntel.industry !== 'Unknown') {
              const kw = (groundingIntel.suggestedKeywords || []).slice(0, 5).join(', ');
              groundingLine = `\nKnown context: industry is "${groundingIntel.industry}"${groundingIntel.businessType ? ` (${groundingIntel.businessType})` : ''}${kw ? `, keywords: ${kw}` : ''}. Use this to find genuinely relevant competitors, not just same-domain guesses.`;
            }
          } catch {
            // Classification failed/threw — proceed without grounding context.
          }

          const prompt = `Analyze ${websiteUrl} and identify competitors.${groundingLine} Return ONLY this exact JSON structure with no other text:

{"mainCompetitors":["domain1.com","domain2.com","domain3.com","domain4.com","domain5.com"],"competitorStrengths":["strength1","strength2","strength3","strength4","strength5"],"competitorWeaknesses":["weakness1","weakness2","weakness3","weakness4","weakness5"],"marketOpportunities":["opportunity1","opportunity2","opportunity3","opportunity4","opportunity5"]}

STRICT RULES:
1. Return EXACTLY 5 items per array (no more, no less)
2. Each item must be under 12 words
3. Use real competitor domains (no https://)
4. Output ONLY the JSON - no explanation, no markdown, no text before or after`;

          const llmResult5 = await llmCall({
            task: 'competitorDiscovery',
            messages: [{ role: 'user', content: prompt }],
            maxTokens: 1500,
            temperature: 0.1,
            byokKey: apiKey,
            auditId,
          });

          const content = llmResult5.content;
          const jsonMatch = content.match(/\{[\s\S]*\}/);

          // Log API call
          await openRouterTracker.logApiCall({
            auditId,
            type: 'competitor',
            model: 'via-llm-router',
            tokens: {
              input: llmResult5.inputTokens,
              output: llmResult5.outputTokens,
              total: llmResult5.inputTokens + llmResult5.outputTokens
            },
            userId: userId || 'anonymous',
            websiteUrl,
            responseTime: Date.now() - callStartTime,
            status: 'success',
            promptLength: prompt.length,
            responseLength: content.length
          });
          
          if (jsonMatch) {
            const parsed = parseRobustJSON(jsonMatch[0]);
            
            // Validate the parsed data has actual content
            if (!validateCompetitorAnalysis(parsed)) {
              console.warn('⚠️ Competitor analysis parsed but validation failed (empty or incomplete data)');
              throw new Error('Competitor analysis validation failed - incomplete data');
            }
            
            console.log('✅ Competitor analysis generated:', parsed);
            return parsed;
          }
          
          throw new Error('No JSON found in response');
        } catch (firstError) {
          // Log failed first attempt
          await openRouterTracker.logApiCall({
            auditId,
            type: 'competitor',
            model: 'via-llm-router',
            tokens: { input: 0, output: 0, total: 0 },
            userId: userId || 'anonymous',
            websiteUrl,
            responseTime: Date.now() - callStartTime,
            status: 'error',
            errorMessage: firstError instanceof Error ? firstError.message : 'Unknown error'
          });
          console.warn('⚠️ First competitor analysis attempt failed, retrying with simpler prompt...');
          
          // RETRY with ultra-simple prompt
          try {
            const retryStartTime = Date.now();
            const simplePrompt = `List 5 competitors for ${domainName}. Return ONLY JSON: {"mainCompetitors":["a.com","b.com","c.com","d.com","e.com"],"competitorStrengths":["s1","s2","s3","s4","s5"],"competitorWeaknesses":["w1","w2","w3","w4","w5"],"marketOpportunities":["o1","o2","o3","o4","o5"]}`;

            const llmRetry6 = await llmCall({
              task: 'competitorDiscovery',
              messages: [{ role: 'user', content: simplePrompt }],
              maxTokens: 1000,
              temperature: 0.1,
              byokKey: apiKey,
              auditId,
            });

            const retryContent = llmRetry6.content;
            const retryJsonMatch = retryContent.match(/\{[\s\S]*\}/);

            await openRouterTracker.logApiCall({
              auditId,
              type: 'competitor',
              model: 'via-llm-router',
              tokens: {
                input: llmRetry6.inputTokens,
                output: llmRetry6.outputTokens,
                total: llmRetry6.inputTokens + llmRetry6.outputTokens
              },
              userId: userId || 'anonymous',
              websiteUrl,
              responseTime: Date.now() - retryStartTime,
              status: 'success',
              promptLength: simplePrompt.length,
              responseLength: retryContent.length
            });
            
            if (retryJsonMatch) {
              const parsed = parseRobustJSON(retryJsonMatch[0]);
              if (validateCompetitorAnalysis(parsed)) {
                console.log('✅ Competitor analysis succeeded on retry:', parsed);
                return parsed;
              }
            }
            throw new Error('Retry also failed to produce valid JSON');
          } catch (retryError) {
            console.error('❌ Competitor analysis retry also failed:', retryError);
            throw retryError;
          }
        }
      })();
      
      // Wait for company intelligence, competitor analysis, and scraping to complete in parallel
      let scrapingSucceeded = true;
      let scrapeErrorMessage: string | null = null;
      let competitorAnalysisFailed = false;
      
      // Transparent fallback when competitor analysis fails - uses empty arrays, not fake data
      const fallbackCompetitorAnalysis = {
        mainCompetitors: [],
        competitorStrengths: [],
        competitorWeaknesses: [],
        marketOpportunities: [],
        competitiveAdvantages: [],
        _unavailable: true // Internal flag to indicate data unavailable
      };
      
      const [companyIntelligence, competitorAnalysis, scrapedContent] = await Promise.all([
        companyIntelligencePromise,
        competitorAnalysisPromise.catch(err => {
          console.warn('⚠️ Competitor analysis unavailable:', err.message);
          competitorAnalysisFailed = true;
          return fallbackCompetitorAnalysis;
        }),
        scrapingPromise.catch(err => {
          console.warn('⚠️ Website scraping failed, using minimal signals:', err.message);
          scrapingSucceeded = false;
          scrapeErrorMessage = err.message || 'Website could not be reached';
          return { html: '', text: '', sitemapUrls: [] as string[], discoveredSubdomains: [] as string[] };
        })
      ]);
      
      const { html: scrapedHtml, text: scrapedText, sitemapUrls, discoveredSubdomains } = scrapedContent;
      
      // Extract content signals from scraped content (now we have company intelligence)
      console.log(`🎯 Extracting content signals for topic prioritization...`);
      let contentSignals = extractContentSignals(
        scrapedHtml, 
        scrapedText, 
        sitemapUrls,
        companyIntelligence
      );
      
      // LLM-VERIFICATION: Verify content types to fix over-counting
      // Only run verification if we have significant candidate URLs
      const candidateUrls = contentSignals.candidateUrls;
      const hasSignificantCandidates = candidateUrls && (
        candidateUrls.tutorials.length > 3 ||
        candidateUrls.caseStudies.length > 3 ||
        candidateUrls.faqs.length > 3 ||
        candidateUrls.research.length > 3 ||
        candidateUrls.frameworks.length > 3
      );
      
      // Store verification summary for UI transparency
      let verificationSummary: {
        tutorials: { candidates: number; verified: number; accuracy: number };
        caseStudies: { candidates: number; verified: number; accuracy: number };
        faqs: { candidates: number; verified: number; accuracy: number };
        frameworks: { candidates: number; verified: number; accuracy: number };
        wasVerified: boolean;
      } | undefined;
      
      if (hasSignificantCandidates && candidateUrls) {
        try {
          console.log('🔬 Running LLM verification on content samples...');
          const verification = await verifyAllContentTypes({
            tutorialUrls: candidateUrls.tutorials,
            caseStudyUrls: candidateUrls.caseStudies,
            faqUrls: candidateUrls.faqs,
            researchUrls: candidateUrls.research,
            frameworkUrls: candidateUrls.frameworks,
          }, 3); // Sample 3 URLs per type
          
          // Store verification summary for UI
          verificationSummary = {
            tutorials: { 
              candidates: verification.tutorials.candidateCount, 
              verified: verification.tutorials.adjustedCount,
              accuracy: Math.round(verification.tutorials.accuracyRate * 100)
            },
            caseStudies: { 
              candidates: verification.caseStudies.candidateCount, 
              verified: verification.caseStudies.adjustedCount,
              accuracy: Math.round(verification.caseStudies.accuracyRate * 100)
            },
            faqs: { 
              candidates: verification.faqs.candidateCount, 
              verified: verification.faqs.adjustedCount,
              accuracy: Math.round(verification.faqs.accuracyRate * 100)
            },
            frameworks: { 
              candidates: verification.frameworks.candidateCount, 
              verified: verification.frameworks.adjustedCount,
              accuracy: Math.round(verification.frameworks.accuracyRate * 100)
            },
            wasVerified: true
          };
          
          // Update content signals with verified counts
          if (verification.tutorials.adjustedCount !== contentSignals.tutorialCount) {
            console.log(`📊 Tutorials: ${contentSignals.tutorialCount} → ${verification.tutorials.adjustedCount} (verified)`);
            contentSignals = { ...contentSignals, tutorialCount: verification.tutorials.adjustedCount };
          }
          if (verification.caseStudies.adjustedCount !== contentSignals.caseStudyCount) {
            console.log(`📊 Case Studies: ${contentSignals.caseStudyCount} → ${verification.caseStudies.adjustedCount} (verified)`);
            contentSignals = { ...contentSignals, caseStudyCount: verification.caseStudies.adjustedCount };
          }
          if (verification.faqs.adjustedCount !== contentSignals.faqSectionCount) {
            console.log(`📊 FAQs: ${contentSignals.faqSectionCount} → ${verification.faqs.adjustedCount} (verified)`);
            contentSignals = { ...contentSignals, faqSectionCount: verification.faqs.adjustedCount };
          }
          if (verification.frameworks.adjustedCount !== contentSignals.frameworkMentionCount) {
            console.log(`📊 Frameworks: ${contentSignals.frameworkMentionCount} → ${verification.frameworks.adjustedCount} (verified)`);
            contentSignals = { ...contentSignals, frameworkMentionCount: verification.frameworks.adjustedCount };
          }
          // Note: Research verification is logged but dataPointCount is derived from multiple sources
          // (text patterns + research URLs * 5), so we log but don't directly adjust the count
          console.log(`📊 Research URLs: ${verification.research.candidateCount} candidates → ${verification.research.adjustedCount} verified (informational only)`);
        } catch (verificationError) {
          console.warn('⚠️ Content verification failed, using unverified counts:', verificationError);
        }
      }
      
      // Validate signal extraction - warn if minimal signals detected
      const totalSignalCount = contentSignals.tutorialCount + contentSignals.caseStudyCount + 
        contentSignals.faqSectionCount + contentSignals.dataPointCount + contentSignals.howToGuideCount;
      
      if (totalSignalCount === 0) {
        console.warn('⚠️ Minimal content signals detected - website may be inaccessible or content-sparse');
      }
      
      // Calculate platform scores to identify weakest platform
      const scoringResult = calculatePlatformScoresV2(contentSignals, sitemapUrls.length, discoveredSubdomains.length, companyIntelligence?.industry || '', contentSignals.totalPageCount || 0);

      // Blueprint audit — runs in parallel, non-blocking on failure
      let blueprintResult = null;
      try {
        blueprintResult = await runBlueprintAudit({
          websiteUrl,
          html: scrapedHtml,
          text: scrapedText,
          sitemapUrls,
          brandName: companyIntelligence?.companyName || domainName,
          companyName: companyIntelligence?.companyName || domainName,
          industry: companyIntelligence?.industry || '',
          primaryQuery: confirmedContext?.selectedKeywords?.[0] || companyIntelligence?.suggestedKeywords?.[0] || '',
        });
      } catch (err: any) {
        console.warn('⚠️ Blueprint audit failed (non-blocking):', err?.message);
      }

      // Identify the platform with lowest score
      const platformScores = scoringResult.platformScores;
      type PlatformKey = 'chatgpt' | 'perplexity' | 'gemini' | 'claude';
      const lowestPlatform: PlatformKey = (Object.entries(platformScores) as [PlatformKey, number][])
        .sort((a, b) => a[1] - b[1])[0][0];
      
      // Calculate signal gaps (how many more of each content type would help)
      const signalGaps = {
        tutorials: Math.max(0, 5 - contentSignals.tutorialCount),
        caseStudies: Math.max(0, 4 - contentSignals.caseStudyCount),
        faqs: Math.max(0, 3 - contentSignals.faqSectionCount),
        dataPoints: Math.max(0, 10 - contentSignals.dataPointCount),
        frameworks: Math.max(0, 3 - contentSignals.frameworkMentionCount),
        howToGuides: Math.max(0, 4 - contentSignals.howToGuideCount)
      };
      
      console.log(`📊 Content Signals for Topic Generation:`, {
        tutorials: contentSignals.tutorialCount,
        faqs: contentSignals.faqSectionCount,
        caseStudies: contentSignals.caseStudyCount,
        dataPoints: contentSignals.dataPointCount,
        lowestPlatform: lowestPlatform,
        lowestScore: platformScores[lowestPlatform],
        scrapingSucceeded: scrapingSucceeded
      });
      
      // Always include company intelligence in topic context for accurate topic generation
      // Signal context is optional (can be minimal), but company intelligence is MANDATORY
      const hasMinimalSignals = totalSignalCount === 0;
      
      // CRITICAL FIX: Always pass company intelligence to prevent domain name inference hallucinations
      // Also include selected keywords (prioritized) and confirmed competitors from user confirmation
      const topicContext: TopicGenerationContext = {
        signals: contentSignals,
        platformScores: platformScores,
        lowestPlatform: lowestPlatform,
        signalGaps: signalGaps,
        companyIntelligence: {
          industry: companyIntelligence.industry || 'Unknown',
          businessType: companyIntelligence.businessType || 'Unknown',
          targetAudience: companyIntelligence.targetAudience || 'General audience',
          valueProposition: companyIntelligence.valueProposition || 'Not specified',
          marketPosition: companyIntelligence.marketPosition || 'Not specified'
        },
        selectedKeywords: confirmedContext?.selectedKeywords || [],
        confirmedCompetitors: confirmedContext?.confirmedCompetitors || []
      };
      
      if (hasMinimalSignals) {
        console.warn('⚠️ Generating topics with minimal signal context but WITH company intelligence');
      }
      
      const batchGenerator = new BatchTopicGenerator(apiKey, auditId, userId, topicContext);
      
      // Derive company name: prefer AI-extracted name, fallback to robust domain parsing
      const aiExtractedName = companyIntelligence.companyName?.trim();
      const rawDomain = extractDomain(websiteUrl);
      const domainFallbackName = (() => {
        let name = rawDomain;
        name = name.replace(/\.[a-z]{2,}$/i, '');
        name = name.replace(/\.(co|com|org|net|gov|edu|ac)$/i, '');
        return name.charAt(0).toUpperCase() + name.slice(1);
      })();
      const companyName = aiExtractedName && aiExtractedName.length >= 2 && aiExtractedName !== 'Needs Verification'
        ? aiExtractedName
        : domainFallbackName;
      console.log(`🏷️ Company name: "${companyName}" (source: ${aiExtractedName ? 'AI-extracted' : 'domain-derived'})`);

      // Citation Snapshot: Check real AI mentions (runs in parallel with topic generation)
      console.log('🔍 Running citation snapshot...');
      const citationSnapshotPromise = generateCitationSnapshot({
        websiteUrl,
        industry: companyIntelligence.industry || 'General',
        companyName: companyName,
        keywords: confirmedContext?.selectedKeywords || companyIntelligence.suggestedKeywords || [],
        apiKey: apiKey,
        auditId,
      }).catch(err => {
        console.warn('⚠️ Citation snapshot failed (non-blocking):', err.message);
        return null;
      });

      // Now generate topics (they will use content signal context for prioritization)
      console.log('📦 Generating topics with content signal prioritization...');
      const [rawAuthoritative, rawThoughtLeadership, rawCompetitiveAdvantage, rawEmergingOpportunity, citationSnapshotResult] = await Promise.all([
        batchGenerator.generateTopicsForCategory(websiteUrl, 'authoritative', topicsPerCategory),
        batchGenerator.generateTopicsForCategory(websiteUrl, 'thoughtLeadership', topicsPerCategory),
        batchGenerator.generateTopicsForCategory(websiteUrl, 'competitiveAdvantage', topicsPerCategory),
        batchGenerator.generateTopicsForCategory(websiteUrl, 'emergingOpportunity', topicsPerCategory),
        citationSnapshotPromise
      ]);
      
      // TOPIC DEDUPLICATION: Remove near-duplicate topics
      console.log('🔄 Deduplicating topics across categories...');
      const authoritative = processTopics(rawAuthoritative, { similarityThreshold: 0.75, maxPerType: 12 });
      const thoughtLeadership = processTopics(rawThoughtLeadership, { similarityThreshold: 0.75, maxPerType: 12 });
      const competitiveAdvantage = processTopics(rawCompetitiveAdvantage, { similarityThreshold: 0.75, maxPerType: 12 });
      const emergingOpportunity = processTopics(rawEmergingOpportunity, { similarityThreshold: 0.75, maxPerType: 12 });

      // Build topicWarnings for any category where the generator returned fewer topics than requested
      const topicWarnings: Record<string, { requested: number; received: number }> = {};
      const categoryRawMap: Record<string, any[]> = {
        authoritative: rawAuthoritative,
        thoughtLeadership: rawThoughtLeadership,
        competitiveAdvantage: rawCompetitiveAdvantage,
        emergingOpportunity: rawEmergingOpportunity,
      };
      for (const [cat, raw] of Object.entries(categoryRawMap)) {
        if (raw.length < topicsPerCategory) {
          topicWarnings[cat] = { requested: topicsPerCategory, received: raw.length };
          console.warn(`⚠️ Partial topics for ${cat}: ${raw.length}/${topicsPerCategory}`);
        }
      }

      const processingTime = Math.round((Date.now() - startTime) / 1000);
      
      console.log(`\n✅ BATCH GENERATION COMPLETE`);
      console.log(`   Authoritative: ${rawAuthoritative.length} → ${authoritative.length} topics (deduplicated)`);
      console.log(`   Thought Leadership: ${rawThoughtLeadership.length} → ${thoughtLeadership.length} topics (deduplicated)`);
      console.log(`   Competitive Advantage: ${rawCompetitiveAdvantage.length} → ${competitiveAdvantage.length} topics (deduplicated)`);
      console.log(`   Emerging Opportunity: ${rawEmergingOpportunity.length} → ${emergingOpportunity.length} topics (deduplicated)`);
      console.log(`   Total: ${authoritative.length + thoughtLeadership.length + competitiveAdvantage.length + emergingOpportunity.length} topics`);
      console.log(`   Time: ${processingTime} seconds`);
      console.log(`==========================================\n`);

      console.log(`✅ Company Intelligence:`, companyIntelligence);
      console.log(`✅ Competitor Analysis:`, competitorAnalysis);

      // Platform scores were already calculated earlier for topic prioritization
      console.log(`✅ Content Signal-Based Platform Scores:`, scoringResult.platformScores);
      console.log(`   Overall: ${scoringResult.overallScore} (${scoringResult.letterGrade})`);
      
      // Generate signal-based strengths and weaknesses
      const competitors = competitorAnalysis.mainCompetitors || [];
      
      const strengths = generateSignalBasedStrengths(contentSignals, companyName, competitors);
      const weaknesses = generateSignalBasedWeaknesses(contentSignals, companyName, competitors, companyIntelligence?.industry || '', contentSignals.totalPageCount || 0);
      const industryBenchmarkData = companyIntelligence ? getIndustryBenchmarks(companyIntelligence.industry || '') : undefined;
      const recommendations = generateSignalBasedRecommendations(contentSignals, companyName, competitors, industryBenchmarkData);
      
      console.log(`📋 Generated ${strengths.length} strengths, ${weaknesses.length} weaknesses, ${recommendations.length} recommendations`);
      
      // Combine scoring result with strengths/weaknesses
      const scores = {
        ...scoringResult,
        strengths,
        weaknesses
      };

      // hasMinimalSignals already calculated above (used for topic context gating)
      
      // Generate "Why This Score" explanation based on content signals
      const scoreExplanation = {
        contentSignals: {
          tutorials: contentSignals.tutorialCount,
          caseStudies: contentSignals.caseStudyCount,
          faqs: contentSignals.faqSectionCount,
          dataPoints: contentSignals.dataPointCount,
          frameworks: contentSignals.frameworkMentionCount,
          howToGuides: contentSignals.howToGuideCount,
          schemaMarkup: contentSignals.schemaTypeCount,
          externalLinks: contentSignals.externalLinkCount,
          longFormContent: contentSignals.longFormContentScore
        },
        platformDrivers: {
          chatgpt: (() => {
            const hasTutorials = contentSignals.tutorialCount >= 5;
            const hasHowTo = contentSignals.howToGuideCount >= 3;
            const hasFaqs = contentSignals.faqSectionCount >= 3;
            if (hasTutorials || hasHowTo || hasFaqs) {
              const parts = [];
              if (hasTutorials) parts.push(`${contentSignals.tutorialCount} tutorials`);
              if (hasHowTo) parts.push(`${contentSignals.howToGuideCount} how-to guides`);
              if (hasFaqs) parts.push(`${contentSignals.faqSectionCount} FAQ sections`);
              return `Strong practical content detected: ${parts.join(", ")} — well positioned for ChatGPT citations.`;
            }
            const best = Math.max(contentSignals.tutorialCount, contentSignals.howToGuideCount, contentSignals.faqSectionCount);
            if (best > 0) {
              return `Some practical content found but below benchmark. Expanding tutorials and FAQs will improve ChatGPT visibility.`;
            }
            return `No tutorials, how-to guides, or FAQ sections detected. ChatGPT heavily favours practical step-by-step content.`;
          })(),
          perplexity: (() => {
            const hasData = contentSignals.dataPointCount >= 15;
            const hasLinks = contentSignals.externalLinkCount >= 10;
            const hasStats = contentSignals.statisticMentionCount >= 5;
            if (hasData || hasLinks || hasStats) {
              const parts = [];
              if (hasData) parts.push(`${contentSignals.dataPointCount} data points`);
              if (hasLinks) parts.push(`${contentSignals.externalLinkCount} external citations`);
              if (hasStats) parts.push(`${contentSignals.statisticMentionCount} statistics`);
              return `Research-backed content detected: ${parts.join(", ")} — strong signal for Perplexity citations.`;
            }
            const best = Math.max(contentSignals.dataPointCount, contentSignals.externalLinkCount, contentSignals.statisticMentionCount);
            if (best > 0) {
              return `Some research signals found but below benchmark. Adding data points and external citations will improve Perplexity visibility.`;
            }
            return `No data points, statistics, or external citations detected. Perplexity prioritises research-backed, citation-heavy content.`;
          })(),
          gemini: (() => {
            const hasSchema = contentSignals.schemaTypeCount >= 2;
            const hasHeadings = contentSignals.headingHierarchyScore >= 50;
            const hasImages = contentSignals.imageCount >= 10;
            if (hasSchema || hasHeadings || hasImages) {
              const parts = [];
              if (hasSchema) parts.push(`${contentSignals.schemaTypeCount} schema types`);
              if (hasHeadings) parts.push(`heading score ${contentSignals.headingHierarchyScore}/100`);
              if (hasImages) parts.push(`${contentSignals.imageCount} images`);
              return `Good technical structure detected: ${parts.join(", ")} — well positioned for Gemini citations.`;
            }
            const best = Math.max(contentSignals.schemaTypeCount, contentSignals.imageCount);
            if (best > 0) {
              return `Some structure detected but below benchmark. Adding schema markup and improving heading hierarchy will improve Gemini visibility.`;
            }
            return `Minimal technical structure detected. Gemini favours well-organised content with schema markup and clear heading hierarchies.`;
          })(),
          claude: (() => {
            const hasCaseStudies = contentSignals.caseStudyCount >= 3;
            const hasFrameworks = contentSignals.frameworkMentionCount >= 3;
            const hasLongForm = contentSignals.longFormContentScore >= 40;
            if (hasCaseStudies || hasFrameworks || hasLongForm) {
              const parts = [];
              if (hasCaseStudies) parts.push(`${contentSignals.caseStudyCount} case studies`);
              if (hasFrameworks) parts.push(`${contentSignals.frameworkMentionCount} frameworks`);
              if (hasLongForm) parts.push(`long-form content score ${contentSignals.longFormContentScore}/100`);
              return `Strong analytical depth detected: ${parts.join(", ")} — well positioned for Claude citations.`;
            }
            const best = Math.max(contentSignals.caseStudyCount, contentSignals.frameworkMentionCount);
            if (best > 0) {
              return `Some analytical content found but below benchmark. Adding case studies and proprietary frameworks will improve Claude visibility.`;
            }
            return `Limited analytical depth detected. Claude favours nuanced long-form content with clear frameworks and real-world case studies.`;
          })(),
        },
        weakestArea: lowestPlatform === 'chatgpt' ? 'Tutorials & How-to Content' 
          : lowestPlatform === 'perplexity' ? 'Data & Citations'
          : lowestPlatform === 'gemini' ? 'Schema & Structure'
          : 'Case Studies & Frameworks',
        strongestArea: (() => {
          const candidates: { label: string; score: number }[] = [
            { label: "Case Studies", score: contentSignals.caseStudyCount * 3 },
            { label: "Data & Research", score: contentSignals.dataPointCount * 0.5 },
            { label: "Tutorials", score: contentSignals.tutorialCount * 2 },
            { label: "FAQ Content", score: contentSignals.faqSectionCount * 2.5 },
            { label: "Schema Markup", score: contentSignals.schemaTypeCount * 4 },
          ];
          const topCandidate = candidates.reduce((best, c) => c.score > best.score ? c : best, candidates[0]);
          const strongestArea = topCandidate.score === 0 ? "No Strong Area Detected" : topCandidate.label;
          if (
            strongestArea === "No Strong Area Detected" ||
            strongestArea === "General Content"
          ) {
            return null;
          }
          return strongestArea;
        })()
      };
      
      // Return complete audit data structure with real values
      const auditData = {
        companyIntelligence: { ...companyIntelligence, companyName: companyName },
        competitorAnalysis: {
          ...competitorAnalysis,
          competitorStrengths: sanitizeStringArray(competitorAnalysis.competitorStrengths || []),
          competitorWeaknesses: sanitizeStringArray(competitorAnalysis.competitorWeaknesses || []),
          marketOpportunities: sanitizeStringArray(competitorAnalysis.marketOpportunities || [])
        },
        // Signal quality indicator for user-facing warning
        signalQuality: hasMinimalSignals ? 'minimal' : 'normal',
        // Scraping status indicator surfaces silent failures to the user
        scrapingStatus: {
          success: scrapingSucceeded,
          warning: scrapingSucceeded ? null : "We could not fully scan your website. This may be because your site uses JavaScript rendering (React/Next.js), bot protection (Cloudflare), or was temporarily unreachable. Scores are estimated from available domain data and may not reflect your full content quality.",
          errorDetail: scrapeErrorMessage,
          largeSiteDetected: largeSiteDetected,
          largeSiteNote: largeSiteDetected ? "Large site detected — analysis based on sampled pages." : null,
        },
        // Content verification summary for UI transparency
        contentVerification: verificationSummary,
        // "Why This Score" explanation for transparency
        scoreExplanation: scoreExplanation,
        auditResults: {
          overallScore: scores.overallScore,
          letterGrade: scores.letterGrade,
          platformScores: scores.platformScores,
          strengths: strengths,
          weaknesses: weaknesses,
          // Disclaimer when content signals are minimal or competitor analysis unavailable
          disclaimer: (() => {
            const disclaimers: string[] = [];
            if (hasMinimalSignals) {
              disclaimers.push('Limited content signals detected. Scores are based on domain analysis rather than full content extraction.');
            }
            if (competitorAnalysisFailed) {
              disclaimers.push('Competitor analysis unavailable. Topic recommendations are based on industry best practices.');
            }
            return disclaimers.length > 0 ? disclaimers.join(' ') : undefined;
          })(),
          technicalFindings: {
            domainAuthority: (() => {
              // Based on actual site scale signals: subdomain presence, sitemap size, documentation depth
              const sitemapSize = sitemapUrls?.length ?? 0;
              const subdomainCount = discoveredSubdomains?.length ?? 0;
              const docPages = contentSignals.documentationPageCount ?? 0;
              const score =
                (sitemapSize >= 1000 ? 3 : sitemapSize >= 200 ? 2 : sitemapSize >= 50 ? 1 : 0) +
                (subdomainCount >= 3 ? 2 : subdomainCount >= 1 ? 1 : 0) +
                (docPages >= 20 ? 2 : docPages >= 5 ? 1 : 0);
              if (score >= 5) return "High";
              if (score >= 3) return "Medium";
              if (score >= 1) return "Low";
              return "Low";
            })(),
            contentStructure: (() => {
              // Based on actual heading hierarchy score and step-by-step list count
              const headingScore = contentSignals.headingHierarchyScore ?? 0;
              const stepLists = contentSignals.stepByStepListCount ?? 0;
              const blogPosts = contentSignals.blogPostCount ?? 0;
              const score =
                (headingScore >= 70 ? 3 : headingScore >= 40 ? 2 : headingScore >= 10 ? 1 : 0) +
                (stepLists >= 5 ? 2 : stepLists >= 1 ? 1 : 0) +
                (blogPosts >= 20 ? 1 : 0);
              if (score >= 5) return "Excellent";
              if (score >= 3) return "Good";
              if (score >= 1) return "Fair";
              return "Poor";
            })(),
            schemaMarkup: (() => {
              // Based on actual schema type count detected from JSON-LD blocks in HTML
              const schemaTypes = contentSignals.schemaTypeCount ?? 0;
              if (schemaTypes >= 4) return "Implemented";
              if (schemaTypes >= 1) return "Partial";
              return "Missing";
            })(),
            entityRecognition: (() => {
              // Based on signals that help AI platforms identify what this entity is:
              // framework mentions (named concepts), case studies (named outcomes),
              // structured data presence, and nuanced term count
              const frameworks = contentSignals.frameworkMentionCount ?? 0;
              const caseStudies = contentSignals.caseStudyCount ?? 0;
              const hasSchema = contentSignals.hasStructuredData ?? false;
              const nuanced = contentSignals.nuancedTermCount ?? 0;
              const score =
                (frameworks >= 5 ? 3 : frameworks >= 2 ? 2 : frameworks >= 1 ? 1 : 0) +
                (caseStudies >= 5 ? 2 : caseStudies >= 2 ? 1 : 0) +
                (hasSchema ? 2 : 0) +
                (nuanced >= 8 ? 1 : 0);
              if (score >= 6) return "Strong";
              if (score >= 3) return "Moderate";
              return "Weak";
            })(),
          }
        },
        contentTopics: {
          authoritative: sanitizeTopics(authoritative),
          thoughtLeadership: sanitizeTopics(thoughtLeadership),
          competitiveAdvantage: sanitizeTopics(competitiveAdvantage),
          emergingOpportunity: sanitizeTopics(emergingOpportunity)
        },
        ...(Object.keys(topicWarnings).length > 0 && { topicWarnings }),
        visibilityPotential: {
          overallPotential: scores.overallScore >= 75 ? 'High' : scores.overallScore >= 50 ? 'Medium' : 'Low',
          platformAlignment: {
            chatgpt: scores.platformScores.chatgpt >= 75 ? 'Strong' : scores.platformScores.chatgpt >= 50 ? 'Moderate' : 'Weak',
            perplexity: scores.platformScores.perplexity >= 75 ? 'Strong' : scores.platformScores.perplexity >= 50 ? 'Moderate' : 'Weak',
            gemini: scores.platformScores.gemini >= 75 ? 'Strong' : scores.platformScores.gemini >= 50 ? 'Moderate' : 'Weak',
            claude: scores.platformScores.claude >= 75 ? 'Strong' : scores.platformScores.claude >= 50 ? 'Moderate' : 'Weak'
          }
        },
        competitorGaps: {
          opportunityAreas: (() => {
            if (citationSnapshotResult && citationSnapshotResult.promptResults) {
              const gaps = citationSnapshotResult.promptResults
                .filter((r: any) => !r.mentioned && r.competitorsMentioned && r.competitorsMentioned.length > 0)
                .slice(0, 5)
                .map((r: any) => {
                  const topComps = r.competitorsMentioned.slice(0, 3).join(', ');
                  return `Not appearing for "${r.prompt}" — ${topComps} are being cited instead`;
                });
              if (gaps.length > 0) return gaps;
            }
            return sanitizeStringArray(competitorAnalysis.marketOpportunities || []);
          })(),
          contentAdvantages: sanitizeStringArray(competitorAnalysis.competitorWeaknesses || []),
          unavailable: competitorAnalysisFailed
        },
        disclaimers: {
          note: "Scores indicate content alignment potential, not actual citation counts which cannot be measured.",
          searchVolumeNote: "All search volumes are estimates presented as ranges."
        },
        marketContext: {
          industryTrends: [
            `${companyIntelligence.industry} sector growth`,
            `${companyIntelligence.businessType} innovations`,
            `${companyIntelligence.targetAudience} demand trends`
          ]
        },
        recommendations: recommendations,
        industryBenchmark: companyIntelligence ? getIndustryBenchmarks(companyIntelligence.industry || '') : undefined,
        playbook: companyIntelligence ? generatePlaybook(
          contentSignals,
          scoringResult,
          companyIntelligence,
          companyName
        ) : undefined,
        citationSnapshot: citationSnapshotResult || null,
        processingDetails: {
          analysisDepth: "comprehensive",
          competitorsAnalyzed: competitorAnalysis.mainCompetitors.length,
          dataSourcesUsed: ["website content", "competitor research", "market intelligence", "AI platform analysis", "batch topic generation"],
          processingTime: `${processingTime} seconds`
        }
      };

      // Complete audit tracking
      const totalTopicsGenerated = authoritative.length + thoughtLeadership.length + competitiveAdvantage.length + emergingOpportunity.length;
      await openRouterTracker.completeAudit(auditId, {
        status: 'completed',
        duration: Date.now() - startTime,
        topicsGenerated: totalTopicsGenerated
      });

      // Save full audit data + checklist to Firestore for retrieval and checklist tracking
      try {
        const { initializeApp: initApp, getApp: getAppInstance } = await import('firebase/app');
        const { getFirestore: getFs, doc: fsDoc, setDoc: fsSetDoc } = await import('firebase/firestore');
        let checklistApp;
        try { checklistApp = getAppInstance('checklist-app'); } catch {
          checklistApp = initApp({
            apiKey: process.env.VITE_FIREBASE_API_KEY,
            projectId: process.env.VITE_FIREBASE_PROJECT_ID,
          }, 'checklist-app');
        }
        const checklistDb = getFs(checklistApp);

        await fsSetDoc(fsDoc(checklistDb, 'audits', auditId), {
          auditData: JSON.parse(JSON.stringify(auditData)),
          websiteUrl,
          userId,
          generatedAt: new Date().toISOString(),
          userPlanAtTime: serverPlan,
          creditsUsed: 1,
          snapshotPrompts: citationSnapshotResult?.promptResults?.map((pr: any) => pr.prompt) ?? [],
        }, { merge: true });

        if (auditData.playbook && auditData.playbook.actions) {
          const checklistItems = auditData.playbook.actions.map((action: any) => ({
            actionId: action.id,
            title: action.title,
            priority: action.priority,
            targetPlatform: action.targetPlatform,
            estimatedImpact: action.estimatedImpact,
            difficulty: action.difficulty,
            completed: false,
            completedAt: null,
          }));
          await fsSetDoc(fsDoc(checklistDb, 'audits', auditId), {
            checklist: checklistItems,
          }, { merge: true });
          console.log(`✅ Saved ${checklistItems.length} checklist items for audit ${auditId}`);
        }
      } catch (saveErr: any) {
        console.warn('⚠️ Non-blocking: Failed to save audit data/checklist:', saveErr.message);
      }

      try {
        await saveScoreHistory(auditId, {
          overallScore: auditData.auditResults.overallScore,
          letterGrade: auditData.auditResults.letterGrade,
          platformScores: auditData.auditResults.platformScores,
        }, 'initial');
      } catch (historyErr: any) {
        console.warn('⚠️ Non-blocking: Failed to save score history:', historyErr.message);
      }

      if (auditData.citationSnapshot) {
        try {
          await saveCitationSnapshot(auditId, auditData.citationSnapshot, 'initial');
        } catch (citHistErr: any) {
          console.warn('⚠️ Non-blocking: Failed to save citation history:', citHistErr.message);
        }
      }

      writeToDataset({
        auditId,
        websiteUrl,
        industry: companyIntelligence?.industry || '',
        businessType: companyIntelligence?.businessType || '',
        targetAudience: companyIntelligence?.targetAudience || '',
        overallScore: scoringResult.overallScore,
        letterGrade: scoringResult.letterGrade,
        platformScores: scoringResult.platformScores,
        scoreBreakdown: {
          contentDepth: scoringResult.breakdown.contentDepth,
          structureTechnical: scoringResult.breakdown.structureTechnical,
          researchCitations: scoringResult.breakdown.researchCitations,
          authority: scoringResult.breakdown.authority,
        },
        signals: contentSignals,
        citationMentionRate: auditData.citationSnapshot?.mentionRate ?? null,
        citationPromptsChecked: auditData.citationSnapshot?.totalPromptsChecked ?? null,
        topCompetitors: (auditData.citationSnapshot?.topCompetitorsCited ?? []).map((c: any) => c.name),
        playbookActionCount: auditData.playbook?.actions?.length ?? 0,
        quickWinCount: auditData.playbook?.quickWins?.length ?? 0,
        planName: serverPlan,
        scrapingSuccess: !(auditData.scrapingStatus?.warning),
        signalQuality: (auditData.signalQuality ?? 'normal') as 'minimal' | 'normal',
        largeSiteDetected: largeSiteDetected,
      }).catch(() => {});

      // Fire-and-forget: sync to Loops for lifecycle/drip emails
      (async () => {
        try {
          const userEmail = (req as any).user?.email;
          if (!userEmail) return;

          // Detect first audit deterministically via a persisted marker on the user doc
          // (avoids count-aggregation lag misfiring the drip trigger on later audits)
          const { doc: fsDoc2, getDoc: fsGetDoc2, setDoc: fsSetDoc2, getFirestore: getFs2 } = await import('firebase/firestore');
          const { getApp: getAppInstance2 } = await import('firebase/app');
          let isFirstAudit = false;
          try {
            const db2 = getFs2(getAppInstance2('checklist-app'));
            const userRef2 = fsDoc2(db2, 'users', userId);
            const userSnap2 = await fsGetDoc2(userRef2);
            if (!userSnap2.exists() || !userSnap2.data()?.firstAuditAt) {
              isFirstAudit = true;
              await fsSetDoc2(userRef2, { firstAuditAt: new Date().toISOString() }, { merge: true });
            }
          } catch { isFirstAudit = false; }

          await loopsService.syncAuditCompleted({
            email: userEmail,
            userId,
            plan: serverPlan,
            companyName,
            auditId,
            auditUrl: `${process.env.PRODUCTION_URL || 'https://app.citationrocket.com'}/audit/${auditId}`,
            overallScore: scoringResult.overallScore,
            quickWins: auditData.playbook?.quickWins ?? [],
            isFirstAudit,
          });
        } catch (e: any) {
          console.warn('⚠️ Loops syncAuditCompleted failed:', e.message);
        }
      })();

      res.json({
        success: true,
        websiteUrl: websiteUrl,
        auditData: {
          ...auditData,
          blueprintResult,
        },
        auditId: auditId,
        generatedAt: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('❌ Batch generation error:', error);
      
      // Mark audit as failed
      try {
        await openRouterTracker.completeAudit(auditId, {
          status: 'failed',
          duration: Date.now() - startTime,
          topicsGenerated: 0,
          errorMessage: error.message
        });
      } catch (trackError) {
        console.error('❌ Error tracking failed audit:', trackError);
      }
      
      res.status(500).json({ error: 'Batch generation failed', details: error.message });
    }
  });

  // Regular audit endpoint
  // Protected route - requires valid Firebase auth token
  app.post('/api/audit', requireAuth, auditPerUserLimiter, async (req: AuthenticatedRequest, res) => {
    const startTime = Date.now();
    
    // Generate unique audit ID
    const auditId = openRouterTracker.generateAuditId();
    console.log(`🆔 Single Audit ID: ${auditId}`);
    
    // Get authenticated user from middleware
    const authenticatedUserId = req.user?.uid;
    const authenticatedEmail = req.user?.email;
    console.log(`🔐 Authenticated user: ${authenticatedEmail} (${authenticatedUserId})`);

    try {
      // Validate request body
      const validationResult = auditRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        const validationError = fromZodError(validationResult.error);
        return res.status(400).json({
          error: 'Invalid request data',
          details: validationError.message
        });
      }

      const { websiteUrl, userPlan, topicsPerCategory: requestedTopics } = validationResult.data;
      
      const userId = authenticatedUserId!;
      const userEmail = authenticatedEmail;

      const { checkDomainLimit: checkSingleDomain } = await import('./domain-limiter');
      const { initializeApp: initSingleApp, getApp: getSingleApp } = await import('firebase/app');
      const { getFirestore: getSingleFs, doc: singleDoc, getDoc: getSingleDoc, collection: singleCollection, query: singleQuery, where: singleWhere, getDocs: getSingleDocs } = await import('firebase/firestore');
      let singleApp;
      try { singleApp = getSingleApp('single-audit-app'); } catch {
        singleApp = initSingleApp({
          apiKey: process.env.VITE_FIREBASE_API_KEY,
          projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        }, 'single-audit-app');
      }
      const singleDb = getSingleFs(singleApp);
      const singleUserDoc = await getSingleDoc(singleDoc(singleDb, 'users', userId));
      const serverPlanForDomain = singleUserDoc.exists() ? (singleUserDoc.data()?.subscriptionPlan || 'free') : 'free';
      const singleDomainCheck = await checkSingleDomain(userId, websiteUrl, serverPlanForDomain);
      if (!singleDomainCheck.allowed) {
        console.log(`🚫 Domain limit exceeded for user ${userId}: ${singleDomainCheck.currentDomains.length}/${singleDomainCheck.limit}`);
        return res.status(403).json({
          error: 'Domain limit reached',
          code: 'DOMAIN_LIMIT_EXCEEDED',
          details: `Your ${serverPlanForDomain} plan allows ${singleDomainCheck.limit} domain${singleDomainCheck.limit !== 1 ? 's' : ''}. Upgrade to add more domains.`,
          currentDomains: singleDomainCheck.currentDomains,
          limit: singleDomainCheck.limit
        });
      }

      // SERVER-SIDE MONTHLY AUDIT LIMIT ENFORCEMENT (same as /api/audit/batch)
      try {
        const planSettingsDoc = await getSingleDoc(singleDoc(singleDb, 'system', 'planSettings'));
        const monthlyLimit = planSettingsDoc.exists()
          ? planSettingsDoc.data()?.[serverPlanForDomain]?.auditsPerMonth
          : undefined;

        if (typeof monthlyLimit === 'number' && monthlyLimit !== -1) {
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);

          const userAuditsSnap = await getSingleDocs(
            singleQuery(singleCollection(singleDb, 'audits'), singleWhere('userId', '==', userId))
          );
          let auditsThisMonth = 0;
          userAuditsSnap.forEach((d) => {
            const ts = d.data()?.timestamp;
            const tsDate = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
            if (tsDate && tsDate >= monthStart) auditsThisMonth++;
          });

          if (auditsThisMonth >= monthlyLimit) {
            console.log(`🚫 Monthly audit limit reached for user ${userId}: ${auditsThisMonth}/${monthlyLimit} (${serverPlanForDomain})`);
            return res.status(403).json({
              error: 'Monthly audit limit reached',
              code: 'AUDIT_LIMIT_REACHED',
              details: `You've reached your monthly limit of ${monthlyLimit} audits on the ${serverPlanForDomain} plan. Upgrade to continue.`,
              used: auditsThisMonth,
              limit: monthlyLimit
            });
          }
          console.log(`✅ Audit limit check passed: ${auditsThisMonth}/${monthlyLimit} used this month (${serverPlanForDomain})`);
        }
      } catch (limitErr) {
        console.error('⚠️ Audit limit check failed (allowing audit to proceed):', limitErr);
      }

      const { getFeatureFlags: getFlags } = await import('./feature-flags');
      const streamPlanFlags = getFlags(serverPlanForDomain);

      await openRouterTracker.createAudit({
        auditId,
        userId,
        userEmail,
        websiteUrl,
        planName: serverPlanForDomain
      });

      const topicsPerCategory = Math.min(requestedTopics || streamPlanFlags.topicsPerCategory, streamPlanFlags.topicsPerCategory);
      
      console.log(`🎯 Generating audit for ${serverPlanForDomain} plan - ${topicsPerCategory} topics per category`);

      // Get master prompt from Firestore (or use default)
      let masterPrompt = await getMasterPrompt();
      
      // Replace placeholders with dynamic values
      const totalTopics = topicsPerCategory * 4;
      const domainName = extractDomain(websiteUrl);
      const promptWithReplacements = masterPrompt
        .replace(/{WEBSITE_URL}/g, websiteUrl)
        .replace(/{DOMAIN_NAME}/g, domainName)
        .replace(/{TOPIC_COUNT}/g, topicsPerCategory.toString())
        .replace(/{TOTAL_TOPICS}/g, totalTopics.toString());

      // Get the correct API key based on user type (AppSumo vs regular)
      let apiKey: string;
      try {
        apiKey = await getOpenRouterApiKeyForUser(userId, serverPlanForDomain);
      } catch (error: any) {
        if (error.message?.includes('APPSUMO_KEY_REQUIRED')) {
          // Fail the audit tracking
          await openRouterTracker.completeAudit(auditId, {
            status: 'failed',
            duration: Date.now() - startTime,
            topicsGenerated: 0,
            errorMessage: 'AppSumo key required'
          });

          return res.status(400).json({ 
            error: 'API key required',
            details: 'AppSumo lifetime users must add their own Perplexity API key in Profile → API Configuration before running audits.',
            code: 'APPSUMO_KEY_REQUIRED'
          });
        }
        return res.status(500).json({ error: 'API key configuration error' });
      }

      console.log('promptWithReplacementspromptWithReplacements', promptWithReplacements);

      // Calculate required tokens based on topic count
      // ~50 tokens per topic, 4 categories, plus overhead
      const estimatedTokens = Math.min(
        (topicsPerCategory * 4 * 50) + 2000,
        12000 // Perplexity API max
      );

      console.log(`📊 Requesting ${estimatedTokens} tokens for ${topicsPerCategory} topics per category`);

      // Helper function to make LLM API call via OpenRouter
      const callLlmAPI = async (prompt: string, isFallback: boolean = false) => {
        return await llmCall({
          task: 'topicGeneration',
          messages: [
            {
              role: 'system',
              content: `You are an AI SEO analyst. Generate EXACTLY ${topicsPerCategory} topics per category (${totalTopics} total). Do not generate fewer. Respond with the exact JSON format requested.${isFallback ? ' Note: The website may be inaccessible, so infer information from the domain name and industry context.' : ''}`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.2,
          byokKey: apiKey,
          auditId,
        });
      };

      // Call LLM API with fallback for inaccessible websites
      let llmResponse7;
      let usedFallback = false;
      try {
        llmResponse7 = await callLlmAPI(promptWithReplacements);
      } catch (apiError: any) {
        const errorMessage = apiError?.message || '';
        console.log(`⚠️ Primary API call failed: ${errorMessage}`);

        // Check if the error indicates the website is inaccessible
        if (errorMessage.toLowerCase().includes('inaccessible') ||
            errorMessage.toLowerCase().includes('cannot access') ||
            errorMessage.toLowerCase().includes('failed to fetch') ||
            errorMessage.toLowerCase().includes('timeout') ||
            errorMessage.toLowerCase().includes('unreachable')) {

          console.log(`🔄 Using fallback: domain-only analysis for ${domainName}`);
          usedFallback = true;

          // Create fallback prompt that analyzes domain name only
          const fallbackPrompt = promptWithReplacements.replace(
            /Browse .* thoroughly|Analyze .* website|Visit .*/gi,
            `Analyze the domain "${domainName}" and infer the likely business type, industry, and audience based on the domain name. Since the website may be temporarily inaccessible, use domain inference and industry knowledge to provide the analysis.`
          );

          llmResponse7 = await callLlmAPI(fallbackPrompt, true);
        } else {
          // Re-throw if it's not an accessibility issue
          throw apiError;
        }
      }

      if (usedFallback) {
        console.log(`✅ Fallback analysis completed for ${domainName}`);
      }

      // Log usage
      await openRouterTracker.logApiCall({
        auditId,
        type: 'topic_authoritative',
        model: 'via-llm-router',
        tokens: {
          input: llmResponse7.inputTokens,
          output: llmResponse7.outputTokens,
          total: llmResponse7.inputTokens + llmResponse7.outputTokens
        },
        userId: userId || 'anonymous',
        websiteUrl,
        responseTime: Date.now() - startTime,
        status: 'success',
        promptLength: promptWithReplacements.length,
        responseLength: llmResponse7.content?.length || 0
      });

      // Parse response with robust JSON extraction
      let auditData: AuditData;
      try {
        const content = llmResponse7.content;
        console.log('Raw AI response length:', content.length);
        
        // Helper to repair truncated JSON
        const repairTruncatedJSON = (str: string): string => {
          let result = str.trim();
          
          // Check if we're inside an unclosed string by counting unescaped quotes
          let inString = false;
          let lastQuoteIndex = -1;
          for (let i = 0; i < result.length; i++) {
            if (result[i] === '"' && (i === 0 || result[i - 1] !== '\\')) {
              inString = !inString;
              if (inString) lastQuoteIndex = i;
            }
          }
          
          // If we're inside a string, close it
          if (inString) {
            result += '"';
          }
          
          // Remove any trailing incomplete key-value pair after the last complete one
          // This handles cases like: {"key": "value", "incomplete
          // Look for patterns like: , "key (incomplete key without value)
          result = result.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, '');
          
          // Remove trailing commas
          result = result.replace(/,(\s*)$/, '$1');
          
          // Count and balance brackets/braces
          const openBraces = (result.match(/\{/g) || []).length;
          const closeBraces = (result.match(/\}/g) || []).length;
          const openBrackets = (result.match(/\[/g) || []).length;
          const closeBrackets = (result.match(/\]/g) || []).length;
          
          // Close arrays first, then objects (reverse of typical JSON structure)
          result += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
          result += '}'.repeat(Math.max(0, openBraces - closeBraces));
          
          return result;
        };
        
        // Helper to extract and repair JSON
        const parseRobustJSON = (str: string): any => {
          // 1. Try extracting from markdown code blocks
          let jsonCandidate = str;
          const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
            jsonCandidate = codeBlockMatch[1];
        } else {
            // 2. If no code block, try finding the outermost object
            const firstBrace = str.indexOf('{');
            const lastBrace = str.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              jsonCandidate = str.substring(firstBrace, lastBrace + 1);
            } else if (firstBrace !== -1) {
              // JSON is truncated - no closing brace found
              jsonCandidate = str.substring(firstBrace);
            }
          }

          // 3. Attempt direct parse
          try {
            return JSON.parse(jsonCandidate);
          } catch (e) {
            console.log('Direct parse failed, attempting repair...');
            
            // 4. Apply repair for truncated JSON
            let repaired = repairTruncatedJSON(jsonCandidate);
            
            // 5. Remove trailing commas before closing braces/brackets
            repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
            
            try {
              return JSON.parse(repaired);
            } catch (e2) {
              console.log('Repair attempt 1 failed, trying aggressive cleanup...');
              
              // 6. More aggressive: find last complete array element and truncate there
              // Look for pattern like }, { or }, ] and truncate incomplete items
              let cleaned = repaired;
              
              // Find all positions of complete objects in arrays
              const lastCompleteObject = cleaned.lastIndexOf('},');
              const lastCompleteArrayEnd = cleaned.lastIndexOf('}]');
              
              if (lastCompleteObject > lastCompleteArrayEnd && lastCompleteObject > 0) {
                // Truncate after the last complete object and close the structure
                cleaned = cleaned.substring(0, lastCompleteObject + 1);
                const openBrackets = (cleaned.match(/\[/g) || []).length;
                const closeBrackets = (cleaned.match(/\]/g) || []).length;
                const openBraces = (cleaned.match(/\{/g) || []).length;
                const closeBraces = (cleaned.match(/\}/g) || []).length;
                cleaned += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
                cleaned += '}'.repeat(Math.max(0, openBraces - closeBraces));
              }
              
              try {
                return JSON.parse(cleaned);
              } catch (e3) {
                // 7. Last resort: normalize whitespace and try again
                cleaned = cleaned
                  .replace(/[\r\n\t]/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
                
                return JSON.parse(cleaned);
              }
            }
          }
        };

        auditData = parseRobustJSON(content);
        
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        console.error('Failed to parse response. Content preview:', 
          llmResponse7.content?.substring(0, 500) + '...');
        
        // Log failure
        await openRouterTracker.completeAudit(auditId, {
          status: 'failed',
          duration: Date.now() - startTime,
          topicsGenerated: 0,
          errorMessage: 'JSON Parse Error'
        });

        return res.status(500).json({
          error: 'Failed to parse AI response. The AI returned malformed data. Please try again.'
        });
      }

      // Validate response structure (keep existing validation)
      if (!auditData.auditResults || !auditData.contentTopics) {
        // Log failure
        await openRouterTracker.completeAudit(auditId, {
          status: 'failed',
          duration: Date.now() - startTime,
          topicsGenerated: 0,
          errorMessage: 'Invalid response structure'
        });

        return res.status(500).json({
          error: 'Invalid response structure from AI. Please try again.'
        });
      }

      // Calculate processing time
      const processingTime = Math.round((Date.now() - startTime) / 1000);
      
      // Add processing details to audit data if not already present
      if (!auditData.processingDetails) {
        auditData.processingDetails = {
          analysisDepth: "comprehensive",
          competitorsAnalyzed: auditData.competitorAnalysis?.mainCompetitors?.length || 0,
          dataSourcesUsed: ["website content", "competitor research", "market intelligence", "AI platform analysis"],
          processingTime: `${processingTime} seconds`
        };
      }

      // Complete audit tracking
      await openRouterTracker.completeAudit(auditId, {
        status: 'completed',
        duration: Date.now() - startTime,
        topicsGenerated: totalTopics
      });

      // Return enhanced response (keeping existing structure intact)
      res.json({
        success: true,
        websiteUrl: websiteUrl,
        auditData: auditData,
        auditId: auditId, // Return the audit ID
        generatedAt: new Date().toISOString()
      });

    } catch (error: any) {
      // Log error details safely without exposing API keys
      const errorStatus = error.response?.status;
      const errorData = error.response?.data;
      console.error('Perplexity API Error:', {
        status: errorStatus,
        message: errorData?.error || errorData,
        url: error.config?.url
      });

      // Track failure
      await openRouterTracker.completeAudit(auditId, {
        status: 'failed',
        duration: Date.now() - startTime,
        topicsGenerated: 0,
        errorMessage: error.message || 'Unknown error'
      });

      if (errorStatus === 401) {
        return res.status(500).json({
          error: 'API authentication failed. Please check configuration.'
        });
      }

      if (errorStatus === 429) {
        return res.status(429).json({
          error: 'Rate limit exceeded. Please try again in a few minutes.'
        });
      }

      if (errorStatus === 400) {
        return res.status(500).json({
          error: `API request error: ${errorData?.error || 'Bad request format'}`
        });
      }

      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return res.status(408).json({
          error: 'Analysis timeout. The request took too long to process. Please try again with a simpler website or try again later.'
        });
      }

      res.status(500).json({
        error: 'An unexpected error occurred. Please try again.'
      });
    }
  });

  // API v1 middleware and routes
  app.use('/api/v1', apiKeyAuth, apiV1PerKeyLimiter);
  registerApiV1(app as any, (url, skipFirecrawl) => scrapeWebsiteContent(url, undefined, undefined, skipFirecrawl));

  // API key management
  app.get('/api/keys/me', requireAuth, async (req: AuthenticatedRequest, res) => {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const record = await getUserApiKey(userId);
    if (!record) {
      const newRecord = await issueApiKey(userId, req.user?.email || '', 'free');
      return res.json({ success: true, apiKey: newRecord });
    }
    return res.json({ success: true, apiKey: record });
  });

  app.post('/api/keys/issue', requireAuth, async (req: AuthenticatedRequest, res) => {
    const userId = req.user?.uid;
    const userEmail = req.user?.email || '';
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const record = await issueApiKey(userId, userEmail, 'free');
    return res.json({ success: true, apiKey: record });
  });

  app.post('/api/keys/checkout', requireAuth, async (req: AuthenticatedRequest, res) => {
    return res.status(503).json({
      error: 'API billing is not yet available. Contact support for API access.'
    });
  });

  app.post('/api/generate-aeo-files', requireAuth, aeoGenerationPerUserLimiter, async (req: AuthenticatedRequest, res) => {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Resolve the plan from the trusted server-side user doc (not the client-sent value)
    const { getFirestore: getAeoFs, doc: aeoDoc, getDoc: getAeoDoc, initializeApp: initAeoApp, getApp: getAeoApp } = {
      ...(await import('firebase/firestore')),
      ...(await import('firebase/app')),
    } as any;
    let aeoApp;
    try { aeoApp = getAeoApp('batch-plan-app'); } catch {
      aeoApp = initAeoApp({
        apiKey: process.env.VITE_FIREBASE_API_KEY,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      }, 'batch-plan-app');
    }
    const aeoDb = getAeoFs(aeoApp);
    const aeoUserDoc = await getAeoDoc(aeoDoc(aeoDb, 'users', userId));
    const serverPlan = aeoUserDoc.exists() ? (aeoUserDoc.data()?.subscriptionPlan || 'free') : 'free';

    const allowedPlans = ['pro', 'enterprise', 'lifetime'];
    if (!allowedPlans.includes(serverPlan)) {
      return res.status(403).json({
        error: 'AEO file generation requires a Pro plan or above.',
        code: 'PLAN_REQUIRED',
        upgrade: '/pricing',
      });
    }

    const { websiteUrl, companyName, industry, businessType,
            targetAudience, valueProposition, keywords = [],
            competitors = [], pingIndexNow = true } = req.body;

    if (!websiteUrl) {
      return res.status(400).json({ error: 'websiteUrl is required' });
    }

    let safeUrl: string;
    try {
      const { assertPublicUrl } = await import('./url-guard');
      safeUrl = await assertPublicUrl(websiteUrl);
    } catch (guardErr: any) {
      return res.status(400).json({
        error: guardErr?.message || 'That URL cannot be processed.',
        code: guardErr?.code || 'UNSAFE_URL',
      });
    }

    try {
      const scrapeResult = await scrapeWebsiteContent(safeUrl, undefined, undefined, serverPlan === 'lifetime');
      const { extractContentSignals } = await import('./content-signal-service');
      const { generateAeoFiles, pingBingIndexNow } = await import('./aeo-file-generator');
      const archiver = (await import('archiver')).default;

      const signals = extractContentSignals(
        scrapeResult.html, scrapeResult.text, scrapeResult.sitemapUrls
      );

      const resolvedCompanyName = companyName ||
        new URL(websiteUrl).hostname.replace(/^www\./, '').split('.')[0];

      const files = await generateAeoFiles({
        websiteUrl,
        companyName: resolvedCompanyName,
        industry: industry || '',
        businessType: businessType || '',
        targetAudience: targetAudience || '',
        valueProposition: valueProposition || '',
        signals,
        sitemapUrls: scrapeResult.sitemapUrls,
        scrapedText: scrapeResult.text,
        keywords,
        competitors,
      });

      if (pingIndexNow) {
        pingBingIndexNow(websiteUrl, scrapeResult.sitemapUrls).catch(() => {});
      }

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition',
        `attachment; filename="${resolvedCompanyName}-aeo-files.zip"`);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.pipe(res);

      for (const [filename, content] of Object.entries(files)) {
        archive.append(content, { name: filename });
      }

      await archive.finalize();

    } catch (err: any) {
      console.error('❌ AEO file generation error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'File generation failed', details: err.message });
      }
    }
  });

  // Reject unmatched /api/* requests (unknown endpoint or wrong HTTP method)
  // with a JSON 404 instead of letting them fall through to the SPA handler.
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const httpServer = createServer(app);
  return httpServer;
}
