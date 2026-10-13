# Citation Rocket — Lifetime Edition

An on-demand AI-search (AEO) audit generator sold as a lifetime deal.
**The customer brings one OpenRouter key, runs an audit when they want, downloads the report and files. Nothing runs in the background.**

The SaaS version is preserved at git tag `saas-baseline`.

## Product

| License | Includes |
|---|---|
| **Lifetime** | One account, BYOK (OpenRouter), manual audits, unlimited domains (fair use), PDF + CSV, AEO Pack, manual Citation Snapshot |
| **Lifetime Agency** | Everything above + custom branding on PDF exports (agency name, logo, accent colour, report title, footer/contact line) |

**Included:** choice of any OpenRouter model (free → premium), AI Readiness Score, platform scores (ChatGPT / Perplexity / Gemini / Claude), content + technical signals, AEO blueprint, industry benchmark, strengths/gaps, Fix-It Playbook, 20 topic ideas, optional comparison with up to 3 user-entered competitors, manual re-audit (shows change vs. previous audit of the same domain), manual Citation Snapshot (≤ 8 prompts, latest only), PDF, CSV, AEO Pack ZIP.

**Explicitly excluded:** scheduled monitoring, background re-audits, citation alerts, emails, teams/seats, client portals, public share links, public API, Chrome extension, custom domains, automatic website deployment, competitor auto-discovery, subscriptions, platform-funded AI, paid scraping, unlimited history, marketplace-specific feature variants.

### Fair use (enforced server-side)

| Limit | Value |
|---|---|
| Audits per hour / per 24 h | 3 / 10 |
| Concurrent audits per account | 2 |
| Pages read per audit | 10 (50 s budget) |
| Competitors per audit | 3 |
| Citation prompts per snapshot | 8 (one at a time) |
| Saved audits | latest 25 |

Defined in one place: `server/services/audit-store.ts` (`FAIR_USE`). Market it as "unlimited domains", not "unlimited automated audits".

## How an audit works

1. `POST /api/audits/analyze` — reads the homepage (direct fetch → Jina fallback), **1 LLM call** proposes business context.
2. Customer edits/confirms the context (and optionally adds ≤ 3 competitors).
3. `POST /api/audits` — synchronous, idempotent per request id:
   scrape ≤ 10 pages → deterministic signals, scores, blueprint, benchmark, findings, playbook → **1 LLM call** for topics (+ competitor comparison if competitors were given; strict JSON validation, max 1 retry).
4. Compact report saved; customer downloads PDF/CSV (generated in the browser) and the AEO Pack (generated from saved inputs — no re-scrape).
5. Optional: `POST /api/audits/:id/citation-snapshot` — ≤ 8 web-search prompts on the customer's key.

Every LLM call goes through `server/services/openrouter.ts` with the **customer's key only** — there is no platform key and no fallback.

### AI models (customer's choice)

Settings → AI models lists every OpenRouter text model (live prices, cached 1 h) with an estimated cost per audit / per citation check. Defaults: `deepseek/deepseek-v4-flash` for analysis (≈ $0.002/audit) and `perplexity/sonar` for the citation check (≈ $0.05/check). Any model works — free (`:free`, rate-limited by providers), budget or premium. The citation check needs live search: a Perplexity Sonar model or any model id with `:online`. **Scores never depend on the model** — they are deterministic; the model only drafts the business context and topic ideas.

### Accuracy rules

- Signals are counted, never inferred: JSON-LD types actually parsed on fetched pages, real outbound links, sitemap URLs matched by tight patterns (one category each). No floors, boosts or extrapolation.
- Error pages and bot walls (soft 404s, "Access denied", challenges) are discarded; duplicate pages are counted once; unreadable sites fail with a clear message before any AI call.
- robots.txt is parsed per RFC 9309; AI *search* crawlers (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, bingbot) are distinguished from *training* crawlers (GPTBot, ClaudeBot, Google-Extended, …). Blocked search crawlers become the #1 playbook action.
- Advice is filtered by industry (a restaurant is never told to write API docs) and targets come from the industry benchmark. Industry benchmark figures are reference targets, not a live dataset (stated in the report).
- The AEO Pack contains only facts found on the site (titles, descriptions, paragraphs, declared logo, linked social profiles, visible FAQs); everything else is a `[REPLACE: …]` placeholder.

## Architecture

```
Static SPA (Vite/React)  ──  Firebase Auth (sign-in only)
        │  Bearer ID token
Express API on Cloud Run (min instances = 0)
        │  firebase-admin
Firestore (users, licenses, audits) — rules deny all browser access
        │
Customer OpenRouter key · direct HTTP fetch + optional Jina Reader
```

```
server/
  index.ts                 app setup (helmet, body limits, routes, static)
  routes/                  me · licenses · audits · webhooks · admin
  services/
    audit-pipeline.ts      analyze + run audit
    audit-store.ts         persistence, idempotency, fair use, retention
    scraper.ts             ≤10 pages, direct → Jina, SSRF-safe
    topics.ts              single consolidated topics call
    citation-snapshot.ts   manual snapshot (≤8 prompts)
    openrouter.ts          the only LLM client (BYOK, fail closed)
    license-service.ts     one license system for every channel
    user-service.ts        encrypted key, branding, account deletion
    aeo-pack.ts            llms.txt, JSON-LD, robots patch (from real site facts)
  engine/                  deterministic scoring, signals, playbook, blueprint, benchmarks
  security/                auth · rate-limits · ssrf · encryption
client/src/pages/          home · dashboard · audit-detail · settings · admin · help
```

### Security model

- **Browser never touches Firestore.** `firestore.rules` denies everything; the API (firebase-admin) is the only writer. Customers cannot change licenses, entitlements, white-label, admin rights or limits.
- **License activation is server-side** (`POST /api/licenses/activate`): code is normalised + SHA-256 hashed, bound atomically in a transaction, never echoed back.
- **OpenRouter keys** are validated against OpenRouter, encrypted with AES-256-GCM (`KEY_ENCRYPTION_SECRET`, outside Firestore), stored as ciphertext + iv + tag + version, returned to the client only as "…last4", never logged. The server refuses to boot without the secret.
- **SSRF:** every outbound website request (pages, sitemaps, robots.txt, every redirect hop) goes through `safeGet()`, which blocks private/loopback/link-local/metadata addresses and re-checks DNS at connect time.
- **Admins** = verified emails in `ADMIN_EMAILS` (no client-settable `isAdmin` flag).
- Webhooks: Standard Webhooks signature verification; license id derives from the payment id so duplicates are no-ops.

## Selling licenses

| Channel | How |
|---|---|
| **Direct (Meta ads → your checkout)** | Dodo one-time products. Webhook `payment.succeeded` creates a license bound to the buyer's email; it **auto-activates when they sign in with that (verified) email**. `refund.succeeded` revokes it. No codes or emails to send. |
| **Marketplaces / partners** | Admin → *Generate license codes* → CSV (shown once; only hashes are stored). Upload the CSV to the marketplace. Buyers enter the code in Settings. |
| **Refund / replacement** | Admin → search email/code/order → *Mark refunded* / *Revoke*, then generate a new code if needed. |

Campaign pricing and coupons live in the checkout platform, not in the app.

## Setup

```bash
cp .env.example .env      # fill in KEY_ENCRYPTION_SECRET (openssl rand -base64 32) etc.
npm install
npm run dev               # http://localhost:5001
npm test                  # license, BYOK, fair use, refunds, webhook, SSRF, persistence
npm run check             # TypeScript
```

### Deploy (Cloud Run, scale to zero)

```bash
firebase deploy --only firestore:rules,firestore:indexes
gcloud run deploy citation-rocket --source . --region us-central1 \
  --min-instances 0 --max-instances 5 --timeout 300 --memory 512Mi \
  --set-env-vars NODE_ENV=production,ADMIN_EMAILS=you@domain.com,DODO_PRODUCT_LIFETIME=...,DODO_PRODUCT_AGENCY=... \
  --set-secrets KEY_ENCRYPTION_SECRET=key-encryption-secret:latest,DODO_WEBHOOK_SECRET=dodo-webhook-secret:latest
```

Give the Cloud Run service account *Cloud Datastore User* and *Firebase Authentication Admin*. Set the Dodo webhook URL to `https://<service>/api/webhooks/dodo` (events: `payment.succeeded`, `refund.succeeded`). Add your app domain to Firebase Auth → Authorized domains.

### Migrating existing SaaS users (same Firebase project)

```bash
npx tsx scripts/migrate-legacy.ts           # dry run
npx tsx scripts/migrate-legacy.ts --apply
```

Gives existing `lifetime` users an entitlement, encrypts any plaintext OpenRouter keys and deletes the plaintext, removes client-set `isAdmin` flags, and imports unredeemed codes from the legacy `appsumo` collection as hashed licenses. Idempotent.

## Launch checklist

- [x] No audit can use a platform OpenRouter key (none exists in code)
- [x] No LLM call bypasses `services/openrouter.ts` (direct OpenAI content-verification removed)
- [x] No Firecrawl / Puppeteer / paid scraping
- [x] No cron, scheduler or background job
- [x] Customer keys encrypted at rest
- [x] Customers cannot modify their own entitlement (rules deny all client access)
- [x] Duplicate payment webhooks cannot issue two licenses
- [x] Duplicate audit requests cannot run two audits (idempotency key)
- [x] Every outgoing website fetch passes SSRF validation
- [x] Per-account concurrency + hourly/daily limits
- [x] Partial scrape failures still produce a report
- [x] Account deletion deletes key + audits (and releases the license)
- [ ] Set production secrets, deploy rules, run the migration (if sharing the Firebase project)
- [ ] Make citationrocket.com and checkout pages describe exactly the feature set above
