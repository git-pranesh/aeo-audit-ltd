---
name: AEO file download (ZIP) + scrape-route SSRF
description: Lessons from wiring the "Download AEO files" ZIP route and its URL guard.
---

## archiver major-version trap
`archiver@8` is ESM-only and **dropped the classic `archiver('zip', opts)` factory** — `await import('archiver')` yields only `{Archiver,JsonArchive,TarArchive,ZipArchive}`, no callable default, so any code using the factory throws "archiver is not a function". Pin to `archiver@7` (CommonJS); then `(await import('archiver')).default` is the factory under both tsx (dev) and esbuild `--format=esm --packages=external` (prod).
**Why:** spec/code and all common usage assume the v7 factory API.
**How to apply:** before using a CJS lib's default export via dynamic import, probe the shape under tsx; if a new major went ESM-only, prefer the last CJS major over rewriting call sites.

## SSRF on scrape-capable routes
Any route that fetches a user-supplied URL server-side (scraping) is an SSRF surface. The existing audit endpoints only do a DNS **existence** check — they do NOT block private/loopback/link-local ranges. New scrape routes must validate before fetching.
`server/url-guard.ts` `assertPublicUrl()` is the shared guard: rejects non-http(s), localhost, IP literals + DNS-resolved addresses in private/loopback/link-local/CGNAT/reserved ranges, and IPv4-mapped IPv6 in **both** dotted (`::ffff:127.0.0.1`) and hex (`::ffff:7f00:1`) forms.
**Why:** without full IPv6 expansion, hex-form mapped loopback (`::ffff:7f00:1`) silently bypasses a naive regex check — a real metadata/internal-service SSRF hole.
**How to apply:** route the URL through `assertPublicUrl` before any scrape/fetch; the audit endpoints are still unhardened, so retrofit them if touched.
