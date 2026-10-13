---
name: Blueprint scoring universality
description: How to keep the extension/blueprint AI-readiness scorer fair across site categories (medical, news, gov, edu, SaaS, ecommerce) without site-specific hacks.
---

# Blueprint scoring must be category-universal

The blueprint scorer (`server/blueprint-orchestrator.ts` + `eeat-detector.ts`,
`offsite-scanner.ts`, `answer-capsule-engine.ts`) once inverted rankings — an
authoritative institution (Mayo Clinic) scored *below* a tiny SaaS. Root causes
and the durable rules to keep it fair:

- **Schema must match by TYPE FAMILY, not exact string.** Crediting only generic
  `Article`/`Organization` silently zeroes out authoritative sites that use
  subtypes (`MedicalWebPage`, `NewsArticle`, `MedicalOrganization`, `Hospital`,
  `NewsMediaOrganization`, …). Match against an org-family / article-family set.

- **Authorship ≠ individual Person byline.** Trusted institutions signal authorship
  via editorial/review processes ("Medically reviewed by", "fact-checked by",
  "X Staff", "Editorial Team", or JSON-LD author/reviewedBy = Organization). Credit
  these as a byline. **But** keep the patterns *attribution-specific* — generic
  footer links like "Editorial Policy"/"Editorial Guidelines" must NOT grant byline
  credit (high false-positive risk).

- **Do not penalize a signal that doesn't apply to the category.** Product-review
  platforms (G2/Capterra/Trustpilot) are irrelevant for hospitals/gov/news. When a
  category is non-reviewable, FOLD the review weight into entity authority so the
  off-site module max (30) stays reachable from authority alone instead of being
  unreachable. Detect non-reviewable via on-page institutional schema, institutional
  TLD (`.gov/.edu/.mil/.int`, `.gov.uk/.ac.uk/.edu.au`), or industry keywords.
  **Why TLD matters:** the extension route usually sends an EMPTY industry string,
  so schema + TLD are the only reliable institutional signals at scan time.

- **Entity-foundation max must be reachable WITHOUT the Google KG API key** (it is
  often unset). Weight Wikidata/Wikipedia/Crunchbase/LinkedIn so the cap is hit
  from free sources.

- **Enforce per-pillar sub-caps BEFORE summing the module score.** E-E-A-T sums
  experience+expertise+authority+trust then `Math.min(35,…)`. If you add a new
  signal to a pillar, re-check that pillar can't exceed its own sub-cap (e.g.
  expertise ≤ 9) — otherwise one pillar steals budget from others. Cap each pillar,
  then sum the capped values.

## Validation gotcha
Server-side `fetch`/`curl` of bot-protected sites (Mayo Clinic, many news/医 sites)
returns "Access Denied" (~tiny body), so a server-fetch validation harness scores
them near zero — a FETCH ARTIFACT, not a scoring bug. The browser extension sends
the real rendered DOM, so validate scoring logic with **synthetic representative
HTML** (or the extension path), never server-side fetch of protected domains.
