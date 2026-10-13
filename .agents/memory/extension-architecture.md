---
name: Chrome extension (Citation Rocket v2) architecture gotchas
description: Durable rules for the sidebar extension — CORS/network fetches, scan capture, and dev/prod URL switching.
---

# Network fetches must run in the background service worker
Content-script `fetch()` is subject to the **page's** CORS, so fetching `https://<domain>/robots.txt` from a `www.` page is cross-origin and blocked. Do all cross-origin network calls (robots.txt, llms.txt, etc.) in `background.js` via a message handler — the service worker has `host_permissions: ["<all_urls>"]` and is exempt from page-origin CORS. The Reddit check already follows this pattern (opens a hidden Google tab in background).

**Why:** repeated CORS failures flooded the console and silently mis-scored Bot Access on every www site.
**How to apply:** never add a cross-origin `fetch` to `content.js`; route it through `chrome.runtime.sendMessage({action:...})` → background `onMessage` handler that `sendResponse(...)` and `return true`.

# Free-scan capture only fires if the whole audit object builds
`captureAnonymousData()` runs at the END of `runFullClientAudit()`. Any throw during audit-object construction (e.g. an undeclared variable) aborts before capture, so **zero** scans get saved and the panel shows "Could not analyze this page" via the `.catch` in the `runAudit` message handler. Treat "no Firebase records appearing" as a sign the scan is crashing earlier, not that capture is broken.

# Switching the extension between dev and prod needs FOUR coordinated changes
When pointing the extension at a different backend, all of these must change together or sign-in/capture breaks:
1. `content.js` `CR_CAPTURE_URL`
2. `side-panel.js` `CR_APP`
3. `manifest.json` `externally_connectable.matches`  ← needed for the web auth page to message the extension
4. `background.js` `onMessageExternal` `allowedOrigins`

**Why:** missing #3/#4 silently rejects `storeAuthToken` from the auth page, so sign-in (and therefore signed-in scan capture) fails even though free scans work.

# The extension-built server payload trades off two opposing limits
The server full audit regex-scans the HTML the extension sends, but the request body is capped (express.json limit, currently 300KB). Two opposite failure modes bit us:
- **Too little / wrong bytes:** a positional cutoff (`outerHTML.substring(0, N)`) drops late-page markup. Heavy pages put the author byline and ALL JSON-LD far down the document → false "No author byline" / "Missing schema".
- **Too much:** dumping the whole `<head>` overflows the body limit → server returns **413** and the signed-in full scan silently fails. Heavy sites inline hundreds of KB of CSS in `<head>` (ahrefs head alone ≈536KB).
**Rule:** never send the whole head and never rely on position. Build the payload from only high-signal markup — title, meta/canonical, every JSON-LD block, author/byline elements — then fill a byte budget with the body, and enforce a hard cap strictly below the server body limit. Whenever you change either side, keep the cap and the server limit in lockstep.

# JSON-LD must be `@graph`-unwrapped everywhere schema @type is read
Yoast / RankMath / most pro sites wrap all entities in one `{"@graph":[...]}` block with no top-level `@type`. Checking only top-level `@type` (or `[...].flat()`) misses Article/Organization/Person/FAQ entirely. Use a recursive flatten that descends into `@graph` (and arrays) and collects every node with an `@type`, and tolerate `@type` being an array. **Apply in lockstep across every schema reader** (client schema scorer + both server schema/E-E-A-T readers); fixing one and not the others reproduces the bug.

# Off-site entity signals must be domain-verified, never name-matched
Looking up Wikidata / Wikipedia / Google Knowledge Graph by brand NAME and taking the first hit produces confident false positives — a small brand collides with an unrelated same-ish-named entity (real case: "Tsenta" → a Chechen village's Wikidata QID; Wikipedia opensearch matched a place via substring). **Rule:** only credit an off-site entity when it is tied to the ACTUAL scanned domain — Wikidata via the P856 official-website claim, Google KG via the result's url, and derive Wikipedia existence from the *verified* entity's enwiki sitelink rather than a separate name search. This verification must live in one shared helper used by every entity reader so the loose path can't creep back in.
**Why:** name-similarity matching is the same class of bug in both directions — it caused false negatives (missed schema) and false positives (wrong entity). Tie signals to the domain, not the string.

# Entity-lookup recall depends on the real brand name, not the domain slug
The off-site/entity readers search Wikidata/Wikipedia/Google KG by a brand name. Deriving that name from the bare domain slug (`mayoclinic.org` → `Mayoclinic`, squished) makes the search return nothing for real multi-word brands → false "no entity found". **Rule:** derive the brand name from on-page signals in priority order — `og:site_name` (the Open Graph standard brand field) → JSON-LD publisher/Organization `name` → `<title>` trailing segment (split on spaced `|`/`-`/`–`/`—`) → domain slug fallback. The extension already sends all `<meta>` + JSON-LD, so this runs server-side in `/api/extension/analyze`.
**Why:** this is the precision/recall pair with the domain-verification rule above — better name = recall (find the entity); P856/domain match = precision (don't credit the wrong one). Improving the search name can't add false positives because the domain-verify gate stays authoritative; it only stops false negatives.

# The signed-in full analysis fires twice and can flicker found→not-found
`fetchSignedInData()` (which renders the off-site/E-E-A-T "locked-section") is triggered from BOTH the end of `renderResults()` and an explicit init call on panel open — so a single scan/open issues two concurrent `/api/extension/analyze` requests. The two responses can disagree: the off-site Wikidata/KG lookups can transiently time out and come back "not found", so whichever request finishes LAST wins the DOM, producing the user-visible "it worked, then vanished to not found in ~2s" flicker.
**Rule:** guard `fetchSignedInData` with (1) a per-page request key so a duplicate concurrent request for the same page is skipped and an already-successfully-rendered page isn't re-fetched, and (2) a monotonic sequence id so only the latest request may write the DOM (drop stale responses after each `await`). Reset the "already rendered" key on the paths that legitimately need fresh data — explicit user re-scan and re-auth/token-change — or those refreshes get stuck.
**Why:** the off-site lookup is non-deterministic under load/timeout, so two identical requests are not interchangeable; without de-dupe the slower flaky one clobbers the good one.

# Scan capture data model
Every scan = one doc in Firestore `extension_scans`. Free scans come through the **unauthenticated** `/api/extension/capture` (identity fields client-supplied → stored with `verified:false`). Signed-in full scans come through `/api/extension/analyze` (`requireAuth`, identity from `req.user` → `verified:true`). The anonymous `extension_signals` "moat" collection is still written from the capture route. Both server routes lazily init a secondary Firebase app named `extension-capture-app` from `VITE_FIREBASE_*` env vars.
