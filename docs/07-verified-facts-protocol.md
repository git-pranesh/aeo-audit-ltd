# Verified Product Facts — Zero-Hallucination Protocol Output

**Verified: July 8, 2026.** Every claim below was confirmed by running commands against the actual codebase, the live database (`system/planSettings`), the live pricing page at app.citationrocket.com/pricing (screenshot taken), the TypeScript compiler, and the test suite. Claims that could not be confirmed are marked **NOT VERIFIED IN CODE**. No marketing language. No inferred values.

---


## 1. Core Mechanics

### What the audit measures
The scoring engine scores four categories with these exact maximum points (verified in `server/scoring-service.ts` lines 25–28):

| Category | Max points |
|---|---|
| Content Depth | 35 |
| Structure & Technical | 25 |
| Research & Citations | 25 |
| Authority | 15 |
| **Total base** | **100** |

### Platform weights (verified: `PLATFORM_WEIGHTS` in scoring-service.ts)
Each platform score re-weights the four categories. Weights sum to 1.0:

| Platform | Content Depth | Structure/Technical | Research/Citations | Authority |
|---|---|---|---|---|
| ChatGPT | 0.45 | 0.25 | 0.15 | 0.15 |
| Perplexity | 0.15 | 0.20 | 0.45 | 0.20 |
| Gemini | 0.25 | 0.40 | 0.20 | 0.15 |
| Claude | 0.20 | 0.15 | 0.25 | 0.40 |

### The 8 blueprint modules (verified: header comment + interfaces in `server/blueprint-signals.ts`)
150 raw points, normalized to 0–100 (`rawScore / 150 × 100`):

| Module | Points |
|---|---|
| 1. Answer Capsule Quality | 0–25 |
| 2. E-E-A-T Index | 0–35 |
| 3. AI Bot Access | 0–10 |
| 4. Off-Site Authority | 0–30 |
| 5. Content Freshness | 0–15 |
| 6. Schema Completeness | 0–20 |
| 7. Fan-Out Coverage | 0–10 |
| 8. Entity Consistency | 0–5 |
| **Total raw** | **150** |

### Scraper page limit (verified: `server/scraper-v2.ts` line 42)
`const MAX_PAGES = 15;` — the scraper fetches at most **15 pages per audit**. Strategy order (verified lines 135–158): for JS-rendered sites, paid plans try **Firecrawl first, then Jina** as fallback, while **Lifetime goes straight to Jina** (skipping paid Firecrawl); non-JS sites are fetched **directly**; the last resort is a Jina fetch of the homepage.

### Citation snapshot (verified: `server/llm-router.ts` line 47, `server/citation-snapshot-service.ts`)
- Model: **`perplexity/sonar`** (routed through OpenRouter).
- Generates **up to 12 prompts** per snapshot (`prompts.slice(0, 12)`): company-name prompts only when a real company name is known, plus prompts from up to 4 keywords, industry prompts, and fan-out prompts.
- Mention rate = mentioned prompts ÷ total prompts × 100.
- BYOK (Lifetime): key must start with **`sk-or-`** (OpenRouter format, verified at `server/routes.ts` line 2901).

---

## 2. Plan Comparison Table

### Feature flags — complete dump of `shared/feature-flags.ts` (every property, every plan)

| Property | free | starter | pro | enterprise | lifetime |
|---|---|---|---|---|---|
| quickWinsChecklist | basic | full | full | full | full |
| quickWinsLimit | 3 | Infinity | Infinity | Infinity | Infinity |
| monthlyReaudit | false | true | true | true | true |
| citationAlerts | false | false | true | true | true |
| citationRefreshButton | false | true | true | true | true |
| citationMonitoringFrequency | none | monthly | weekly | daily | weekly |
| multiDomainLimit | 1 | 5 | Infinity | Infinity | Infinity |
| reauditButton | false | true | true | true | true |
| topicsPerCategory | 3 | 12 | 25 | 100 | **25** |
| playbooks | basic | full | full_priority | full_whitelabel | full_priority |
| schemaGeneratorLimit | 1 | 999 | 999 | 999 | 999 |
| competitorWatchlistLimit | 0 | 3 | 999 | 999 | 999 |
| pdfExport | watermarked | clean | whitelabel | whitelabel | whitelabel |
| scoreTrendExport | false | false | true | true | true |

Notes:
- **Audit counts and prices are NOT in feature-flags.ts.** They live in the database record `system/planSettings` (admin-editable). Live values read directly from the database on July 8, 2026: free = 1 audit/mo, starter = 15, pro = 30, enterprise = 50, lifetime = -1 (unlimited).
- Unknown plan names fall back to `free` flags (`getFeatureFlags` line 103).

### Cross-check with the live pricing page (screenshot taken July 8, 2026)
The live page at app.citationrocket.com/pricing shows: Free $0 (1 audit/mo, 3 topics, 1 domain), Starter $49 (15 audits/mo, 12 topics, 5 domains), Pro $149 (30 audits/mo, 25 topics, unlimited domains), Enterprise $299 (50 audits/mo, 100 topics, unlimited domains). **These match the live database values exactly.** Annual toggle exists; coupon-code field exists.

**Mismatches found (flagged at verification time — both since fixed):**
1. `server/subscription-service.ts` `getPlanPrices()` used Enterprise **$399** while the live page/database say **$299**. ✅ **Fixed July 8, 2026:** all 14 files containing $399/$3,990 were changed to $299/$2,990; a grep for "399" now returns zero pricing references. Tests re-run: 88/88 pass.
2. The AppSumo modal (`appsumo-key-required-modal.tsx`) told Lifetime users "**100 topics per category**" but the server enforces **25** for lifetime. ✅ **Fixed July 8, 2026:** modal now says "25 topics per category".
3. `server/dodo-service.ts` and `server/payment-link-service.ts` contain **different hardcoded fallback Dodo product IDs** for the same plans. In practice the `DODO_PRODUCT_*` environment variables are set (6 present), so the fallbacks are unused — but the inconsistency exists in code.

### Dodo product mapping
- **App subscription plans:** product IDs come from environment variables `DODO_PRODUCT_STARTER` / `DODO_PRODUCT_PRO` / `DODO_PRODUCT_ENTERPRISE` (values are secrets, not printed here; 6 such variables are configured).
- **Developer API tiers** (`server/dodo-api-billing.ts` lines 26–32): `pdt_0NgbqsqV2s2ppCUdKJOLu` = API Starter $29/mo, `pdt_0NgbqyuHoAves0cTkSEf2` = API Professional $99/mo, `pdt_0Ngbr5wqnDLITjR5NgnOR` = API Enterprise $299/mo, plus annual variants at 10× monthly. **These are for the unreleased Developer API, not app plans, and cannot currently be purchased** (checkout endpoint returns 503).

---

## 3. Lifetime / AppSumo Details

- **How a user gets it (verified: `client/src/lib/coupon-service.ts` lines 116–190 + pricing page):** self-serve redemption. The pricing page has an AppSumo code field. The **validation step** (`validateAppSumoCode()`) rejects codes already marked redeemed; the **redemption step** (`redeemAppSumoCode()`) runs an **atomic Firestore transaction** (✅ hardened July 8, 2026): it re-reads the code inside the transaction, throws "This code has already been redeemed" if `isRedeemed` is true, and otherwise marks the code redeemed (redeemer email + timestamp) **and** sets the user to `subscriptionPlan: 'lifetime'`, `subscriptionStatus: 'active'` in the same all-or-nothing write. Two people racing the same code: exactly one wins; the loser is never upgraded. No manual admin step required.
- **Mandatory for Lifetime only (verified: `APPSUMO_KEY_REQUIRED` checks in `server/routes.ts` at 4 call sites):** the user must add their **own OpenRouter API key** before any audit runs. The server blocks audits without it (fail-closed). Error message shown: "AppSumo lifetime users must add their own Perplexity API key in Profile → API Configuration before running audits." (Note: the message says "Perplexity" but the key validated is an **OpenRouter** key.)
- **Key format check (verbatim, routes.ts line 2901):** `if (!apiKey.startsWith('sk-or-'))` — rejected if it doesn't start with `sk-or-`.
- **What the modal tells users (verified by reading the component):** title "OpenRouter API Key Required"; states typical audit costs **$0.30–0.50** in API usage; setup path: Profile → "API Key" tab → get free OpenRouter key → paste and save. It also says "Unlimited audits, 25 topics per category - Forever!" — both figures match live settings and server enforcement. (Before July 8, 2026 it incorrectly claimed 100 topics; fixed.)
- **Cost safety:** Lifetime audits run on the user's key, and the scraper skips the paid Firecrawl path for lifetime (`scrapeWebsiteContent(..., serverPlan === 'lifetime')`).

---

## 4. Known Limitations & Bugs

- **TypeScript errors: 9 total, all in one file** (`server/test-all-fixes.ts`, an internal test script — not part of the running product): 3× TS1252 (function declarations in blocks) and 6× TS2345 (a test object missing fields of `CitationHistoryEntry`). No errors in product code.
- **Test suite: all passing.** `npx vitest run` on July 8, 2026: **6 files, 88 tests, 88 passed, 0 failed** (4.6s).
- **E-E-A-T author detection is regex-based and misses real bylines.** It tests 12 regex patterns against raw HTML (e.g. `by First Last`, `Author:`, author/byline CSS classes, `rel="author"`, `itemprop="author"`, JSON-LD `"@type": "Person"`, `/author/` URLs), plus org-authorship and editorial-review fallbacks. Known limitation: bylines rendered by JavaScript, non-English bylines, and unconventional markup are not detected. Document as a known limitation, not a fully reliable feature.
- **Chrome-extension Reddit detection is fragile by design.** It opens a hidden tab running a Google search for `site:reddit.com "<brand>"` with a 15-second timeout. Known failure modes: Google rate limiting/CAPTCHA (returns error/timeout, shown as unknown), and false positives for short or generic brand names (the quoted search matches any page containing the phrase).
- **Drip / re-engagement email:** the app fires event syncs automatically (new user, audit completed, checklist progress) as fire-and-forget calls to the external email platform. **The drip sequence itself lives in the external platform and must be configured there** — there is no in-app drip scheduler.
- **Citation monitoring has an internal timer — no external cron needed.** `server/index.ts` line 92: `cron.schedule('0 * * * *', ...)` runs the citation refresh cycle hourly, but **only when `NODE_ENV === 'production'` or `ENABLE_CITATION_SCHEDULER === 'true'`**. In development it is off by default.
- **Monthly audit caps: now enforced on both client and server** (✅ server-side check added July 8, 2026). The browser check (`canUserRunAudit`) remains, and the full-audit endpoint (`/api/audit/batch`) now independently reads the live limits from `system/planSettings`, counts the user's audits this calendar month in the `audits` collection, and returns **403 `AUDIT_LIMIT_REACHED`** before any AI cost is incurred. Unlimited (`-1`) plans skip the check; if the check itself errors, the audit proceeds (fail-open) with the error logged.
- **Open billing TODOs:** in-app subscription cancellation and invoice download are not implemented (Dodo TODOs in `subscription-management.tsx`, `billing-history.tsx`).
- **Developer API is unreleased:** endpoints exist, but paid API tiers cannot be purchased (`/api/keys/checkout` returns 503); every key is capped at Free 50 calls/month.

---

## 5. Explicitly Out of Scope (verified absent)

| Capability | Status | Evidence |
|---|---|---|
| Guarantees AI citation improvement | **NO** — no guarantee language found in product code or copy (only sample FAQ text inside the schema-generator demo templates, which is example content the tool generates, not a product claim) | grep "guarantee" across client + server |
| Submits sites to ChatGPT/Perplexity/any AI platform | **NO** — the product only *queries* Perplexity to check mentions; it never submits or registers anything | citation-snapshot-service.ts |
| Modifies the user's website automatically | **NO** — it generates copy-paste snippets, schema, and templates only | playbook/schema generators |
| Live chat support | **NO** — no Intercom/Crisp/Tawk/live-chat code found | grep across client + server |
| Team / multi-user accounts | **NO** — no team, member-invite, or organization code found | grep across server + shared |
| White-label reseller beyond PDF | **NO** — `pdfExport: 'whitelabel'` (branding removal) is the only white-label mechanism; no logo upload, no reseller portal | feature-flags.ts + PDF generator |
| Non-English website support | **PARTIALLY / NOT VERIFIED** — no language detection or handling exists anywhere in the scraper or signal extraction; scoring regexes (bylines, citations) are English-patterned. Non-English sites will scrape but signals will under-detect. Do not advertise multilingual support. | grep scraper-v2.ts + content-signal-service.ts |
| Native mobile app (iOS/Android) | **NO** — no native/Expo/Capacitor code in the repository | project tree + package.json |
| Extension on Firefox/Safari | **NO (Chrome only)** — Manifest V3 using `chrome.*` APIs including the Chrome-specific side panel; no Firefox/Safari builds or `browser_specific_settings` | extension/manifest.json + *.js |
| Money-back guarantee mechanism | **NO** — no refund API usage anywhere in the code; refunds would be manual via the Dodo dashboard | grep "refund" across server |

---

## 6. Verification Log — where guessing was refused

1. **Live Dodo product IDs for app plans** — set via secret environment variables; values intentionally not printed. Only the (unused, mutually inconsistent) code fallbacks were observable.
2. **Firefox/Safari extension compatibility** — not tested in those browsers; the "Chrome only" verdict rests on Chrome-specific APIs in the code, not on live testing.
3. **Non-English behavior** — no code evidence in either direction beyond English-patterned regexes; marked PARTIALLY rather than asserting it works or fails.
4. **Whether the external drip email sequence is currently active** — the app-side event syncs are verified in code; the state of the sequence inside the external email platform cannot be verified from this codebase.
5. **Category max points (1b)** — the literal grep for numbers was too noisy; the values were instead verified from the typed interface comments (`contentDepth: number; // 0-35 points` etc.) and the platform-weight normalization logic.
6. **"5–8 prompts" folklore** — an earlier draft claimed 5–8 prompts per citation snapshot. The code says up to **12** (`prompts.slice(0, 12)`). The 12 figure is what is documented here and in the master reference.
7. **Enterprise price** — originally reported as a conflict ($299 live vs $399 in code) rather than picking one value. ✅ Resolved July 8, 2026: all code reconciled to $299.
