/**
 * Citation Rocket — Content Script
 *
 * Runs on every page at document_idle.
 * Does NOT auto-inject any UI.
 * Responds to messages from the side panel.
 *
 * Client-side modules (zero server cost):
 *   - Answer Capsule (Module 1)
 *   - Bot Access (Module 3)
 *   - Schema Completeness (Module 5 partial)
 *   - Content Freshness (Module 6)
 *   - Fan-Out Coverage (Module 7)
 *   - Wikidata Entity Check (free external API)
 *   - G2 Profile Existence (HEAD request)
 */

;(function() { if (window.__crLoaded) return; window.__crLoaded = true;
const CR_CAPTURE_URL = 'https://app.citationrocket.com/api/extension/capture';

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'runAudit') {
    runFullClientAudit()
      .then(audit => sendResponse({ audit }))
      .catch(err => sendResponse({ audit: null, error: err.message }));
    return true; // keep async channel open
  }
  if (message.action === 'ping') {
    sendResponse({ alive: true });
    return true;
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Flatten a parsed JSON-LD value into a list of schema objects, unwrapping
// the `@graph` wrapper that Yoast / RankMath / most pro sites use.
function flattenJsonLd(node) {
  const out = [];
  const visit = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (Array.isArray(n['@graph'])) n['@graph'].forEach(visit);
    if (n['@type']) out.push(n);
  };
  visit(node);
  return out;
}

// Build a bounded HTML payload for the server analysis that ALWAYS preserves
// the high-signal markup (head, JSON-LD, author/byline elements) regardless of
// where it sits on the page. Large pages put bylines/schema past a naive cutoff.
function buildAnalysisHtml(fullHtml) {
  const BUDGET = 200000;     // target payload size
  const HARD_CAP = 280000;   // never exceed this (server rejects >300KB)
  const parts = [];
  const seen = new Set();
  const add = (chunk) => {
    if (chunk && chunk.length < 6000 && !seen.has(chunk)) { seen.add(chunk); parts.push(chunk); }
  };
  // Only the high-signal parts of <head> — NOT the whole head. Heavy sites inline
  // hundreds of KB of CSS/scripts in <head>, which alone can blow the size limit.
  try {
    if (document.title) parts.push('<title>' + document.title + '</title>');
    document.head?.querySelectorAll('meta').forEach(m => add(m.outerHTML));
    document.head?.querySelectorAll('link[rel="canonical"]').forEach(l => add(l.outerHTML));
  } catch {}
  // All JSON-LD schema blocks (head or body), wherever they sit.
  try {
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      const oh = s.outerHTML;
      if (oh && oh.length < 60000 && !seen.has(oh)) { seen.add(oh); parts.push(oh); }
    });
  } catch {}
  // Author/byline elements, regardless of position on the page.
  try {
    const bylineSel = '[class*="author" i],[class*="byline" i],[class*="writer" i],[rel="author"],[itemprop="author"],a[href*="/author/"],a[href*="/authors/"]';
    document.querySelectorAll(bylineSel).forEach(el => add(el.outerHTML));
  } catch {}
  const priority = parts.join('\n');
  const remaining = Math.max(0, BUDGET - priority.length);
  const payload = priority + '\n<!--CR_BODY-->\n' + fullHtml.substring(0, remaining);
  // Hard guarantee we stay under the server's request-size limit.
  return payload.length > HARD_CAP ? payload.substring(0, HARD_CAP) : payload;
}

// ─── Main audit orchestrator ──────────────────────────────────────────────────

async function runFullClientAudit() {
  const html = document.documentElement.outerHTML;
  const text = document.body?.innerText || '';
  const domain = window.location.hostname.replace(/^www\./, '');
  const pageUrl = window.location.href;

  // Run all client-side modules in parallel
  const [
    answerScore,
    schemaScore,
    freshnessScore,
    fanOutScore,
    botScore,
    redditResult,
  ] = await Promise.all([
    scoreAnswerCapsule(html, text),
    scoreSchemaCompleteness(html),
    scoreFreshness(html),
    scoreFanOut(html),
    scoreBotAccess(domain),
    checkRedditPresence(domain),
  ]);

  // wikidataResult and Wikipedia are only available in Full Analysis (server-side)
  const wikidataResult = { found: null, qNumber: null };
  const g2Result = { found: null, articleTitle: null };

  // Composite free score (max 80 from modules + 5 Reddit bonus)
  const moduleTotal = answerScore.score + schemaScore.score +
                      freshnessScore.score + fanOutScore.score + botScore.score;
  const bonusTotal = (redditResult?.status === 'ok' && redditResult?.found ? 5 : 0);
  const rawScore = moduleTotal + bonusTotal;
  const maxScore = 85; // 80 module pts + 5 Reddit bonus
  const normalizedScore = Math.round((rawScore / maxScore) * 100);

  const grade = normalizedScore >= 65 ? 'A' :
                normalizedScore >= 50 ? 'B' :
                normalizedScore >= 35 ? 'C' :
                normalizedScore >= 20 ? 'D' : 'F';

  const criticalIssues = getCriticalIssues(botScore, schemaScore, answerScore);

  const audit = {
    domain,
    pageUrl,
    score: normalizedScore,
    grade,
    rawScore,
    maxScore,
    modules: { answerScore, schemaScore, freshnessScore, fanOutScore, botScore },
    bonus: { wikidataResult, g2Result, redditResult },
    criticalIssues,
    scannedAt: new Date().toISOString(),
    // Page content for server-side analysis after sign-in
    _html: buildAnalysisHtml(html),
    _text: text.substring(0, 50000),
    _wikidataQid: null, // always null in free scan — set server-side
  };

  // Fire-and-forget anonymous data capture (the moat)
  captureAnonymousData(domain, audit).catch(() => {});

  return audit;
}

// ─── Author Detection (standard formats only) ─────────────────────────────────

function detectAuthorByStandards() {
  // 1. JSON-LD author (the right way to declare authorship)
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts) {
    try {
      const items = [JSON.parse(s.textContent)].flat();
      for (const item of items) {
        if (item.author) {
          const author = Array.isArray(item.author) ? item.author[0] : item.author;
          const name = author?.name || (typeof author === 'string' ? author : null);
          if (name) return { found: true, name, source: 'JSON-LD' };
        }
      }
    } catch {}
  }

  // 2. Standard meta author tag
  const metaAuthor = document.querySelector('meta[name="author"]')?.getAttribute('content');
  if (metaAuthor) return { found: true, name: metaAuthor, source: 'meta' };

  // 3. rel="author" link (HTML standard)
  const relAuthor = document.querySelector('[rel="author"]');
  if (relAuthor?.textContent?.trim()) {
    return { found: true, name: relAuthor.textContent.trim(), source: 'rel=author' };
  }

  // 4. Schema.org microdata
  const itemprop = document.querySelector('[itemprop="author"]');
  if (itemprop?.textContent?.trim()) {
    return { found: true, name: itemprop.textContent.trim().substring(0, 50), source: 'microdata' };
  }

  // 5. CSS class selectors — byline elements on sites using semantic class naming
  const bylineSelectors = [
    '[class*="author"]',
    '[class*="byline"]',
    '[class*="writer"]',
    '[class*="posted-by"]',
    '[id*="author"]',
    '.entry-meta [href*="/author/"]',
    'a[href*="/author/"]',
    'a[href*="/blog/authors/"]',
    '.authors a',
    '.author-name',
    '.byline-name',
  ];

  for (const sel of bylineSelectors) {
    const el = document.querySelector(sel);
    const text = el?.textContent?.trim()?.substring(0, 80);
    if (text && text.length > 2 && text.length < 80) {
      return { found: true, name: text, source: 'css-class' };
    }
  }

  // Not found via standard formats — real finding, site should add author to JSON-LD.
  return { found: false, name: null, source: null };
}

// ─── Module 1: Answer Capsule ─────────────────────────────────────────────────

function scoreAnswerCapsule(html, text) {
  const first150 = text.split(/\s+/).slice(0, 150).join(' ');
  const QUESTION_STARTERS = /^(how|what|why|when|which|who|where)\b/i;

  const h1 = document.querySelector('h1');
  const h1Text = h1 ? h1.textContent.trim() : '';
  const h1IsDeclarative = h1Text.length > 0 && !QUESTION_STARTERS.test(h1Text);

  const DEFINITION_PATTERNS = [
    /^[A-Z][^.]{3,60} is (a|an|the) /,
    /^[A-Z][^.]{3,60} refers to /,
    /^[A-Z][^.]{3,60} means /,
  ];
  const hasDefinitionFirst = DEFINITION_PATTERNS.some(p => p.test(first150.trim()));

  const DATA_POINT = /\b\d+(\.\d+)?(%|percent|million|billion|x|×)\b|\bstudy (found|shows)\b/i;
  const hasDataPoint = DATA_POINT.test(first150);

  const questionHeadings = Array.from(document.querySelectorAll('h2, h3'))
    .filter(h => QUESTION_STARTERS.test(h.textContent.trim())).length;

  const answerBlocks = Array.from(
    html.matchAll(/<h[23][^>]*>.*?<\/h[23]>\s*<p[^>]*>(.*?)<\/p>/gis)
  ).filter(m => {
    const words = m[1].replace(/<[^>]+>/g, '').split(/\s+/).length;
    return words >= 40 && words <= 150;
  }).length;

  const authorResult = detectAuthorByStandards();
  const hasAuthorByline = authorResult.found;

  let score = 0;
  if (h1IsDeclarative) score += 3; else score -= 1;
  if (hasDefinitionFirst) score += 6;
  if (hasDataPoint) score += 5;
  score += Math.min(6, questionHeadings * 2);
  score += Math.min(5, answerBlocks);
  if (hasAuthorByline) score += 2;

  return {
    score: Math.max(0, Math.min(25, score)),
    max: 25,
    label: 'Answer Capsule',
    details: { h1IsDeclarative, hasDefinitionFirst, hasDataPoint, questionHeadings, answerBlocks, hasAuthorByline },
    issues: [
      !h1IsDeclarative && 'H1 is a question — declarative H1 gets more citations',
      !hasDefinitionFirst && 'Opening paragraph lacks definition-first structure',
      !hasDataPoint && 'No data points in opening sentences',
      !hasAuthorByline && 'No author in JSON-LD schema or meta tags (add Person schema)',
    ].filter(Boolean),
  };
}

// ─── Module 5: Schema Completeness ───────────────────────────────────────────

function scoreSchemaCompleteness(html) {
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  const schemas = [];
  jsonLdScripts.forEach(s => {
    try { schemas.push(...flattenJsonLd(JSON.parse(s.textContent))); } catch {}
  });

  // Microdata fallback
  if (schemas.length === 0) {
    const hasMicrodata = Array.from(document.querySelectorAll('[itemtype]'))
      .some(el => /Organization|Corporation/.test(el.getAttribute('itemtype') || ''));
    if (hasMicrodata) {
      return {
        score: 5, max: 20, label: 'Schema',
        detected: { hasOrg: true, hasArticle: false, hasFaq: false, hasBreadcrumb: false, hasHowTo: false },
        issues: ['Using Microdata — JSON-LD recommended for AI platforms'],
      };
    }
    // Content-rich page, schema likely JS-injected
    const wordCount = document.body.innerText.split(/\s+/).length;
    if (wordCount > 200) {
      return {
        score: 5, max: 20, label: 'Schema',
        detected: { hasOrg: false, hasArticle: false, hasFaq: false, hasBreadcrumb: false, hasHowTo: false },
        issues: ['Schema may be JS-rendered — full server audit shows accurate schema analysis'],
      };
    }
  }

  const hasOrg = schemas.some(s => ['Organization','Corporation','LocalBusiness'].includes(s['@type']));
  const hasArticle = schemas.some(s => ['Article','BlogPosting'].includes(s['@type']));
  const hasFaq = schemas.some(s => s['@type'] === 'FAQPage');
  const hasBreadcrumb = schemas.some(s => s['@type'] === 'BreadcrumbList');
  const hasHowTo = schemas.some(s => s['@type'] === 'HowTo');
  const hasCourse = schemas.some(s => s['@type'] === 'Course');
  const hasWebPage = schemas.some(s =>
    ['WebPage','AboutPage','ContactPage','FAQPage'].includes(s['@type'])
  );
  const orgSchema = schemas.find(s => ['Organization','Corporation','LocalBusiness'].includes(s['@type']));
  const orgHasSameAs = Array.isArray(orgSchema?.sameAs) && orgSchema.sameAs.length > 0;

  let score = 0;
  if (hasOrg) score += 5;
  if (orgHasSameAs) score += 2;
  if (hasArticle) score += 4;
  if (hasFaq) score += 4;
  if (hasBreadcrumb) score += 3;
  if (hasHowTo) score += 2;
  if (hasCourse) score += 3;
  if (hasWebPage) score += 2;
  if (schemas.length > 0 && score === 0) score += 2; // baseline: any valid schema

  return {
    score: Math.min(20, score), max: 20, label: 'Schema',
    detected: { hasOrg, hasArticle, hasFaq, hasBreadcrumb, hasHowTo, hasCourse, hasWebPage },
    issues: [
      !hasOrg && 'Missing Organization schema',
      !orgHasSameAs && hasOrg && 'Organization schema missing sameAs links',
      !hasFaq && 'No FAQPage schema detected',
      !hasArticle && 'No Article schema on content pages',
    ].filter(Boolean),
  };
}

// ─── Module 6: Content Freshness ─────────────────────────────────────────────

function scoreFreshness(html) {
  let foundDate = null;
  let dateSource = null;

  // 1. JSON-LD dateModified (most reliable — what Google and AI platforms read)
  const freshnessScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of freshnessScripts) {
    try {
      const items = [JSON.parse(s.textContent)].flat();
      for (const item of items) {
        if (item.dateModified) {
          foundDate = item.dateModified;
          dateSource = 'JSON-LD dateModified';
          break;
        }
        if (item.datePublished && !foundDate) {
          foundDate = item.datePublished;
          dateSource = 'JSON-LD datePublished';
        }
      }
    } catch {}
    if (foundDate) break;
  }

  // 2. Standard meta tags (Open Graph / Article tags)
  if (!foundDate) {
    const metaSelectors = [
      'meta[property="article:modified_time"]',
      'meta[property="article:published_time"]',
      'meta[name="article:modified_time"]',
      'meta[property="og:updated_time"]',
      'meta[name="revised"]',
      'meta[name="date"]',
    ];
    for (const sel of metaSelectors) {
      const val = document.querySelector(sel)?.getAttribute('content');
      if (val) { foundDate = val; dateSource = sel; break; }
    }
  }

  // 3. HTML time element with datetime attribute (semantic HTML)
  if (!foundDate) {
    const timeEl = document.querySelector(
      'time[datetime][class*="modif"], time[datetime][class*="updat"], time[datetime][class*="publish"]'
    ) || document.querySelector('time[datetime]');
    if (timeEl) {
      foundDate = timeEl.getAttribute('datetime');
      dateSource = 'time[datetime]';
    }
  }

  // 4. HTTP-equiv last-modified (rarely used but valid)
  if (!foundDate) {
    const httpEquiv = document.querySelector(
      'meta[http-equiv="last-modified"]'
    )?.getAttribute('content');
    if (httpEquiv) { foundDate = httpEquiv; dateSource = 'http-equiv'; }
  }

  // 5. Visible date text — month-name anchored only (not free-form word scanning)
  if (!foundDate) {
    const match = document.body.innerText.match(
      /(?:last\s+)?(?:updated|published|modified|revised)(?:\s+on)?\s*:?\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z.]*\s+\d{1,2},?\s*\d{4}|\d{4}-\d{2}-\d{2})/i
    );
    if (match) { foundDate = match[1]; dateSource = 'visible-text'; }
  }

  let daysSince = null;
  if (foundDate) {
    const parsed = new Date(foundDate);
    if (!isNaN(parsed.getTime())) {
      daysSince = Math.floor((Date.now() - parsed.getTime()) / 86400000);
    }
  }

  let score = 0;
  if (foundDate && daysSince !== null) {
    if (daysSince <= 30) score += 7;
    else if (daysSince <= 90) score += 5;
    else if (daysSince <= 180) score += 3;
    else score += 1;
  } else if (foundDate && daysSince === null) {
    // Date string found but couldn't be parsed — give minimal credit
    score = 1;
  }

  return {
    score: Math.min(15, score), max: 15, label: 'Freshness',
    daysSince, dateSource,
    issues: [
      !foundDate && 'No date signals found — add dateModified to schema',
      foundDate && daysSince === null &&
        'Date found but could not be parsed — use ISO format (YYYY-MM-DD)',
      daysSince !== null && daysSince > 180 &&
        `Content is ${daysSince} days old — refresh recommended`,
    ].filter(Boolean),
  };
}

// ─── Module 7: Fan-Out Coverage ───────────────────────────────────────────────

function scoreFanOut(html) {
  const h1 = document.querySelector('h1');
  const h1Text = h1 ? h1.textContent.trim() : '';
  const QUESTION_STARTERS = /^(how|what|why|when|which|who|where)\b/i;
  const h1IsQuestion = QUESTION_STARTERS.test(h1Text);

  const headings = document.querySelectorAll('h2, h3');
  let answerBlockCount = 0;
  headings.forEach(h => {
    const next = h.nextElementSibling;
    if (next && next.tagName === 'P') {
      const words = next.textContent.trim().split(/\s+/).length;
      if (words >= 40 && words <= 150) answerBlockCount++;
    }
  });

  let score = 0;
  if (!h1IsQuestion) score += 3;
  score += Math.min(7, answerBlockCount * 2);

  return {
    score: Math.min(10, score), max: 10, label: 'Fan-Out',
    headingCount: headings.length, answerBlockCount, h1IsQuestion,
    issues: [
      h1IsQuestion && 'Declarative H1 gets 26% more citations than question H1',
      answerBlockCount === 0 && 'No answer blocks (40-150 words) found under headings',
    ].filter(Boolean),
  };
}

// ─── Module 3: AI Bot Access ─────────────────────────────────────────────────

async function scoreBotAccess(domain) {
  const CITATION_BOTS = ['OAI-SearchBot','ChatGPT-User','ClaudeBot',
                          'PerplexityBot','anthropic-ai','Claude-SearchBot'];

  let robotsTxt = '';
  let llmsTxtExists = false;

  // Fetch robots.txt / llms.txt via the background service worker.
  // Content-script fetches are subject to page CORS (and fail on www. hosts);
  // the background worker has host_permissions and is exempt from page CORS.
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'fetchRobots', domain });
    if (resp && resp.ok) {
      robotsTxt = resp.robotsTxt || '';
      llmsTxtExists = !!resp.llmsTxtExists;
    }
  } catch {}

  // Parse blocked citation bots
  const citationBotsBlocked = [];
  const lines = robotsTxt.split('\n').map(l => l.trim());
  let currentAgents = [];
  for (const line of lines) {
    if (line.startsWith('User-agent:')) {
      currentAgents = [line.replace('User-agent:', '').trim()];
    } else if (line.startsWith('Disallow: /') && !line.startsWith('Disallow: //')) {
      const path = line.replace('Disallow:', '').trim();
      if (path === '/') {
        for (const agent of currentAgents) {
          for (const bot of CITATION_BOTS) {
            if ((agent === '*' || agent.toLowerCase() === bot.toLowerCase()) &&
                !citationBotsBlocked.includes(bot)) {
              citationBotsBlocked.push(bot);
            }
          }
        }
      }
    }
  }

  const hasSitemap = /^Sitemap:/im.test(robotsTxt);

  let score = 0;
  if (citationBotsBlocked.length === 0) score += 6;
  else score += Math.max(0, 6 - citationBotsBlocked.length * 2);
  if (llmsTxtExists) score += 2;
  if (hasSitemap) score += 2;

  return {
    score: Math.min(10, score), max: 10, label: 'Bot Access',
    citationBotsBlocked, llmsTxtExists, hasSitemap,
    robotsTxtFound: robotsTxt.length > 0,
    issues: [
      citationBotsBlocked.length > 0 &&
        `${citationBotsBlocked.length} citation bot(s) blocked: ${citationBotsBlocked.join(', ')}`,
      !llmsTxtExists && 'No llms.txt found at domain root',
    ].filter(Boolean),
  };
}

// ─── Wikidata Entity Check (free, CORS-friendly) ──────────────────────────────

async function checkWikidata(domain) {
  const base = domain.split('.')[0];

  function splitCamelOrCompound(str) {
    return str
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([a-zA-Z])(\d)/g, '$1 $2');
  }

  const split = splitCamelOrCompound(base);

  const brandVariants = [
    base.charAt(0).toUpperCase() + base.slice(1),
    split.replace(/\b\w/g, c => c.toUpperCase()),
    base.length <= 5 ? base.toUpperCase() : null,
    base.replace(/(app|hq|io|ai|hub)$/i, '').replace(/\b\w/g, c => c.toUpperCase()),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  for (const brand of brandVariants) {
    try {
      const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(brand)}&language=en&limit=5&format=json&origin=*&type=item`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      const results = data?.search ?? [];

      // STRICT matching: label must closely match AND description must
      // suggest it's an organization/company/software (not a concept/word)
      const ORG_KEYWORDS = ['company','corporation','software','platform','service',
                            'organization','startup','inc','ltd','llc','founded',
                            'enterprise','business','firm','agency','brand'];

      const match = results.find(r => {
        const label = (r.label || '').toLowerCase().trim();
        const desc = (r.description || '').toLowerCase();
        const b = brand.toLowerCase().trim();
        // Label must closely match
        const labelMatch = label === b || label === b + ' corporation' ||
                           label === b + ' inc' || label.startsWith(b + ' ');
        if (!labelMatch) return false;
        // Description must suggest it's an entity, not a generic concept
        const isOrg = ORG_KEYWORDS.some(kw => desc.includes(kw));
        // Also accept if it has no description (common for less-known entities)
        return isOrg || !r.description;
      });

      if (match) {
        return { found: true, qNumber: match.id, brandGuess: brand };
      }
    } catch {
      continue;
    }
  }
  return { found: false, qNumber: null, brandGuess: brandVariants[0] };
}

// ─── Wikipedia Article Check ──────────────────────────────────────────────────

async function checkWikipedia(domain) {
  const base = domain.split('.')[0];

  function splitCamelOrCompound(str) {
    return str
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([a-zA-Z])(\d)/g, '$1 $2');
  }

  const split = splitCamelOrCompound(base);

  const brandVariants = [
    base.charAt(0).toUpperCase() + base.slice(1),
    split.replace(/\b\w/g, c => c.toUpperCase()),
    base.length <= 5 ? base.toUpperCase() : null,
    base.replace(/(app|hq|io|ai|hub)$/i, '').replace(/\b\w/g, c => c.toUpperCase()),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  for (const brand of brandVariants) {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(brand)}&limit=5&format=json&origin=*`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      const titles = data?.[1] ?? [];
      const descriptions = data?.[2] ?? [];
      const b = brand.toLowerCase();

      const match = titles.findIndex((title, i) => {
        const t = title.toLowerCase();
        const desc = (descriptions[i] || '').toLowerCase();
        const titleMatch = t === b || t.startsWith(b + ' ') || t === b + ' corporation' || t === b + ' inc';
        const notConcept = !desc.includes('commune') && !desc.includes('river') &&
                           !desc.includes('mountain') && !desc.includes('municipality');
        return titleMatch && notConcept;
      });

      if (match !== -1) {
        const articleTitle = titles[match];
        return {
          found: true,
          articleTitle,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle)}`,
        };
      }
    } catch {
      continue;
    }
  }
  return { found: false, articleTitle: null, url: null };
}

// ─── Reddit Presence Check ────────────────────────────────────────────────────

async function checkRedditPresence(domain) {
  // Use full domain for accuracy — "seo.ai" not "seo", "frase.io" not "frase"
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'checkRedditMentions', brandName: domain },
      (response) => {
        if (chrome.runtime.lastError || !response?.result) {
          resolve({ found: null, status: 'error', mentionCount: null, topSubreddits: [] });
        } else {
          resolve(response.result);
        }
      }
    );
  });
}

// ─── Critical Issues ──────────────────────────────────────────────────────────

function getCriticalIssues(botScore, schemaScore, answerScore) {
  const issues = [];
  if (botScore.citationBotsBlocked?.length > 0) {
    issues.push({
      severity: 'critical',
      type: 'bot-blocking',
      text: `ChatGPT & Claude blocked in robots.txt: ${botScore.citationBotsBlocked.slice(0,3).join(', ')}${botScore.citationBotsBlocked.length > 3 ? ` +${botScore.citationBotsBlocked.length - 3} more` : ''}`,
    });
  }
  if (!schemaScore.detected?.hasOrg) {
    issues.push({ severity: 'high', type: 'schema', text: 'Missing Organization schema markup' });
  }
  if (answerScore.score < 8) {
    issues.push({ severity: 'high', type: 'answer', text: 'Opening content not structured as AI-extractable answer' });
  }
  return issues;
}

// ─── Anonymous Data Capture (the moat) ───────────────────────────────────────

async function captureAnonymousData(domain, audit) {
  // Read auth state (if signed in) so the scan can be attributed to the user.
  let auth = {};
  try {
    auth = await chrome.storage.local.get(['authToken', 'userEmail', 'userPlan']);
  } catch {}

  const payload = {
    domain,
    pageUrl: audit.pageUrl || null,
    type: 'free',
    email: auth.userEmail || null,
    plan: auth.userPlan || 'free',
    signedIn: !!auth.authToken,
    grade: audit.grade,
    overallScore: audit.score,
    signals: {
      citationBotsBlocked: audit.modules.botScore.citationBotsBlocked,
      llmsTxtPresent: audit.modules.botScore.llmsTxtExists,
      hasOrganizationSchema: audit.modules.schemaScore.detected?.hasOrg ?? false,
      hasFaqSchema: audit.modules.schemaScore.detected?.hasFaq ?? false,
      hasArticleSchema: audit.modules.schemaScore.detected?.hasArticle ?? false,
      answerCapsuleScore: audit.modules.answerScore.score,
      schemaScore: audit.modules.schemaScore.score,
      freshnessScore: audit.modules.freshnessScore.score,
      fanOutScore: audit.modules.fanOutScore.score,
      botAccessScore: audit.modules.botScore.score,
      wikidataEntityFound: false,
      g2ProfileFound: false,
      redditMentionCount: audit.bonus.redditResult?.mentionCount || 0,
      redditFound: audit.bonus.redditResult?.found || false,
      overallScore: audit.score,
    },
    source: 'extension_v2.0',
  };

  try {
    await fetch(CR_CAPTURE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true, // survives page navigation
    });
  } catch {
    // Silent fail — never block the audit for data capture
  }
}
})();
