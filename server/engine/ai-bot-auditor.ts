/**
 * AI Bot Access Auditor — Module 3 (0–10 points)
 *
 * Critical distinction most sites get wrong:
 *   Training bots  (can block): GPTBot, Google-Extended, CCBot
 *   Citation bots  (MUST allow): OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot
 *
 * Blocking citation bots = invisible self-sabotage.
 * A site that blocks OAI-SearchBot cannot appear in ChatGPT answers.
 */

import type { BotAccessSignals } from './blueprint-signals';
import { safeGet, safeGetText } from '../security/ssrf';

// ─── Bot classification ───────────────────────────────────────────────────────

/** These bots RETRIEVE content for live AI answers. Blocking = no AI citations. */
export const CITATION_BOTS = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'anthropic-ai',
  'Claude-Web',
  'PerplexityBot',
  'Perplexity-User',
  'YouBot',
  'BingBot',          // Powers Copilot
];

/** These bots train AI models. Blocking is the site owner's choice. */
export const TRAINING_BOTS = [
  'GPTBot',
  'Google-Extended',
  'CCBot',
  'Common Crawl',
  'Diffbot',
  'FacebookBot',
  'Applebot-Extended',
  'Amazonbot',
  'DataForSeoBot',
];

// ─── Main auditor ─────────────────────────────────────────────────────────────

export async function auditBotAccess(
  websiteUrl: string,
  pageHtml: string
): Promise<BotAccessSignals> {
  const domain = extractDomain(websiteUrl);
  const isHttps = websiteUrl.startsWith('https://');

  // Fetch robots.txt
  let robotsTxtContent = '';
  let robotsTxtFetched = false;

  const robots = await safeGetText(`https://${domain}/robots.txt`, { timeoutMs: 8000 });
  if (robots !== null && !/<html/i.test(robots)) {
    robotsTxtContent = robots;
    robotsTxtFetched = true;
  }

  // Parse robots.txt
  const citationBotsBlocked = getBlockedBots(robotsTxtContent, CITATION_BOTS);
  const citationBotsAllowed = CITATION_BOTS.filter(b => !citationBotsBlocked.includes(b));
  const trainingBotsBlocked = getBlockedBots(robotsTxtContent, TRAINING_BOTS);
  const trainingBotsAllowed = TRAINING_BOTS.filter(b => !trainingBotsBlocked.includes(b));
  const hasSitemapInRobotsTxt = /^Sitemap:/im.test(robotsTxtContent);

  // Check for llms.txt presence in page source or as a known URL
  const llmsTxtPresent = await checkUrlExists(`https://${domain}/llms.txt`);
  const llmsFullTxtPresent = await checkUrlExists(`https://${domain}/llms-full.txt`);
  const agentsMdPresent = await checkUrlExists(`https://${domain}/AGENTS.md`);

  // JS rendering detection (already done in scraper-v2, re-use)
  const jsRenderingDetected = detectJsRendering(pageHtml);

  // ── Score ──────────────────────────────────────────────────────────────────
  let score = 0;

  // All citation bots allowed = +5 (most important)
  if (citationBotsBlocked.length === 0) {
    score += 5;
  } else {
    // Deduct 1 per blocked citation bot, min 0
    score += Math.max(0, 5 - citationBotsBlocked.length * 2);
  }

  // Sitemap referenced in robots.txt = +2
  if (hasSitemapInRobotsTxt) score += 2;

  // llms.txt present = +2
  if (llmsTxtPresent) score += 2;

  // No JS rendering issues = +1
  if (!jsRenderingDetected) score += 1;

  const botAccessScore = Math.max(0, Math.min(10, score));

  return {
    robotsTxtFetched,
    robotsTxtContent: robotsTxtContent.substring(0, 2000), // cap stored content
    citationBotsBlocked,
    citationBotsAllowed,
    trainingBotsBlocked,
    trainingBotsAllowed,
    hasSitemapInRobotsTxt,
    jsRenderingDetected,
    llmsTxtPresent,
    llmsFullTxtPresent,
    agentsMdPresent,
    botAccessScore,
  };
}

/**
 * Generate a corrected robots.txt snippet showing exactly what to add.
 * Returned as a string the user can copy-paste.
 */
export function generateRobotsTxtFix(blocked: string[]): string {
  if (blocked.length === 0) return '';

  return blocked.map(bot => `# Allow ${bot} for AI citation (do NOT block)\nUser-agent: ${bot}\nAllow: /\n`).join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBlockedBots(robotsTxt: string, botList: string[]): string[] {
  if (!robotsTxt) return [];

  const blocked: string[] = [];
  const lines = robotsTxt.split('\n').map(l => l.trim());

  let currentAgents: string[] = [];
  let blockAllActive = false;

  for (const line of lines) {
    if (line.startsWith('User-agent:')) {
      const agent = line.replace('User-agent:', '').trim();
      if (agent === '*') {
        blockAllActive = false;
        currentAgents = ['*'];
      } else {
        currentAgents = [agent];
      }
    } else if (line.startsWith('Disallow:')) {
      const path = line.replace('Disallow:', '').trim();
      if (path === '/' || path === '') {
        // Disallow / means blocked
        if (path === '/') {
          for (const agent of currentAgents) {
            for (const bot of botList) {
              if (agent === '*' || agent.toLowerCase() === bot.toLowerCase()) {
                if (!blocked.includes(bot)) blocked.push(bot);
              }
            }
          }
        }
      }
    }
  }

  return blocked;
}

function detectJsRendering(html: string): boolean {
  if (!html || html.length < 100) return true; // empty = probably JS-only

  const jsSignatures = [
    '__NEXT_DATA__', '/_next/',
    '__NUXT__', '/_nuxt/',
    'ng-version', 'data-reactroot',
    'webflow-badge', 'framer-badge',
    '__GATSBY',
  ];

  // If very little text content relative to HTML size, likely JS-rendered
  const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const textRatio = textContent.length / Math.max(1, html.length);
  if (textRatio < 0.05) return true; // < 5% text = JS-heavy

  return jsSignatures.some(sig => html.includes(sig));
}

async function checkUrlExists(url: string): Promise<boolean> {
  try {
    const res = await safeGet(url, { timeoutMs: 5000, maxBytes: 512 * 1024 });
    // Many sites answer unknown paths with a 200 HTML page — that is not an llms.txt.
    return res.status >= 200 && res.status < 300 && !/<html/i.test(String(res.data).slice(0, 2000));
  } catch {
    return false;
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}
