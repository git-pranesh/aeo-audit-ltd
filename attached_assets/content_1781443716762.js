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

const CR_CAPTURE_URL = 'https://citationrocket.com/api/extension/capture';

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
    wikidataResult,
    g2Result,
  ] = await Promise.all([
    scoreAnswerCapsule(html, text),
    scoreSchemaCompleteness(html),
    scoreFreshness(html),
    scoreFanOut(html),
    scoreBotAccess(domain),
    checkWikidata(domain),
    checkG2Profile(domain),
  ]);

  // Composite free score (max 80 from modules + 10 bonus signals)
  const moduleTotal = answerScore.score + schemaScore.score +
                      freshnessScore.score + fanOutScore.score + botScore.score;
  const bonusTotal = (wikidataResult.found ? 5 : 0) + (g2Result.found ? 5 : 0);
  const rawScore = moduleTotal + bonusTotal;
  const maxScore = 90; // 80 module pts + 10 bonus
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
    bonus: { wikidataResult, g2Result },
    criticalIssues,
    scannedAt: new Date().toISOString(),
  };

  // Fire-and-forget anonymous data capture (the moat)
  captureAnonymousData(domain, audit).catch(() => {});

  return audit;
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

  let score = 0;
  if (h1IsDeclarative) score += 3; else score -= 1;
  if (hasDefinitionFirst) score += 6;
  if (hasDataPoint) score += 5;
  score += Math.min(6, questionHeadings * 2);
  score += Math.min(5, answerBlocks);

  return {
    score: Math.max(0, Math.min(25, score)),
    max: 25,
    label: 'Answer Capsule',
    details: { h1IsDeclarative, hasDefinitionFirst, hasDataPoint, questionHeadings, answerBlocks },
    issues: [
      !h1IsDeclarative && 'H1 is a question — declarative H1 gets more citations',
      !hasDefinitionFirst && 'Opening paragraph lacks definition-first structure',
      !hasDataPoint && 'No data points in opening sentences',
    ].filter(Boolean),
  };
}

// ─── Module 5: Schema Completeness ───────────────────────────────────────────

function scoreSchemaCompleteness(html) {
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  const schemas = [];
  jsonLdScripts.forEach(s => {
    try { schemas.push(...[JSON.parse(s.textContent)].flat()); } catch {}
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
    if (wordCount > 500) {
      return {
        score: 3, max: 20, label: 'Schema',
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
  const orgSchema = schemas.find(s => ['Organization','Corporation','LocalBusiness'].includes(s['@type']));
  const orgHasSameAs = Array.isArray(orgSchema?.sameAs) && orgSchema.sameAs.length > 0;

  let score = 0;
  if (hasOrg) score += 5;
  if (orgHasSameAs) score += 2;
  if (hasArticle) score += 4;
  if (hasFaq) score += 4;
  if (hasBreadcrumb) score += 3;
  if (hasHowTo) score += 2;

  return {
    score: Math.min(20, score), max: 20, label: 'Schema',
    detected: { hasOrg, hasArticle, hasFaq, hasBreadcrumb, hasHowTo },
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

  // 1. Meta tags
  document.querySelectorAll('meta').forEach(tag => {
    const prop = (tag.getAttribute('property') || tag.getAttribute('name') || '').toLowerCase();
    const content = tag.getAttribute('content') || '';
    if (['article:modified_time','article:published_time','og:updated_time',
         'revised','last-modified'].includes(prop)) {
      if (!foundDate && content) foundDate = content;
    }
  });

  // 2. Time elements
  if (!foundDate) {
    const timeEl = document.querySelector('time[datetime]');
    if (timeEl) foundDate = timeEl.getAttribute('datetime');
  }

  // 3. Visible date text
  if (!foundDate) {
    const match = document.body.innerText.match(
      /(?:updated|published|modified|revised)[:\s]+(\w+ \d{1,2},?\s*\d{4}|\d{4}-\d{2}-\d{2})/i
    );
    if (match) foundDate = match[1];
  }

  // 4. JSON-LD dateModified
  if (!foundDate) {
    const m = html.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
    if (m) foundDate = m[1];
  }

  const hasBlog = document.querySelectorAll('article,[class*="blog"],[class*="post"]').length > 0;
  const hasDateEl = !!document.querySelector('time,[datetime],[class*="date"],[class*="timestamp"]');
  const hasVisibleUpdated = /\b(last updated|updated on)\s*:?\s*/i.test(document.body.innerText);

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
    if (hasVisibleUpdated) score += 4;
  } else if (hasBlog && hasDateEl) {
    score = 3;
  } else if (hasBlog) {
    score = 1;
  }

  return {
    score: Math.min(15, score), max: 15, label: 'Freshness',
    daysSince, hasVisibleUpdated,
    issues: [
      !foundDate && 'No date signals found — add dateModified to schema',
      !hasVisibleUpdated && 'No visible "Last Updated" annotation',
      daysSince !== null && daysSince > 180 && `Content is ${daysSince} days old — refresh recommended`,
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

  try {
    const [robotsRes, llmsRes] = await Promise.allSettled([
      fetch(`https://${domain}/robots.txt`, { signal: AbortSignal.timeout(6000) }),
      fetch(`https://${domain}/llms.txt`, { method: 'HEAD', signal: AbortSignal.timeout(5000) }),
    ]);
    if (robotsRes.status === 'fulfilled' && robotsRes.value.ok) {
      robotsTxt = await robotsRes.value.text();
    }
    llmsTxtExists = llmsRes.status === 'fulfilled' && llmsRes.value.ok;
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
  // Extract brand name from domain (e.g. trulyinbox.com → TrulyInbox)
  const brandGuess = domain.split('.')[0]
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(brandGuess)}&language=en&limit=3&format=json&origin=*`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { found: false, qNumber: null, brandGuess };
    const data = await res.json();
    const results = data?.search ?? [];
    if (results.length === 0) return { found: false, qNumber: null, brandGuess };
    return { found: true, qNumber: results[0]?.id ?? null, brandGuess };
  } catch {
    return { found: false, qNumber: null, brandGuess };
  }
}

// ─── G2 Profile Check ─────────────────────────────────────────────────────────

async function checkG2Profile(domain) {
  const slug = domain.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '-');
  const g2Url = `https://www.g2.com/products/${slug}/reviews`;
  try {
    const res = await fetch(g2Url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return { found: res.ok && res.status < 400, url: g2Url };
  } catch {
    return { found: false, url: g2Url };
  }
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
  // Only send public website data — no user data, no conversation data
  const payload = {
    domain,
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
      wikidataEntityFound: audit.bonus.wikidataResult.found,
      g2ProfileFound: audit.bonus.g2Result.found,
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
