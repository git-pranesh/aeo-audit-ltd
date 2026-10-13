/**
 * Burst limits per account. Hourly/daily fair-use and concurrency caps are
 * enforced in services/audit-store.ts against Firestore, so they survive restarts and
 * work across multiple Cloud Run instances; these in-memory limiters only stop
 * tight loops cheaply before any Firestore read happens.
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

interface UserKeyedRequest extends Request {
  user?: { uid?: string };
}

function userKey(req: UserKeyedRequest): string {
  return req.user?.uid || ipKeyGenerator(req.ip || '');
}

function perUser(windowMs: number, max: number, error: string) {
  return rateLimit({
    windowMs,
    max,
    message: { error },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userKey,
  });
}

/** Audit start requests (hourly/daily fair use is enforced durably in audit-store). */
export const auditStartLimiter = perUser(10 * 60 * 1000, 10, 'Too many audit requests. Please wait a few minutes.');

/** Context analysis (one cheap LLM call): 10 per hour. */
export const analyzeLimiter = perUser(60 * 60 * 1000, 10, 'Too many website analyses. Please try again shortly.');

/** Manual citation snapshot (6–8 web-search calls on the customer key). */
export const citationLimiter = perUser(60 * 60 * 1000, 5, 'Too many citation checks. Please try again shortly.');

/** License activation attempts — slows code guessing. */
export const licenseLimiter = perUser(15 * 60 * 1000, 10, 'Too many activation attempts. Please wait 15 minutes.');

/** Key save/validate. */
export const keyLimiter = perUser(15 * 60 * 1000, 10, 'Too many key updates. Please wait a few minutes.');

/** General API ceiling per account/IP. */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});
