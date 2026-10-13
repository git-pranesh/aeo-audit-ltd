/**
 * API Key Middleware
 *
 * Authenticates requests to /api/v1/* using Bearer token (cr_live_ key).
 * Checks quota. Increments usage after successful response.
 *
 * Usage in routes.ts:
 *   import { apiKeyAuth } from './api-key-middleware';
 *   app.use('/api/v1', apiKeyAuth);
 */

import type { Request, Response, NextFunction } from 'express';
import { validateApiKey, checkQuota, incrementUsage, API_PLAN_LIMITS } from './api-key-service';

export interface ApiKeyRequest extends Request {
  apiKey?: string;
  apiKeyPlan?: string;
  apiKeyUserId?: string;
}

export async function apiKeyAuth(
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Missing API key. Add Authorization: Bearer cr_live_xxxx header.',
      code: 'MISSING_API_KEY',
      docs: 'https://citationrocket.com/docs/api',
    });
    return;
  }

  const key = authHeader.replace('Bearer ', '').trim();

  // Validate key exists and is active
  const record = await validateApiKey(key);
  if (!record) {
    res.status(401).json({
      success: false,
      error: 'Invalid or inactive API key.',
      code: 'INVALID_API_KEY',
      docs: 'https://citationrocket.com/docs/api',
    });
    return;
  }

  // Check quota
  const quota = await checkQuota(key);
  if (!quota.allowed) {
    const limit = API_PLAN_LIMITS[record.plan] ?? 50;
    res.status(429).json({
      success: false,
      error: `Monthly limit reached. ${record.plan} plan: ${limit} calls/month.`,
      code: 'QUOTA_EXCEEDED',
      plan: record.plan,
      limit,
      remaining: 0,
      resetAt: record.resetAt,
      upgrade: 'https://citationrocket.com/pricing',
    });
    return;
  }

  // Attach to request for downstream use
  req.apiKey = key;
  req.apiKeyPlan = record.plan;
  req.apiKeyUserId = record.userId;

  // Add rate limit headers to response
  res.setHeader('X-RateLimit-Limit', quota.limit);
  res.setHeader('X-RateLimit-Remaining', quota.remaining - 1);
  res.setHeader('X-RateLimit-Plan', record.plan);

  // Increment usage after response is sent (non-blocking)
  res.on('finish', () => {
    if (res.statusCode < 500) {
      incrementUsage(key).catch(() => {});
    }
  });

  next();
}
