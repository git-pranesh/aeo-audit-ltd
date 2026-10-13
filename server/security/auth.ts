import type { Request, Response, NextFunction } from 'express';
import { adminAuth, adminDb } from '../firebase-admin';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    emailVerified: boolean;
  };
}

/** Comma-separated list in ADMIN_EMAILS. Admin rights are never stored client-writable. */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Verifies the Firebase ID token in the Authorization header. */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = { uid: decoded.uid, email: decoded.email, emailVerified: decoded.email_verified === true };
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

export function isAdminUser(user: AuthenticatedRequest['user']): boolean {
  const email = user?.email?.toLowerCase();
  return !!email && !!user?.emailVerified && adminEmails().includes(email);
}

/** requireAuth + admin allowlist (verified email only). */
export async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (!isAdminUser(req.user)) {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    next();
  });
}

/** Rejects requests from accounts without an active lifetime license. */
export async function requireLicense(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const snap = await adminDb.collection('users').doc(req.user!.uid).get();
  const entitlement = snap.exists ? snap.data()?.entitlement : null;
  if (!entitlement || entitlement.status !== 'active') {
    res.status(402).json({ error: 'Activate your lifetime license to run audits.', code: 'LICENSE_REQUIRED' });
    return;
  }
  next();
}
