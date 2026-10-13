# Technical Reference

The single, current technical document for Citation Rocket. This replaces all previous `TECHNICAL_DOCUMENTATION*.md` versions.

---

## Stack at a glance

- **Frontend:** React 18 + TypeScript, Vite, Shadcn/ui (light theme). State via TanStack Query, routing via Wouter, forms via React Hook Form + Zod. Auth via the Firebase client SDK.
- **Backend:** Express.js + TypeScript. Security via helmet, cors, express-rate-limit.
- **Data:**
  - **PostgreSQL (Neon) + Drizzle ORM** — sessions/relational data.
  - **Firebase Firestore** — user documents, audit payloads, citation history, score history.
- **Path aliases:** `@shared` and `@`.

---

## Core flow: the two-step audit pipeline

1. **Step 1 — `/api/audit/analyze`** — extracts company intelligence, suggests keywords and competitors.
2. **Step 2 — `/api/audit/batch`** — full audit: sitemap scraping, content-signal extraction, platform-specific scoring, topic generation, playbook creation, and a live citation snapshot via the Perplexity Sonar model (routed through OpenRouter).

---

## AI models actually used (important correction)

The older docs and README describe the AI as "GPT-4.1-nano." In the current code the real routing (`server/llm-router.ts`) is:

| Job | Model |
| :--- | :--- |
| Deep research | `perplexity/sonar-pro` |
| Company research | `perplexity/sonar` |
| Citation snapshot | `perplexity/sonar` |
| Fallback / orchestration | `openai/gpt-4o-mini` |
| Content verification | `gpt-4.1-nano` (`server/content-verification-service.ts`) |

So the **heavy lifting is the Perplexity Sonar model**, with OpenAI used for verification and as a fallback. All calls — platform and BYOK — are routed exclusively through OpenRouter (`OPENROUTER_API_KEY`, or a user's saved OpenRouter key); there is no direct Perplexity API integration. Usage/cost is tracked in the `perplexity_calls` collection (named for the model it tracks, not the provider).

---

## Scoring engine

- **Zero-based, earned-points model** across four categories: Content Depth, Structure & Technical, Research & Citations, Authority.
- Signals scored against benchmark values with penalty multipliers for low performance.
- Platform-specific weighting for ChatGPT / Perplexity / Gemini / Claude.
- **Scale-aware confidence floors** when detection fails on large sites; **±3 point tie-breaker jitter** across platforms.
- Content signals prioritize sitemap URLs → scraped HTML (DOM/schema) → scraped text (word frequency).

---

## Scraping (`server/scraper-v2.ts`)

- Order: Firecrawl → Jina Reader → basic fetch.
- Caps: **15 pages**, **45s total**, **8s/page**, sitemap read up to **5,000 URLs**.
- User-Agent: `CitationRocketBot/2.0`.
- **SSRF guard** (`server/url-guard.ts`, `assertPublicUrl`) blocks private/internal targets on scrape routes.

---

## Feature gating

- Central config: `shared/feature-flags.ts` (`getFeatureFlags(plan)`), plus audit/domain limits in `client/src/lib/firestore-utils.ts`.
- Plans: `free`, `starter`, `pro`, `enterprise`, `lifetime`. Unlimited values stored as `-1` or `Infinity`.
- Admin can override plan prices/limits live via a Firestore settings record (`system/planSettings`).

---

## Payments (Dodo)

- Subscriptions/checkout via `server/subscription-service.ts` + `server/dodo-service.ts`.
- Webhook: **`POST /api/webhooks/dodo`** (`server/routes.ts` ~line 3016), verified with **Svix** using `DODO_WEBHOOK_SECRET` (fail-closed in production).
- Upgrades apply immediately on `payment.succeeded` / `subscription.created`; downgrades are deferred (`pendingDowngrade`) to period end; cancellations honored to `periodEndDate`.
- Only percentage-based coupons sync to Dodo.

---

## Citation monitoring

- The Perplexity Sonar model (via OpenRouter) generates 5–8 prompts and detects company mentions → mention rate + cited competitors.
- Stored in a per-audit citation-history subcollection; score history similarly.
- `server/citation-scheduler.ts` (node-cron) refreshes on plan cadence (monthly/weekly/daily); mention-rate changes can trigger alert emails.

---

## Admin

- Gating: email allowlist (`client/src/lib/admin-utils.ts`) + `isAdmin` field.
- Dashboard at `/admin`: Users, Prompts, Home Page Content, Health, API Usage, Demo.
- Health endpoint: `GET /api/admin/system-health` (in-memory error log via `server/error-monitor.ts`).
- Privileged data ops use the Firebase Admin SDK (`server/firebase-admin.ts`), which **requires `FIREBASE_SERVICE_ACCOUNT`**.

---

## Email

- Transactional email via **Resend** (`server/email-service.ts`); lifecycle/drip via **Loops** (`server/loops-service.ts`).
- `MAILERSEND_*` secrets are referenced as an option but are not currently provided.

---

## Data model notes

- **Users:** `users/{uid}` in Firestore; login identity is a separate Firebase Auth account with the same uid.
- **Audits:** top-level `audits/{auditId}` collection, keyed by owner field `userId` (also stores `userEmail`). Subcollections: `scoreHistory`, `citationHistory`.

---

## Companion Chrome extension

- Located in `extension/`. Fetches must run in the background worker (content-script fetches hit page CORS). Captures AI-answer/citation data back into the platform.

---

## Key environment secrets

`OPENROUTER_API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `VITE_FIREBASE_*`, `DODO_PAYMENTS_API_KEY`, `DODO_WEBHOOK_SECRET`, `FIRECRAWL_API_KEY`, `RESEND_API_KEY`. (Never print their values.)
