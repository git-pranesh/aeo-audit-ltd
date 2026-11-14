/**
 * Endpoints used by citationrocket.com without an account:
 *   GET  /founding  current founding-1,000 count and prices
 *   POST /checkout  Dodo checkout session at the current price step
 *   POST /preview   free preview audit (deterministic part only, no AI call)
 *   GET  /invite/:code  what an admin invite link may show before sign-in (name, still open?)
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { handler } from './http';
import { adminDb } from '../firebase-admin';
import { assertPublicUrl } from '../security/ssrf';
import { extractDomain } from '../engine/domain-utils';
import { runAudit } from '../services/audit-pipeline';
import { getFoundingStatus } from '../services/founding';
import { createCheckoutSession, DodoError } from '../services/dodo';
import { lookupInvite } from '../services/invite-service';
import { getTestimonialPhoto, listPublicTestimonials, lookupReviewRequest, MAX_PHOTO_CHARS, submitReview } from '../services/testimonial-service';
import { optionalAuth, type AuthenticatedRequest } from '../security/auth';
import type { PreviewResult } from '@shared/api';

export const publicRouter = Router();

const ALLOWED_ORIGINS = new Set([
  'https://www.citationrocket.com',
  'https://citationrocket.com',
  'http://localhost:3000',
  'http://localhost:3100',
]);

/** The website calls these from the browser (preview) and from its server (checkout, founding). */
function cors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}
publicRouter.use(cors);

const perIp = (windowMs: number, max: number, error: string) =>
  rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error }, keyGenerator: (req) => ipKeyGenerator(req.ip || '') });

// ─── Founding 1,000 ───────────────────────────────────────────────────────────

publicRouter.get('/founding', handler(async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=30');
  res.json(await getFoundingStatus());
}));

// ─── Checkout at the current price step ──────────────────────────────────────

const APP_URL = (process.env.APP_PUBLIC_URL || 'https://app.citationrocket.com').replace(/\/$/, '');

publicRouter.post('/checkout', perIp(60 * 60 * 1000, 30, 'Too many checkout attempts. Please try again later.'), handler(async (req, res) => {
  const body = z.object({
    plan: z.enum(['lifetime', 'agency']),
    metadata: z.record(z.string().regex(/^[a-z_]{1,32}$/), z.string().max(400)).refine((m) => Object.keys(m).length <= 10, 'Too much metadata.').default({}),
  }).parse(req.body);

  const productId = body.plan === 'agency' ? process.env.DODO_PRODUCT_AGENCY : process.env.DODO_PRODUCT_LIFETIME;
  if (!productId) {
    res.status(503).json({ error: 'Checkout is not configured.', code: 'NOT_CONFIGURED' });
    return;
  }
  const founding = await getFoundingStatus();
  const price = founding.prices[body.plan];
  try {
    const session = await createCheckoutSession({
      productId,
      amountUsd: price,
      returnUrl: `${APP_URL}/welcome/${body.plan}`,
      metadata: { ...body.metadata, plan: body.plan, price: String(price), step: String(founding.step) },
    });
    res.json({ url: session.url, price, step: founding.step });
  } catch (err) {
    if (err instanceof DodoError) {
      res.status(err.status).json({ error: err.message, code: 'CHECKOUT_FAILED' });
      return;
    }
    throw err;
  }
}));

// ─── Invite links ─────────────────────────────────────────────────────────────

publicRouter.get('/invite/:code', perIp(15 * 60 * 1000, 30, 'Too many attempts. Please wait a few minutes.'), handler(async (req, res) => {
  const code = z.string().trim().min(4).max(80).parse(req.params.code);
  res.setHeader('Cache-Control', 'no-store');
  res.json(await lookupInvite(code));
}));

// ─── Testimonials: review links and the website wall ─────────────────────────

publicRouter.get('/review/:id', perIp(15 * 60 * 1000, 60, 'Too many attempts. Please wait a few minutes.'), handler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await lookupReviewRequest(String(req.params.id)));
}));

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

publicRouter.post('/review/:id', perIp(60 * 60 * 1000, 20, 'Too many submissions. Please try again later.'), optionalAuth, handler<AuthenticatedRequest>(async (req, res) => {
  const body = z.object({
    rating: z.number().int().min(1).max(5),
    text: z.string().trim().min(20, 'Please write at least a sentence or two.').max(1500, 'Please keep it under 1,500 characters.'),
    name: z.string().trim().min(2, 'Add your name.').max(80),
    role: optionalText(80),
    company: optionalText(80),
    linkedin: optionalText(200),
    photoData: z.string().max(MAX_PHOTO_CHARS).optional(),
    photoUrl: z.string().max(500).optional(),
    consent: z.literal(true, { errorMap: () => ({ message: 'Please confirm we can show your review.' }) }),
  }).parse(req.body);
  await submitReview(String(req.params.id), { ...body, uid: req.user?.uid, email: req.user?.email });
  res.json({ ok: true });
}));

publicRouter.get('/testimonials', handler(async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ testimonials: await listPublicTestimonials(APP_URL) });
}));

publicRouter.get('/testimonials/:id/photo', handler(async (req, res) => {
  const photo = await getTestimonialPhoto(String(req.params.id));
  if (!photo) {
    res.status(404).end();
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if ('redirect' in photo) {
    res.redirect(302, photo.redirect);
    return;
  }
  res.setHeader('Content-Type', photo.type);
  res.send(photo.data);
}));

// ─── Free preview audit ───────────────────────────────────────────────────────

const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CONCURRENT_PREVIEWS = 4;
const previewsInFlight = new Map<string, Promise<PreviewResult>>();

const emptyContext = { companyName: '', industry: '', businessType: '', targetAudience: '', valueProposition: '', keywords: [], competitors: [] };

async function runPreview(websiteUrl: string, domain: string): Promise<PreviewResult> {
  const { auditData, aeoInputs } = await runAudit({ auditId: `preview-${domain}-${Date.now()}`, websiteUrl, context: emptyContext, apiKey: '', preview: true });
  const bot = auditData.blueprintResult?.botAccess ?? {};
  const actions = auditData.playbook?.actions ?? [];
  const weaknesses = auditData.auditResults.weaknesses ?? [];
  return {
    domain,
    websiteUrl,
    score: auditData.auditResults.overallScore,
    grade: auditData.auditResults.letterGrade,
    platformScores: auditData.auditResults.platformScores,
    searchBotsBlocked: bot.citationBotsBlocked ?? [],
    llmsTxt: !!(bot.llmsTxtPresent ?? aeoInputs.hasLlmsTxt),
    sitemap: aeoInputs.sitemapLocation != null,
    issues: weaknesses.slice(0, 3),
    fixes: actions.slice(0, 3).map((a) => ({ title: a.title, priority: a.priority, timeToImplement: a.timeToImplement })),
    totalFixes: actions.length,
    totalIssues: weaknesses.length,
    checkedAt: new Date().toISOString(),
    cached: false,
  };
}

publicRouter.post('/preview', perIp(60 * 60 * 1000, 8, 'Too many previews from this connection. Please try again in an hour.'), handler(async (req, res) => {
  const body = z.object({
    websiteUrl: z.string().trim().min(3).max(500),
    email: z.string().trim().toLowerCase().email().max(200).optional(),
  }).parse(req.body);

  const websiteUrl = await assertPublicUrl(body.websiteUrl);
  const domain = extractDomain(websiteUrl);
  const cacheRef = adminDb.collection('previews').doc(domain);

  if (body.email) {
    // Lead capture only: no email is sent. Also lets the visitor find the preview again by email.
    await adminDb.collection('preview_leads').doc(`${domain}__${body.email}`).set({ email: body.email, domain, createdAt: new Date().toISOString() }, { merge: true });
  }

  const cached = await cacheRef.get();
  const data = cached.exists ? cached.data() as { result: PreviewResult; createdAt: string } : null;
  if (data && Date.now() - new Date(data.createdAt).getTime() < PREVIEW_TTL_MS) {
    res.json({ ...data.result, cached: true });
    return;
  }

  let job = previewsInFlight.get(domain);
  if (!job) {
    if (previewsInFlight.size >= MAX_CONCURRENT_PREVIEWS) {
      res.status(429).json({ error: 'Lots of previews are running right now. Please try again in a minute.', code: 'BUSY' });
      return;
    }
    job = runPreview(websiteUrl, domain).finally(() => previewsInFlight.delete(domain));
    previewsInFlight.set(domain, job);
  }
  const result = await job;
  await cacheRef.set({ result, createdAt: result.checkedAt });
  res.json(result);
}));
