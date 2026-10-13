/**
 * The entire admin surface: find a user, manage their license, see failures.
 * Admins are the verified emails listed in ADMIN_EMAILS.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../security/auth';
import { handler } from './http';
import { adminAuth, adminDb } from '../firebase-admin';
import {
  generateCodes, hashCode, setLicenseStatus, setLicenseWhiteLabel, type License,
} from '../services/license-service';
import { deleteAccount } from '../services/user-service';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

function publicLicense(id: string, l: License) {
  const { codeHash: _hash, ...rest } = l;
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

/** Recent failures + basic counts. */
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
    },
  });
}));
