import { Request, Response, NextFunction } from 'express';
import { adminAuth, adminDb } from './firebase-admin';

// Hardcoded admin allowlist as defense-in-depth alongside the Firestore
// `isAdmin` flag — mirrors client/src/lib/admin-utils.ts's ADMIN_EMAILS.
const ADMIN_EMAILS = ['hello@pressense.co'];

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
  };
}

/**
 * Middleware to verify Firebase ID tokens
 * Extracts and validates the Bearer token from Authorization header
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Missing or invalid Authorization header' 
      });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];

    if (!idToken) {
      res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'No token provided' 
      });
      return;
    }

    // Verify the token with Firebase Admin
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    
    // Attach user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email
    };

    next();
  } catch (error) {
    console.error('❌ Auth verification failed:', error instanceof Error ? error.message : error);
    
    // Provide specific error messages for common cases
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        res.status(401).json({ 
          error: 'Unauthorized', 
          message: 'Token has expired. Please sign in again.' 
        });
        return;
      }
      if (error.message.includes('invalid')) {
        res.status(401).json({ 
          error: 'Unauthorized', 
          message: 'Invalid token' 
        });
        return;
      }
    }

    res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Authentication failed' 
    });
  }
}

/**
 * Middleware requiring the caller to be the admin account.
 * Must run after (or compose) requireAuth — expects req.user to be set.
 * Checks both the hardcoded email allowlist and the Firestore `isAdmin`
 * flag so either signal is sufficient (defense in depth, and tolerant of
 * the flag not yet being set on the admin's own user doc).
 */
export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  await requireAuth(req, res, async () => {
    try {
      const uid = req.user?.uid;
      const email = (req.user?.email || '').toLowerCase();

      if (email && ADMIN_EMAILS.includes(email)) {
        next();
        return;
      }

      if (uid) {
        const userSnap = await adminDb.collection('users').doc(uid).get();
        if (userSnap.exists && userSnap.data()?.isAdmin) {
          next();
          return;
        }
      }

      res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    } catch (error) {
      console.error('❌ Admin verification failed:', error instanceof Error ? error.message : error);
      res.status(500).json({ error: 'Failed to verify admin access' });
    }
  });
}

/**
 * Optional auth middleware - doesn't reject requests without auth
 * but attaches user info if token is present and valid
 */
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];
      
      if (idToken) {
        try {
          const decodedToken = await adminAuth.verifyIdToken(idToken);
          req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email
          };
        } catch {
          // Token invalid, but continue without auth
          console.warn('⚠️ Optional auth: token validation failed, continuing without auth');
        }
      }
    }

    next();
  } catch (error) {
    // Log but don't block request
    console.warn('⚠️ Optional auth error:', error);
    next();
  }
}
