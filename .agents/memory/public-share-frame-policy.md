---
name: Scoped iframe/frame-ancestors policy for a single public route
description: How to make one route embeddable via iframe on external sites without loosening frame protection app-wide.
---

The app's global Helmet middleware sets `X-Frame-Options: SAMEORIGIN` and CSP with no `frame-ancestors` override (defaults to same-origin-only framing). When one specific route needs to be iframe-embeddable on external sites (e.g. a public share/marketing page) while the rest of the app must stay locked to same-origin framing:

- Don't loosen the global Helmet config. Instead, define two Helmet instances (a strict default and a permissive one with `frameAncestors: ["*"]` and `frameguard: false`), and pick between them in a path-matching middleware placed before both, e.g. `req.path.startsWith('/share/')`.
- This must be registered before the SPA catch-all/vite middleware, since Express applies middleware in registration order.

**Why:** Global CSP/X-Frame-Options changes are an easy way to accidentally make the whole app clickjacking-vulnerable or embeddable when only one marketing/prospect-facing page needs it.

**How to apply:** Any time a new "embed this page elsewhere" feature is requested, scope the permissive frame headers to only the new route's path prefix (both the HTML page and any API it calls), never touch the shared/global Helmet config.
