import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../security/auth';
import { licenseLimiter } from '../security/rate-limits';
import { handler } from './http';
import { activateCode } from '../services/license-service';
import { getOrCreateUser } from '../services/user-service';
import { buildMe } from './me';

export const licensesRouter = Router();

/**
 * POST /api/licenses/activate { code }
 * Server-side only: hashes the code, checks it is available, binds it to the
 * caller atomically and sets the entitlement. The code is never echoed back.
 */
licensesRouter.post('/activate', requireAuth, licenseLimiter, handler<AuthenticatedRequest>(async (req, res) => {
  const { code } = z.object({ code: z.string().trim().min(4).max(80) }).parse(req.body);
  await getOrCreateUser(req.user!.uid, req.user!.email);
  await activateCode(req.user!.uid, code);
  res.json(await buildMe(req));
}));
