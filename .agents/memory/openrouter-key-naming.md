---
name: OpenRouter key naming migration
description: Where platform/BYOK API key names live now that everything runs on OpenRouter, and how legacy "Perplexity" naming is aliased for migration.
---

The platform's LLM key resolution and a user's BYOK key were historically named after "Perplexity" even though the actual provider is OpenRouter. This is now OpenRouter-only end to end, with old field/env names kept solely as a read fallback for pre-migration data — never reintroduce a Perplexity-named env var or field as anything but that.

**Why:** a plaintext env var literally named after the wrong provider was actually functioning as the platform's real fallback key, which caused real confusion and risked an outage if someone "cleaned up" the wrong-looking var.

**How to apply:** when a component needs the platform or a user's AI key, resolve it from the OpenRouter-named source; treat any Perplexity-named field/env var you encounter as legacy compat only, not the source of truth.

Note: the admin usage/analytics dashboard still labels OpenRouter spend/status as "Perplexity" — same confusion, different surface, deliberately left for a separate pass.
