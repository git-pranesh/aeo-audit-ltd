import { Router } from 'express';
import { z } from 'zod';
import archiver from 'archiver';
import { requireAuth, requireLicense, type AuthenticatedRequest } from '../security/auth';
import { CUSTOM_ENGINE, ENGINE_IDS, ENGINES, MAX_OWN_QUESTIONS } from '../../shared/engines';
import { analyzeLimiter, auditStartLimiter, citationLimiter } from '../security/rate-limits';
import { assertPublicUrl } from '../security/ssrf';
import { handler } from './http';
import { getModelChoice, getUser, recordDownload, requireOpenRouterKey } from '../services/user-service';
import { analyzeWebsite, runAudit } from '../services/audit-pipeline';
import {
  FAIR_USE, completeAudit, limitsFor, deleteAudit, failAudit, getAudit, getAuditForFiles, listAudits,
  appendTopics, auditHistoryFor, previousScoreFor, saveCitationSnapshot, startAudit,
} from '../services/audit-store';
import { generateCitationSnapshot, summarizeCheck, writeCitationQuestions } from '../services/citation-snapshot';
import { generateTopics } from '../services/topics';
import { generateAeoFiles } from '../services/aeo-pack';
import { extractDomain } from '../engine/domain-utils';
import { OpenRouterError } from '../services/openrouter';
import { addAiSpend, recordAuditResearch, recordCheckResearch } from '../services/research-store';

export const auditsRouter = Router();
auditsRouter.use(requireAuth);

const urlSchema = z.string().trim().min(3).max(500);

const contextSchema = z.object({
  companyName: z.string().trim().max(80).default(''),
  industry: z.string().trim().max(120).default(''),
  businessType: z.string().trim().max(120).default(''),
  targetAudience: z.string().trim().max(160).default(''),
  valueProposition: z.string().trim().max(200).default(''),
  keywords: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
  competitors: z.array(z.string().trim().min(3).max(120)).max(FAIR_USE.maxCompetitors, `Add at most ${FAIR_USE.maxCompetitors} competitors.`).default([]),
});

function cleanCompetitor(c: string): string {
  return c.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').toLowerCase();
}

// ─── List / read / delete ─────────────────────────────────────────────────────

auditsRouter.get('/', handler<AuthenticatedRequest>(async (req, res) => {
  res.json({ audits: await listAudits(req.user!.uid) });
}));

// Reading a saved report needs no active licence: after a refund or a revoked invite, people keep
// read-only access to their past reports. Anything that runs AI or starts work still needs a licence.
auditsRouter.get('/:auditId', handler<AuthenticatedRequest>(async (req, res) => {
  const audit = await getAudit(req.user!.uid, req.params.auditId);
  if (!audit) {
    res.status(404).json({ error: 'Audit not found.' });
    return;
  }
  res.json(audit);
}));

auditsRouter.delete('/:auditId', handler<AuthenticatedRequest>(async (req, res) => {
  const ok = await deleteAudit(req.user!.uid, req.params.auditId);
  res.status(ok ? 200 : 404).json(ok ? { ok: true } : { error: 'Audit not found or still running.' });
}));

// ─── Step 1: propose business context ─────────────────────────────────────────

auditsRouter.post('/analyze', requireLicense, analyzeLimiter, handler<AuthenticatedRequest>(async (req, res) => {
  const websiteUrl = await assertPublicUrl(urlSchema.parse(req.body?.websiteUrl));
  const apiKey = await requireOpenRouterKey(req.user!.uid);
  const suggestion = await analyzeWebsite(websiteUrl, apiKey, await getModelChoice(req.user!.uid));
  res.json({ websiteUrl, suggestion });
}));

// ─── Step 2: run the audit (synchronous; idempotent per idempotencyKey) ──────

auditsRouter.post('/', requireLicense, auditStartLimiter, handler<AuthenticatedRequest>(async (req, res) => {
  const body = z.object({
    websiteUrl: urlSchema,
    idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, 'Invalid request id.'),
    context: contextSchema,
  }).parse(req.body);

  const uid = req.user!.uid;
  const websiteUrl = await assertPublicUrl(body.websiteUrl);
  const context = { ...body.context, competitors: Array.from(new Set(body.context.competitors.map(cleanCompetitor))).filter(Boolean) };
  const apiKey = await requireOpenRouterKey(uid); // fail before reserving a slot
  const domain = extractDomain(websiteUrl);

  const limits = limitsFor((await getUser(uid))?.entitlement?.whiteLabel);
  const start = await startAudit({ uid, idempotencyKey: body.idempotencyKey, websiteUrl, domain, context, limits });
  if (start.kind === 'existing') {
    // Retried request: report the existing audit rather than starting another.
    res.status(start.audit.status === 'running' ? 202 : 200).json(start.audit);
    return;
  }

  const { auditId } = start;
  try {
    let aiCost = 0;
    const { auditData, aeoInputs } = await runAudit({ auditId, websiteUrl, context, apiKey, models: await getModelChoice(uid), onCost: (usd) => { aiCost += usd; } });
    const previousScore = await previousScoreFor(uid, domain, auditId);
    await completeAudit(uid, auditId, auditData, aeoInputs, previousScore, limits.savedAudits);
    void addAiSpend(uid, 'audits', aiCost);
    void recordAuditResearch({ source: 'app', websiteUrl, domain, context, auditData, aiCostUsd: aiCost, agency: limits.savedAudits > 25 });
    res.json(await getAudit(uid, auditId));
  } catch (err) {
    const message = err instanceof OpenRouterError ? err.message : 'The audit could not be completed. Please try again.';
    console.error(`Audit ${auditId} failed:`, err instanceof Error ? err.message : err);
    await failAudit(uid, auditId, message);
    throw err;
  }
}));

// ─── Manual Citation Snapshot (latest only, customer key) ─────────────────────

const snapshotsInFlight = new Set<string>();
const questionSchema = z.string().trim().min(5, 'Each question needs at least 5 characters.').max(200, 'Each question can be up to 200 characters.');

auditsRouter.post('/:auditId/citation-snapshot', requireLicense, citationLimiter, handler<AuthenticatedRequest>(async (req, res) => {
  const uid = req.user!.uid;
  const audit = await getAudit(uid, req.params.auditId);
  if (!audit || audit.status !== 'completed') {
    res.status(404).json({ error: 'Audit not found.' });
    return;
  }
  // One active snapshot per account (per instance; the per-user limiter caps the rest).
  if (snapshotsInFlight.has(uid)) {
    res.status(409).json({ error: 'A citation check is already running.', code: 'SNAPSHOT_RUNNING' });
    return;
  }
  const body = z.object({
    engines: z.array(z.enum([...ENGINE_IDS, CUSTOM_ENGINE])).min(1).max(ENGINE_IDS.length + 1).optional(),
    questions: z.array(questionSchema).min(1).max(MAX_OWN_QUESTIONS).optional(),
  }).parse(req.body ?? {});
  const apiKey = await requireOpenRouterKey(uid);
  const models = await getModelChoice(uid);

  const engines = body.engines && Array.from(new Set(body.engines)).flatMap((id) => {
    if (id !== CUSTOM_ENGINE) {
      const def = ENGINES.find((e) => e.id === id)!;
      return [{ id: def.id as string, label: def.label, model: def.model }];
    }
    return models.webSearch?.id ? [{ id: CUSTOM_ENGINE as string, label: 'Your model', model: models.webSearch.id }] : [];
  });
  if (engines && engines.length === 0) {
    res.status(400).json({ error: 'Choose at least one AI engine.', code: 'BAD_REQUEST' });
    return;
  }

  snapshotsInFlight.add(uid);
  try {
    const snapshot = await generateCitationSnapshot({
      websiteUrl: audit.websiteUrl,
      industry: audit.context.industry || 'General',
      companyName: audit.context.companyName,
      keywords: audit.context.keywords,
      apiKey,
      auditId: `${audit.auditId}-snapshot-${Date.now()}`,
      model: models.webSearch?.id,
      engines,
      questions: body.questions && Array.from(new Set(body.questions)),
      questionModel: models.structured,
    });
    const stored = { ...snapshot, generatedAt: snapshot.snapshotDate };
    await saveCitationSnapshot(uid, audit.auditId, stored, summarizeCheck(snapshot, audit.context.companyName));
    void addAiSpend(uid, 'checks', snapshot.estimatedCost ?? 0);
    void recordCheckResearch({ domain: extractDomain(audit.websiteUrl), context: audit.context, snapshot });
    res.json({ citationSnapshot: stored });
  } finally {
    snapshotsInFlight.delete(uid);
  }
}));

/** A fresh set of questions to review and edit, before spending anything on engines. */
auditsRouter.post('/:auditId/citation-questions', requireLicense, analyzeLimiter, handler<AuthenticatedRequest>(async (req, res) => {
  const uid = req.user!.uid;
  const audit = await getAudit(uid, req.params.auditId);
  if (!audit || audit.status !== 'completed') {
    res.status(404).json({ error: 'Audit not found.' });
    return;
  }
  const { avoid } = z.object({ avoid: z.array(z.string().trim().max(200)).max(60).default([]) }).parse(req.body ?? {});
  const apiKey = await requireOpenRouterKey(uid);
  const models = await getModelChoice(uid);
  const questions = await writeCitationQuestions({
    websiteUrl: audit.websiteUrl,
    industry: audit.context.industry || 'General',
    companyName: audit.context.companyName,
    keywords: audit.context.keywords,
    apiKey,
    questionModel: models.structured,
  }, avoid);
  res.json({ questions });
}));

/** Scores and citation checks for this website across saved audits. */
auditsRouter.get('/:auditId/history', handler<AuthenticatedRequest>(async (req, res) => {
  const history = await auditHistoryFor(req.user!.uid, req.params.auditId);
  if (!history) {
    res.status(404).json({ error: 'Audit not found.' });
    return;
  }
  res.json(history);
}));

/** More content ideas on a saved audit, different from the ones already written. One AI call. */
auditsRouter.post('/:auditId/topics', requireLicense, analyzeLimiter, handler<AuthenticatedRequest>(async (req, res) => {
  const uid = req.user!.uid;
  const audit = await getAuditForFiles(uid, req.params.auditId);
  if (!audit || audit.status !== 'completed' || !audit.auditData || !audit.aeoInputs) {
    res.status(404).json({ error: 'Audit not found.' });
    return;
  }
  const apiKey = await requireOpenRouterKey(uid);
  const models = await getModelChoice(uid);
  const existing = Object.values(audit.auditData.contentTopics ?? {}).flat().map((t: any) => String(t.topic));
  const scores = audit.auditData.auditResults.platformScores;
  const lowestPlatform = (Object.entries(scores) as [keyof typeof scores, number][]).sort((a, b) => a[1] - b[1])[0][0];
  const siteText = (audit.aeoInputs.facts?.pages ?? []).flatMap((p) => [p.title, p.description, p.h1, ...p.paragraphs]).filter(Boolean).join(' ');
  const { topics } = await generateTopics(
    { websiteUrl: audit.websiteUrl, context: audit.context, signals: audit.aeoInputs.signals, platformScores: scores, lowestPlatform, avoid: existing },
    apiKey, `${req.params.auditId}-topics-${Date.now()}`, models, siteText,
  );
  const contentTopics = await appendTopics(uid, req.params.auditId, topics);
  res.json({ contentTopics });
}));

// ─── AEO Pack ZIP (generated from saved inputs; no re-scrape) ─────────────────

// The AEO Pack is built from the saved audit with no AI call, so it is part of read-only access.
auditsRouter.get('/:auditId/aeo-pack', handler<AuthenticatedRequest>(async (req, res) => {
  const audit = await getAuditForFiles(req.user!.uid, req.params.auditId);
  if (!audit || audit.status !== 'completed' || !audit.aeoInputs) {
    res.status(404).json({ error: 'Audit not found.' });
    return;
  }
  const ctx = audit.context;
  const files = await generateAeoFiles({
    websiteUrl: audit.websiteUrl,
    companyName: ctx.companyName || audit.domain,
    industry: ctx.industry,
    businessType: ctx.businessType,
    targetAudience: ctx.targetAudience,
    valueProposition: ctx.valueProposition,
    signals: audit.aeoInputs.signals,
    sitemapUrls: audit.aeoInputs.sitemapUrls,
    keywords: ctx.keywords,
    facts: audit.aeoInputs.facts,
    sitemapLocation: audit.aeoInputs.sitemapLocation,
    hasLlmsTxt: audit.aeoInputs.hasLlmsTxt,
  });

  const safeName = (ctx.companyName || audit.domain).replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60) || 'site';
  await recordDownload(req.user!.uid, 'pack');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}-aeo-pack.zip"`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', () => res.destroy());
  archive.pipe(res);
  for (const [name, content] of Object.entries(files)) archive.append(content, { name });
  await archive.finalize();
}));
