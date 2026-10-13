/**
 * Error Monitor Service
 *
 * Captures critical runtime errors, de-duplicates them,
 * and sends admin alert emails so bugs surface immediately
 * rather than silently corrupting data.
 */

import { emailService } from './email-service';

export type ErrorCategory =
  | 'citation'
  | 'subscription'
  | 'webhook'
  | 'auth'
  | 'scoring'
  | 'scheduler'
  | 'email'
  | 'general';

export interface MonitoredError {
  category: ErrorCategory;
  message: string;
  data?: Record<string, unknown>;
  userId?: string;
  auditId?: string;
  timestamp: string;
}

// Simple in-memory de-dupe: track fingerprints seen in the last hour
const recentFingerprints = new Map<string, number>();
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Firestore log stored in-memory (bounded to last 200 entries)
const errorLog: MonitoredError[] = [];
const MAX_LOG_SIZE = 200;

function fingerprint(category: ErrorCategory, message: string): string {
  // Normalise numeric tokens so "audit 123" and "audit 456" share a fingerprint
  return `${category}::${message.replace(/[0-9a-f-]{6,}/gi, '<id>')}`.toLowerCase();
}

function isDuplicate(fp: string): boolean {
  const seen = recentFingerprints.get(fp);
  if (!seen) return false;
  return Date.now() - seen < DEDUP_WINDOW_MS;
}

function recordFingerprint(fp: string): void {
  recentFingerprints.set(fp, Date.now());
  // Prune stale entries periodically
  if (recentFingerprints.size > 500) {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [key, ts] of Array.from(recentFingerprints)) {
      if (ts < cutoff) recentFingerprints.delete(key);
    }
  }
}

/**
 * Report a critical error. Adds it to the in-memory log and
 * optionally sends an admin alert email (de-duplicated per hour).
 */
export async function reportError(
  category: ErrorCategory,
  message: string,
  data?: Record<string, unknown>,
  options: { userId?: string; auditId?: string; sendAlert?: boolean } = {}
): Promise<void> {
  const { userId, auditId, sendAlert = true } = options;

  const entry: MonitoredError = {
    category,
    message,
    data,
    userId,
    auditId,
    timestamp: new Date().toISOString(),
  };

  // Append to in-memory log (bounded)
  errorLog.push(entry);
  if (errorLog.length > MAX_LOG_SIZE) errorLog.shift();

  console.error(`[ERROR-MONITOR][${category.toUpperCase()}] ${message}`, data || '');

  if (!sendAlert) return;

  const fp = fingerprint(category, message);
  if (isDuplicate(fp)) {
    console.log(`[ERROR-MONITOR] Suppressed duplicate alert for: ${fp}`);
    return;
  }
  recordFingerprint(fp);

  const adminEmail = process.env.ADMIN_ALERT_EMAIL;
  if (!adminEmail) {
    console.warn('[ERROR-MONITOR] ADMIN_ALERT_EMAIL not set — skipping admin alert email');
    return;
  }

  try {
    await emailService.sendAdminAlertEmail(adminEmail, {
      category,
      message,
      data,
      userId,
      auditId,
      timestamp: entry.timestamp,
    });
  } catch (emailErr: any) {
    // Never let the monitoring itself crash the caller
    console.error('[ERROR-MONITOR] Failed to send admin alert email:', emailErr.message);
  }
}

/**
 * Return the current error log (most recent first, up to `limit` items).
 */
export function getErrorLog(limit = 50): MonitoredError[] {
  return [...errorLog].reverse().slice(0, limit);
}

/**
 * Return a summary of error counts grouped by category.
 */
export function getErrorSummary(): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const entry of errorLog) {
    summary[entry.category] = (summary[entry.category] || 0) + 1;
  }
  return summary;
}

/**
 * Clear the in-memory log (used in tests / admin reset).
 */
export function clearErrorLog(): void {
  errorLog.length = 0;
  recentFingerprints.clear();
}
