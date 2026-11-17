/**
 * The entire admin surface: find a user, manage their license, see failures.
 * Admins are the verified emails listed in ADMIN_EMAILS.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, type AuthenticatedRequest } from '../security/auth';
import { handler } from './http';
import { adminAuth, adminDb } from '../firebase-admin';
import {
  generateCodes, hashCode, setLicenseStatus, setLicenseWhiteLabel, type License,
} from '../services/license-service';
import { deleteAccount } from '../services/user-service';
import {
  createInvite, getInviteLink, INVITE_CAP_DEFAULT_USD, INVITE_CAP_MAX_USD, listInvites, revokeInvite, setInviteCap,
} from '../services/invite-service';
import { isKeyManagementConfigured } from '../services/openrouter-keys';
import { createReviewRequest, deleteTestimonial, listAdminTestimonials, updateTestimonial } from '../services/testimonial-service';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const APP_URL = (process.env.APP_PUBLIC_URL || 'https://app.citationrocket.com').replace(/\/$/, '');

function publicLicense(id: string, l: License) {
  // Never send secrets to a browser, admin or not.
  const { codeHash: _hash, sponsoredKey: _key, inviteCode: _code, ...rest } = l;
  return { id, ...rest };
}

/** GET /api/admin/lookup?q=<email | uid | license code | order id> */
adminRouter.get('/lookup', handler(async (req, res) => {
  const q = z.string().trim().min(3).max(200).parse(req.query.q);
  const licensesCol = adminDb.collection('licenses');

  let uid: string | null = null;
  let email: string | null = null;
  if (q.includes('@')) {
    email = q.toLowerCase();
    try {
      uid = (await adminAuth.getUserByEmail(email)).uid;
    } catch {
      uid = null;
    }
  } else if (/^[A-Za-z0-9]{10,128}$/.test(q)) {
    const asUser = await adminDb.collection('users').doc(q).get();
    if (asUser.exists) uid = q;
  }

  const licenseDocs = new Map<string, License>();
  const add = (snap: FirebaseFirestore.QuerySnapshot | FirebaseFirestore.DocumentSnapshot) => {
    if ('docs' in snap) snap.docs.forEach((d) => licenseDocs.set(d.id, d.data() as License));
    else if (snap.exists) licenseDocs.set(snap.id, snap.data() as License);
  };
  // Independent lookups run in parallel (this page is used during support chats).
  const results = await Promise.all([
    licensesCol.doc(hashCode(q)).get(),
    licensesCol.doc(`order_${q.replace(/[^A-Za-z0-9_-]/g, '')}`).get(),
    ...(email ? [licensesCol.where('purchaserEmail', '==', email).limit(20).get()] : []),
    ...(uid ? [licensesCol.where('activatedBy', '==', uid).limit(20).get()] : []),
  ]);
  results.forEach(add);

  let user = null;
  if (uid) {
    const [snap, audits] = await Promise.all([
      adminDb.collection('users').doc(uid).get(),
      adminDb.collection('audits').where('userId', '==', uid).select('status').get(),
    ]);
    const d = snap.data() || {};
    user = {
      uid,
      email: d.email || email,
      createdAt: d.createdAt,
      entitlement: d.entitlement ?? null,
      hasKey: !!d.openRouterKey,
      savedAudits: audits.size,
      failedAudits: audits.docs.filter((a) => a.get('status') === 'failed').length,
    };
  }

  res.json({
    user,
    licenses: Array.from(licenseDocs.entries()).map(([id, l]) => publicLicense(id, l)),
  });
}));

adminRouter.post('/licenses/:id/status', handler(async (req, res) => {
  const { status } = z.object({ status: z.enum(['revoked', 'refunded', 'active']) }).parse(req.body);
  const updated = await setLicenseStatus(req.params.id, status);
  if (!updated) {
    res.status(404).json({ error: 'License not found.' });
    return;
  }
  res.json({ license: publicLicense(req.params.id, updated) });
}));

adminRouter.post('/licenses/:id/white-label', handler(async (req, res) => {
  const { whiteLabel } = z.object({ whiteLabel: z.boolean() }).parse(req.body);
  const updated = await setLicenseWhiteLabel(req.params.id, whiteLabel);
  if (!updated) {
    res.status(404).json({ error: 'License not found.' });
    return;
  }
  res.json({ license: publicLicense(req.params.id, updated) });
}));

/** Generate codes for a marketplace/partner or a manual replacement. Returned once, as CSV. */
adminRouter.post('/licenses/generate', handler(async (req, res) => {
  const body = z.object({
    count: z.number().int().min(1).max(1000),
    whiteLabel: z.boolean().default(false),
    channel: z.enum(['direct', 'marketplace', 'partner']).default('marketplace'),
    note: z.string().max(200).optional(),
  }).parse(req.body);
  const codes = await generateCodes(body.count, body);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="license-codes-${Date.now()}.csv"`);
  res.send(['code,product,white_label,channel', ...codes.map((c) => `${c},lifetime,${body.whiteLabel},${body.channel}`)].join('\n'));
}));

adminRouter.delete('/users/:uid', handler(async (req, res) => {
  await deleteAccount(req.params.uid);
  res.json({ ok: true });
}));

// ─── Invites: partner licence + capped OpenRouter key, as one link ───────────

adminRouter.get('/invites', handler(async (_req, res) => {
  res.json({ invites: await listInvites(), configured: isKeyManagementConfigured(), defaultCapUsd: INVITE_CAP_DEFAULT_USD, maxCapUsd: INVITE_CAP_MAX_USD });
}));

adminRouter.post('/invites', handler<AuthenticatedRequest>(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(1, 'Give the invite a name.').max(80),
    note: z.string().trim().max(200).optional(),
    capUsd: z.number().min(0).max(INVITE_CAP_MAX_USD).default(INVITE_CAP_DEFAULT_USD),
    whiteLabel: z.boolean().default(false),
  }).parse(req.body);
  const { id, link } = await createInvite({ ...body, createdBy: req.user!.email ?? req.user!.uid, appUrl: APP_URL });
  res.status(201).json({ id, link });
}));

/** The link again, while unused. */
adminRouter.get('/invites/:id/link', handler(async (req, res) => {
  res.json({ link: await getInviteLink(req.params.id, APP_URL) });
}));

adminRouter.post('/invites/:id/revoke', handler(async (req, res) => {
  res.json(await revokeInvite(req.params.id));
}));

adminRouter.post('/invites/:id/cap', handler(async (req, res) => {
  const { capUsd } = z.object({ capUsd: z.number().min(0).max(INVITE_CAP_MAX_USD) }).parse(req.body);
  res.json({ invite: await setInviteCap(req.params.id, capUsd) });
}));

// ─── Testimonials: review links, show/hide, pin ──────────────────────────────

adminRouter.get('/testimonials', handler(async (_req, res) => {
  res.json({ testimonials: await listAdminTestimonials(APP_URL) });
}));

adminRouter.post('/testimonials', handler<AuthenticatedRequest>(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(1, 'Give the person a name.').max(80),
    note: z.string().trim().max(200).optional().transform((v) => (v ? v : undefined)),
  }).parse(req.body);
  res.status(201).json(await createReviewRequest({ ...body, createdBy: req.user!.email ?? req.user!.uid, appUrl: APP_URL }));
}));

adminRouter.post('/testimonials/:id', handler(async (req, res) => {
  const patch = z.object({ shown: z.boolean().optional(), pinned: z.boolean().optional() }).parse(req.body);
  await updateTestimonial(req.params.id, patch);
  res.json({ ok: true });
}));

adminRouter.delete('/testimonials/:id', handler(async (req, res) => {
  await deleteTestimonial(req.params.id);
  res.json({ ok: true });
}));

/** Recent failures + basic counts. */
/**
 * GET /api/admin/people: every direct sale and every signup, newest first.
 * Sales are direct (Dodo) licences; a $0 sale is a 100% test code. Signups are user records.
 */
adminRouter.get('/people', handler(async (_req, res) => {
  const [lic, usr, aud] = await Promise.all([
    adminDb.collection('licenses').where('channel', '==', 'direct')
      .select('purchaserEmail', 'orderReference', 'whiteLabel', 'amountPaid', 'status', 'createdAt', 'activatedBy').get(),
    adminDb.collection('users').select('email', 'displayName', 'createdAt', 'entitlement', 'openRouterKey').limit(5000).get(),
    adminDb.collection('audits').select('userId').limit(20000).get(),
  ]);
  const auditsBy = new Map<string, number>();
  for (const d of aud.docs) { const u = d.get('userId'); if (u) auditsBy.set(u, (auditsBy.get(u) ?? 0) + 1); }
  const byNewest = (a: { createdAt?: string }, b: { createdAt?: string }) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  const sales = lic.docs.map((d) => {
    const x = d.data() as License;
    return {
      licenseId: d.id, email: x.purchaserEmail || '', orderReference: x.orderReference || '', agency: !!x.whiteLabel,
      amountPaid: x.amountPaid ?? null, status: x.status, createdAt: x.createdAt,
      claimed: !!x.activatedBy, audits: x.activatedBy ? auditsBy.get(x.activatedBy) ?? 0 : 0,
    };
  }).sort(byNewest);
  const signups = usr.docs.map((d) => {
    const x = d.data();
    return {
      uid: d.id, email: x.email || '', name: x.displayName || '', createdAt: x.createdAt || '',
      licence: x.entitlement ? (x.entitlement.whiteLabel ? 'agency' : 'lifetime') : null,
      hasKey: !!x.openRouterKey, audits: auditsBy.get(d.id) ?? 0,
    };
  }).sort(byNewest);
  const paid = sales.filter((s) => (s.amountPaid ?? 1) > 0 && s.status !== 'refunded' && s.status !== 'revoked');
  res.json({
    sales, signups,
    totals: { paidSales: paid.length, revenueCents: paid.reduce((n, s) => n + (s.amountPaid ?? 0), 0), signups: signups.length },
  });
}));

adminRouter.get('/status', handler(async (_req, res) => {
  const [failed, users, licenses, active] = await Promise.all([
    adminDb.collection('audits').where('status', '==', 'failed').limit(50)
      .select('domain', 'error', 'createdAt', 'userId').get(),
    adminDb.collection('users').count().get(),
    adminDb.collection('licenses').count().get(),
    adminDb.collection('licenses').where('status', '==', 'active').count().get(),
  ]);
  res.json({
    counts: {
      users: users.data().count,
      licenses: licenses.data().count,
      activeLicenses: active.data().count,
    },
    recentFailures: failed.docs
      .map((d) => ({ auditId: d.id, ...d.data() }))
      .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))),
    config: {
      encryption: !!process.env.KEY_ENCRYPTION_SECRET,
      webhookSecret: !!process.env.DODO_WEBHOOK_SECRET,
      lifetimeProduct: !!process.env.DODO_PRODUCT_LIFETIME,
      agencyProduct: !!process.env.DODO_PRODUCT_AGENCY,
      inviteKeys: isKeyManagementConfigured(),
      email: !!process.env.RESEND_API_KEY,
    },
  });
}));
