# Citation Rocket — Product Facts (Lifetime Edition)

This is the **single source of truth** for the website, ads, marketplace
listings and support replies. Every statement here is true of the code in this
repository. If marketing copy says something that is not in this document, it
is not a fact — change the copy or change the product first.

Last verified against the code: see the git log for this file.

---

## 1. What it is (one line)

An AI-search readiness audit for any public website: it reads your site, shows
what AI assistants can and can't use, checks whether AI search actually
mentions you, and gives you ready-made files and a prioritized plan to fix it —
paid once, running on your own OpenRouter key.

## 2. How it is sold

| | **Lifetime** | **Lifetime Agency** |
|---|---|---|
| Price | `[PRICE]` one-time | `[PRICE]` one-time |
| Accounts | 1 | 1 |
| Domains | Unlimited (fair use) | Unlimited (fair use) |
| Audits | 10 per 24 h · 3 per hour | 30 per 24 h · 10 per hour |
| Saved audits | Latest 25 | Latest 100 |
| PDF branding | Citation Rocket | Your agency: name, logo, accent colour, report title, footer/contact line |
| Everything else in §3 | ✓ | ✓ |

- **There is no free plan and no trial.** Anyone can create an account, but
  audits require an activated license.
- "Lifetime" means for the lifetime of the product (define this in your Terms).
- AI usage is paid by the customer to OpenRouter (see §5). Citation Rocket
  never uses its own AI key for customers.
- Direct purchases activate automatically when the buyer signs in with the
  purchase email (verified). Marketplace buyers enter a license code.
- One license per account; codes do not stack.

## 3. What every audit includes

**Flow:** enter a URL → we read the homepage and suggest business details
(name, industry, business type, audience, value proposition, keywords) → you
confirm or edit them and optionally add up to 3 competitors → the audit runs.
Typical run time in testing: **20–60 seconds** (up to ~2 minutes for slow sites).

| Section | What it is — factually |
|---|---|
| AI Readiness Score (0–100, letter grade) | Deterministic score from signals measured on your pages. Same site → same score, regardless of AI model. |
| Platform scores (ChatGPT, Perplexity, Gemini, Claude) | **Estimates** of how well your content matches what each assistant tends to cite, from on-site signals. Not measured rankings from those platforms. |
| Content & technical signals | Counted from up to **10 pages** we read plus your sitemap: FAQ sections, how-to/tutorial pages, blog posts, case studies, docs, data points, outbound citations, schema.org types (parsed JSON-LD/microdata), headings, images. Nothing is estimated or extrapolated. |
| AI crawler access | Your robots.txt checked for AI **search** crawlers (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, bingbot) and AI **training** crawlers (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, meta-externalagent). Blocked search crawlers become the #1 action. |
| AEO blueprint | Answer-capsule, E-E-A-T signals, schema completeness, freshness, entity/off-site presence (public checks such as Wikidata), llms.txt presence. |
| Industry benchmark | Your score next to **reference targets** for your industry. These are fixed reference values, not a live dataset of other companies (the report says so). |
| Strengths & areas to improve | Generated from the measured signals, filtered for your industry (a restaurant is not told to write API docs). |
| Fix-It Playbook | Prioritized actions with step-by-step instructions, effort/time estimates and code where relevant; targets adjusted to your industry. |
| Content topic ideas | **20** questions (5 each: Authoritative, Thought Leadership, Competitive Advantage, Emerging Opportunity) written by AI from your confirmed business details and measured gaps. Any number in a topic must appear on your own site. No search-volume data is used or shown. |
| Competitor comparison | Only if you add competitors (max 3): AI-written strengths, weaknesses and opportunities vs. those names. We do not auto-discover competitors. |
| AI Citation Check (optional, manual) | AI writes 8 real customer questions for your business (3 about your brand, 5 category questions that don't name you), then asks them to a live web-search AI (Perplexity Sonar via OpenRouter by default). Shows whether you were mentioned, the answer context, and which brands were named instead. Latest result only; no scheduled re-checks. |
| Re-audit | Run again any time; the report shows the change vs. your previous audit of the same domain. |
| Exports | PDF report and full CSV (generated in your browser). |
| AEO Pack (ZIP, 10 files) | See §4. |

## 4. AEO Pack contents (10 files)

Built only from facts found on your site (page titles, descriptions, real
paragraphs, a logo you declared, social profiles you link to, FAQ questions you
already show). Anything we could not verify is a `[REPLACE: …]` placeholder —
never invented text.

| File | What it is |
|---|---|
| `llms.txt` | Per the llmstxt.org format: name, summary, links to your key pages. |
| `llms-full.txt` | Readable text of the pages we read (main content only) + your FAQs. |
| `robots-patch.txt` | Allow rules for AI search crawlers; AI training crawlers as an optional commented section; your sitemap line only if we found a sitemap. |
| `schema/Organization.jsonld` | Name, URL, description, logo, sameAs (your social profiles), topics. |
| `schema/WebSite.jsonld` | Site name and URL. |
| `schema/FAQPage.jsonld` | From FAQs visible on your site; otherwise a template to fill in. |
| `schema/Article.jsonld` | Template for blog posts/articles. |
| `schema/BreadcrumbList.jsonld` | Template for inner pages. |
| `markdown-twins/homepage.md` | Plain-text version of your homepage. |
| `INSTRUCTIONS.md` | Where each file goes and how to install/validate it. |

Installing needs access to upload files to your site root and edit `<head>` /
robots.txt (CMS settings, hosting file manager, or a developer).

## 5. Bring your own key (BYOK)

- One OpenRouter key powers everything. Stored encrypted (AES-256-GCM); never
  shown again or sent back to the browser.
- Customers choose any OpenRouter text model in Settings, free to premium, with
  live prices shown. Scores don't depend on the model; it only writes the
  business-details suggestion, topic ideas, competitor comparison and citation
  questions.
- Defaults and **estimated** costs (from OpenRouter's live prices; actual bills
  vary with page size and model):
  - Audit: `deepseek/deepseek-v4-flash` — about **$0.002** (2 AI calls).
  - Citation check: question writer + 8 searches with `perplexity/sonar` — about **$0.05**.
- Free OpenRouter models work but are often rate-limited by their providers;
  the app tells the customer when that happens.
- We recommend a dedicated key with a low spending limit (e.g. $5).

## 6. What it does NOT do

- No free plan, trial, or free audits.
- No scheduled monitoring, background re-audits, alerts or emails.
- No Chrome extension. No public API. No team seats or client logins.
- No automatic competitor discovery. No search-volume or keyword-difficulty data.
- No measured rankings inside ChatGPT/Gemini/Claude; platform scores are estimates.
- Does not change your website — you install the files.
- Cannot audit sites behind logins or strong bot protection; the app reports
  this clearly and uses no AI credits.
- No branded HTML report or custom domain for agencies (PDF branding only).

## 7. Claims guide (marketing)

**OK to say**
- "Pay once. Runs on your own OpenRouter key — audits cost about a fifth of a cent in AI fees with the default model."
- "See which AI crawlers your robots.txt blocks — and the exact fix."
- "We ask a live AI search engine 8 real customer questions about your business and show who it recommends instead."
- "Download a 10-file AEO Pack built from your own site: llms.txt, schema markup, AI-crawler robots.txt rules, install guide."
- "20 content ideas written for your business, every audit."
- "Pick any AI model on OpenRouter — free to premium."
- "Agency license: your logo and colours on every PDF."

**Do not say**
- "Free audit", "free plan", "no credit card" (there is no free tier).
- "Monitoring", "alerts", "tracks over time" (only manual re-audit vs. previous).
- "Chrome extension", "API".
- "Your ChatGPT/Gemini/Claude ranking" (scores are estimates from your site).
- "Benchmarked against N companies" (reference targets).
- "Guaranteed citations", "rank #1 in ChatGPT".
- "The only tool…", "no other tool…" (unless you have verified every competitor and can prove it).
- "12 prompts", "15 pages", "11 files", "AGENTS.md included", "HowTo schema" (old product).
- "No developer needed" (installation needs access to your site files/head).

## 8. Website FAQ answers (factual)

**Does Citation Rocket actually check what AI says about me?**
Yes, if you run the optional Citation Check. It asks a live web-search AI 8
questions written for your business and shows whether you were mentioned and
who was recommended instead. It's a snapshot at that moment, not monitoring.

**What is the AEO Pack?**
A ZIP of 10 files built from your own site — llms.txt, llms-full.txt, schema
markup (Organization, WebSite, FAQ, plus Article/Breadcrumb templates),
robots.txt rules for AI crawlers, a Markdown copy of your homepage and install
instructions.

**How long does an audit take?**
Usually under a minute after you confirm your business details.

**Can it audit any website?**
Any public website. Sites behind a login or strong bot protection can't be
read; you'll see a clear message and no AI credits are used.

**Do I need an OpenRouter account?**
Yes. Create one at openrouter.ai, add a few dollars of credit and paste a key
in Settings. With the default model an audit costs about $0.002 in AI fees.

**Is there a white-label option?**
Yes — the Lifetime Agency license puts your agency name, logo, colours,
report title and contact line on PDF reports instead of Citation Rocket's.

**How is the score calculated?**
From signals measured on up to 10 of your pages and your sitemap: content
types, structure, schema markup, outbound citations and AI crawler access. It's
deterministic — the same site gets the same score.

**Is there a monthly fee?**
No. You pay once. AI usage is billed by OpenRouter to your own account.
