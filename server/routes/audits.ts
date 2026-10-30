import { Router } from 'express';
import { z } from 'zod';
import archiver from 'archiver';
import { requireAuth, requireLicense, type AuthenticatedRequest } from '../security/auth';
import { analyzeLimiter, auditStartLimiter, citationLimiter } from '../security/rate-limits';
import { assertPublicUrl } from '../security/ssrf';
import { handler } from './http';
import { getModelChoice, getUser, recordDownload, requireOpenRouterKey } from '../services/user-service';
import { analyzeWebsite, runAudit } from '../services/audit-pipeline';
import {
  FAIR_USE, completeAudit, limitsFor, deleteAudit, failAudit, getAudit, getAuditForFiles, listAudits,
  previousScoreFor, saveCitationSnapshot, startAudit,
} from '../services/audit-store';
import { generateCitationSnapshot } from '../services/citation-snapshot';
import { generateAeoFiles } from '../services/aeo-pack';
import { extractDomain } from '../engine/domain-utils';
import { OpenRouterError } from '../services/openrouter';

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

auditsRouter.get('/:auditId', requireLicense, handler<AuthenticatedRequest>(async (req, res) => {
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
    const { auditData, aeoInputs } = await runAudit({ auditId, websiteUrl, context, apiKey, models: await getModelChoice(uid) });
    const previousScore = await previousScoreFor(uid, domain, auditId);
    await completeAudit(uid, auditId, auditData, aeoInputs, previousScore, limits.savedAudits);
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
  const apiKey = await requireOpenRouterKey(uid);
  const models = await getModelChoice(uid);

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
      questionModel: models.structured,
    });
    const stored = { ...snapshot, generatedAt: snapshot.snapshotDate };
    await saveCitationSnapshot(uid, audit.auditId, stored);
    res.json({ citationSnapshot: stored });
  } finally {
    snapshotsInFlight.delete(uid);
  }
}));

// ─── AEO Pack ZIP (generated from saved inputs; no re-scrape) ─────────────────

auditsRouter.get('/:auditId/aeo-pack', requireLicense, handler<AuthenticatedRequest>(async (req, res) => {
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
