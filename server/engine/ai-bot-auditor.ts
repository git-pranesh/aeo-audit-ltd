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
import { BROWSER_USER_AGENT, safeGet, safeGetText } from '../security/ssrf';

// ─── Bot classification ───────────────────────────────────────────────────────

/** These bots RETRIEVE content for live AI answers. Blocking = no AI citations. */
export const CITATION_BOTS = [
  'OAI-SearchBot',     // ChatGPT search index
  'ChatGPT-User',      // ChatGPT user-requested fetches
  'Claude-SearchBot',  // Claude search index
  'Claude-User',       // Claude user-requested fetches
  'PerplexityBot',     // Perplexity search index
  'Perplexity-User',   // Perplexity user-requested fetches
  'bingbot',           // Bing, Copilot
];

/** These bots train AI models. Blocking is the site owner's choice. */
export const TRAINING_BOTS = [
  'GPTBot',            // OpenAI training
  'ClaudeBot',         // Anthropic training
  'Google-Extended',   // Gemini training/grounding opt-out token
  'Applebot-Extended',
  'CCBot',             // Common Crawl
  'meta-externalagent',
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

  // Some sites serve bots an error page instead of robots.txt; retry as a browser.
  for (const userAgent of [undefined, BROWSER_USER_AGENT]) {
    const robots = await safeGetText(`https://${domain}/robots.txt`, { timeoutMs: 8000, userAgent });
    if (robots !== null && !/<html/i.test(robots.slice(0, 1000))) {
      robotsTxtContent = robots;
      robotsTxtFetched = true;
      break;
    }
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
  const agentsMdPresent = false; // AGENTS.md is a code-repository convention, not a website signal

  // JS rendering detection (already done in scraper-v2, re-use)
  const jsRenderingDetected = detectJsRendering(pageHtml);

  // ── Score ──────────────────────────────────────────────────────────────────
  let score = 0;

  // All citation bots allowed = +5 (most important). If robots.txt couldn't be
  // read we don't know, so award a neutral 2 instead of claiming full access.
  if (!robotsTxtFetched) {
    score += 2;
  } else if (citationBotsBlocked.length === 0) {
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

/**
 * Standard robots.txt semantics (RFC 9309): user-agent names are
 * case-insensitive, consecutive User-agent lines share one group, a crawler
 * obeys the group naming it (product token match) and only falls back to "*"
 * when no group names it. A bot is "blocked" when its group disallows "/"
 * without an equally broad Allow.
 */
export function getBlockedBots(robotsTxt: string, botList: string[]): string[] {
  if (!robotsTxt) return [];
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;

  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const ua = line.match(/^user-agent\s*:\s*(.+)$/i);
    if (ua) {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(ua[1].trim().toLowerCase());
      continue;
    }
    const rule = line.match(/^(allow|disallow)\s*:\s*(.*)$/i);
    if (rule && current) current.rules.push({ allow: rule[1].toLowerCase() === 'allow', path: rule[2].trim() });
  }

  const groupFor = (bot: string) => {
    const name = bot.toLowerCase();
    return groups.find((g) => g.agents.some((a) => a !== '*' && (a === name || name.startsWith(a) || a.startsWith(name))))
      || groups.find((g) => g.agents.includes('*'));
  };

  return botList.filter((bot) => {
    const g = groupFor(bot);
    if (!g) return false;
    const blocksRoot = g.rules.some((r) => !r.allow && r.path === '/');
    const allowsRoot = g.rules.some((r) => r.allow && (r.path === '/' || r.path === '/*'));
    return blocksRoot && !allowsRoot;
  });
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
