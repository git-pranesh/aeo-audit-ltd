# Plans, Limits & Billing

Every number here is verified against the code (`shared/feature-flags.ts`, `client/src/lib/firestore-utils.ts`, `server/subscription-service.ts`) **and the live admin settings record** (`system/planSettings` in the database), which overrides code defaults and is the real source of truth for audit limits and prices.

---

## Pricing

| Plan | Monthly | Annual | Notes |
| :--- | :--- | :--- | :--- |
| **Free** | $0 | $0 | Default for new signups |
| **Starter** | $49 | $490/yr | ~20% saving on annual |
| **Pro** | $149 | $1,490/yr | ~20% saving on annual |
| **Enterprise** | $299 (live setting) | $2,990/yr | ✅ Code reconciled to $299 everywhere on July 8, 2026 |
| **Lifetime** | one-time (AppSumo) | — | Sold via AppSumo. **BYOK** (own OpenRouter key required) + free scraping path (no Firecrawl) |

> Prices and limits are overridden live by an admin via the `system/planSettings` database record — that record is the source of truth. The values above are the live database values as of July 2026.

---

## Full feature/limit comparison

| Feature | Free | Starter | Pro | Enterprise | Lifetime |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Audits / month** (live values) | 1 | 15 | 30 | 50 | Unlimited (BYOK — runs on user's own key) |
| **Domains** | 1 | 5 | Unlimited | Unlimited | Unlimited |
| **Re-audit button** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Monthly re-audit** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Topic ideas / category** | 3 | 12 | 25 | 100 | 25 |
| **Competitors tracked** | 0 | 3 | Unlimited | Unlimited | Unlimited |
| **Fix-It Playbook depth** | Basic | Full | Full + Priority | Full + White-label | Full + Priority |
| **Quick Wins shown** | 3 | Unlimited | Unlimited | Unlimited | Unlimited |
| **Citation monitoring** | None | Monthly | Weekly | Daily | Weekly |
| **Citation alert emails** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Citation refresh button** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **PDF export** | Watermarked | Clean | White-label | White-label | White-label |
| **Full-audit CSV download** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Score-trend CSV export** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Schema snippets shown in audit report** | 1 | Unlimited | Unlimited | Unlimited | Unlimited |
| **AEO file ZIP download** | ❌ | ❌ | ✅ | ✅ | ✅ |

---

## How limits actually behave in the software

These aren't just marketing lines — here's what a real user experiences:

- **Audit limit reached:** When a user has used their monthly audits (1 Free / 15 Starter / 30 Pro / 50 Enterprise, per live settings), the app **blocks the next audit** and shows: *"You've reached your monthly limit of N audits. Upgrade your plan for more audits."* Unlimited (Lifetime) is stored as `-1` internally and never blocks. ✅ As of July 8, 2026 this cap is enforced on the server too: the audit endpoint counts the user's audits this month and returns a 403 "Monthly audit limit reached" before running anything.
- **Domain limit:** Users can only run audits across the number of distinct websites their plan allows.
- **Locked features:** Things like the re-audit button, citation alerts, white-label PDF, and score-trend export are **hidden or disabled** in the UI when the plan doesn't include them.
- **Topic ideas / competitors:** The tool generates only up to the plan's cap.
- **Citation monitoring frequency:** A background scheduler re-checks citations at each plan's cadence — Starter monthly, Pro weekly, Enterprise daily. Free plans are skipped entirely.

---

## Upgrading & downgrading (how it works)

Payments run through **Dodo Payments**. Users manage this in **Profile → Subscription**.

### Upgrading (e.g., Starter → Pro)
- The user checks out via a Dodo checkout session.
- Once Dodo confirms payment (via webhook: `payment.succeeded` / `subscription.created`), the account is upgraded **immediately** — plan, status, and billing period are updated and higher limits apply right away.

### Downgrading (e.g., Pro → Starter)
- The change is **scheduled** (`pendingDowngrade`) and takes effect **at the end of the current billing period**. The user keeps their current, higher features until then — no refund of unused time, but no loss of paid-for access either.

### Cancelling
- When Dodo sends `subscription.cancelled`, the app sets the status to *cancelling* and **honors access until the paid period ends**. It does not cut the user off immediately.

### Important billing note
The whole flow depends on the **webhook** being correctly configured. The webhook URL is:

```
https://app.citationrocket.com/api/webhooks/dodo
```

Every event must carry the correct `user_id` and `plan_name` in its metadata, and the `DODO_WEBHOOK_SECRET` must match — otherwise the account won't update. Also, Dodo only supports **percentage-based** discount coupons; fixed-dollar coupons are ignored.
