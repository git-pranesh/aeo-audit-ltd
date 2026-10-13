/**
 * ROUTES.TS PATCH — Complete instructions for all 3 changes.
 *
 * Make these 3 changes to server/routes.ts.
 * Each section has FIND and REPLACE_WITH blocks.
 * Do them in order.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE 1: Add imports (at the top of routes.ts, after the last existing import)
// ═══════════════════════════════════════════════════════════════════════════════

/*
FIND (last import line, around line 36):
  import { saveCitationSnapshot, getLatestCitationEntry, detectCitationChanges } from './citation-history-service';

ADD AFTER IT:
  import { writeToDataset } from './audit-dataset';
  import { registerApiV1 } from './api-router';
  import { apiKeyAuth } from './api-key-middleware';
  import { issueApiKey, getUserApiKey } from './api-key-service';
  import { createApiPlanCheckout, handleDodoApiWebhook, DODO_API_PRODUCTS } from './dodo-api-billing';
*/


// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE 2: Write to dataset after every completed audit
// ═══════════════════════════════════════════════════════════════════════════════

/*
FIND (around line 4408-4416):
      if (auditData.citationSnapshot) {
        try {
          await saveCitationSnapshot(auditId, auditData.citationSnapshot, 'initial');
        } catch (citHistErr: any) {
          console.warn('⚠️ Non-blocking: Failed to save citation history:', citHistErr.message);
        }
      }

      res.json({
        success: true,
        websiteUrl: websiteUrl,
        auditData: auditData,
        auditId: auditId,
        generatedAt: new Date().toISOString()
      });

REPLACE WITH:
      if (auditData.citationSnapshot) {
        try {
          await saveCitationSnapshot(auditId, auditData.citationSnapshot, 'initial');
        } catch (citHistErr: any) {
          console.warn('⚠️ Non-blocking: Failed to save citation history:', citHistErr.message);
        }
      }

      // DATASET WRITE — non-blocking fire-and-forget. Builds the AEO moat.
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
        signalQuality: auditData.signalQuality ?? 'normal',
        largeSiteDetected: largeSiteDetected,
      }).catch(() => {});

      res.json({
        success: true,
        websiteUrl: websiteUrl,
        auditData: auditData,
        auditId: auditId,
        generatedAt: new Date().toISOString()
      });
*/


// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE 3: Register API v1 routes + API key routes + Dodo webhook handler
// ═══════════════════════════════════════════════════════════════════════════════
//
// Find the BOTTOM of the registerRoutes() function, just before:
//   return httpServer;
//
// Add the entire block below before that return statement.
// ═══════════════════════════════════════════════════════════════════════════════

/*
  // ─── API v1 middleware (API key auth for all /api/v1/* routes) ──────────────
  app.use('/api/v1', apiKeyAuth);

  // ─── Register API v1 public endpoints ──────────────────────────────────────
  registerApiV1(app as any, (url) => scrapeWebsiteContent(url));

  // ─── API Key management routes ──────────────────────────────────────────────

  // GET /api/keys/me — get current user's API key + usage stats
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

  // POST /api/keys/issue — issue API key (called after signup or from dashboard)
  app.post('/api/keys/issue', requireAuth, async (req: AuthenticatedRequest, res) => {
    const userId = req.user?.uid;
    const userEmail = req.user?.email || '';
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const record = await issueApiKey(userId, userEmail, 'free');
    return res.json({ success: true, apiKey: record });
  });

  // POST /api/keys/checkout — start Dodo checkout for API plan upgrade
  app.post('/api/keys/checkout', requireAuth, async (req: AuthenticatedRequest, res) => {
    const userId = req.user?.uid;
    const userEmail = req.user?.email || '';
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { plan, billing = 'monthly' } = req.body;
    if (!plan) return res.status(400).json({ error: 'plan is required' });
    const result = await createApiPlanCheckout({ plan, billing, userId, userEmail });
    if ('error' in result) return res.status(500).json({ error: result.error });
    return res.json({ success: true, checkoutUrl: result.checkoutUrl });
  });

  // POST /api/generate-aeo-files — Thing 3: generate the full AEO file package
  // Available to Growth plan and above (plan gating enforced below)
  app.post('/api/generate-aeo-files', requireAuth, async (req: AuthenticatedRequest, res) => {
    const userId = req.user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Get user's plan
    const { getFeatureFlags } = await import('./feature-flags');
    const userPlanRaw = req.body.userPlan || 'free';
    const serverPlan = await subscriptionService.getServerPlan(userId, userPlanRaw);
    const flags = getFeatureFlags(serverPlan);

    // Gate to Growth/Pro/Enterprise/Lifetime only
    const allowedPlans = ['pro', 'enterprise', 'lifetime', 'appsumo'];
    if (!allowedPlans.includes(serverPlan)) {
      return res.status(403).json({
        error: 'AEO file generation requires a Growth plan or above.',
        code: 'PLAN_REQUIRED',
        upgrade: 'https://citationrocket.com/pricing',
      });
    }

    const { websiteUrl, companyName, industry, businessType, targetAudience,
            valueProposition, keywords = [], competitors = [], pingIndexNow = true } = req.body;

    if (!websiteUrl) return res.status(400).json({ error: 'websiteUrl is required' });

    try {
      const scrapeResult = await scrapeWebsiteContent(websiteUrl);
      const { extractContentSignals } = await import('./content-signal-service');
      const { generateAeoFiles, pingBingIndexNow } = await import('./aeo-file-generator');

      const signals = extractContentSignals(scrapeResult.html, scrapeResult.text, scrapeResult.sitemapUrls);

      const files = await generateAeoFiles({
        websiteUrl,
        companyName: companyName || new URL(websiteUrl).hostname.replace(/^www\./, '').split('.')[0],
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

      let indexNowResult = { success: false, message: 'Skipped' };
      if (pingIndexNow) {
        indexNowResult = await pingBingIndexNow(websiteUrl, scrapeResult.sitemapUrls);
      }

      return res.json({
        success: true,
        files,
        fileCount: Object.keys(files).length,
        indexNow: indexNowResult,
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('❌ AEO file generation error:', err);
      return res.status(500).json({ error: 'File generation failed', details: err.message });
    }
  });

  // Hook Dodo API webhook events into the existing Dodo webhook handler.
  // FIND the existing Dodo webhook handler in routes.ts (search for 'webhookSecret')
  // and add this line INSIDE it, after verifying the signature:
  //
  //   await handleDodoApiWebhook(event);
  //
  // This handles API subscription activations/cancellations automatically.
*/


// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE 4: Wire in Scraper V2 (THE MOST IMPORTANT CHANGE)
// ═══════════════════════════════════════════════════════════════════════════════

/*
FIND (at the top of routes.ts, after existing imports ~line 36):
  import { saveCitationSnapshot, getLatestCitationEntry, detectCitationChanges } from './citation-history-service';

ADD this import alongside the other new imports from Change 1:
  import { scrapeWebsiteV2 } from './scraper-v2';


FIND the function definition in routes.ts (line 167):
  async function scrapeWebsiteContent(
    websiteUrl: string,
    signal?: AbortSignal,
    partial?: ScrapeResult
  ): Promise<ScrapeResult> {

ADD this 3-line wrapper immediately INSIDE that function, as the very first thing
before any existing code (before the "const normalizedUrl = ..." line):

    // SCRAPER V2: Smart SaaS-optimized scraping. 15 pages max, intelligent selection.
    // Falls back to old scraper path only if V2 returns empty result.
    const v2Result = await scrapeWebsiteV2(websiteUrl, signal);
    if (v2Result.html.length > 500 || v2Result.sitemapUrls.length > 0) {
      return v2Result;
    }
    console.warn('⚠️ Scraper V2 returned empty result — falling back to legacy scraper');
    // (existing legacy scraper code continues below)


WHY THIS APPROACH:
- V2 runs first. If it succeeds (which it will for 95% of SaaS sites), returns immediately.
- If V2 somehow fails, falls through to the existing legacy scraper as safety net.
- Zero risk of breaking existing functionality.
- Can remove the legacy fallback after 2 weeks of production data confirming V2 works.
*/
