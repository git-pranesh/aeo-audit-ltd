# AEO Audit / Citation Rocket

Citation Rocket is an AI-readiness and answer-engine-optimization (AEO) audit
application for businesses, agencies, and SaaS teams. A user submits a public
website, confirms the company context detected by the application, and receives
an audit covering content signals, technical structure, authority, platform
scores, industry benchmarks, AI-generated topic opportunities, a fix-it
playbook, quick wins, and an optional live citation snapshot.

The repository is named `aeo-audit`; the product and application copy in the
source code uses the name **Citation Rocket**.

This README describes the behavior that is implemented in this repository. It
does not describe planned features as if they were available.

## What the application does

The application analyzes a public website for signals that can help it appear
in AI-generated answers and recommendations. It is not a search-engine ranking
guarantee, and it does not control the answers returned by ChatGPT, Perplexity,
Gemini, Claude, or any other AI system.

Implemented product areas include:

- A two-step website audit flow.
- Company and business-context discovery before the full audit.
- An overall AI-readiness score from 0–100 with a letter grade.
- Separate platform-oriented scores for ChatGPT, Perplexity, Gemini, and Claude.
- Content, technical, research/citation, and authority signal analysis.
- Industry benchmark comparisons.
- AI-generated topic ideas in four categories.
- A deterministic fix-it playbook with prioritized actions, templates, and code
  snippets.
- A Quick Wins checklist with progress tracking.
- Re-audits and score history.
- Citation snapshots and scheduled citation monitoring.
- PDF and CSV exports.
- AEO file-package generation for eligible plans.
- Competitor tracking.
- Multiple-domain support according to plan.
- Dodo Payments subscription checkout and plan changes.
- Dodo webhook processing with signature verification and idempotency handling.
- Firebase email/password authentication.
- A REST API for developers and agencies.
- A Chrome extension for page-level AEO checks.
- An admin dashboard for users, plans, coupons, prompts, content, usage,
  emails, demos, and system health.

## User experience

### Public pages

The React application currently defines these client routes:

| Route | Purpose |
| --- | --- |
| `/` | Public home page and audit entry point |
| `/pricing` | Public pricing and plan comparison |
| `/help` | Help and support page |
| `/coming-soon` | Coming-soon page |
| `/payment-success` | Payment success destination |
| `/payment-cancelled` | Payment cancellation destination |
| `/extension-auth` | Chrome extension authentication handoff |

### Authenticated pages

| Route | Purpose |
| --- | --- |
| `/dashboard` | Saved audits, audit history, domain filtering, and re-audit access |
| `/audit/:auditId` | Full audit report |
| `/profile` | Profile, security, subscription, API configuration, billing, usage,
  and notification settings |

### Sharing

An administrator can create and revoke a public share link for an audit. Public
share access uses a tokenized route:

```text
/share/:token
```

The public share route is intentionally separate from the authenticated audit
route.

## Audit workflow

### Step 1: company analysis

The initial analysis endpoint receives a website URL and extracts company
intelligence. It can suggest:

- Industry.
- Business type.
- Target audience.
- Target keywords.
- Competitors.
- Company and value-proposition context.

The user sees the detected context in the business-context confirmation step
and can correct it before the full audit begins.

### Step 2: full audit

The full audit combines the following stages:

1. Validate and normalize the public website URL.
2. Block private and internal network targets with the SSRF guard.
3. Read the sitemap where available.
4. Scrape prioritized pages.
5. Extract content and technical signals.
6. Calculate the overall and platform-oriented scores.
7. Compare the result with industry benchmarks.
8. Generate topic opportunities.
9. Generate the fix-it playbook and Quick Wins.
10. Optionally run a live citation snapshot.
11. Save the audit and related history to Firestore.

The UI shows progress messages while the longer-running stages execute.

## Report sections

An audit report can contain:

- Overall score and letter grade.
- Individual platform scores.
- Score breakdown and signal explanations.
- Content signal counts.
- Industry benchmark comparisons.
- AI citation snapshot results.
- Prompt-by-prompt citation results.
- Mention rate.
- Competitors cited by the model.
- Topic ideas grouped as:
  - Authoritative.
  - Thought Leadership.
  - Competitive Advantage.
  - Emerging Opportunity.
- A prioritized Fix-It Playbook.
- Ready-to-use content templates and code snippets.
- Quick Wins checklist.
- Score history and trend information.
- Citation history and refresh information.
- PDF and CSV export actions.

## Scoring model

The scoring service uses a zero-based, earned-points approach. Signals earn
points; the website does not begin with a preloaded score.

The main scoring categories are:

1. **Content Depth**
2. **Structure & Technical**
3. **Research & Citations**
4. **Authority**

The scoring engine also includes:

- Industry-aware benchmark comparisons.
- Platform-specific weighting for ChatGPT, Perplexity, Gemini, and Claude.
- Penalty multipliers for low-performing signals.
- Pillar and category caps.
- Scale-aware confidence floors when scraping or detection is incomplete.
- A small platform tie-breaker jitter so platform scores are not always
  identical.

Scores are an analytical model, not an objective measurement of how an AI
system will answer every future query.

## Content signals

The content-signal pipeline looks for signals including:

- Tutorials.
- How-to guides.
- FAQs.
- Case studies.
- Blog posts.
- Documentation pages.
- Data points and statistics.
- Frameworks.
- External authority links.
- Structured data and schema types.
- Sitemap and page-count information.
- Content freshness and related page structure.

The implementation prioritizes:

1. Sitemap information.
2. Scraped HTML and DOM/schema structure.
3. Scraped text and word-frequency evidence.

## AI model routing

All application LLM traffic is routed through OpenRouter. The application does
not make a direct Perplexity API request.

The current routing in `server/llm-router.ts` is:

| Job | OpenRouter model |
| --- | --- |
| Company intelligence | `deepseek/deepseek-v4-flash` |
| Competitor analysis | `deepseek/deepseek-v4-flash` |
| Topic generation | `deepseek/deepseek-v4-flash` |
| Content verification | `deepseek/deepseek-v4-flash` through the central router |
| Playbook generation | `deepseek/deepseek-v4-flash` |
| Schema generation | `deepseek/deepseek-v4-flash` |
| Competitor discovery | `perplexity/sonar` |
| Citation snapshot | `perplexity/sonar` |
| Deep research | `perplexity/sonar-pro` |
| Fallback/orchestration | `openai/gpt-4o-mini` |

The provider returned by the router is `openrouter`. A user's optional
bring-your-own key is also an OpenRouter key.

### LLM safety controls

The server includes:

- A hard per-audit LLM call budget.
- Per-user rate limiting for audit-related routes.
- Per-API-key rate limiting for `/api/v1`.
- Separate existing monthly API-key quota enforcement.
- Abort timeouts for OpenRouter requests.
- Cost estimation and usage tracking for model calls.

## Website scraping

The scraper uses this fallback order:

1. Firecrawl.
2. Jina Reader.
3. Basic HTTP fetching.

The current safeguards and limits include:

- Up to 15 pages actively scraped per audit.
- An approximately 45-second total scraping budget.
- An approximately 8-second per-page budget.
- Sitemaps read up to 5,000 URLs for counting and prioritization.
- A `CitationRocketBot/2.0` user agent.
- SSRF protection for private and internal addresses.
- Secondary readers for sites that block the primary scraper.

Lifetime/AppSumo audits intentionally use the free scraping path and do not use
paid Firecrawl calls. This protects the economics of the lifetime plan but can
make JavaScript-heavy or highly protected sites less complete than they are on
paid plans.

If a site blocks automated access, the application can produce a partial or
estimated result. A non-zero score in that situation is not proof that every
page was read successfully.

## Citation snapshots and monitoring

The citation system:

- Generates a set of prompts based on the company, industry, keywords, and
  competitors.
- Queries the selected live-search model through OpenRouter.
- Detects whether the audited company is mentioned.
- Records the mention rate.
- Records prompt-level results.
- Records competitors cited in the responses.
- Stores citation history per audit.

The scheduler runs on an hourly cron tick and refreshes audits that are due
according to their plan:

| Plan | Monitoring cadence |
| --- | --- |
| Free | None |
| Starter | Monthly |
| Pro | Weekly |
| Enterprise | Daily |
| Lifetime | Weekly |

Citation alert emails are enabled for Pro, Enterprise, and Lifetime plans.

## Fix-It Playbook and topics

The playbook generator produces actions based on the detected signal gaps. The
result can include:

- Prioritized improvement tasks.
- Estimated impact.
- Difficulty and target platform information.
- Content templates.
- Code snippets.
- Quick Win extraction.
- Plan-dependent depth and prioritization.

Topic generation returns ideas in four categories:

- `authoritative`
- `thoughtLeadership`
- `competitiveAdvantage`
- `emergingOpportunity`

The number of topics per category depends on the plan. Topic suggestions are
deduplicated with keyword/word-overlap logic rather than embedding similarity.

## AEO file package

Eligible plans can generate an AEO download package. The package generator can
produce:

- `llms.txt`
- `llms-full.txt`
- `AGENTS.md`
- A `robots.txt` patch.
- Organization JSON-LD.
- FAQPage JSON-LD.
- HowTo JSON-LD.
- Article JSON-LD.
- BreadcrumbList JSON-LD.
- A Markdown twin of the homepage.
- `INSTRUCTIONS.md`.

The AEO ZIP is available to Pro, Enterprise, and Lifetime plans. Free and
Starter requests are blocked by the server.

The package can optionally send a Bing IndexNow ping. It does not automatically
deploy files to the audited customer's website.

## Exports

The application supports:

- PDF audit reports.
- Full audit CSV export on every plan, including Free.
- Score-trend CSV export for Pro, Enterprise, and Lifetime.
- Watermarked, clean, or unbranded PDF output depending on plan.

The app's unbranded/white-label mode removes Citation Rocket branding. It does
not automatically add the customer's own logo.

## Plans and pricing

The plan values below are the documented defaults/live values referenced by the
current product documentation. The administrator can override prices and
limits at runtime through the Firestore `system/planSettings` record, so that
record is the final source of truth for a deployed environment.

| Plan | Monthly | Annual | Plan notes |
| --- | ---: | ---: | --- |
| Free | `$0` | `$0` | Default for new accounts |
| Starter | `$49` | `$490/year` | Annual billing is discounted |
| Pro | `$149` | `$1,490/year` | Annual billing is discounted |
| Enterprise | `$299` | `$2,990/year` | Annual billing is discounted |
| Lifetime | One-time AppSumo offer | — | BYOK OpenRouter key; no monthly subscription |

### Plan feature comparison

| Feature | Free | Starter | Pro | Enterprise | Lifetime |
| --- | ---: | ---: | ---: | ---: | ---: |
| Audits/month | 1 | 15 | 30 | 50 | Unlimited, BYOK |
| Domains | 1 | 5 | Unlimited | Unlimited | Unlimited |
| Re-audit | No | Yes | Yes | Yes | Yes |
| Monthly re-audit | No | Yes | Yes | Yes | Yes |
| Topics/category | 3 | 12 | 25 | 100 | 25 |
| Competitors tracked | 0 | 3 | Unlimited | Unlimited | Unlimited |
| Quick Wins | 3 | Unlimited | Unlimited | Unlimited | Unlimited |
| Citation monitoring | None | Monthly | Weekly | Daily | Weekly |
| Citation alert emails | No | No | Yes | Yes | Yes |
| Citation refresh button | No | Yes | Yes | Yes | Yes |
| PDF export | Watermarked | Clean | White-label | White-label | White-label |
| Full audit CSV | Yes | Yes | Yes | Yes | Yes |
| Score trend CSV | No | No | Yes | Yes | Yes |
| AEO ZIP | No | No | Yes | Yes | Yes |

Unlimited values are represented in code as `Infinity` for feature flags or
`-1` for certain usage limits.

### Lifetime/AppSumo behavior

Lifetime users must supply their own OpenRouter API key in **Profile → API
Configuration**. The server intentionally fails closed for Lifetime users who
do not have a usable key, returning an `APPSUMO_KEY_REQUIRED` error for
key-dependent audit features.

The Lifetime plan does not silently fall back to the platform OpenRouter key.

### Billing behavior

Billing is implemented with Dodo Payments:

- Checkout sessions are created server-side.
- Payment success and subscription activation webhooks update the user plan.
- Upgrades take effect after successful payment confirmation.
- Downgrades are scheduled for the end of the current paid period.
- Dodo subscription cancellation webhooks preserve paid access through the
  relevant period end.
- Percentage-based coupons are supported; fixed-dollar coupon syncing is not.

The current Profile UI does **not** claim to perform a self-service Dodo
cancellation. Its cancellation action directs the user to support. Billing
history is not populated with fabricated invoices; until real invoice records
are available, the UI says **“Invoice history coming soon.”**

### Dodo webhook endpoint

```text
POST /api/webhooks/dodo
```

The handler:

- Receives the raw body before the global JSON parser.
- Verifies Dodo/Svix webhook signatures.
- Fails closed in production when `DODO_WEBHOOK_SECRET` is missing.
- Stores webhook delivery state in Firestore
  (`processed_webhooks/{webhook-id}`).
- Skips completed duplicates with HTTP 200.
- Skips an actively leased duplicate with HTTP 200.
- Uses a short processing lease so a crashed handler can be retried.
- Stores a 30-day expiration timestamp for processed webhook records.
- Processes successful payment/subscription events.
- Processes cancellation and expiration events.
- Downgrades a matched user to the Free plan for `payment.failed`,
  `dispute.opened`, and successful refund events.

Firestore TTL cleanup for the `expiresAt` field should be enabled in the
Firebase project if automatic deletion of old idempotency records is desired.

## Public API

The developer API is mounted under `/api/v1` and requires a bearer API key:

```http
Authorization: Bearer cr_live_xxxx
```

API keys are issued and managed from the authenticated application. The API
middleware validates the key, applies the plan's monthly quota, adds rate-limit
headers, and increments successful/non-5xx usage after the response.

### `POST /api/v1/score`

Quick scoring endpoint. It validates the URL, scrapes and scores the site, and
does not generate topics, a full playbook, or a citation snapshot.

Request:

```json
{
  "url": "https://example.com",
  "industry": "saas"
}
```

Returns an envelope containing:

- Overall score.
- Letter grade.
- Platform scores.
- Score breakdown.
- Extracted signal counts.
- Processing time metadata.

### `POST /api/v1/audit`

Full API audit endpoint. It can accept:

- `url`
- `industry`
- `businessType`
- `targetAudience`
- Up to 10 `keywords`
- Up to 10 `competitors`
- `topicsPerCategory`
- `includeCitationSnapshot`
- `openRouterApiKey`

The legacy `perplexityApiKey` request property is still accepted as a
compatibility alias by the parser, but new integrations should use
`openRouterApiKey`.

The response can include scores, signals, playbook actions, Quick Wins,
industry benchmarks, and an optional citation snapshot.

### `POST /api/v1/generate-files`

Generates the AEO file package as filename/content data. It accepts a URL and
optional company and business context, and can optionally request an IndexNow
ping.

### `GET /api/v1/benchmarks`

Returns benchmark data for an industry:

```text
GET /api/v1/benchmarks?industry=saas
```

The optional `useLiveData=true` query parameter asks the endpoint to use live
dataset statistics when enough data exists; otherwise the endpoint returns the
configured hardcoded benchmark set.

### API response shape

Successful responses use:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "processingTimeMs": 1234,
    "auditId": "api_..."
  }
}
```

Errors use:

```json
{
  "success": false,
  "error": "Description",
  "code": "ERROR_CODE"
}
```

Common API error codes include `MISSING_API_KEY`, `INVALID_API_KEY`,
`QUOTA_EXCEEDED`, `VALIDATION_ERROR`, and `SCRAPE_ERROR`.

## Chrome extension

The `extension/` directory contains a Manifest V3 extension named
**Citation Rocket — AEO Score**.

Implemented extension characteristics:

- Manifest version 3.
- Background service worker.
- Side panel UI.
- Content script running at document idle on HTTP/HTTPS pages.
- Active-tab, tab, storage, side-panel, and scripting permissions.
- All-URL host permission.
- Extension-to-website communication for the configured Citation Rocket
  domains.
- Page-level AEO checks for answer clarity, schema, freshness, and AI-crawler
  access.

The extension keeps cross-origin fetch work in the background worker rather
than making page-context requests that can be blocked by the page's CORS
policy.

## Admin console

The admin dashboard is available at `/admin` for authorized users. Admin
authorization is checked both client-side and server-side:

- A server-side email allowlist currently includes `hello@pressense.co`.
- A Firestore user document can have `isAdmin: true`.
- Protected server routes use Firebase ID-token verification and admin checks.

The admin area currently includes:

- Overview statistics.
- User search, filtering, plan changes, usage reset, and deletion.
- Subscription management.
- Coupon and AppSumo code management.
- Prompt management and version/restore controls.
- Runtime plan management.
- Home page content management.
- OpenRouter usage and cost monitoring.
- Email template management.
- Demo data tools.
- System health and error monitoring.
- View-As-Plan testing for Free, Starter, Pro, and Enterprise experiences.

Privileged Firestore and Firebase Auth operations use the Firebase Admin SDK.
The `FIREBASE_SERVICE_ACCOUNT` secret is required for those operations to have
full privileges.

## Authentication and security

Authentication uses Firebase Authentication. Protected application routes
expect a Firebase ID token:

```http
Authorization: Bearer <firebase-id-token>
```

Server-side protections include:

- Firebase ID-token verification.
- Admin authorization checks.
- Helmet.
- CORS configuration.
- Express rate limiting.
- Per-user audit rate limits.
- Per-API-key API rate limits.
- Monthly API key quotas.
- URL validation.
- SSRF protection for scraping routes.
- Dodo/Svix webhook signature verification.
- Raw-body webhook parsing before the JSON parser.
- Per-audit LLM call budgets.
- Production fail-closed behavior for missing Dodo webhook configuration.

This repository must not contain service-account JSON files, API keys, exported
user CSVs, or `.env` files. The `.gitignore` excludes common credential and PII
export patterns.

## Data storage

The application uses two data systems:

### Firebase / Firestore

Firestore stores:

- `users/{uid}` account and subscription documents.
- Top-level `audits/{auditId}` documents.
- Score history.
- Citation history.
- Plan settings.
- Coupons and AppSumo redemption data.
- OpenRouter usage data.
- Processed Dodo webhook IDs and processing leases.

Audit ownership is stored on each audit document using `userId`.

### PostgreSQL / Drizzle

PostgreSQL is configured through Drizzle ORM for relational/session-oriented
data. The project includes `drizzle.config.ts` and the `db:push` script for
schema operations where the configured database is used.

## Email

The application has two email-related paths:

- Resend is used for transactional email delivery in
  `server/email-service.ts`.
- Loops is used for lifecycle/drip email behavior in
  `server/loops-service.ts`.

Depending on the event, the application can send welcome, subscription,
downgrade, cancellation, citation alert, and other configured notification
messages. Actual delivery depends on the configured provider credentials and
templates.

## Repository layout

```text
.
├── client/                    React/Vite frontend
│   └── src/
│       ├── components/        Feature and UI components
│       ├── contexts/          Auth and view-as-plan contexts
│       ├── lib/               Firebase, API, plan, and utility code
│       ├── pages/             Public, profile, audit, and admin pages
│       └── App.tsx            Wouter route table
├── server/                    Express backend and domain services
│   ├── routes.ts              Main authenticated/public route registration
│   ├── api-router.ts          Public `/api/v1` handlers
│   ├── llm-router.ts          Central OpenRouter LLM entry point
│   ├── scraper-v2.ts          Website scraping pipeline
│   ├── scoring-service.ts     Score calculation
│   ├── content-signal-service.ts
│   ├── citation-*.ts          Citation snapshots, history, and scheduling
│   ├── dodo-*.ts              Dodo payments and pricing integration
│   ├── openrouter-*.ts        BYOK resolution and usage tracking
│   ├── firebase-admin.ts      Privileged Firebase Admin initialization
│   └── replit_integrations/   Replit-provided AI integration routes
├── shared/                    Shared TypeScript types and feature flags
├── extension/                 Manifest V3 Chrome extension
├── docs/                      Fact-checked product and technical docs
├── tests/                     Vitest tests
├── scripts/                   Operational scripts
├── public/                    Static public assets
├── package.json               Scripts and dependencies
├── vite.config.ts             Frontend build and aliases
├── tsconfig.json              TypeScript configuration
└── .replit                    Replit workflows and deployment settings
```

## Local development

### Prerequisites

- Node.js 20.
- npm.
- A Firebase project with Authentication and Firestore configured.
- The required external service credentials for the features you want to run.
- PostgreSQL only if using the configured Drizzle/relational paths.

### Install

```bash
npm install
```

### Start development

```bash
PORT=5000 npm run dev
```

The development server serves the API and Vite client on port `5000` in the
repository's configured Replit workflow.

### Type-check

```bash
npm run check
```

### Run tests

```bash
npm test
```

### Build production assets

```bash
npm run build
```

### Start the production build

```bash
npm run start
```

The production deployment is configured as an autoscale deployment using
`npm run build` followed by `npm run start`.

## Environment configuration

Do not commit values for any of these variables. Configure them through the
deployment or secrets manager.

### Firebase

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
FIREBASE_SERVICE_ACCOUNT
```

The `VITE_FIREBASE_*` variables are client configuration values. The Firebase
service-account value is privileged server configuration and must remain
secret.

### AI, scraping, and research

```text
OPENROUTER_API_KEY
FIRECRAWL_API_KEY
GOOGLE_KG_API_KEY
JINA_API_KEY
AI_INTEGRATIONS_OPENAI_API_KEY
AI_INTEGRATIONS_OPENAI_BASE_URL
```

`OPENROUTER_API_KEY` is the platform LLM key. User BYOK keys are stored and
resolved separately from the user's authenticated Firestore profile.

### Payments

```text
DODO_PAYMENTS_API_KEY
DODO_WEBHOOK_SECRET
DODO_PRODUCT_STARTER
DODO_PRODUCT_PRO
DODO_PRODUCT_ENTERPRISE
DODO_PRODUCT_STARTER_ANNUAL
DODO_PRODUCT_PRO_ANNUAL
DODO_PRODUCT_ENTERPRISE_ANNUAL
```

The Dodo product IDs map the monthly and annual paid plans to Dodo products.
They are configuration values, not substitutes for the Dodo API credentials.

### Email and operations

```text
RESEND_API_KEY
RESEND_FROM_EMAIL
LOOPS_API_KEY
ADMIN_ALERT_EMAIL
PRODUCTION_URL
VITE_APP_URL
ENABLE_CITATION_SCHEDULER
PORT
NODE_ENV
```

The citation scheduler runs automatically in production. In development it is
disabled unless `ENABLE_CITATION_SCHEDULER=true`.

## Deployment notes

The server listens on `0.0.0.0` and the configured `PORT`. The Replit
configuration uses:

- Build command: `npm run build`
- Run command: `npm run start`
- Autoscale deployment target

For Dodo billing, configure the webhook URL to point to the deployed
application:

```text
https://<your-production-domain>/api/webhooks/dodo
```

The deployed URL is environment-specific and should not be hard-coded from
this README.

## Known limitations

These are current limitations, not hidden assumptions:

- Scraping is capped and large sites are sampled.
- Cloudflare and other bot protection can reduce the amount of readable
  content.
- JavaScript-heavy sites can be incomplete when Firecrawl or fallbacks cannot
  render enough content.
- Lifetime/AppSumo uses the free scraping path and can therefore read less than
  paid plans on difficult sites.
- Private and internal URLs are intentionally rejected.
- Scores can be estimated when content detection is incomplete.
- Live citation results are point-in-time observations and can change.
- AI-generated company context and topic ideas can be wrong or generic; users
  can correct context before the full audit.
- Billing updates depend on correctly configured Dodo webhooks and metadata.
- Only percentage-based coupon syncing is supported.
- Fixed-dollar coupon syncing is not supported.
- Real invoice history is not populated yet; the UI displays
  “Invoice history coming soon” until invoice records are implemented.
- The current subscription cancellation UI directs users to support rather
  than pretending that a cancellation API call succeeded.
- The application does not deploy generated AEO files to a customer's website.
- Firestore TTL cleanup for processed webhook records requires the TTL policy
  to be enabled in the Firebase project.

## Testing and verification

The repository includes Vitest configuration and tests under `tests/`. The
standard local checks are:

```bash
npm run check
npm test
npm run build
```

Some historical test/support files may contain type assumptions that are not
part of the production runtime. Always review the exact command output when
validating a checkout.

## Documentation

The `docs/` directory contains deeper, code-checked documentation:

- `docs/01-features.md` — feature overview.
- `docs/02-user-guide.md` — subscriber workflow.
- `docs/03-admin-guide.md` — admin operation guide.
- `docs/04-plans-and-billing.md` — plan limits and payment behavior.
- `docs/05-limitations.md` — known limitations.
- `docs/06-technical-reference.md` — architecture and implementation notes.
- `docs/07-verified-facts-protocol.md` — verification conventions.
- `docs/verification-index.md` and `docs/proofs/` — verification artifacts.

## Project status

This is a working application with active external-service dependencies. It is
not a self-contained offline demo: authentication, Firestore data, LLM
requests, website scraping, Dodo payments, and email delivery all depend on
their corresponding configuration and provider availability.

There is no license file in this repository. Add a license before distributing
the code under an open-source license.