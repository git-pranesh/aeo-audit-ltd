import { Router } from 'express';
import { z } from 'zod';
import type { MeResponse } from '@shared/api';
import { requireAuth, isAdminUser, type AuthenticatedRequest } from '../security/auth';
import { keyLimiter } from '../security/rate-limits';
import { handler } from './http';
import {
  deleteAccount, deleteOpenRouterKey, getOrCreateUserWithFlag, getUser, markRefundRequested, recordDownload, saveBranding,
  saveModelChoice, saveOpenRouterKey, setRefundResult,
} from '../services/user-service';
import { claimPurchasedLicense, getLicense, setLicenseStatus, unusedPurchasesFor } from '../services/license-service';
import { guaranteeStatus, type GuaranteeStatus } from '../../shared/guarantee';
import { createRefund, DodoError } from '../services/dodo';
import { invalidateFoundingCache } from '../services/founding';
import { cookieValue, requestAllowsTracking, requestUserData, sendMetaEvent, sha256 } from '../services/meta-capi';
import { cv, sendXrayEvent, xrayVisitorId } from '../services/xray';
import { XRAY_COOKIE } from '../../shared/meta';
import { inspectOpenRouterKey, MODEL_MAP } from '../services/openrouter';
import { estimateAuditCost, estimateSnapshotCost, getCatalog, resolveModel } from '../services/model-catalog';
import { limitsFor } from '../services/audit-store';

export const meRouter = Router();
meRouter.use(requireAuth);

export async function buildMe(req: AuthenticatedRequest): Promise<MeResponse> {
  const { uid, email, emailVerified } = req.user!;
  const { user: found, created } = await getOrCreateUserWithFlag(uid, email);
  let user = found;
  const metaRegistrationEventId = created ? `reg_${uid}` : undefined;
  if (metaRegistrationEventId && requestAllowsTracking(req)) {
    await sendMetaEvent({
      event_name: 'CompleteRegistration',
      event_id: metaRegistrationEventId,
      event_source_url: 'https://app.citationrocket.com/',
      action_source: 'website',
      user_data: { ...requestUserData(req), external_id: [sha256(uid)], ...(email ? { em: [sha256(email)] } : {}) },
    });
    await sendXrayEvent(cv.registrationComplete, {
      distinctId: uid,
      eventId: metaRegistrationEventId,
      visitorId: xrayVisitorId(cookieValue(req, XRAY_COOKIE)),
      url: 'https://app.citationrocket.com/',
      ...(email ? { identity: { email } } : {}),
    });
  }
  if (!user.entitlement) {
    // Direct purchases are claimed automatically by verified email.
    const claimed = await claimPurchasedLicense(uid, email, emailVerified);
    if (claimed) {
      user = { ...user, entitlement: claimed };
    }
  }
  const unusedPurchases = user.entitlement ? await unusedPurchasesFor(email, emailVerified) : [];
  let guarantee: GuaranteeStatus | null = null;
  if (user.entitlement) {
    const license = await getLicense(user.entitlement.licenseId);
    guarantee = guaranteeStatus({
      channel: user.entitlement.channel,
      purchasedAt: license?.createdAt ?? user.entitlement.activatedAt,
      usage: user.guarantee,
    });
  }
  return {
    guarantee,
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
    ...(metaRegistrationEventId ? { metaRegistrationEventId } : {}),
    ...(unusedPurchases.length ? { unusedPurchases } : {}),
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

// ─── Money-back guarantee ─────────────────────────────────────────────────────

/** PDF and CSV are generated in the browser; the client reports them before generating. The AEO Pack is counted server-side. */
meRouter.post('/download-event', handler<AuthenticatedRequest>(async (req, res) => {
  const { kind } = z.object({ kind: z.enum(['pdf', 'csv']) }).parse(req.body);
  await recordDownload(req.user!.uid, kind);
  res.json({ ok: true });
}));

const REASONS: Record<string, string> = {
  not_direct: 'The money-back guarantee applies to purchases made on citationrocket.com.',
  expired: 'The guarantee window has closed.',
  audits: 'The guarantee ended because the audit limit was reached.',
  downloads: 'The guarantee ended when a PDF, CSV or AEO Pack was downloaded.',
  refunded: 'A refund has already been requested for this licence.',
};

/** Self-serve refund while the guarantee holds: Dodo refund, licence refunded, access ends now. */
meRouter.post('/refund', handler<AuthenticatedRequest>(async (req, res) => {
  const uid = req.user!.uid;
  const user = await getUser(uid);
  if (!user?.entitlement) {
    res.status(404).json({ error: 'No licence on this account.', code: 'NO_LICENSE' });
    return;
  }
  const license = await getLicense(user.entitlement.licenseId);
  const status = guaranteeStatus({ channel: user.entitlement.channel, purchasedAt: license?.createdAt ?? user.entitlement.activatedAt, usage: user.guarantee });
  if (!status.eligible) {
    res.status(403).json({ error: REASONS[status.reason] ?? 'Not eligible.', code: 'NOT_ELIGIBLE' });
    return;
  }
  if (!license?.orderReference) {
    res.status(400).json({ error: 'This licence has no payment reference. Email support@citationrocket.com.', code: 'NO_PAYMENT' });
    return;
  }
  if (!(await markRefundRequested(uid))) {
    res.status(409).json({ error: REASONS.refunded, code: 'ALREADY_REQUESTED' });
    return;
  }
  try {
    const refund = await createRefund(license.orderReference, 'Self-serve money-back guarantee');
    await setLicenseStatus(user.entitlement.licenseId, 'refunded');
    await setRefundResult(uid, { refundId: refund.refundId });
    invalidateFoundingCache();
    console.log(`Refund ${refund.refundId} (${refund.status}) for ${license.orderReference} by ${uid}`);
    res.json({ ok: true, refundId: refund.refundId });
  } catch (err) {
    await setRefundResult(uid, null); // let them try again
    if (err instanceof DodoError) {
      res.status(err.status).json({ error: `${err.message} If this keeps happening, email support@citationrocket.com.`, code: 'REFUND_FAILED' });
      return;
    }
    throw err;
  }
}));

// ─── Account deletion ─────────────────────────────────────────────────────────

meRouter.delete('/', handler<AuthenticatedRequest>(async (req, res) => {
  await deleteAccount(req.user!.uid);
  res.json({ ok: true });
}));
