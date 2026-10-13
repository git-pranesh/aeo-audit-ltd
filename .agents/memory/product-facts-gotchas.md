---
name: Product facts gotchas
description: Non-obvious factual traps when describing Citation Rocket's features/plans to customers or in docs.
---

# Citation Rocket — factual gotchas

- **"White-label" PDF = unbranded, NOT custom-branded.** The whitelabel mode only *removes* Citation Rocket's own branding (footer URL + header). There is no logo upload / customer-brand insertion anywhere in `audit-pdf-generator.ts`. Never claim "your brand on the report."
  **Why:** the marketing doc originally said "your brand, not ours" — that was an overstatement flagged by the owner.

- **`replit.md`'s model list is stale.** It says gpt-4.1-nano for content verification + gpt-4o-mini orchestration. The live `server/llm-router.ts` MODEL_MAP actually uses **DeepSeek V4 Flash** for all extraction tasks (company intel, competitors, topics, playbook, content verification, schema), **Perplexity Sonar** for company research + citation snapshot, **Perplexity Sonar Pro** for deep research, and **GPT-4o-mini** only as fallback. Everything routed via OpenRouter. Trust llm-router.ts, not replit.md.

- **BYOK key is an OpenRouter key**, even though the stored field is historically named `perplexityApiKey`. Validated against openrouter.ai. Don't tell lifetime users to get a "Perplexity" key.

- **`BUG-XX` comments in server/ are all resolved FIX annotations**, not open bugs. The only genuinely unfinished paths are two Dodo billing TODOs: in-app cancellation and invoice fetch/download (subscription-management.tsx, billing-history.tsx).

- **Developer API is beta/unreleased, NOT sellable.** The 4 `/api/v1/*` endpoints work and any logged-in user auto-gets a `cr_live_` key via `/api/keys/me`, but `/api/keys/checkout` returns HTTP 503 ("API billing is not yet available"). So every key stays on the **Free 50 calls/month** quota — the 500/5000/20000 tiers in `api-key-service.ts` are unreachable in-app. Not on pricing page, no key-mgmt UI. Don't market it. (Profile → "API Configuration" is BYOK OpenRouter, a different thing.)

- **Never quote plan limits/prices from code defaults — read the live `system/planSettings` Firestore doc first.** It overrides code and the values genuinely differ: live audits/mo = Free 1 / Starter 15 / Pro 30 / Enterprise 50 / Lifetime -1 (code fallbacks say 10/-1/-1). Enterprise price was reconciled to **$299** across all code in July 2026 (previously $399 in 14 files).
  **Why:** the owner deliberately capped Pro/Ent via admin settings to control API costs; docs first shipped saying "unlimited" and were wrong.
  **How to apply:** use firebase-admin (FIREBASE_SERVICE_ACCOUNT) to read `system/planSettings` before writing anything about plans.

- **Monthly audit cap is enforced on BOTH client and server** (since July 2026). Client: `canUserRunAudit` counter check. Server: both full-audit endpoints (`/api/audit/batch` and legacy `/api/audit`) read `system/planSettings.<plan>.auditsPerMonth`, count the user's docs in the `audits` collection for the current calendar month (field is `timestamp`, not `generatedAt`; query by userId only + JS month filter to avoid a composite index), and 403 with `AUDIT_LIMIT_REACHED` before AI spend. Fail-open on check errors by design. Re-audits are NOT capped (deliberate open policy question). Topics are server-enforced via hardcoded `shared/feature-flags.ts` (so Lifetime topics = 25 even though planSettings says 100).

- **`docs/00-master-reference.md`** is the fact-checked single-source-of-truth doc for features/plans/limits/models (built by verifying against code AND the live planSettings doc, not the older docs).
- **AppSumo redemption is atomic** (since July 8, 2026): `redeemAppSumoCode()` uses a Firestore `runTransaction` — the isRedeemed check, code-marking, and user Lifetime upgrade are all-or-nothing. Code doc is located by query first (transactions can't query), then re-checked inside the transaction. Remaining edge: duplicate `appsumo` docs with the same code would each be independently redeemable (codes aren't unique at the data-model level).
- **Two different "schema" features — never conflate:** (1) schema snippets shown inside the audit report (Free sees 1, Starter+ see all, via `schemaGeneratorLimit`); (2) the AEO file ZIP download (`/api/generate-aeo-files`) which is server-gated to `['pro','enterprise','lifetime']` — Free AND Starter get 403. The UI shows the download button to everyone; blocked plans get an upgrade toast on click. Docs previously merged these into one misleading table row (fixed July 8, 2026).
