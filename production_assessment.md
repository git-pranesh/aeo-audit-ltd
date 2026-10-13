# Production Assessment — AI Citation Rocket

## Executive conclusion

**Do not treat the current codebase as production-ready for public checkout or admin use.**

The application builds successfully and its existing unit tests pass, but there are **three confirmed authorization defects** that let an unauthenticated caller invoke admin, subscription, and API-key operations. These are code-level, reproducible findings—not guesses or style recommendations.

## What was actually verified

| Check | Result | Evidence |
| --- | --- | --- |
| Production client/server build | Pass | `npm run build` completed successfully |
| Existing automated test suite | Pass | `npm test`: **6 files, 88 tests passed** |
| Type-check command | Fail | `npx tsc --noEmit` reports existing errors in `server/test-all-fixes.ts` |
| Guest/public share page | Pass in development | A temporary shared audit loaded while signed out; after revocation its public API returned `404` |
| Share-page frame policy | Pass in development | `/share/:token` has `frame-ancestors *` and no `X-Frame-Options`; normal pages retain `X-Frame-Options: SAMEORIGIN` |
| Anonymous endpoint access | Confirmed unsafe where listed below | Direct HTTP calls received application responses rather than `401/403` |
| Fake-credit-card checkout | **Not run** | The Dodo client is explicitly configured with `environment: 'live_mode'`; submitting a card would target live billing rather than a safe sandbox |

### Important testing boundary

This is a **code-grounded production assessment plus safe runtime checks**, not a claim that every click on every authenticated screen was manually exercised. No additional test account, Dodo sandbox, or browser automation capable of completing Firebase login and external checkout was available. Every finding below is either:

1. directly visible in executed production code, or
2. reproduced through the local running application without using customer data.

## Confirmed production bugs

### CRITICAL — Any anonymous caller can invoke admin billing and plan-management operations

**Evidence**

`server/routes.ts` registers these administrative routes with no `requireAuth` or `requireAdmin` middleware:

- `POST /api/admin/coupons/create` — line 1185
- `POST /api/admin/sync-pricing` — line 1242
- `GET /api/admin/plans` — line 1304
- `POST /api/admin/plans` — line 1347
- `PATCH /api/admin/plans/:slug` — line 1506
- `DELETE /api/admin/plans/:slug` — line 1598

Direct runtime verification:

- An unauthenticated `GET /api/admin/plans` returned `200`.
- An unauthenticated `POST /api/admin/plans` created a `$1/month` plan and a Dodo product. The test plan was permanently removed and the test Dodo product was archived immediately after verification.

**User impact**

An attacker can read custom-plan configuration, create or alter products/plans, deactivate plans, invoke pricing synchronization, and attempt coupon creation without having an account or admin role. This can create billing abuse, unexpected pricing changes, and operational disruption.

**Required fix**

Put `requireAdmin` on every `/api/admin/*` route that changes or reveals administrative data. Do not rely on a hidden client-side admin screen: the server must enforce it.

---

### CRITICAL — Subscription and checkout endpoints trust a caller-supplied user ID and are unauthenticated

**Evidence**

The following routes have no `requireAuth` middleware:

- `POST /api/payment/create-link` — `server/routes.ts:2507`
- `POST /api/subscription/upgrade` — line 2888
- `POST /api/subscription/downgrade` — line 2921
- `POST /api/subscription/cancel-downgrade` — line 2951
- `POST /api/subscription/switch-billing` — line 2976

They read `userId`, `userEmail`, `userName`, plan, and subscription values from `req.body`. The client checkout implementation also sends those values with no Firebase authorization header (`client/src/pages/pricing.tsx`, around line 366).

The downgrade service writes `pendingDowngrade` to the Firestore user document identified by `data.userId` (`server/subscription-service.ts`). Therefore, a caller who knows or obtains another user’s UID can request a downgrade for that user without being authenticated as that user.

Runtime verification:

- Unauthenticated requests received application-level responses (not `401`/`403`).
- A blank request to the checkout endpoint reached Dodo session-creation code and returned a downstream `500`, proving the endpoint is not blocked at authentication.

**User impact**

An attacker can manipulate subscription workflows for other accounts, create checkout sessions attributed to arbitrary users, and produce billing/support inconsistencies. This is particularly serious because Dodo runs in live mode.

**Required fix**

Require Firebase authentication on all billing routes. Derive the UID and email only from `req.user` after token verification; ignore client-supplied identity fields. Fetch the current plan/subscription from the server-side user record before applying any plan change.

---

### HIGH — Any anonymous caller can read API-key status and attempt to overwrite another user’s OpenRouter key

**Evidence**

Neither route has authentication or an ownership check:

- `POST /api/user/openrouter-key` (renamed from `/api/user/perplexity-key`) — `server/routes.ts:3031`
- `GET /api/user/openrouter-key/:userId` (renamed from `/api/user/perplexity-key/:userId`) — line ~3116

The POST route validates an OpenRouter-format key and writes it to the `users/{userId}` document supplied in the request. The GET route reveals whether a user has a key, its source, and a masked prefix/suffix.

Direct runtime verification: an unauthenticated GET reached the user lookup and returned `404 User not found` for a fabricated UID rather than `401/403`.

**User impact**

An attacker with a valid OpenRouter key can overwrite a target user’s configured BYOK key if they know the target UID. They can also enumerate key-presence/status for known UIDs.

**Required fix**

Require authentication and always use `req.user.uid`. Never accept a `userId` in the body/path for a user-owned secret operation. Store user-supplied provider keys in a protected secret store or encrypt at rest; do not expose masked fragments through an open endpoint.

---

### MEDIUM — “Sanitized” public share response exposes the entire stored audit payload

**Evidence**

The public endpoint at `server/routes.ts:1805` responds with:

```ts
auditData: data.auditData
```

This is the complete saved audit payload, not an explicitly whitelisted public-report DTO. The schema includes citation prompt responses (`citationSnapshot.promptResults[].fullResponse`) and other analysis internals.

**User impact**

The feature intentionally makes reports public, but the code does not enforce a minimal public data contract. Any field added to `auditData` later becomes public automatically, and fields not needed by the public report may already be disclosed.

**Required fix**

Build a dedicated `PublicAuditReport` response with an explicit allowlist of score, topic, and citation-summary fields. Exclude internal processing data, raw model responses, all IDs, and any future user/business-private fields by default.

---

### MEDIUM — Shared reports are not fully read-only

**Evidence**

`client/src/pages/audit-share.tsx` passes `publicView` to the standard `AuditResults` component. In `client/src/components/audit-results.tsx`, `publicView` only hides the “AI-Ready Files” download card (line 624). It still renders:

- `FixItPlaybook` (line 595)
- `SchemaGenerator` (line 604)

The share requirement was a read-only report with no owner-only actions.

**User impact**

A public report can still present interactive tooling rather than a strict report-only surface. This is a product/specification mismatch and broadens the unauthenticated attack/UI surface.

**Required fix**

Create a dedicated read-only report component or ensure every interactive/action-capable child component is disabled/omitted when `publicView` is true.

---

### MEDIUM — The repository’s TypeScript quality gate fails even though the app build succeeds

**Evidence**

`npx tsc --noEmit` fails in `server/test-all-fixes.ts`:

- strict-mode function declarations inside blocks
- outdated `CitationHistoryEntry` fixtures missing required fields

`npm run build` succeeds because the bundler does not make this TypeScript check a release gate.

**User impact**

Broken static checks hide new type defects and make CI/release confidence lower. This is not a confirmed end-user outage, but it is a release-quality defect.

**Required fix**

Repair or exclude the obsolete script deliberately, then make `npm run check` mandatory in CI before publish.

## Verified strengths

- Core audit endpoints, audit checklist, re-audit, citation refresh, AEO file generation, and API-key issuance use `requireAuth`.
- The newly added admin-only audit-share enable/revoke endpoints use `requireAdmin`.
- Public sharing avoids opening Firestore client reads: it uses a server route and a token.
- Share-link revocation was exercised safely in development: the old URL/API response became `404`.
- Frame protection is scoped: the normal application remains same-origin framed, while only the share route is embeddable.
- The existing test suite covers scoring, content signals, edge cases, plan behavior, API endpoints, and webhook-signature tests.

## Product-screen and feature inventory

The client has 14 routed screens:

1. Home / audit entry
2. Dashboard
3. Pricing
4. Profile
5. Audit detail
6. Admin dashboard
7. Batch test
8. Payment success
9. Payment cancelled
10. Help
11. Coming soon
12. Extension authentication
13. Public audit share
14. Not found

The admin dashboard additionally contains user management, subscription management, coupon management, plan management, prompt management, email templates, settings, home content, analytics, API monitoring/usage, system health, and demo controls.

These screens were **inventoried from routes/components**. The production assessment does not claim a manual logged-in pass of every administrative control, external payment screen, Google/Firebase popup, or Chrome-extension install flow.

## Checkout assessment

The requested “fake credit card” test was intentionally not performed:

- `server/dodo-service.ts` instantiates Dodo with `environment: 'live_mode'`.
- The project has no separate Dodo sandbox configuration or documented test-product mapping.
- A card submission in this configuration could create a real customer/payment/subscription.

Before a real checkout E2E test, configure a separate Dodo test environment with non-production products, webhook secret, Firebase project/data, and test customer. Then validate payment success, cancellation, retries, webhook replay/idempotency, upgrade, downgrade, annual/monthly switch, invoice history, and entitlement reconciliation.

## Release recommendation

**Status: BLOCKED for public production use until the three authorization defects are fixed.**

Priority order:

1. Lock down `/api/admin/*` server routes with `requireAdmin`.
2. Lock down checkout/subscription routes; derive identity from auth only.
3. Lock down BYOK read/write routes and protect stored keys.
4. Replace public-share payload with a whitelisted public DTO and a truly read-only UI.
5. Fix the TypeScript check and add browser/E2E coverage using a Dodo test environment.

## Evidence trail

- Build: `npm run build` — passed
- Tests: `npm test` — 88/88 passed
- Type check: `npx tsc --noEmit` — failed in `server/test-all-fixes.ts`
- Safe HTTP checks: unauthenticated admin plan endpoints, checkout/subscription endpoint reachability, public-share retrieval/revocation, and frame-response headers
- Source locations: `server/routes.ts`, `server/subscription-service.ts`, `server/dodo-service.ts`, `client/src/pages/pricing.tsx`, `client/src/pages/audit-share.tsx`, and `client/src/components/audit-results.tsx`