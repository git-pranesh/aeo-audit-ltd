# User Guide — For Subscribers (Customers)

This walks a normal paying customer through the whole tool, screen by screen.

---

## 1. Getting in

- **Home page (`/`)** — This is the front door. There's a headline explaining the product and a box to run an audit.
- **Sign up / Log in** — Click sign up or log in (powered by Firebase). You can create an account with email/password. You'll need an account to save audits and manage a subscription.

---

## 2. Running your first audit

On the home page (or your dashboard), you run an audit in **two steps**:

**Step 1 — Enter your website.** Type in your website URL and start. The tool quickly analyzes your company to figure out your industry, what you do, and your value proposition.

**Step 2 — Confirm the details.** A pop-up (the "Business Context" box) shows what the tool guessed — your **industry, target keywords, and competitors**. You can edit any of these to make the report more accurate. When you confirm, the full audit runs.

> The full audit takes a couple of minutes. It scrapes your site, scores it, generates topics and your playbook, and runs the live AI citation check. You'll see rotating status messages while it works.

---

## 3. Reading your report (`/audit/:auditId`)

Your report is one long page with these sections:

| Section | What it tells you |
| :--- | :--- |
| **Overall Score & Grade** | Your AI readiness from 0–100 with a letter grade. |
| **Platform Scores** | Separate scores for ChatGPT, Perplexity, Gemini, Claude. |
| **Score Explanation** | Which content signals you have vs. miss (FAQs, case studies, schema, etc.). |
| **AI Citation Snapshot** | Your mention rate, the exact prompts tested, and competitors AI recommended. |
| **Industry Benchmarks** | How your scores compare to your industry's norm. |
| **AI Readiness Topics** | Content ideas in 4 categories to earn citations. |
| **Fix-It Playbook** | Your prioritized, step-by-step improvement plan. |
| **Quick Wins Checklist** | The highest-impact tasks — check them off as you go. |

You can **export the report to PDF** from this page.

---

## 4. Your dashboard (`/dashboard`)

This is your home base after logging in:
- **Audit history** — every past audit with its score and date.
- **Domain management** — filter audits by website, and see how many of your allowed domains you've used.
- **Re-audit** — re-run an audit to measure progress (available on paid plans). Your checked-off items and progress are preserved.

---

## 5. Managing your account (`/profile`)

Everything about your account lives here, in tabs:

| Tab | What you do |
| :--- | :--- |
| **Profile** | Change your display name and photo. |
| **Security** | Reset your password, or delete your account. |
| **Subscription** | See your current plan and status; **upgrade, downgrade, or cancel**. |
| **Billing** | See your card on file, and download past invoices (PDF). |
| **Usage** | See how many audits you've used against your monthly limit. |
| **API Configuration** | (Lifetime/AppSumo users) Add your own AI API key if your plan requires it. This tab only shows when your plan needs a key. |
| **Notifications** | Manage your email notification preferences (e.g. citation-alert emails). |

> There are **7 tabs** in the code (`client/src/pages/profile.tsx`): Profile, Security, Subscription, API Configuration, Billing, Usage, Notifications. API Configuration is shown conditionally.

---

## 6. Changing your plan

Go to **Profile → Subscription** and open the plan-change option:
- **Upgrading** takes effect **immediately** once payment goes through (handled by Dodo Payments). You get the higher limits right away.
- **Downgrading** is scheduled to take effect **at the end of your current billing period** — you keep your current features until then.
- **Cancelling** keeps your access until the end of the period you already paid for; it doesn't cut you off instantly.

See [04 — Plans & Billing](04-plans-and-billing.md) for the exact limits of each plan.

---

## 7. What "limits" you'll actually run into
- If you hit your **monthly audit limit**, the tool blocks a new audit and shows a message inviting you to upgrade.
- If you try to add more **domains** than your plan allows, you'll be limited.
- Some features (re-audit button, citation alerts, white-label PDF, score-trend export, more topic ideas) simply **won't appear or will be locked** unless your plan includes them.
