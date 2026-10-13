# Citation Rocket — Master Reference (Single Source of Truth)

> **Purpose:** One fact-checked document you can use to build marketing material, help docs, FAQs, pricing pages, and to train a customer-support AI bot.
>
> **Accuracy rule:** Every number, plan limit, model name, and behavior below was verified directly against the codebase (not assumed). Where the product has caveats or limits, they are stated plainly. Last verified: July 2026.
>
> **How to read the confidence:** Anything in this file marked as a limit, price, or behavior is pulled from the actual code. Wording that describes *value* (marketing tone) is kept separate from wording that describes *mechanics* (what the software literally does).

---

## 1. What Citation Rocket is (one-paragraph pitch)

Citation Rocket is an **AI Readiness Optimizer**. A business pastes in its website URL and, in a couple of minutes, gets a report showing how likely AI assistants (ChatGPT, Perplexity, Gemini, Claude) are to recommend them — plus the exact steps, templates, and ready-to-install files to improve. It doesn't just score you; it **asks real AI questions your customers would ask and shows you whether you got mentioned and who beat you.**

**Who it's for:** B2B companies, marketing agencies, and SaaS brands who want to be the name AI recommends.

---

## 2. Complete feature list (every shipping feature)

| # | Feature | What it does (plain language) |
|---|---|---|
| 1 | **AI Readiness Score** | A 0–100 score with a letter grade (A+ to F). |
| 2 | **Per-platform scores** | Separate scores for **ChatGPT, Perplexity, Gemini, and Claude**. |
| 3 | **AI Citation Snapshot** | Asks live AI questions and reports your **mention rate**, the exact prompts tested, and which competitors got named instead. |
| 4 | **Content Signal Breakdown** | Detects the "signals" AI trusts: tutorials, how-tos, FAQs, case studies, blogs, schema, headings, data points, statistics, external links, frameworks, etc. |
| 5 | **Industry Benchmarks** | Compares your signals against benchmarks and scales them to your site's size. |
| 6 | **Fix-It Playbook** | A prioritized action plan with content templates and code snippets. Depth scales by plan. |
| 7 | **Quick Wins Checklist** | The highest-impact actions pulled out of the playbook into a checkbox list. |
| 8 | **AI-Ready Topic Ideas** | Content ideas in 4 buckets: Authoritative, Thought Leadership, Competitive Advantage, Emerging Opportunity. Count scales by plan. |
| 9 | **Re-Audits & Progress Tracking** | Re-run the audit; the tool preserves your completed checklist items and archives fixed ones. |
| 10 | **Ongoing Citation Monitoring** | A background scheduler re-checks your AI mentions on a plan-based cadence (monthly/weekly/daily). |
| 11 | **Citation Alert Emails** | Emails you when your mention rate changes significantly (Pro and above). |
| 12 | **PDF Report Export** | Export a polished report. Higher plans get an **unbranded** version (see §7 for the exact meaning). |
| 13 | **CSV Export** | Export audit data (scores, findings, competitors, topics, citation data) as CSV. |
| 14 | **Score-Trend Export** | Track and export your score over time (Pro and above). |
| 15 | **AEO / Schema File Generator (ZIP download)** | Generates a downloadable ZIP of AI-crawler files: `llms.txt`, `llms-full.txt`, `AGENTS.md`, `robots-patch.txt`, 5 schema files (Organization, FAQPage, HowTo, Article, BreadcrumbList), a clean markdown version of the homepage, and an INSTRUCTIONS file. |
| 16 | **Competitor Watchlist** | Track named competitors over time (count scales by plan). |
| 17 | **Multiple Domains** | Run audits across multiple websites (count scales by plan). |
| 18 | **Developer API** *(beta / unreleased)* | REST API (`/api/v1/score`, `/audit`, `/generate-files`, `/benchmarks`) with `cr_live_…` bearer keys. **Works, but paid tiers aren't purchasable yet — all keys are capped at the Free 50 calls/month. Not advertised. See §7.** |
| 19 | **Chrome Extension** | Runs a live, client-side AEO audit of the current browser tab (see §6). |
| 20 | **Admin Dashboard** | System health, user management, content editing, and a "View-As-Plan" simulator (staff-only). |

---

## 3. How the audit works (the pipeline)

The audit runs in two user-facing steps.

### Step 1 — Analyze (`/api/audit/analyze`)
- Verifies the domain actually exists (DNS check) so bad URLs fail fast.
- Uses **Perplexity Sonar** (live web search) to extract company intelligence: official company name, industry, business type, target audience, value proposition, and market position.
- Suggests **3 alternative industries**, **5 keywords**, and a set of **AI-visibility competitors** (sites AI tends to cite for the same topics). Suggested competitor domains are validated to strip out hallucinated URLs.
- The user reviews and can correct industry, keywords, and competitors before the full audit — this is the guardrail against AI getting the basics wrong.

### Step 2 — Batch Audit (`/api/audit/batch`)
- **Scrapes** the site (see §8 for exact scraping limits), reading sitemap, robots.txt, and key pages.
- **Extracts content signals** (counts of tutorials, case studies, schema types, data points, etc.).
- **Scores** the site (see §4).
- **Generates topics** in 4 categories, then de-duplicates near-identical ideas using **keyword/word-overlap similarity** (Jaccard overlap of significant words, plus a first-few-words "intent fingerprint") — **not** cosine or embedding similarity. Topics that target *different* AI platforms are never merged even when the wording overlaps.
- **Builds the Fix-It Playbook** (a 12-month roadmap with actions, templates, snippets).
- **Runs the Citation Snapshot** via Perplexity Sonar.

---

## 4. The scoring engine (exact mechanics)

Scoring is a **zero-based earned-points model**: a site starts at **0** and earns points only when it hits benchmarks. Max = **100**.

**Categories and point maximums:**

| Category | Max pts | What earns points |
|---|---:|---|
| **Content Depth** | 35 | Tutorials (10), How-To guides (8), FAQs (7), Case studies (6), Blog posts (4) |
| **Structure & Technical** | 25 | Schema (10), Headings (8), Step lists (4), Images (3) |
| **Research & Citations** | 25 | Data points (10), Statistics (7), External links (5), Research terms (3) |
| **Authority** | 15 | Frameworks (6), Long-form content (5), Nuanced terms (4) |

**Benchmarks & penalty curve:** Benchmarks are SaaS-optimized by default (e.g., ~15 tutorials, ~30 data points) and adjusted by detected industry. Points are awarded on a curve:
- **≥ 60%** of benchmark → **100%** credit
- **≥ 30%** → **70%** credit
- **≥ 10%** → **40%** credit
- **< 10%** → **15%** credit

**Small-site scaling:** Sites with **fewer than 50 pages** get their **volume-based** benchmarks (tutorials, how-tos, FAQs, case studies, blog posts, data points, statistics, external links, frameworks) scaled down proportionally (floor 0.15×) so small sites aren't unfairly crushed. Quality/structure benchmarks (schema, heading score, images, research terms, long-form, nuanced terms) are **not** scaled — they apply equally regardless of site size.

**Per-platform weighting** (each AI values different things):

| Platform | Depth | Structure | Research | Authority |
|---|---:|---:|---:|---:|
| **ChatGPT** | 0.45 | 0.25 | 0.15 | 0.15 |
| **Perplexity** | 0.15 | 0.20 | 0.45 | 0.20 |
| **Gemini** | 0.25 | 0.40 | 0.20 | 0.15 |
| **Claude** | 0.20 | 0.15 | 0.25 | 0.40 |

**Letter grade thresholds:** A+ ≥90 · A ≥85 · A- ≥80 · B+ ≥75 · B ≥70 · B- ≥65 · C+ ≥60 · C ≥55 · C- ≥50 · D+ ≥45 · D ≥40 · D- ≥35 · **F <35**.

**Platform jitter:** A small **±3 point** variation is applied so the four platforms don't show identical numbers — expect minor platform-to-platform differences by design.

---

## 5. The AI Citation Snapshot (exact mechanics)

- Generates up to **12 prompts** per snapshot (identity/reputation/"vs alternatives" prompts when a real company name is known, plus keyword- and industry-based prompts).
- **Mention rate** = round( prompts where you were mentioned ÷ total prompts × 100 ). Detection matches your company name, brand variations, or domain in the AI's answer.
- **Competitor detection** pulls named brands from the answers, filters out generic words and section headers, and only keeps competitors mentioned **2+ times**, capped at the **top 10**.
- Results are stored in a **citation history** so you can see changes over time.
- **Point-in-time caveat:** AI answers change; a snapshot reflects that moment, not a permanent verdict.

---

## 6. The Chrome Extension (exact behavior)

- Runs a **client-side AEO audit of the currently open tab** — it does not need an audit from the main app.
- Scores five modules: **Answer Capsule, Schema, Freshness, Fan-Out, and Bot Access.**
- Checks `robots.txt` for blocked AI bots (e.g., OAI-SearchBot), checks whether `llms.txt` exists, and does a background check for Reddit presence.

---

## 7. Plans, pricing & limits (verified)

### Pricing

| Plan | Monthly | Annual | Notes |
|---|---|---|---|
| **Free** | $0 | $0 | Default for new signups |
| **Starter** | $49 | $490/yr | ~2 months free on annual |
| **Pro** | $149 | $1,490/yr | ~2 months free on annual |
| **Enterprise** | **$299 (live setting)** | $2,990/yr | ✅ Code reconciled to $299 everywhere on July 8, 2026 |
| **Lifetime** | one-time (AppSumo) | — | Sold via AppSumo. **BYOK** (own OpenRouter key required) + free scraping path. See §9. |

> **How pricing/limits work:** the admin-editable database record (`system/planSettings`) is the live source of truth and overrides the code defaults. The numbers in this document are the **live database values as of July 2026** — an admin can change them at any time without a code change.
>
> **✅ Resolved (July 8, 2026):** the code previously said Enterprise **$399** in 14 files (upgrade helper, checkout map, emails, admin dashboards, UI fallbacks). All were changed to **$299 / $2,990 annual** to match the live price. A grep for "399" now returns zero pricing references.

### Full feature/limit comparison

| Feature | Free | Starter | Pro | Enterprise | Lifetime |
|---|:---:|:---:|:---:|:---:|:---:|
| **Audits / month** (live values) | 1 | **15** | **30** | **50** | Unlimited† |
| **Domains** | 1 | 5 | Unlimited | Unlimited | Unlimited |
| **Re-audit button** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Topic ideas / category** | 3 | 12 | 25 | 100 | 25 |
| **Competitors tracked** | 0 | 3 | Unlimited | Unlimited | Unlimited |
| **Fix-It Playbook** | Basic | Full | Full + Priority | Full + Unbranded | Full + Priority |
| **Quick Wins shown** | 3 | Unlimited | Unlimited | Unlimited | Unlimited |
| **Citation monitoring** | None | Monthly | Weekly | Daily | Weekly |
| **Citation alert emails** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Citation refresh button** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **PDF export** | Watermarked | Clean | Unbranded | Unbranded | Unbranded |
| **Full-audit CSV download** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Score-trend CSV export** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Schema snippets shown in audit report** | 1 | Unlimited | Unlimited | Unlimited | Unlimited |
| **AEO file ZIP download (llms.txt, AGENTS.md, schema files)** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **API calls / month** | 50 | 500 | 5,000 | 20,000 | 50* |

† **Lifetime "unlimited" audits are cost-safe by design:** Lifetime users run audits on **their own OpenRouter API key** (BYOK, see §9), so heavy usage costs them — not Citation Rocket. All plans that use the platform's key (Free/Starter/Pro/Enterprise) have hard monthly caps.

**✅ Enforcement (updated July 8, 2026):** the monthly audit cap is now checked **on the server too**, not just in the browser. Before a full audit runs, the server reads the live plan limits (`system/planSettings`), counts the user's audits this calendar month in the `audits` collection, and returns **403 "Monthly audit limit reached"** if the cap is hit — before any AI spend occurs. Unlimited plans (`-1`, e.g. Lifetime) skip the check. If the check itself errors (e.g. a network blip), the audit is allowed and the error logged, so a glitch never blocks paying customers.

\* **⚠️ The Developer API is not a sellable feature yet — treat it as unreleased/beta.** The 4 endpoints work and any logged-in user can get a `cr_live_…` key, but **paid API tiers cannot be purchased**: the API checkout endpoint returns HTTP 503 *"API billing is not yet available. Contact support for API access."* In practice **every key is issued on the Free tier (50 calls/month)** regardless of the user's app plan, so the 500 / 5,000 / 20,000 quotas defined in code are currently unreachable through the app. It is **not advertised on the pricing page** and has **no key-management UI**. (Lifetime is not mapped at all → also falls back to Free.) Do not put this on marketing material until API billing is live.

### ⚠️ Important wording correction — "white-label" vs "unbranded"

The code's "white-label" setting **removes Citation Rocket's branding** from the PDF (the footer URL and the "Citation Rocket" header disappear). It does **not** add the customer's own logo or brand — there is no logo upload. So the honest customer-facing term is **"unbranded"**, not "your brand on it." Only the **Enterprise** playbook is additionally unbranded; Pro and Lifetime playbooks are "Full + Priority" (prioritized, still branded).

---

## 8. Website scraping — exact limits

- **Max 15 pages** scraped per audit (to avoid timeouts). Large sites are sampled, not fully read.
- **45-second** total scraping budget; **8 seconds** per page.
- Sitemaps are read up to **5,000 URLs** for counting, but only top-priority pages are actually scraped.
- **Bot-blocked sites:** identifies as `CitationRocketBot/2.0` and falls back to secondary readers (Jina Reader, then a basic fetch). A fully locked-down site may return little or no content.
- **JavaScript-heavy sites** (Webflow, Framer, Next.js) use **Firecrawl** on paid monthly/annual plans. If Firecrawl and fallbacks fail, the audit may only see the homepage or return empty content.
- **SSRF protection is scoped to file generation:** only the AEO file generator (ZIP download) blocks private, loopback, and cloud-metadata addresses via `assertPublicUrl`. The **audit endpoints do not apply that private-range block** — the analyze step performs a DNS-existence check on the domain (batch/audit do not even do that), and none of them reject private-range IPs — so Citation Rocket is intended for **public websites only** (point it only at public sites).
- **When scraping fails but the site is clearly large,** the scorer applies "confidence floors" (a reasonable estimate) rather than returning zero. This is a safeguard, not a true reading.

---

## 9. Lifetime / AppSumo plan — special rules (read carefully)

The Lifetime plan is a one-time AppSumo purchase, so it works differently to keep it cost-safe:

- **How it's activated (self-serve):** the buyer enters their AppSumo code on the **Pricing page**. The code is checked against the `appsumo` database collection, then redeemed via an **atomic transaction** (✅ hardened July 8, 2026): the already-redeemed check, the code being marked redeemed (redeemer email + timestamp), and the account's Lifetime upgrade all happen in one all-or-nothing step — a code can never be redeemed twice, even by two people at the same instant. No manual admin step.
- **✅ UI overstatement fixed (July 8, 2026):** the "OpenRouter API Key Required" popup previously claimed "100 topics per category" — it now correctly says **25**, matching what the server enforces for Lifetime.

- **Bring Your Own Key (BYOK):** Lifetime users **must add their own OpenRouter API key** in **Profile → API Configuration**. The system **fails closed** — it never falls back to the platform key. Without a key, audits, re-audits, citation refreshes, and AEO file generation return an **`APPSUMO_KEY_REQUIRED`** error (HTTP 400).
  - *Note: the key is an **OpenRouter** key even though the field name in the code is historically `perplexityApiKey`.*
- **Free scraping path:** Lifetime uses the free scraper (Jina Reader → basic fetch) and **skips paid Firecrawl** even on JS-heavy sites. As a result, JS-heavy sites may read **less completely** on Lifetime than on paid monthly/annual plans. The generated file set is identical; only the source content may be thinner.
- **Cadence:** Lifetime citation monitoring runs **weekly** (same as Pro).

---

## 10. The AI models under the hood (verified)

Everything is routed through **OpenRouter**.

| Job | Model | Why |
|---|---|---|
| Competitor analysis, topic generation (structured extraction) | **DeepSeek V4 Flash** | Cheap, fast structured extraction |
| Content-type verification (during the audit) | **GPT-4.1-nano** (OpenAI, `server/content-verification-service.ts`) | Cheap classifier that re-checks that detected URLs really are tutorials/FAQs/etc. |
| Company research (live web) | **Perplexity Sonar** | Live web search |
| Citation snapshot (live web) | **Perplexity Sonar** | Live web search |
| Deep research (where used) | **Perplexity Sonar Pro** | Higher-quality live search |
| Fallback | **GPT-4o-mini** | General fallback |

> Note (corrected 2026-07-10): content-type verification actually runs on **GPT-4.1-nano**. It is called from the batch audit at `server/routes.ts:4144` via `verifyAllContentTypes()`, which uses `model: 'gpt-4.1-nano'` (`server/content-verification-service.ts:131`). The `MODEL_MAP.contentVerification = 'deepseek/deepseek-v4-flash'` entry in `server/llm-router.ts:33` is **dead code** — no `llmCall` ever passes `task: 'contentVerification'` (the only tasks invoked are `companyResearch`, `competitorAnalysis`, `topicGeneration`, and `citationSnapshot`). So `replit.md` and `docs/06` (which name gpt-4.1-nano) are correct; an earlier draft of this section wrongly said DeepSeek here.

---

## 11. What it does really well

- **Shows the "moment of truth."** The Citation Snapshot literally shows whether AI names you and who it recommends instead — this is the standout feature.
- **Actionable, not vague.** The Fix-It Playbook gives concrete steps, templates, and code — plus a downloadable ZIP of ready-to-install AI-crawler files.
- **Fair scoring.** Benchmarks scale to site size and industry, so a small law firm isn't judged against a giant SaaS.
- **Progress you can track.** Re-audits preserve checklist progress and export score trends over time.
- **Cost-controlled.** Model routing uses cheap models for bulk work and only spends on live web search where it matters.

---

## 12. What can go wrong / failure modes (be honest with customers)

| Situation | What happens | Customer impact |
|---|---|---|
| Site blocks bots (Cloudflare, etc.) | Falls back to Jina/basic fetch; may get little content | Score may rely on confidence-floor estimates |
| JS-heavy site on Lifetime plan | Firecrawl skipped; free scraper may read less | Thinner content than paid plans |
| Perplexity down / rate-limited (401/429/500) | Audit **still completes** but **without live citation data** for that run | No mention rate that run |
| LLM returns malformed JSON | Call throws a parse error (no auto-retry) | Occasional failed step; re-run |
| Very large site | Only 15 pages scraped, 5,000 sitemap URLs counted | Sampled, not exhaustive |
| Lifetime user without key | `APPSUMO_KEY_REQUIRED` (HTTP 400) | Must add OpenRouter key first |
| AI-generated intel is generic/wrong | Step 1 review screen lets user correct it | User fixes before full audit |

**Rate limits:** the audit endpoint allows **20 requests / 15 minutes per IP**; the waitlist endpoint allows **10 requests / minute per IP**.

---

## 13. Known bugs & unfinished paths (verified)

The codebase has **no open bug markers** — every `BUG-XX` note in the code is a **fix that has already been applied** (concurrency guards, competitor-extraction tightening, citation-threshold tuning, cancellation-access handling, etc.).

**Genuinely unfinished / not-yet-shipped code paths:**
1. **In-app subscription cancellation** is not yet wired to the Dodo API (`subscription-management.tsx`). Cancellation currently depends on the Dodo webhook flow.
2. **Invoice history/download** is not yet wired to the Dodo API (`billing-history.tsx`) — invoices aren't fetched or downloadable in-app yet.
3. **Developer API billing** is stubbed — the API checkout endpoint returns HTTP 503 ("API billing is not yet available"), so paid API tiers can't be bought and all keys stay on the Free 50/month quota. The API endpoints themselves work; only the paid upgrade path is missing.

Everything else is implemented and working as described.

---

## 14. Billing behavior (Dodo Payments)

- **Upgrades** apply **immediately** once Dodo confirms payment (webhook `payment.succeeded` / `subscription.created`).
- **Downgrades** are **scheduled** and take effect **at the end of the current billing period** (user keeps higher features until then; no refund of unused time).
- **Cancellations** honor access **until the paid period ends** (no immediate cut-off).
- The flow depends on the webhook at `https://app.citationrocket.com/api/webhooks/dodo` carrying correct `user_id` + `plan_name` metadata and a matching `DODO_WEBHOOK_SECRET`.
- **Only percentage-based discount coupons** are supported; fixed-dollar coupons are ignored.

---

## 15. Operational dependencies

The product relies on: **Perplexity** (citations & research), **OpenRouter/OpenAI** (analysis), **Firecrawl** (JS-site scraping, paid plans only), **Jina Reader** (free scraping path / Lifetime), **Dodo Payments** (billing), **Firebase** (auth + Firestore database), **Neon PostgreSQL** (sessions/relational), and an **email provider** (Resend, plus Loops for lifecycle email). An outage in any one degrades the related feature only.

> Admin bulk operations require the `FIREBASE_SERVICE_ACCOUNT` secret; without it, admin user/audit management silently runs with limited privileges.

---

## 16. FAQ (customer-ready)

**Q: What does Citation Rocket actually do?**
It scores how likely AI assistants are to recommend your website, shows you whether AI currently mentions you (and who it recommends instead), and gives you a step-by-step plan plus ready-to-install files to improve.

**Q: How is the score calculated?**
Your site starts at 0 and earns points for the content signals AI trusts (tutorials, FAQs, schema, data, case studies, etc.), measured against benchmarks for your industry and site size. You get an overall 0–100 score, a letter grade, and separate scores for ChatGPT, Perplexity, Gemini, and Claude.

**Q: Why do the four platform scores differ slightly?**
Each AI values different things (e.g., Perplexity weights research/citations heavily; Claude weights authority), and a small ±3-point variation is applied by design.

**Q: Does it really check what AI says about me?**
Yes. The Citation Snapshot sends up to 12 real prompts to Perplexity's live search and reports how often you were mentioned and which competitors showed up.

**Q: Can it audit any website?**
Any public website. Citation Rocket is designed for public sites only — the downloadable file generator additionally blocks private/internal addresses for security. Very large or heavily bot-protected sites may be read only partially.

**Q: What's in the downloadable ZIP?**
`llms.txt`, `llms-full.txt`, `AGENTS.md`, `robots-patch.txt`, five schema files, a clean markdown copy of your homepage, and an install-instructions file.

**Q: What does "white-label"/"unbranded" PDF mean?**
The Citation Rocket branding is removed from the report. It does **not** add your own logo — it's an unbranded report.

**Q: How often does monitoring run?**
Starter monthly, Pro weekly, Enterprise daily, Lifetime weekly. Free plans aren't monitored.

**Q: What's different about the Lifetime (AppSumo) plan?**
You bring your own OpenRouter API key (required), and scraping uses the free path (no Firecrawl), which can read JS-heavy sites less completely.

**Q: When do plan changes take effect?**
Upgrades are immediate; downgrades and cancellations take effect at the end of your current billing period.

**Q: Can I cancel or download invoices inside the app?**
Not yet — in-app cancellation and invoice download are still being wired up to the payment provider. Contact support for now.

---

## 17. Notes for training a support AI bot

- **Never promise a custom-branded (logo) PDF.** The correct claim is "unbranded report."
- **Don't promise instant downgrades or refunds.** Downgrades apply at period end.
- **For Lifetime users hitting `APPSUMO_KEY_REQUIRED`:** tell them to add their OpenRouter key in Profile → API Configuration.
- **If a customer says citation data is missing:** it usually means Perplexity was rate-limited/down that run — advise re-running later; the rest of the audit still completes.
- **If scores seem low for a bot-blocked site:** explain confidence floors and that heavily protected/JS-heavy sites may be read partially.
- **For "cancel my plan" / "where's my invoice":** these in-app flows aren't live yet; route to human support.
- **Model lineup:** content-type verification runs on **GPT-4.1-nano**; competitor analysis and topic generation on **DeepSeek V4 Flash**; company research and citation snapshots on **Perplexity Sonar**; **GPT-4o-mini** is the fallback. All routed via OpenRouter except the gpt-4.1-nano content check (direct OpenAI SDK).
