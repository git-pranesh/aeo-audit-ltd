import { Router } from 'express';
import { z } from 'zod';
import type { MeResponse } from '@shared/api';
import { requireAuth, isAdminUser, type AuthenticatedRequest } from '../security/auth';
import { keyLimiter } from '../security/rate-limits';
import { handler } from './http';
import {
  deleteAccount, deleteOpenRouterKey, getOrCreateUser, getUser, saveBranding, saveModelChoice, saveOpenRouterKey,
} from '../services/user-service';
import { claimPurchasedLicense } from '../services/license-service';
import { inspectOpenRouterKey, MODEL_MAP } from '../services/openrouter';
import { estimateAuditCost, estimateSnapshotCost, getCatalog, resolveModel } from '../services/model-catalog';
import { limitsFor } from '../services/audit-store';

export const meRouter = Router();
meRouter.use(requireAuth);

export async function buildMe(req: AuthenticatedRequest): Promise<MeResponse> {
  const { uid, email, emailVerified } = req.user!;
  let user = await getOrCreateUser(uid, email);
  if (!user.entitlement) {
    // Direct purchases are claimed automatically by verified email.
    const claimed = await claimPurchasedLicense(uid, email, emailVerified);
    if (claimed) user = { ...user, entitlement: claimed };
  }
  return {
    uid,
    email: email || user.email,
    emailVerified,
    entitlement: user.entitlement ?? null,
    openRouterKey: user.openRouterKey ? { last4: user.openRouterKey.last4, updatedAt: user.openRouterKey.updatedAt } : null,
    branding: user.entitlement?.whiteLabel ? user.branding ?? null : null,
    isAdmin: isAdminUser(req.user),
    limits: limitsFor(user.entitlement?.whiteLabel),
    aiModels: {
      structured: user.aiModels?.structured?.id ?? null,
      webSearch: user.aiModels?.webSearch?.id ?? null,
      defaults: { structured: MODEL_MAP.structured, webSearch: MODEL_MAP.webSearch },
    },
  };
}

meRouter.get('/', handler<AuthenticatedRequest>(async (req, res) => {
  res.json(await buildMe(req));
}));

// ─── OpenRouter key (BYOK) ────────────────────────────────────────────────────

meRouter.put('/openrouter-key', keyLimiter, handler<AuthenticatedRequest>(async (req, res) => {
  const { key } = z.object({
    key: z.string().trim().min(20, 'That does not look like an OpenRouter key.').max(200).regex(/^sk-or-/, 'OpenRouter keys start with "sk-or-".'),
  }).parse(req.body);

  const info = await inspectOpenRouterKey(key);
  if (!info.valid) {
    res.status(400).json({ error: 'OpenRouter rejected this key. Check it and try again.', code: 'KEY_INVALID' });
    return;
  }
  const stored = await saveOpenRouterKey(req.user!.uid, key);
  res.json({
    openRouterKey: { last4: stored.last4, updatedAt: stored.updatedAt },
    limit: info.limit ?? null,
    limitRemaining: info.limitRemaining ?? null,
    // Nudge customers toward a capped, dedicated key.
    warning: info.limit == null ? 'This key has no spending limit. We recommend a dedicated key with a low limit (e.g. $5).' : null,
  });
}));

meRouter.delete('/openrouter-key', handler<AuthenticatedRequest>(async (req, res) => {
  await deleteOpenRouterKey(req.user!.uid);
  res.json({ ok: true });
}));

// ─── AI model choice (any OpenRouter model, free to premium) ─────────────────

meRouter.get('/models/catalog', handler(async (_req, res) => {
  const catalog = await getCatalog();
  res.json({
    models: catalog.map((m) => ({ ...m, estAuditUsd: estimateAuditCost(m), estSnapshotUsd: estimateSnapshotCost(m) })),
  });
}));

meRouter.put('/models', handler<AuthenticatedRequest>(async (req, res) => {
  const body = z.object({
    structured: z.string().trim().max(120).nullable(),
    webSearch: z.string().trim().max(120).nullable(),
  }).parse(req.body);
  try {
    const structured = body.structured ? await resolveModel(body.structured, 'structured') : null;
    const webSearch = body.webSearch ? await resolveModel(body.webSearch, 'webSearch') : null;
    await saveModelChoice(req.user!.uid, {
      ...(structured ? { structured: { id: structured.id, supportsJson: structured.supportsJson } } : {}),
      ...(webSearch ? { webSearch: { id: webSearch.id } } : {}),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message, code: 'MODEL_INVALID' });
    return;
  }
  res.json(await buildMe(req));
}));

// ─── White-label branding (Agency license only) ───────────────────────────────

const brandingSchema = z.object({
  agencyName: z.string().trim().min(1).max(80),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Accent colour must be a hex value like #4F46E5.'),
  reportTitle: z.string().trim().max(80).default('AI Readiness Report'),
  footerText: z.string().trim().max(160).default(''),
  logoDataUrl: z.string()
    .max(300_000, 'Logo must be under 200 KB.')
    .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, 'Logo must be a PNG or JPEG.')
    .optional(),
});

meRouter.put('/branding', handler<AuthenticatedRequest>(async (req, res) => {
  const user = await getUser(req.user!.uid);
  if (!user?.entitlement?.whiteLabel) {
    res.status(403).json({ error: 'Custom branding is part of the Lifetime Agency license.', code: 'AGENCY_REQUIRED' });
    return;
  }
  const branding = brandingSchema.parse(req.body);
  await saveBranding(req.user!.uid, branding);
  res.json({ branding });
}));

meRouter.delete('/branding', handler<AuthenticatedRequest>(async (req, res) => {
  await saveBranding(req.user!.uid, null);
  res.json({ ok: true });
}));

// ─── Account deletion ─────────────────────────────────────────────────────────

meRouter.delete('/', handler<AuthenticatedRequest>(async (req, res) => {
  await deleteAccount(req.user!.uid);
  res.json({ ok: true });
}));
