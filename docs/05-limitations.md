# Known Limitations

An honest, fact-checked list of what the product can't do (yet) and where results may be imperfect. Based on the actual code.

---

## 1. Website scraping limits
- **Max 15 pages** are scraped per audit (to avoid timeouts). Very large sites are sampled, not fully read.
- **45-second total** scraping budget, with **8 seconds per page**. Slow sites may be partially read.
- Sitemaps are read up to **5,000 URLs** for *counting*, but only top-priority pages are actually scraped.
- **Bot-blocked sites:** Some sites (Cloudflare and similar) block automated visitors. Citation Rocket identifies itself as `CitationRocketBot/2.0` and falls back to secondary readers (Jina, then a basic fetch), but a fully locked-down site may yield little or no page content.
- **JavaScript-heavy sites** (Webflow, Framer, Next.js) rely on Firecrawl for paid plans; if that and the fallbacks fail, the audit may only see the homepage or return empty content.
- **Lifetime (AppSumo) plan uses the free scraping path** (Jina Reader → basic fetch) and **skips paid Firecrawl** to keep the one-time-purchase model cost-safe. JS-heavy sites may therefore read less completely on Lifetime than on paid monthly/annual plans.
- For safety, the tool **blocks internal/private URLs** (SSRF protection), so it can only audit public websites.

## 2. When scraping fails, scores are estimated
- If content detection fails but the site is clearly large, the scoring engine applies **"confidence floors"** rather than returning a zero (e.g., a scale floor of ~45–55 points for big sitemaps, an authority floor of ~45 if there are several subdomains).
- This means a blocked but obviously substantial site gets a **reasonable estimate**, not a true reading. It's a safeguard, but it's not the same as a full analysis.

## 3. Scoring is a model, not absolute truth
- Scores are **zero-based earned points**: the site starts at 0 and earns points for detected signals (schema, how-to guides, case studies, etc.).
- Scores are normalized against **industry benchmarks**, so the same site can score differently depending on its detected industry.
- A small **±3 point jitter** is applied across platforms so ChatGPT/Perplexity/Gemini/Claude don't show identical numbers — expect small platform-to-platform variation by design.

## 4. Live AI citation data depends on Perplexity
- The "AI Citation Snapshot" is powered by the **Perplexity Sonar** API.
- If Perplexity is rate-limited or down (401/429/500), **the audit still completes but without live citation data** for that run.
- Results reflect what AI answered **at that moment** — AI answers change over time, so snapshots are a point-in-time reading, not a permanent verdict.

## 5. AI-generated content caveats
- Company intelligence, topics, and parts of the analysis are AI-generated and can occasionally be **wrong or generic** — which is why the Step 2 confirmation screen lets users correct industry, keywords, and competitors before the full audit.

## 6. Billing edge cases
- Plan changes depend entirely on **Dodo webhooks** arriving with correct metadata (`user_id`, `plan_name`) and a matching `DODO_WEBHOOK_SECRET`. Misconfiguration means the account won't update.
- **Fixed-amount discount coupons are not supported** — only percentage-based discounts sync to Dodo.
- Downgrades are **not instant** (they apply at period end) by design.

## 7. Operational dependencies
The product needs these external services to be healthy: **Perplexity** (citations & research), **OpenAI/OpenRouter** (analysis), **Firecrawl** (scraping JS sites — paid plans only), **Jina Reader** (free scraping path for Lifetime plan), **Dodo Payments** (billing), **Firebase** (auth + database), and an **email provider** (Resend / Loops) for alerts. An outage in any of these degrades the related feature.

**Lifetime (AppSumo) plan is bring-your-own-key (BYOK):** it requires the user's own OpenRouter key (added in Profile → API Configuration) and never falls back to the platform key. Audits, re-audits, citation refreshes, and AEO file generation return an `APPSUMO_KEY_REQUIRED` error (HTTP 400) for a Lifetime user who has not added a key.

## 8. Admin data operations need a secret
Bulk admin database operations (via the Firebase Admin SDK) **silently run with limited privileges unless `FIREBASE_SERVICE_ACCOUNT` is set.** It is currently set — but if it's ever removed, admin user/audit management will fail quietly.
