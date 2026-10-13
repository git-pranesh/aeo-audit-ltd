/**
 * Per-user rate limiting for expensive, LLM-backed routes.
 *
 * These sit alongside (not instead of) the existing IP-based `auditLimiter` on
 * `/api/audit/*` in routes.ts and the monthly quota in api-key-middleware.ts.
 * The IP limiter stops anonymous abuse; this stops one authenticated user (or
 * one API key) from burning through calls in a tight loop, which the IP
 * limiter alone doesn't catch behind shared IPs/proxies.
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

// Requests carrying Firebase-authenticated identity (routes gated by requireAuth).
interface UserKeyedRequest extends Request {
  user?: { uid?: string };
}

// Requests carrying a validated Citation Rocket API key (routes gated by apiKeyAuth).
interface ApiKeyKeyedRequest extends Request {
  apiKeyUserId?: string;
}

// All these routes require auth/an API key, so the IP fallback should be rare
// (only hit if middleware ordering ever changes) — but use the IPv6-safe
// helper so it can never be used to bypass limits behind a shared IPv6 prefix.
function userKeyGenerator(req: UserKeyedRequest): string {
  return req.user?.uid || ipKeyGenerator(req.ip || '');
}

function apiKeyKeyGenerator(req: ApiKeyKeyedRequest): string {
  return req.apiKeyUserId || ipKeyGenerator(req.ip || '');
}

/** Full audits and batch audits: heaviest LLM cost per call. */
export const auditPerUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // 15 audit/batch starts per 15 min per user
  message: { error: 'Too many audit requests from this account. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKeyGenerator,
});

/** AEO file generation (llms.txt + schema markup). */
export const aeoGenerationPerUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many file-generation requests from this account. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKeyGenerator,
});

/** Manual citation refresh — real Perplexity Sonar web-search cost. */
export const citationRefreshPerUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many citation refresh requests from this account. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKeyGenerator,
});

/**
 * Public API v1 burst protection. api-key-middleware.ts already enforces a
 * monthly quota per plan; this only guards against short bursts (e.g. a
 * misbehaving script hammering the endpoint) within that quota.
 */
export const apiV1PerKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 requests/min per API key
  message: { success: false, error: 'Rate limit exceeded. Max 30 requests per minute.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: apiKeyKeyGenerator,
});
