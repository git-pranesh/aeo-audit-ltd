---
name: Citation snapshot verification & offline LLM proof
description: How to runtime-prove LLM-backed pipelines offline, plus citation-history persistence scope.
---

# Offline runtime proof for LLM-backed pipelines

To get a *faithful* runtime proof of a pipeline that calls an LLM without spending
money or needing a key: stub `global.fetch` **before** invoking it. `llm-router.llmCall`
(server/llm-router.ts) is the single external I/O point and uses `global.fetch` at
call time, so overriding `global.fetch` to return a canned OpenRouter
`{choices:[{message:{content}}],usage:{...}}` response exercises the *entire real*
pipeline (e.g. generateCitationSnapshot → generatePrompts → checkMention →
extractCompetitors → aggregateCompetitors → mentionRate) with zero reimplementation.
Pass a dummy `apiKey`/byokKey — the mocked fetch ignores it.

**Why:** internal helpers (generatePrompts, checkMention, extractCompetitors,
aggregateCompetitors, isDue) are NOT exported, so you cannot import them directly;
running the exported entry point with a stubbed fetch is the honest way to execute
the real code. See docs/proofs/verify-citation.ts.

**How to apply:** reuse this pattern for any remaining docs-verification task whose
behavior is gated behind an LLM/network call (e.g. company intel, topics).

# Citation history persistence scope (non-obvious)

`saveCitationSnapshot` (audits/{auditId}/citationHistory) is called only for triggers
**initial** (batch audit), **manual** (refresh), and **scheduled**. The **re-audit**
path regenerates a snapshot into the audit doc but does NOT add a citationHistory
entry — so "stored for trend over time" covers those three triggers, not re-audits.
The `'reaudit'` CitationTrigger type exists but has no save call site.
