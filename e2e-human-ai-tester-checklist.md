# End-to-End Human + AI Tester Checklist

## Purpose

This is the execution list for testing the product like a real user. It is not a code review. The testers must perform each item, record the result, and attach evidence for every failure.

## Tester rules

- Test in a fresh browser profile/incognito when the case says “logged out.”
- Do not use real customer data.
- Do not submit a real card.
- The current server Dodo client is configured for `live_mode`, so checkout testing must stop unless a separate Dodo sandbox/test environment and test products are configured.
- For every failed test, record:
  - Test ID
  - Exact URL
  - Account/role used
  - Steps taken
  - Expected result
  - Actual result
  - Screenshot or screen recording
  - Browser console and network error
  - Timestamp and environment

## Required test fixtures

Create or obtain these before testing:

| Fixture | Purpose |
| --- | --- |
| Guest/incognito browser | Public pages, login gates, direct API checks |
| New free test account | Signup, onboarding, free-plan limits |
| Regular paid test account | Plan-gated features, billing, profile |
| Second regular test account | Cross-account authorization tests |
| Admin account `hello@pressense.co` | Admin dashboard and admin-only share flow |
| Test website with normal HTML | Successful audit |
| Test website that blocks bots | Scrape failure/partial-result behavior |
| Test website with thin content | Unknown/low-content classification behavior |
| Dodo sandbox products and webhook secret | Checkout tests only; do not use live products |
| Chrome test profile | Extension install and capture tests |

## Result labels

- `PASS` — expected result happened and evidence was captured.
- `FAIL` — behavior is wrong, broken, insecure, or misleading.
- `BLOCKED` — environment/account/payment dependency prevented testing.
- `NOT APPLICABLE` — only when the test genuinely does not apply.

# Part 1 — Guest and authentication tests

## G-001 Home page loads logged out

1. Open `/` in incognito.
2. Confirm the page loads without console errors.
3. Confirm the logo, navigation, help link, pricing/get-started CTA, audit URL form, footer, and legal text render.
4. Resize to mobile width and desktop width.

Expected:

- No authentication is required to view the landing page.
- No broken images, overflowing text, or unusable controls.
- Audit submission either asks the visitor to sign in or opens the intended signup/login flow.

## G-002 Login modal

1. Open Sign In.
2. Test invalid email/password.
3. Test empty fields.
4. Test valid test credentials.
5. Test closing and reopening the modal.
6. Test Google sign-in in a browser where the popup is allowed.

Expected:

- Invalid credentials show a useful error.
- Submit buttons cannot be repeatedly double-submitted.
- Successful login returns to the intended page.
- Refresh preserves the authenticated session.
- Logout removes access to protected screens.

## G-003 Signup modal

1. Test invalid email.
2. Test weak/mismatched password.
3. Test duplicate email.
4. Test valid signup with a new test account.
5. Confirm the user document is created and the dashboard opens.
6. Confirm the welcome-email flow does not block signup if email delivery is unavailable.

## G-004 Direct protected-route access

While logged out, open each:

- `/dashboard`
- `/profile`
- `/audit/<known-audit-id>`
- `/admin`
- `/batch-test`
- `/extension-auth`

Expected:

- The user is redirected or shown a login gate.
- No private audit, profile, billing, admin, or user data is rendered.

## G-005 Direct public routes

Test:

- `/pricing`
- `/help`
- `/coming-soon`
- `/payment-success`
- `/payment-cancelled`
- `/share/<valid-token>`
- `/share/<invalid-token>`
- an unknown URL

Expected:

- Public screens load without login.
- Invalid/revoked share links show a clear not-found/revoked message.
- The unknown URL shows the not-found screen.

# Part 2 — Home and audit creation

## H-001 Valid audit form

1. Log in as the free test user.
2. Enter a valid HTTPS website.
3. Submit.
4. Confirm loading/progress states are visible.
5. Confirm the audit moves through the company-intelligence confirmation flow.
6. Confirm the user can review/edit the business context.
7. Confirm the full audit completes.
8. Confirm the result is saved.
9. Refresh and reopen it from the dashboard.

Expected:

- The URL is validated.
- Progress does not get stuck at 100%.
- The final screen identifies the correct company and industry.
- Saved data matches the completed run.

## H-002 Invalid and hostile URLs

Test:

- Empty URL
- `example.com` without protocol
- malformed URL
- `javascript:...`
- `file:///...`
- localhost/private-network URL
- very long URL
- a URL with query parameters/fragments

Expected:

- Invalid or unsafe URLs are rejected.
- The app never fetches local/private-network resources through the server.
- Errors are user-readable and do not expose stack traces/secrets.

## H-003 Audit failure states

Run against:

- bot-blocked website
- timeout-prone website
- empty/thin-content website
- website with invalid TLS/redirect behavior
- website returning 4xx/5xx

Expected:

- The request finishes within a bounded time.
- A partial result is clearly labeled as partial.
- The app does not silently present missing topics as complete.
- Retry/restart behavior is clear.
- No generic upstream error hides the real cause.

## H-004 Usage limits

For each plan fixture:

- Run audits until the monthly limit is reached.
- Attempt one additional audit.
- Refresh the page and retry.
- Test a plan whose limit is unlimited.

Expected:

- Client and server enforce the same limit.
- The user cannot bypass the limit by changing browser state or request body.
- The message says what limit was reached and how to upgrade.
- Usage counters update exactly once per successful audit.

# Part 3 — Audit result screen

## R-001 Core score display

Confirm the result contains:

- Overall AI readiness score
- ChatGPT score
- Perplexity score
- Gemini score
- Claude score
- Letter grade
- Score explanation
- Strengths
- Weaknesses
- Company intelligence
- Industry benchmark when available

Expected:

- Scores are numbers in the expected range.
- Missing optional data does not crash the page.
- The displayed website/company matches the scanned website.

## R-002 Citation snapshot

1. Open an audit with citation data.
2. Inspect prompt count, mention count, mention rate, competitors, prompt results, and date.
3. Open an audit with no citation data.

Expected:

- Counts and percentages are internally consistent.
- Long responses wrap/scroll correctly.
- Missing citation data shows an intentional empty state.

## R-003 Topics

1. Open every topic category:
   - Authoritative
   - Thought Leadership
   - Competitive Advantage
   - Emerging Opportunity
2. Expand/collapse topic details.
3. Test an audit with fewer topics than requested.
4. Confirm the partial-topics warning is visible on a fresh result.
5. Reopen the saved audit and confirm the warning remains visible.

Expected:

- Categories do not display duplicate or empty cards unexpectedly.
- Partial generation is not presented as a full requested count.
- The warning survives save/reopen.

## R-004 Blueprint, benchmark, competitors, and recommendations

Verify each section loads when data exists and shows a safe empty state when absent:

- AEO blueprint score
- Company intelligence
- Competitor analysis
- Market context
- Industry benchmark
- Recommendations
- Fix-it playbook
- Quick Wins checklist
- Schema generator

Expected:

- Sections do not display fake placeholder claims.
- Plan gating is clear.
- Buttons show loading and error states.

## R-005 Export actions

Test:

- Save as PDF
- Export CSV
- Share PDF report
- Generate AEO files

For each:

- Test allowed plan.
- Test disallowed plan.
- Test double-click.
- Test a large audit.
- Test browser download permissions.

Expected:

- Download has the correct filename and content.
- Restricted actions do not execute server work before showing the upgrade gate.
- Failed generation leaves the user with a retryable error.

# Part 4 — Dashboard and saved audits

## D-001 Dashboard loading

Verify:

- Current plan
- Usage count
- Audit limit
- Audit history
- Empty state for a new account
- Loading state
- Error state
- Pagination/limit behavior if more than the visible number of audits exists

## D-002 Audit ownership

1. Log in as user A.
2. Open user B’s known audit ID directly.
3. Try the same through browser navigation and direct API calls.

Expected:

- User A cannot see or mutate user B’s audit.
- No private fields leak in the response.

## D-003 Audit detail actions

Test:

- Back to dashboard
- Re-audit
- Citation refresh
- Checklist load
- Checklist item completion/uncompletion
- Score history
- PDF/CSV/share actions
- Browser refresh during each loading state

Expected:

- Every action checks ownership server-side.
- Re-audit and citation refresh cannot be double-submitted.
- Checklist state persists after refresh.
- Failure messages identify the action that failed.

# Part 5 — Public audit sharing

## S-001 Admin enables sharing

1. Log in as `hello@pressense.co`.
2. Open a saved audit.
3. Confirm the admin-only share panel is visible.
4. Enable the public link.
5. Copy the link.
6. Copy the iframe snippet.
7. Open the link in incognito.

Expected:

- The link is unguessable.
- The public page loads without login.
- It shows only the intended report information.
- It has no account, billing, edit, re-audit, checklist mutation, or owner controls.

## S-002 Non-admin cannot share

1. Log in as a regular user.
2. Open that user’s audit.
3. Confirm the share control is hidden.
4. Directly call the enable/revoke endpoints with the regular user’s auth token.

Expected:

- UI control is absent.
- Both endpoints return `403`.

## S-003 Revoke behavior

1. Enable a share link.
2. Confirm it works in incognito.
3. Revoke it from the admin audit page.
4. Reopen the old URL in incognito.

Expected:

- The old URL returns a clear not-found/revoked result.
- No cached report remains visible after reload.

## S-004 Iframe behavior

1. Place the share URL in an iframe on a different-origin test page.
2. Test desktop and mobile iframe sizes.
3. Inspect response headers.

Expected:

- The share route loads inside the iframe.
- Normal application routes remain protected from external framing.
- No horizontal overflow makes the report unusable.

# Part 6 — Pricing, checkout, and billing

## B-001 Pricing page

Verify:

- Free, Starter, Pro, Enterprise cards
- Monthly/annual toggle
- Prices match `/api/pricing/plans`
- Feature lists match backend plan settings
- Current-plan label
- Coupon entry and validation
- AppSumo redemption
- Custom plans
- Loading and API failure states
- Mobile layout

## B-002 Checkout preparation

Before testing, confirm:

- Dodo test/sandbox environment is active.
- Test product IDs are not live product IDs.
- Test webhook secret is configured.
- Test Firebase project/database is isolated.

If any item is false: mark all payment tests `BLOCKED`, not `PASS`.

## B-003 Checkout with sandbox card

For every paid plan and billing period:

1. Start checkout as a free user.
2. Confirm correct product and amount.
3. Submit the provider’s official sandbox success card.
4. Return through payment-success.
5. Confirm Firestore plan/status/billing period.
6. Confirm entitlements update.
7. Confirm email behavior.

## B-004 Payment failure/cancel

Test:

- Declined sandbox card
- Insufficient-funds sandbox card
- Cancel on provider checkout
- Network interruption
- Refresh payment-success
- Reopen payment-success without a valid session

Expected:

- No plan upgrade occurs on failed/cancelled payment.
- The user sees a useful recovery path.
- Webhook retry/replay does not duplicate state or email.

## B-005 Plan changes

Test:

- Starter → Pro
- Pro → Enterprise
- Enterprise → lower plan
- Monthly → annual
- Annual → monthly
- Cancel pending downgrade
- Refresh before/after webhook arrival
- Delayed webhook

Expected:

- Server verifies ownership and current state.
- Plan changes are idempotent.
- Invoice/billing history remains correct.
- UI does not claim success before confirmed payment where payment is required.

# Part 7 — Profile and account settings

## P-001 Profile basics

Test:

- Display name
- Photo/custom photo
- Bio
- Email/provider display
- Password/security actions
- Logout
- Refresh persistence

## P-002 Subscription and invoices

Verify:

- Current plan/status
- Start/end dates
- Billing period
- Upgrade/downgrade controls
- Pending change
- Cancel pending downgrade
- Invoice history
- Empty invoice state
- Switching plans does not make invoice history silently disappear

## P-003 API configuration

Test:

- Save valid BYOK key in isolated test account
- Reject invalid key format
- Invalid provider key
- Remove/replace key
- Reload and verify masked display
- Confirm account B cannot see account A’s key status

# Part 8 — Admin dashboard

As admin, test every panel:

## A-001 User management

- Search
- Filter by plan
- View user
- Change plan
- Change status
- Reset usage
- Delete user
- Confirm confirmation dialogs and error handling

## A-002 Subscription management

- View subscriptions
- Filter/search
- Update a test account
- Confirm audit and billing state remain consistent

## A-003 Coupon management

- Create percentage coupon
- Reject invalid percentage
- Reject unsupported fixed discount
- Apply coupon on pricing page
- Enforce expiration/max-use/applicable-plan behavior
- Disable/delete coupon

## A-004 Plan management

- List plans
- Create custom plan
- Validate name/slug/price/billing type
- Edit plan
- Change price
- Deactivate plan
- Permanently delete test plan
- Confirm non-admin access is denied

## A-005 Prompt management

- Load prompt
- Edit prompt
- Save
- Cancel unsaved changes
- Refresh and confirm persistence
- Test malformed/empty prompt errors

## A-006 Email templates

- Load templates
- Edit subject/body/CTA/footer
- Save
- Refresh persistence
- Verify template variables render safely

## A-007 Home content/settings

- Load home content
- Edit each editable field
- Save/reload
- Confirm malformed content does not break the public home page

## A-008 Analytics/API monitoring/usage

- Load dashboards
- Empty data state
- Date/filter controls
- Error state
- Confirm no private user data is exposed to non-admin users

## A-009 System health and demo manager

- Load system health
- Known-error display
- Seed demo data
- Clear demo data
- Confirm destructive operations require confirmation
- Confirm demo mode cannot affect real customer data

# Part 9 — Batch audit and extension

## X-001 Batch test screen

- Open screen as allowed user
- Submit valid batch
- Multiple URLs
- Duplicate URLs
- Invalid URL among valid URLs
- Partial batch failure
- Cancellation/navigation during batch
- Results save and reopen

## X-002 Chrome extension authentication

- Open extension auth route logged out
- Complete auth handoff
- Reload extension
- Scan a page
- Capture page data
- Analyze captured data
- Site with CORS restrictions
- Site blocking scraping
- Expired login token

Expected:

- Content-script requests use the background-worker path where required.
- No page data or auth token is leaked to an unrelated origin.
- Extension failures are visible and recoverable.

# Part 10 — API/security regression suite

For every authenticated API route:

- No Authorization header → `401`
- Invalid/expired token → `401`
- User A token with User B ID → `403` or safe denial
- Valid owner token → expected success
- Malformed JSON/body → `400`
- Oversized input → safe rejection
- Repeated request/double click → idempotent or safely rejected

For every admin route:

- Guest → `401`
- Regular authenticated user → `403`
- Admin → expected success

For every public endpoint:

- No token required only where intended
- No user ID/email/billing/secret leakage
- Rate limiting where abuse is possible
- CORS and iframe headers match the route’s intended policy

# Required final tester report format

## Summary

- Environment and build/version
- Tester identity: human or AI
- Start/end time
- Total tests
- Passed
- Failed
- Blocked
- Not applicable

## Bug record

```text
Bug ID:
Severity: Critical / High / Medium / Low
Test ID:
Role/account:
URL:
Steps:
Expected:
Actual:
Reproducible: Yes / No
Evidence:
Security or data impact:
Suggested fix:
```

## Release decision

Choose exactly one:

- `READY`
- `READY WITH ACCEPTED LOW-RISK ISSUES`
- `BLOCKED — FIX REQUIRED`
- `BLOCKED — TEST ENVIRONMENT INCOMPLETE`