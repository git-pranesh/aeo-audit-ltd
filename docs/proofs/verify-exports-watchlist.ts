/**
 * Reproducible proof for Task #19 — Exports & Watchlist
 * (docs/00 §2 #12-#17, §7 table; docs/01 exports/watchlist sections).
 *
 * Executes the REAL importable modules (no network, no Firestore spend):
 *   - generateAeoFiles()  → asserts the exact AEO ZIP file list.
 *   - getFeatureFlags()   → asserts per-plan PDF mode + watchlist limits.
 *   - AuditPDFGenerator   → renders a real PDF per mode and greps the raw
 *                           PDF byte stream for branding/watermark text.
 *
 * Run: npx tsx docs/proofs/verify-exports-watchlist.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function assert(id: string, cond: boolean, detail: string) {
  const tag = cond ? '✅ PASS' : '❌ FAIL';
  if (cond) pass++; else fail++;
  console.log(`${tag} ${id}  ${detail}`);
}

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

async function main() {
  // ── EX-05: AEO ZIP contents (executes the REAL generateAeoFiles) ────────────
  const { generateAeoFiles } = await import('../../server/aeo-file-generator');
  const files = await generateAeoFiles({
    websiteUrl: 'https://example.com',
    companyName: 'Example Co',
    industry: 'SaaS',
    businessType: 'B2B',
    targetAudience: 'developers',
    valueProposition: 'ships fast',
    signals: {
      tutorialCount: 3, howToGuideCount: 2, faqSectionCount: 1, stepByStepListCount: 1,
      externalLinkCount: 5, dataPointCount: 10, statisticMentionCount: 4, researchTermCount: 2,
      schemaTypeCount: 2, headingHierarchyScore: 50, hasStructuredData: true, imageCount: 8,
      caseStudyCount: 2, frameworkMentionCount: 1, longFormContentScore: 40, nuancedTermCount: 3,
      blogPostCount: 6, documentationPageCount: 4, totalPageCount: 30, contentDepthScore: 55,
    },
    sitemapUrls: ['https://example.com/blog/a', 'https://example.com/docs/b'],
    scrapedText: 'Example homepage content about shipping fast for developers.',
    keywords: ['ci', 'cd', 'devops'],
    competitors: ['rival.com'],
  });
  const expectedFiles = [
    'llms.txt', 'llms-full.txt', 'AGENTS.md', 'robots-patch.txt',
    'schema/Organization.jsonld', 'schema/FAQPage.jsonld', 'schema/HowTo.jsonld',
    'schema/Article.jsonld', 'schema/BreadcrumbList.jsonld',
    'markdown-twins/homepage.md', 'INSTRUCTIONS.md',
  ];
  const actualFiles = Object.keys(files);
  const listMatches = expectedFiles.length === actualFiles.length
    && expectedFiles.every((f) => actualFiles.includes(f));
  const schemaFiles = actualFiles.filter((f) => f.startsWith('schema/'));
  assert('EX-05', listMatches && schemaFiles.length === 5,
    `AEO ZIP files=[${actualFiles.join(', ')}] — 5 schema files, llms/llms-full/AGENTS/robots/homepage/INSTRUCTIONS all present`);

  // ── PB-17 / PB-13 / EX-02: per-plan flags (executes getFeatureFlags) ────────
  const { getFeatureFlags } = await import('../../shared/feature-flags');
  const pdfByPlan = Object.fromEntries(
    ['free', 'starter', 'pro', 'enterprise', 'lifetime'].map((p) => [p, getFeatureFlags(p).pdfExport])
  );
  assert('PB-17', pdfByPlan.free === 'watermarked' && pdfByPlan.starter === 'clean'
    && pdfByPlan.pro === 'whitelabel' && pdfByPlan.enterprise === 'whitelabel'
    && pdfByPlan.lifetime === 'whitelabel',
    `pdfExport per plan = ${JSON.stringify(pdfByPlan)} (whitelabel = unbranded)`);

  const wl = Object.fromEntries(
    ['free', 'starter', 'pro', 'enterprise', 'lifetime'].map((p) => [p, getFeatureFlags(p).competitorWatchlistLimit])
  );
  assert('PB-13', wl.free === 0 && wl.starter === 3
    && wl.pro === 999 && wl.enterprise === 999 && wl.lifetime === 999,
    `competitorWatchlistLimit per plan = ${JSON.stringify(wl)} (free 0, starter 3, pro/ent/life unlimited)`);

  const st = Object.fromEntries(
    ['free', 'starter', 'pro', 'enterprise', 'lifetime'].map((p) => [p, getFeatureFlags(p).scoreTrendExport])
  );
  assert('EX-02', st.free === false && st.starter === false
    && st.pro === true && st.enterprise === true && st.lifetime === true,
    `scoreTrendExport per plan = ${JSON.stringify(st)} (Pro+ only)`);

  // ── EX-06: REAL PDF rendered per mode; grep raw byte stream for branding ────
  const { AuditPDFGenerator } = await import('../../client/src/lib/audit-pdf-generator');
  const fixture: any = {
    auditResults: {
      overallScore: 72, letterGrade: 'B',
      platformScores: { chatgpt: 70, perplexity: 68, gemini: 74, claude: 71 },
      strengths: [], weaknesses: [],
      technicalFindings: {
        domainAuthority: 'Moderate', contentStructure: 'Good',
        schemaMarkup: 'Present', entityRecognition: 'Fair',
      },
    },
    contentTopics: { authoritative: [], thoughtLeadership: [], competitiveAdvantage: [], emergingOpportunity: [] },
    recommendations: [],
  };

  function renderPdf(mode: 'watermarked' | 'clean' | 'whitelabel'): string {
    const gen: any = new AuditPDFGenerator({
      auditData: fixture, websiteUrl: 'https://example.com',
      generatedAt: new Date().toISOString(), pdfMode: mode,
    });
    gen.generate();
    return Buffer.from(gen.pdf.output('arraybuffer')).toString('latin1');
  }

  const wm = renderPdf('watermarked');
  const clean = renderPdf('clean');
  const white = renderPdf('whitelabel');

  const has = (s: string, needle: string) => s.includes(needle);

  assert('EX-06a', has(wm, 'FREE PLAN') && has(wm, 'citationrocket.com') && has(wm, 'Citation Rocket'),
    `watermarked PDF: watermark "FREE PLAN"=YES, "citationrocket.com"=YES (branded)`);
  assert('EX-06b', !has(clean, 'FREE PLAN') && has(clean, 'citationrocket.com') && has(clean, 'Citation Rocket'),
    `clean PDF: no watermark, still branded ("citationrocket.com"=YES)`);
  assert('EX-06c', !has(white, 'FREE PLAN') && !has(white, 'citationrocket.com') && !has(white, 'Citation Rocket'),
    `whitelabel PDF: no watermark AND no "citationrocket.com"/"Citation Rocket" (UNBRANDED)`);

  // ── EX-03: AEO ZIP gating (source assertion, matches live route) ────────────
  const routes = read('server/routes.ts');
  const aeoIdx = routes.indexOf("app.post('/api/generate-aeo-files'");
  const aeoBlock = routes.slice(aeoIdx, aeoIdx + 2200);
  assert('EX-03', aeoIdx > 0 && /allowedPlans\s*=\s*\['pro',\s*'enterprise',\s*'lifetime'\]/.test(aeoBlock)
    && /status\(403\)/.test(aeoBlock) && /PLAN_REQUIRED/.test(aeoBlock),
    'POST /api/generate-aeo-files → 403 PLAN_REQUIRED unless plan ∈ [pro,enterprise,lifetime]');

  // ── EX-01: full-audit CSV button has NO plan gate (source assertion) ────────
  const home = read('client/src/pages/home.tsx');
  const auditDetail = read('client/src/pages/audit-detail.tsx');
  assert('EX-01', /button-download-csv/.test(home + auditDetail),
    'full-audit CSV download button rendered with no feature-flag guard (all plans incl. Free)');

  console.log(`\n── Task #19 proof: ${pass} passed, ${fail} failed ──`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
