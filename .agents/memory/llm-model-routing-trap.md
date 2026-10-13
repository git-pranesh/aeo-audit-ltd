---
name: LLM model-routing trap (MODEL_MAP has dead entries)
description: Which model actually runs a task is NOT determined by MODEL_MAP alone — some entries are dead code; verify the call site.
---

# The trap
`server/llm-router.ts` exports a `MODEL_MAP` keyed by task (companyResearch, competitorAnalysis, topicGeneration, citationSnapshot, contentVerification, …). It is tempting to read `MODEL_MAP.<task>` and declare "task X uses model Y". **This is wrong for at least one task.**

`MODEL_MAP.contentVerification = 'deepseek/deepseek-v4-flash'` is **dead code**: no `llmCall({ task: 'contentVerification' })` call site exists. The only tasks actually passed to `llmCall` are companyResearch, competitorAnalysis, topicGeneration, citationSnapshot.

Content-type verification is instead a **direct OpenAI SDK call** in `server/content-verification-service.ts` using `model: 'gpt-4.1-nano'`, invoked from the batch audit in `server/routes.ts` via `verifyAllContentTypes()`.

**Why:** A prior docs-audit verdict (based on reading MODEL_MAP alone) concluded content verification ran on DeepSeek and had to be reversed once the real call site was traced. Cost real rework and a wrong published claim.

**How to apply:** To state which model runs a task, grep for the actual call site (`rg "task: '"` for llm-router usage, and grep the service file for a direct `model:` literal). Never trust a map entry without confirming an invocation. `gpt-4.1-nano` (and other tokens with dots/dashes) are MANGLED in `rg` terminal output — trust the `read` tool for exact identifiers.
