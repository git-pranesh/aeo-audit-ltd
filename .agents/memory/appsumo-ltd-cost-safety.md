---
name: AppSumo LTD cost-safety (BYOK + free scraping)
description: How lifetime/AppSumo plan avoids costing the platform money, and the invariants any new audit/scrape/AI entry point must uphold.
---

# AppSumo Lifetime (LTD) cost-safety

A one-time AppSumo purchase must never run indefinitely on the platform's own paid keys. Two independent guardrails enforce this:

## 1. Scraping: lifetime skips paid Firecrawl
- `scrapeWebsiteContent`/`scrapeWebsiteV2` take an optional `skipFirecrawl` flag. When true, the free path (Jina Reader → basic fetch) is used and **both** Firecrawl branches (primary + fallback) are bypassed.
- Every scrape entry point must pass `plan === 'lifetime'` for `skipFirecrawl`. Known entry points: batch audit, re-audit, `/api/generate-aeo-files`, and the public v1 API (`registerApiV1` injects it; v1 handlers derive it from `req.apiKeyPlan`).
- **Rule:** any NEW route that scrapes must resolve the server-side plan and pass `skipFirecrawl` for lifetime, or it silently leaks Firecrawl spend.

## 2. AI key: lifetime is BYOK, fail-closed
- `getPerplexityApiKeyForUser(userId?, knownPlan?)` returns the single OpenRouter key. Lifetime users MUST use their own stored key; there is **no platform-key fallback** for them.
- Pass `knownPlan` (the trusted server-side plan) whenever the caller already knows it. When `knownPlan === 'lifetime'` the function throws `APPSUMO_KEY_REQUIRED` on user-doc-missing AND on any Firestore read error — it fails closed so a transient error can never leak the platform key.
- **Why:** without `knownPlan`, a doc-read failure fell back to the platform key. Non-lifetime callers intentionally KEEP the platform fallback so a Firestore blip doesn't break paid users' audits — do not make everyone fail closed.
- Routes that surface this to users must map `APPSUMO_KEY_REQUIRED` → HTTP 400 (not 500) with an actionable message (add key in Profile → API Configuration). Missing this on citation-refresh once produced a generic 500.

## MOAT / data-capture note
Switching who-pays (BYOK) and how-scraped (Jina vs Firecrawl) does NOT change data capture. All audit results, citation snapshots, and score history still write to the Firestore `audits` collection regardless of plan; the Chrome extension capture path is untouched. The moat is the accumulated audit/citation dataset, not the scraping vendor.
