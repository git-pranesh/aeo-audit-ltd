---
name: Loops lifecycle/drip email
description: How Loops.so is wired for drip/re-engagement email and why credentials differ from other email services.
---

# Loops lifecycle/drip email

Drip / lifecycle / re-engagement email is intentionally NOT built in-app. It lives in **Loops.so** (third-party), connected as a Replit `connector_catalog:loops-so` integration. The app only *pushes* behavioral signals; the timing, copy, filtering, and sending are owned by the user in the Loops dashboard.

**Why:** the (non-technical) owner wanted to plan/edit campaigns themselves with analytics, without a dev editing code for every copy/timing change. Transactional email (welcome, receipts, citation alerts) stays in-app via Resend; only lifecycle email moved out.

## Credential access — the non-obvious part
Loops credentials come from the **Replit connector proxy at runtime**, NOT from `process.env` like `RESEND_API_KEY` (other email keys in this repo are plain secrets — Loops is the exception). A `LOOPS_API_KEY` env var, if set, overrides the proxy.
**Why:** it was connected as a Replit integration, so the key lives in the connector system, not the secrets store.
**How to apply:** reuse `getLoopsApiKey()` in `server/loops-service.ts` rather than assuming a plain secret exists.

## Sync contract the Loops dashboard depends on
- Event **`first_audit_completed`** is the drip trigger (fired only on a user's first audit; first-audit detected via a persisted `firstAuditAt` marker on the user doc, set atomically on first completion — not a count query, which lags).
- Event `audit_completed` fires every audit.
- Contact props kept current for Loops-side filtering: `plan` (free/starter/etc), `checklistCompletedItems` (count), plus `companyName`, `auditScore`, `auditUrl`, `quickWin1..3` for use as email merge fields.
- All sync calls are fire-and-forget (never block the request; failures only warn-log).
**Why:** if these event names / prop names change in code, the user's configured Loop in the Loops dashboard silently stops matching — keep them in lockstep with whatever the Loop is built on.
