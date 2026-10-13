import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { OpenRouterError } from '../services/openrouter';
import { LicenseError } from '../services/license-service';
import { FairUseError } from '../services/audit-store';
import { UnsafeUrlError } from '../security/ssrf';

/** Wraps an async handler and turns known errors into clean JSON responses. */
export function handler<R extends Request = Request>(fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req as R, res, next).catch((err) => sendError(res, err));
  };
}

export function sendError(res: Response, err: unknown): void {
  if (res.headersSent) return;
  if (err instanceof OpenRouterError || err instanceof LicenseError || err instanceof FairUseError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof UnsafeUrlError) {
    res.status(400).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.errors[0]?.message || 'Invalid request.', code: 'BAD_REQUEST' });
    return;
  }
  // Never echo internal errors (they can contain upstream response bodies).
  console.error('Unhandled API error:', err instanceof Error ? err.message : err);
  res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL' });
}
