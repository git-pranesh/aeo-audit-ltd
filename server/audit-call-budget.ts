/**
 * Per-audit LLM call budget.
 *
 * A real audit makes well under 20 LLM calls end-to-end (company intel, topic
 * generation, content verification, citation snapshots). This is a hard safety
 * cap — independent of per-user/per-IP rate limiting at the route layer — so a
 * bug (retry loop, runaway batch, re-entrant call) can't turn one audit into an
 * unbounded number of paid LLM calls.
 *
 * In-memory only: budgets are per-process and reset on restart/redeploy. That's
 * fine for its purpose (bounding a single audit's blast radius, not long-term
 * accounting) and avoids adding a datastore dependency for a safety valve.
 */

const MAX_CALLS_PER_AUDIT = 20;
const ENTRY_TTL_MS = 30 * 60 * 1000; // 30 minutes — longer than any single audit should take

interface BudgetEntry {
  count: number;
  firstCallAt: number;
}

const budgets = new Map<string, BudgetEntry>();

function sweepStale(): void {
  const now = Date.now();
  budgets.forEach((entry, auditId) => {
    if (now - entry.firstCallAt > ENTRY_TTL_MS) {
      budgets.delete(auditId);
    }
  });
}

/**
 * Records one LLM call against `auditId`'s budget. Throws once the cap is
 * exceeded so the caller's normal error handling surfaces it (same as any
 * other LLM call failure) instead of silently continuing to spend.
 */
export function checkAuditCallBudget(auditId: string, maxCalls: number = MAX_CALLS_PER_AUDIT): void {
  if (budgets.size > 5000) sweepStale();

  const existing = budgets.get(auditId);
  if (!existing) {
    budgets.set(auditId, { count: 1, firstCallAt: Date.now() });
    return;
  }

  if (existing.count >= maxCalls) {
    throw new Error(
      `Audit ${auditId} exceeded its per-audit LLM call budget (${maxCalls} calls). ` +
      `This is a safety cap, not a normal audit limit — if a legitimate audit needs more calls, raise MAX_CALLS_PER_AUDIT.`
    );
  }

  existing.count += 1;
}
