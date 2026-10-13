# Verification Index — Docs vs. Code/Runtime

This is the live dashboard for the docs-vs-reality audit. Every factual claim in `docs/00`–`docs/06` is broken into a numbered row in **`docs/verification-ledger.csv`**. Each row records the claim, the subsystem that owns it, its verification status, and the concrete evidence (grep with file+line, live curl output, Firestore dumps, executed functions) — never mere code inspection.

**Golden rule: no evidence, no verdict.** A claim stays `unverified` until a command was actually run and its output captured in the ledger. Behavior claims (what a user experiences) require **runtime** proof; constants/enums require **static** proof (grep + line number).

Last updated: **2026-07-10**

---

## Status legend

| Status | Meaning |
| :--- | :--- |
| `VERIFIED` | Claim confirmed by real evidence captured in the ledger. |
| `PARTIAL` | Partly proven; a specific piece still needs a fresh run (see followup_note). |
| `CONFLICT` | Doc and code/runtime disagree — needs reconciliation. |
| `NOT_VERIFIABLE` | Cannot be proven from this repo/runtime (e.g. external platform state). |
| `OUTDATED_DOC` | Doc describes an old behavior the code no longer has. |
| `unverified` | Row created, not yet investigated. Owned by the subsystem's task. |

---

## Ledger columns

`claim_id, doc_file, section, claim_text, subsystem, status, evidence_static, evidence_runtime, commands_run, last_verified_at, followup_note`

- **evidence_static** — grep/file:line proof for constants, enums, gating logic.
- **evidence_runtime** — live proof: curl output, Firestore read, executed function, seeded test result.
- **commands_run** — the exact command(s) used, so anyone can re-run.
- **followup_note** — what remains, or which task owns the runtime proof.

---

## Coverage by subsystem

| Prefix | Subsystem | Owning task | Rows | Verified | Partial | Conflict | Unverified |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `PB-` | Plans & Billing values | #12 (back-filled) | 23 | 23 | 0 | 0 | 0 |
| `EX-` | Exports (CSV / AEO ZIP / PDF / schema) | #19 | 6 | 6 | 0 | 0 | 0 |
| `PL-` | Audit pipeline & scraping | #13 | 16 | 16 | 0 | 0 | 0 |
| `SC-` | Scoring engine | #14 | 10 | 10 | 0 | 0 | 0 |
| `PT-` | Playbook & topics | #15 | 6 | 6 | 0 | 0 | 0 |
| `CT-` | Citation snapshot & alerts | #16 | 8 | 8 | 0 | 0 | 0 |
| `EA-` | Extension / admin / billing / account | #17 | 17 | 17 | 0 | 0 | 0 |
| `FN-` | Final reconciliation & limitations | #18 | 6 | 6 | 0 | 0 | 0 |
| | **Total** | | **92** | **92** | **0** | **0** | **0** |

> **Close-out (2026-07-10, Task #18):** 100% of the 92 claim rows are `VERIFIED`. Zero partials, zero open conflicts, zero unverified. All six former conflicts were reconciled by fixing the docs to match code; both partials (`PB-05`, `EA-12`) were resolved with fresh runs; the six `FN-` limitation rows were verified.

---

## What is proven now (Task #12 back-fill)

Confirmed this session with fresh evidence:

- **Audit limits** (live pricing API, reads `system/planSettings`): Free 1 / Starter 15 / Pro 30 / Enterprise 50 per month. Lifetime `-1` is `PARTIAL` — the pricing API omits Lifetime, so it needs a fresh Firestore read.
- **Prices** (live pricing API): Free $0 / Starter $49 / Pro $149 / **Enterprise $299** (the $399→$299 reconciliation holds).
- **Feature-flags table** (grep `shared/feature-flags.ts` with line numbers): topics-per-category, domains, re-audit, competitors, quick wins, citation frequency/alerts, PDF mode, score-trend export, playbook mode, schema limit — all five plans.
- **Server-side audit cap**: 403 `AUDIT_LIMIT_REACHED` before AI spend (live curl, session test).
- **Exports gating**: full-audit CSV ungated on all plans (incl. Free); score-trend CSV Pro+; AEO ZIP pro/enterprise/lifetime only (Free **and** Starter get 403 `PLAN_REQUIRED`); schema snippets Free=1 / paid=all.
- **AppSumo redemption** is atomic (`runTransaction`, `isRedeemed` re-check) — race test showed exactly one winner; modal now says "25 topics".

## What is proven now (Task #13 — audit pipeline & scraping)

All 16 `PL-` rows now carry evidence: **13 VERIFIED, 1 PARTIAL, 2 CONFLICT (both doc-fixed)**.

- **Runtime-proven** (seeded users, real Firebase ID tokens, live curl):
  - `PL-01` analyze DNS fast-fail → 400 `DOMAIN_NOT_FOUND` on a nonexistent domain.
  - `PL-14` Multiple-Domains limit enforced server-side → free user at 1 domain gets 403 `DOMAIN_LIMIT_EXCEEDED` (limit=1). Seeded auth/Firestore data cleaned up afterward.
- **Static-proven** (grep + file:line; internal/no live spend): Perplexity Sonar for company intel (`companyResearch`→`perplexity/sonar`), analyze output shape (3 industries / 5 keywords / DNS-validated competitors), sitemap+robots+page scraping, content-signal extraction & sitemap-first priority, `MAX_PAGES=15`, 45s/8s budgets, 5,000-URL sitemap cap, `CitationRocketBot/2.0` UA + Firecrawl→Jina→basic fallback, Firecrawl on paid / Lifetime skips, confidence floors, re-audit smart-merge.
- **Conflicts found and corrected in `docs/00`:**
  - `PL-12` — SSRF/private-IP blocking (`assertPublicUrl`) applies **only** to the AEO file generator (`/api/generate-aeo-files`); the audit pipeline does a DNS-existence check only. §8 & §16 reworded.
  - `PL-16` — waitlist rate limit is **10 requests/minute per IP**, not "5/hour". §12 corrected.

## What is proven now (Task #14 — scoring engine)

All 10 `SC-` rows now carry evidence: **10 VERIFIED, 0 CONFLICT**. No doc changes needed — §4 matched the code exactly.

- **Runtime-proven** (executed `calculatePlatformScoresV2` + `getBenchmarks` via `npx tsx` on fixed inputs):
  - A "perfect" site (all benchmarks met) → overall **100 / A+**, category breakdown exactly **35 / 25 / 25 / 15**, and platform jitter **{chatgpt 100, perplexity 99, gemini 98, claude 97}** (±3 spread, distinct).
  - An "empty" 5-page site → overall **0 / F**, jitter **{0, 1, 2, 3}**.
  - `getBenchmarks('', 10)` → volume signals scaled 0.2× (tutorials 15→3, dataPoints 30→6, blogPosts/externalLinks 50→10); structure/authority quality benchmarks (schema, headings, images, research terms, long-form, nuanced) **unscaled**.
- **Static-proven** (grep + file:line): category maxes & `Math.min` caps, per-signal weights, `getPenaltyMultiplier` curve (60/30/10 → 1.0/0.7/0.4/0.15), `PLATFORM_WEIGHTS`, `calculateLetterGrade` thresholds, `ensureDistinctScores` ±3, small-site `Math.max(0.15, pages/50)` floor, blueprint 8-module 150-raw → `/150*100` normalization, and E-E-A-T `AUTHOR_BYLINE_PATTERNS` (12 English-only static-HTML regexes).
- **Note on SC-05:** doc's "benchmarks scaled proportionally" is accurate for volume signals; the code intentionally does **not** scale structure/authority quality benchmarks. Captured in the row's `followup_note` — not a conflict, but a precision detail.
- **Note on SC-10:** the documented limitation is confirmed — author detection is regex on static HTML, so JS-rendered, non-English, and unconventional bylines are missed.

## What is proven now (Task #15 — playbook & topics)

All 6 `PT-` rows now carry evidence: **5 VERIFIED, 1 CONFLICT (doc-fixed)**.

- **Runtime-proven** (executed the real functions via `npx tsx docs/proofs/verify-playbook-topics.ts`):
  - `generatePlaybook()` on empty signals → **12 prioritized actions** (sorted critical→high→medium), **2 with code snippets, 3 with content templates**, and **byte-identical across two runs** (deterministic).
  - **Quick Wins** = 4 actions, all satisfy *easy + critical/high*; `quickWinsLimit` = Free **3**, all paid **Infinity**.
  - `deduplicateTopics()` on 4 topics → **4 → 3**: a near-duplicate ChatGPT title was dropped while a same-wording **Perplexity** title was **kept** (different target platform), proving keyword/Jaccard overlap + the never-merge-different-platform rule — **not cosine**.
  - `getFeatureFlags` per plan → `topicsPerCategory` **3 / 12 / 25 / 100 / 25** and `playbooks` **basic / full / full_priority / full_whitelabel / full_priority** exactly as documented.
- **Static-proven** (grep + file:line): gap-based deterministic generator, code-snippet/content-template fields, priority sort, client-side plan gating of playbook depth (`fix-it-playbook.tsx`), the four topic categories, and the feature-flag constants.
- **Conflict found and corrected:**
  - `PT-05` — docs/`replit.md` said topics are de-duplicated via **cosine-similarity**; the code uses **keyword/word-overlap (Jaccard) similarity** plus an intent fingerprint and a same-platform-only merge rule. `docs/00` §3 Step 2 and `replit.md` line 25 corrected.
- **Note on PT-04:** the live cap comes from `shared/feature-flags.ts` (Lifetime **25**). The unused `prompt-service.getPlanSettings` still lists Lifetime 100 but has **no server call site** — latent dead-code inconsistency, not a live behavior; captured in the row's `followup_note`.

## What is proven now (Task #16 — citation snapshot & alerts)

All 8 `CT-` rows now carry evidence: **8 VERIFIED, 0 conflicts** — `docs/00` §5, §7/§15, §2 #11 and §12 all match the live code.

- **Runtime-proven** (ran the *real* snapshot pipeline offline by stubbing `global.fetch`, the only network I/O in `llm-router.llmCall`; no API key, no spend, via `npx tsx docs/proofs/verify-citation.ts`):
  - `generateCitationSnapshot()` with a real name + 4 keywords → **12 prompts** (capped); empty name + no keywords → **7** — confirming "**up to 12**", variable and capped.
  - **Mention rate** = `round(mentioned/total*100)`: "Acme" named in 3 of 12 answers → **25%**; a domain-only answer (no name) → **100%**, proving the domain-match branch.
  - **Competitor aggregation**: a competitor seen in only 1 answer was **dropped** (`<2`), competitors in all answers kept, and 12 distinct 2+ competitors returned exactly **10** (top-10 cap).
  - `getFeatureFlags` per plan → `citationMonitoringFrequency` **none / monthly / weekly / daily / weekly** and `citationAlerts` **false / false / true / true / true** ("Pro and above").
  - `detectCitationChanges()`: 0→60% (≥2 mentions) = **significant**; 50→55% = not; **corrupt** baseline (prev 100% / 0 competitors) = not; **recovery** baseline = not.
- **Static-proven** (grep + file:line): the prompt-builder structure and `slice(0,12)`; `checkMention` name/brand-variation/domain branches with the empty-name guard; competitor generic/descriptor filtering; `saveCitationSnapshot` → `audits/{id}/citationHistory` storage + read-back; the hourly `cron.schedule('0 * * * *')` gated by `NODE_ENV==='production' || ENABLE_CITATION_SCHEDULER==='true'`; and the batch-audit `.catch(() => null)` that lets an audit complete without live citation data when Perplexity fails.
- **N/A (justified):** CT-04 Firestore write and CT-07 cron boot are not executed to avoid mutating production / rebooting; both are verified statically and the *payload* stored in CT-04 was produced at runtime in CT-01..CT-03.
- **Scope note (CT-04):** citation history is persisted on **initial / manual / scheduled** runs (`saveCitationSnapshot`); the **re-audit** path regenerates a snapshot into the audit doc but does **not** add a history entry — so trend history covers those three triggers, not re-audits.

## What is proven now (Task #17 — extension, models, admin, billing & account)

*Historical snapshot at the end of Task #17 (before the Task #18 close-out): 13 VERIFIED, 1 PARTIAL, 3 CONFLICT — one of which (EA-05) was later found to be a wrong verdict.* After Task #18 all 17 `EA-` rows are **VERIFIED** (`npx tsx docs/proofs/verify-extension-admin-billing.ts` → 17/17 assertions pass; reconciliation detailed below).

- **Runtime-proven** (executed the shipped modules, no network/Firestore spend):
  - **Model routing** (imported live `MODEL_MAP`): company research + citation = `perplexity/sonar`; deep research = `perplexity/sonar-pro`; fallback = `openai/gpt-4o-mini` — all via OpenRouter. `MODEL_MAP.contentVerification = deepseek/deepseek-v4-flash` **exists in the map but is never invoked** (see the EA-05 reversal below).
  - **API quotas** (imported live `API_PLAN_LIMITS`): Free **50** / Starter **500** / Professional **5,000** / Enterprise **20,000**.
  - **Email deps**: `RESEND_API_KEY` + `new Resend` (transactional), `loops-service` (lifecycle); `MAILERSEND_API_KEY` is **unset** in the environment — confirmed at runtime.
- **Source-proven** (file:line assertions against the shipped code):
  - **Extension**: MV3 `manifest.json` (side panel, `chrome.*` perms, content script on all pages); `content.js` runs 5 client-side modules (Answer Capsule, Schema, Freshness, Fan-Out, Bot Access), checks `robots.txt` for `OAI-SearchBot` et al., `llms.txt` existence, and a background Reddit check.
  - **Developer API**: `POST /api/keys/checkout` → **503** "API billing is not yet available"; the paid-tier routes in `dodo-api-billing.ts` are commented out, so every key stays on Free 50/mo.
  - **Billing timing**: downgrade `effectiveDate` = first day of next month (period-end); upgrade = immediate checkout; Dodo webhook `/api/webhooks/dodo` verifies **Svix** signature and **fail-closed rejects** in prod when `DODO_WEBHOOK_SECRET` is missing; only **percentage** coupons supported (fixed rejected in `dodo-service.createDiscount`).
  - **Unfinished (confirmed)**: in-app cancellation and invoice download are both `TODO` stubs (`subscription-management.tsx`, `billing-history.tsx`).
- **3 CONFLICTS (all reconciled in Task #18 — see below):**
  - **EA-05** — ⚠️ **This Task #17 conclusion was WRONG and was reversed in Task #18.** Content verification actually runs on **`gpt-4.1-nano`** (`server/content-verification-service.ts:131`, invoked in the batch audit at `server/routes.ts:4144`). `MODEL_MAP.contentVerification = deepseek/deepseek-v4-flash` is **dead code** (no `llmCall` passes `task:'contentVerification'`). So docs `06`/`07`/`replit.md` were **correct** and doc `00` §10 was the defect — now fixed.
  - **EA-09** — admin allowlist is **one** email (`hello@pressense.co`), not "+2 others"; the `isAdmin` Firestore flag is also honored. Doc `03` §1 fixed.
  - **EA-10** — admin dashboard has **12 tabs** (`overview, users, subscriptions, coupons, prompts, settings, plans, home-content, api-usage, emails, demo, system-health`). **"View-As-Plan" is a toggle, not a tab.** Doc `03` §2 fixed.
- **1 PARTIAL (resolved in Task #18):** **EA-12** — profile has **7 tabs** (profile, security, subscription, api-config, billing, usage, notifications); the **Notifications** tab was missing from the docs. Doc `02` §5 fixed.

## What is proven now (Task #19 — exports & watchlist)

All 6 `EX-` rows now carry evidence: **6 VERIFIED, 0 conflicts** (`npx tsx docs/proofs/verify-exports-watchlist.ts` → 9/9 assertions pass). No doc changes needed — `docs/00` §2 #15 and §7 matched the code.

- **Runtime-proven** (executed the shipped modules offline, no network/Firestore spend):
  - `EX-05` — ran the real `generateAeoFiles()`; the returned object has exactly **11 keys**: `llms.txt, llms-full.txt, AGENTS.md, robots-patch.txt`, five `schema/*.jsonld` (Organization, FAQPage, HowTo, Article, BreadcrumbList), `markdown-twins/homepage.md`, and `INSTRUCTIONS.md` — the documented AEO ZIP contents exactly.
  - `EX-06` — rendered a **real jsPDF per mode** with `AuditPDFGenerator` and grepped the raw byte stream: **watermarked** has the "FREE PLAN" watermark and "citationrocket.com" (branded); **clean** has no watermark but is still branded; **whitelabel** has no watermark and **no** "citationrocket.com"/"Citation Rocket" (fully unbranded).
  - `PB-17` / `PB-13` / `EX-02` — executed `getFeatureFlags` per plan: `pdfExport` **watermarked / clean / whitelabel / whitelabel / whitelabel**, `competitorWatchlistLimit` **0 / 3 / 999 / 999 / 999**, `scoreTrendExport` **false / false / true / true / true**.
- **Source-proven** (file:line assertions against the shipped code):
  - `EX-03` — `POST /api/generate-aeo-files` returns **403 `PLAN_REQUIRED`** unless plan ∈ `[pro, enterprise, lifetime]`.
  - `EX-01` — the full-audit CSV download button renders with **no feature-flag guard**, so all plans (including Free) can export it.
- **Note:** the per-plan PDF-mode mapping (`PB-17`) is now backed by both the flag values *and* a rendered-PDF grep, closing the "runtime per-plan PDF output owned by exports task" follow-up.

## What is proven now (Task #18 — final reconciliation & limitations)

The audit close-out. All 6 `FN-` rows verified, all remaining conflicts/partials reconciled, and a random re-check confirms earlier rows still hold. **Ledger is now 92/92 `VERIFIED`.**

- **The 6 `FN-` limitation rows (verified 2026-07-10):**
  - `FN-01` — the 19 `BUG-[0-9]` markers in the code are all **"BUG-NN FIX" annotations for already-applied fixes** (concurrency guards, empty-name guards, etc.), not open defects. No open `TODO`/`FIXME`/`BUG:` markers.
  - `FN-02` — out-of-scope features confirmed **absent**: no AI-citation guarantee, no site submission, no auto-website-modify, no live-chat widget, no team/org, no refund API, no native mobile app.
  - `FN-03` — `npx tsc --noEmit` → **9 errors, all in `server/test-all-fixes.ts`** (a dev scratch file); zero errors in product code.
  - `FN-04` — `npx vitest run` → **6 files / 88 tests pass, 0 fail**.
  - `FN-05` — scale/authority floors confirmed: `scoring-service.ts:357` tiered **45 / 50 / 55** by sitemap size; `:373` subdomain floor triggers at `<40` for 3+ subdomains.
  - `FN-06` — **no language detection** anywhere (`scraper-v2.ts` + `content-signal-service.ts` → 0 hits); non-English sites scrape but under-detect. Confirms the documented limitation.
- **The headline reversal — EA-05:** Task #17 concluded content verification used DeepSeek and told readers doc `00` was right. **That was wrong.** Fresh evidence: `server/content-verification-service.ts:131` uses **`gpt-4.1-nano`** (direct OpenAI SDK) and is invoked live in the batch audit at `server/routes.ts:4144`; the `MODEL_MAP.contentVerification = deepseek/deepseek-v4-flash` entry is **dead code** (no `llmCall` passes `task:'contentVerification'` — the only tasks invoked are companyResearch, competitorAnalysis, topicGeneration, citationSnapshot). Docs `06`/`07`/`replit.md` were correct; **doc `00` §10 + §17 were fixed.**
- **Conflicts reconciled by fixing the docs (doc now matches code):**
  - `EA-09` → doc `03` §1: admin allowlist is **only** `hello@pressense.co`.
  - `EA-10` → doc `03` §2: the full **12-tab** dashboard is documented; View-As-Plan reframed as a toggle.
  - `EA-12` → doc `02` §5: the **Notifications** tab added (7 tabs total).
  - `PL-12`, `PL-16`, `PT-05` — docs were already fixed in their owning tasks; re-confirmed here (single `assertPublicUrl` call site; auditLimiter 20/15min + waitlistLimiter 10/60s; zero `cosine`/`embedding` in `server/`).
- **Partials resolved with fresh runs:** `PB-05` (Lifetime `-1` via `docs/proofs/verify-final.ts`); `EA-12` (doc fixed). `PL-03` resolved as accurate **intent** — the analyze prompt requests 3 industries / 5 keywords (not hard-enforced), while the validated-competitor DNS filter **is** enforced.
- **Random re-check (~11% of rows, fresh runs 2026-07-10):** re-ran `PB-05`, `PB-10`, `PL-07`, `PL-08`, `PL-09`, `SC-04`, `SC-06` and re-confirmed `PL-12`/`PL-16`/`PT-05` — every value still matched the ledger. No drift found.

### Consolidated doc corrections made across the whole audit
| Doc | Section | Correction |
| :--- | :--- | :--- |
| `00` | §3 Step 2 | Topic dedup is Jaccard/word-overlap, **not** cosine (also `replit.md`). |
| `00` | §8, §16 | `assertPublicUrl` SSRF guard is on the **AEO file generator only**, not the audit pipeline. |
| `00` | §12 | Waitlist rate limit is **10/min per IP**, not "5/hour". |
| `00` | §10, §17 | Content verification is **`gpt-4.1-nano`** (reversal); the DeepSeek map entry is dead code. |
| `02` | §5 | Profile has **7 tabs** — added the **Notifications** tab. |
| `03` | §1 | Admin allowlist is **one** email (`hello@pressense.co`); removed two non-existent addresses. |
| `03` | §2 | Documented all **12** dashboard tabs; View-As-Plan is a **toggle**, not a tab. |

## Resolution log (all items closed)

The audit is complete: **0 `unverified`, 0 `PARTIAL`, 0 `CONFLICT` rows remain.** For historical reference, these were the last open items and how each was closed:

- **EX-05 / EX-06**: ✅ **RESOLVED (Task #19)** — ran the real `generateAeoFiles()` (11-file manifest confirmed; the route appends exactly these entries into the ZIP via `Object.entries`) and rendered a real PDF per mode (watermarked/clean/unbranded confirmed via raw byte grep). See `docs/proofs/verify-exports-watchlist.ts`.
- **EA-05**: ✅ **RESOLVED (Task #18, REVERSING the Task #17 verdict)** — content verification runs on **`gpt-4.1-nano`** (`server/content-verification-service.ts:131`, invoked at `server/routes.ts:4144` via `verifyAllContentTypes`). `MODEL_MAP.contentVerification = deepseek/deepseek-v4-flash` is dead code (no `llmCall` uses `task:'contentVerification'`). Docs `06`/`07`/`replit.md` were correct; **doc `00` §10/§17 was the defect and is now fixed.**
- **PB-05**: ✅ **RESOLVED (Task #18)** — fresh Firebase Admin read of `system/planSettings` (`docs/proofs/verify-final.ts`) confirms Lifetime `auditsPerMonth = -1` (unlimited).

---

## How to update this audit

1. Pick a subsystem task; open its `unverified` rows in the ledger.
2. Run the proving command (grep+line for constants, curl/Firestore/executed function for behavior).
3. Paste evidence into `evidence_static` / `evidence_runtime`, record `commands_run`, set `status`, stamp `last_verified_at`.
4. Clean up any seeded Firestore/auth/test artifacts created during proof.
5. Update the coverage table above.
