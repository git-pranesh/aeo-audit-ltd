# Autify AI Tester Prompts — Citation Rocket

## Before creating sessions

Use the published app URL:

```text
https://app.citationrocket.com
```

Create these Autify Memories first:

```text
{{FREE_TEST_EMAIL}}
{{FREE_TEST_PASSWORD}}
{{PAID_TEST_EMAIL}}
{{PAID_TEST_PASSWORD}}
{{SECOND_TEST_EMAIL}}
{{SECOND_TEST_PASSWORD}}
{{ADMIN_EMAIL}}
{{ADMIN_PASSWORD}}
{{KNOWN_AUDIT_ID}}
{{PUBLIC_AUDIT_URL}}
{{REVOKED_PUBLIC_AUDIT_URL}}
```

Use test accounts and test websites only. Do not place real passwords, API keys, or customer data directly into a prompt.

## Important billing restriction

Do not run the checkout prompts against the current production site. The application’s Dodo payment client is configured for live billing. Checkout can only be tested after a separate Dodo sandbox/test environment, test products, test webhook secret, and isolated test accounts are configured.

---

# Guest and authentication prompts

## AUTIFY-001 — Home page loads for a guest

```text
Open https://app.citationrocket.com
Confirm that the home page is displayed without requiring login
Confirm that the logo, navigation, help link, pricing link, sign-in control, get-started control, website URL field, audit CTA, and footer are visible
Resize the browser to a mobile-sized viewport
Confirm that the home page remains usable without horizontal scrolling
Resize the browser to a desktop-sized viewport
Confirm that the home page remains usable and no visible JavaScript error is shown
```

## AUTIFY-002 — Invalid login is rejected

```text
Open https://app.citationrocket.com
Click Sign In
Enter email address invalid-login@example.com and password WrongPassword123!
Submit the login form
Confirm that an authentication error is displayed
Confirm that the dashboard is not displayed
Confirm that no private user data is displayed
```

## AUTIFY-003 — Empty login fields are validated

```text
Open https://app.citationrocket.com
Click Sign In
Submit the login form without entering an email address or password
Confirm that validation messages identify the required fields
Confirm that the login request is not submitted
```

## AUTIFY-004 — Valid login reaches the dashboard

```text
Open https://app.citationrocket.com
Click Sign In
Enter email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Submit the login form
Confirm that the dashboard screen is displayed
Refresh the browser
Confirm that the user remains signed in
Confirm that the correct user plan and usage information are displayed
```

## AUTIFY-005 — Logout removes protected access

```text
Open https://app.citationrocket.com
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Confirm that the dashboard screen is displayed
Use the visible logout control
Confirm that the user is signed out
Open https://app.citationrocket.com/dashboard
Confirm that the user is redirected to login or the public home page
Confirm that no private dashboard data is displayed
```

## AUTIFY-006 — Guest cannot open protected routes

```text
Open https://app.citationrocket.com/dashboard
Confirm that login is required or that the browser is redirected to the public home page
Open https://app.citationrocket.com/profile
Confirm that login is required or that the browser is redirected to the public home page
Open https://app.citationrocket.com/admin
Confirm that login is required or that the browser is redirected to the public home page
Open https://app.citationrocket.com/batch-test
Confirm that login is required or that the browser is redirected to the public home page
```

## AUTIFY-007 — Signup validation

```text
Open https://app.citationrocket.com
Open the signup form
Submit the form with an invalid email address and mismatched passwords
Confirm that specific validation messages are displayed
Enter a new test email address and matching valid test passwords
Submit the signup form
Confirm that the new account reaches the dashboard or the intended email-verification state
Confirm that no uncaught JavaScript error is displayed
```

---

# Audit creation prompts

## AUTIFY-010 — Create a normal audit

```text
Open https://app.citationrocket.com
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Confirm that the dashboard screen is displayed
Open the audit creation flow
Enter website URL https://example.com
Submit the audit
Confirm that a visible loading or progress state is displayed
Confirm that the company-information confirmation step is displayed
Confirm that the detected company information is readable
Continue to the full audit
Wait for the audit to finish
Confirm that the audit results screen is displayed
Confirm that an overall score and platform scores are displayed
Confirm that the completed audit can be saved or opened from the dashboard
```

## AUTIFY-011 — Invalid website URL validation

```text
Open https://app.citationrocket.com
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Open the audit creation flow
Enter website URL not-a-url
Submit the audit
Confirm that a URL validation error is displayed
Confirm that the audit request is not started
Replace the URL with javascript:alert(1)
Submit the audit
Confirm that the unsafe URL is rejected
Confirm that no alert or script executes
```

## AUTIFY-012 — Audit failure is understandable

```text
Open https://app.citationrocket.com
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Open the audit creation flow
Enter the configured bot-blocked or unavailable test website URL
Submit the audit
Wait for the audit request to finish or fail
Confirm that the page does not remain indefinitely at 100 percent
If a partial result is returned, confirm that the result clearly says it is partial
If the request fails, confirm that the error identifies the failure and provides a retry path
Confirm that no stack trace, API key, or internal server detail is displayed
```

## AUTIFY-013 — Free-plan audit limit

```text
Open https://app.citationrocket.com
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Open the audit creation flow
Run audits until the displayed free-plan monthly limit is reached
Attempt one additional audit
Confirm that the additional audit is blocked
Confirm that the message identifies the plan limit and provides an upgrade path
Refresh the browser
Confirm that the usage count and limit remain consistent
```

---

# Dashboard and saved-audit prompts

## AUTIFY-020 — Dashboard contents

```text
Open https://app.citationrocket.com/dashboard
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Confirm that the dashboard displays the current plan
Confirm that the dashboard displays audit usage
Confirm that the dashboard displays the audit limit
Confirm that recent audits or the correct empty state are displayed
Confirm that loading and error states are not stuck
```

## AUTIFY-021 — Reopen a saved audit

```text
Open https://app.citationrocket.com/dashboard
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Open the saved audit identified by {{KNOWN_AUDIT_ID}}
Confirm that the audit detail screen is displayed
Confirm that the website URL matches the saved audit
Confirm that the overall score and platform scores match the saved audit
Refresh the browser
Confirm that the same audit remains displayed after refresh
```

## AUTIFY-022 — Users cannot open another user’s audit

```text
Open https://app.citationrocket.com/audit/{{KNOWN_AUDIT_ID}}
Sign in with email address {{SECOND_TEST_EMAIL}} and password {{SECOND_TEST_PASSWORD}}
Confirm that the audit is denied or the user is redirected away
Confirm that no score, company information, citation data, checklist, or private audit information is displayed
```

---

# Audit-results prompts

## AUTIFY-030 — Score and company intelligence sections

```text
Open https://app.citationrocket.com/audit/{{KNOWN_AUDIT_ID}}
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Confirm that Company Intelligence is displayed when data exists
Confirm that the business profile, target audience, value proposition, and market position are readable
Confirm that the Overall AI Readiness Score is displayed
Confirm that ChatGPT, Perplexity, Gemini, and Claude scores are displayed
Confirm that the letter grade and score explanation are displayed
Confirm that strengths and weaknesses are displayed when available
Confirm that no score is below 0 or above 100
```

## AUTIFY-031 — Topic categories

```text
Open https://app.citationrocket.com/audit/{{KNOWN_AUDIT_ID}}
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Open the Authoritative topic category
Confirm that topic cards are displayed or that an intentional empty state is displayed
Open the Thought Leadership topic category
Confirm that topic cards are displayed or that an intentional empty state is displayed
Open the Competitive Advantage topic category
Confirm that topic cards are displayed or that an intentional empty state is displayed
Open the Emerging Opportunity topic category
Confirm that topic cards are displayed or that an intentional empty state is displayed
Expand a topic card
Confirm that its confidence, justification, platform, and supporting details are readable
```

## AUTIFY-032 — Partial-topic warning

```text
Open the audit result that was generated with fewer topics than requested
Confirm that the result visibly warns that fewer topics were generated than requested
Refresh the browser
Confirm that the warning remains visible after refresh
Return to the dashboard
Reopen the same audit
Confirm that the warning remains visible on the saved audit report
```

## AUTIFY-033 — Citation snapshot

```text
Open https://app.citationrocket.com/audit/{{KNOWN_AUDIT_ID}}
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Scroll to the citation snapshot section
Confirm that total prompts checked, mentioned count, and mention rate are displayed
Confirm that prompt results and competitor results are readable
Confirm that long citation responses do not break the page layout
Open an audit without citation data
Confirm that a clear no-citation-data state is displayed
```

## AUTIFY-034 — Playbook and checklist

```text
Open https://app.citationrocket.com/audit/{{KNOWN_AUDIT_ID}}
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Scroll to the Fix-It Playbook section
Confirm that playbook actions are displayed when available
Open the Quick Wins checklist
Mark one checklist item complete
Confirm that the item changes to completed
Refresh the browser
Confirm that the completed state persists
Mark the same checklist item incomplete
Confirm that the item changes back to incomplete
```

## AUTIFY-035 — Export actions

```text
Open https://app.citationrocket.com/audit/{{KNOWN_AUDIT_ID}}
Sign in with email address {{PAID_TEST_EMAIL}} and password {{PAID_TEST_PASSWORD}}
Click Save as PDF
Confirm that a PDF download starts or a clear plan-gating message is displayed
Click Export CSV Data
Confirm that a CSV download starts or a clear plan-gating message is displayed
Confirm that no duplicate downloads start from one click
```

## AUTIFY-036 — Citation refresh and re-audit

```text
Open https://app.citationrocket.com/audit/{{KNOWN_AUDIT_ID}}
Sign in with email address {{PAID_TEST_EMAIL}} and password {{PAID_TEST_PASSWORD}}
Click the citation refresh control
Confirm that a loading state is displayed
Confirm that the control cannot be submitted repeatedly while loading
Wait for completion
Confirm that the citation results and refresh timestamp update or that a clear error is displayed
Click the re-audit control
Confirm that a loading state is displayed
Confirm that the re-audit cannot be submitted repeatedly while loading
```

---

# Public sharing prompts

## AUTIFY-040 — Admin enables a public audit link

```text
Open https://app.citationrocket.com/audit/{{KNOWN_AUDIT_ID}}
Sign in with email address {{ADMIN_EMAIL}} and password {{ADMIN_PASSWORD}}
Confirm that the admin-only Public share link panel is displayed
Click Enable public link
Confirm that a share URL is displayed
Click Copy link
Confirm that a success message says that the link was copied
Click Copy embed code
Confirm that a success message says that the embed code was copied
Open the displayed share URL in a new incognito browser
Confirm that the report loads without login
```

## AUTIFY-041 — Public report is read-only

```text
Open {{PUBLIC_AUDIT_URL}} in a new incognito browser
Confirm that the public report loads without login
Confirm that the website URL and report score are displayed
Confirm that topic and citation sections are displayed when available
Confirm that no account email, user ID, subscription plan, billing information, or credits are displayed
Confirm that no re-audit, citation-refresh, checklist-edit, account, or billing control is displayed
Confirm that no download or generation action is available in the public report
```

## AUTIFY-042 — Regular users cannot create public links

```text
Open https://app.citationrocket.com/audit/{{KNOWN_AUDIT_ID}}
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Confirm that the admin-only Public share link panel is not displayed
Open the browser DevTools Network panel
Attempt to send a POST request to /api/admin/audits/{{KNOWN_AUDIT_ID}}/share using the regular user session
Confirm that the server returns HTTP 403
Attempt to send a DELETE request to /api/admin/audits/{{KNOWN_AUDIT_ID}}/share using the regular user session
Confirm that the server returns HTTP 403
```

## AUTIFY-043 — Revoke a public link

```text
Open https://app.citationrocket.com/audit/{{KNOWN_AUDIT_ID}}
Sign in with email address {{ADMIN_EMAIL}} and password {{ADMIN_PASSWORD}}
Confirm that the active public share URL is displayed
Open the displayed public share URL in a new incognito browser
Confirm that the report loads
Return to the admin audit screen
Click Revoke link
Confirm that a success message says that the link was revoked
Open the old public share URL in a new incognito browser
Confirm that the report is no longer available
Confirm that the page says the link is invalid or revoked
```

## AUTIFY-044 — Public link works in an iframe

```text
Open a blank external test page in the browser
Insert an iframe whose source is {{PUBLIC_AUDIT_URL}}
Set the iframe width to 100 percent and height to 900 pixels
Confirm that the public audit report renders inside the iframe
Resize the browser to a mobile-sized viewport
Confirm that the iframe report remains readable without unexpected horizontal scrolling
Open the normal home page in an iframe on the external test page
Confirm that normal application frame protections are still enforced
```

---

# Pricing and billing prompts

## AUTIFY-050 — Pricing page

```text
Open https://app.citationrocket.com/pricing
Confirm that Free, Starter, Pro, and Enterprise plans are displayed
Confirm that monthly and annual billing options are displayed
Switch from monthly billing to annual billing
Confirm that the displayed prices update
Switch back to monthly billing
Confirm that the displayed prices return to monthly values
Confirm that each plan’s features are readable
Confirm that the current plan is clearly identified after login
```

## AUTIFY-051 — Coupon validation

```text
Open https://app.citationrocket.com/pricing
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Enter an invalid coupon code INVALID-TEST-COUPON
Apply the coupon
Confirm that an invalid-coupon error is displayed
Confirm that the plan price does not change
Enter the approved sandbox coupon code {{TEST_COUPON_CODE}}
Apply the coupon
Confirm that the coupon is accepted
Confirm that the displayed discount and final price are correct
```

## AUTIFY-052 — Checkout preparation only

```text
Open https://app.citationrocket.com/pricing
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Choose the Starter monthly plan
Click the upgrade or checkout control
Confirm that the checkout session opens only in the configured payment test environment
Confirm that the displayed product, billing period, currency, and amount are correct
Stop the test before entering any card number if the payment page is live production billing
Mark the test BLOCKED if a separate sandbox/test environment is not clearly identified
```

## AUTIFY-053 — Sandbox successful checkout

```text
Open the configured Dodo sandbox checkout URL
Confirm that the checkout page identifies the Starter monthly test product
Enter the official Dodo sandbox success card number {{DODO_TEST_SUCCESS_CARD}}
Enter the sandbox card expiry, CVC, and billing values required by the payment provider
Complete the payment
Confirm that the payment-success screen is displayed
Confirm that the test account’s plan changes to Starter
Confirm that the test account’s subscription status is active
Confirm that the billing period is monthly
Refresh the browser
Confirm that the Starter entitlement remains active
```

## AUTIFY-054 — Sandbox failed and cancelled checkout

```text
Open the configured Dodo sandbox checkout URL
Enter the official Dodo sandbox declined card number {{DODO_TEST_DECLINED_CARD}}
Complete the payment attempt
Confirm that payment failure is displayed
Confirm that the test account plan does not change
Open the checkout again
Cancel the checkout before payment
Confirm that the payment-cancelled screen is displayed
Confirm that the test account plan does not change
```

## AUTIFY-055 — Subscription plan change

```text
Open https://app.citationrocket.com/profile
Sign in with email address {{PAID_TEST_EMAIL}} and password {{PAID_TEST_PASSWORD}}
Open the subscription or plan-management section
Choose the configured sandbox upgrade from Starter to Pro
Confirm that the correct new product and price are displayed
Complete payment using the official Dodo sandbox success card {{DODO_TEST_SUCCESS_CARD}}
Confirm that the Pro plan is displayed after the webhook completes
Confirm that the old pending plan-change state is cleared
```

## AUTIFY-056 — Downgrade and billing-period change

```text
Open https://app.citationrocket.com/profile
Sign in with email address {{PAID_TEST_EMAIL}} and password {{PAID_TEST_PASSWORD}}
Open the subscription or plan-management section
Schedule a downgrade to the configured lower test plan
Confirm that the downgrade is shown as pending
Cancel the pending downgrade
Confirm that the pending downgrade is removed
Choose the configured sandbox monthly-to-annual billing change
Confirm that the new billing period and price are displayed
Complete the sandbox payment
Confirm that the billing period updates only after successful payment confirmation
```

---

# Profile and account prompts

## AUTIFY-060 — Profile settings

```text
Open https://app.citationrocket.com/profile
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Confirm that the profile page is displayed
Edit the display name to Autify Test User
Save the profile
Confirm that a success message is displayed
Refresh the browser
Confirm that Autify Test User remains displayed
```

## AUTIFY-061 — API-key settings

```text
Open https://app.citationrocket.com/profile
Sign in with email address {{PAID_TEST_EMAIL}} and password {{PAID_TEST_PASSWORD}}
Open the API configuration section
Enter the approved test provider key {{TEST_PROVIDER_KEY}}
Save the key
Confirm that only a masked key status is displayed
Refresh the browser
Confirm that the key is still shown only in masked form
Sign out
Sign in with email address {{SECOND_TEST_EMAIL}} and password {{SECOND_TEST_PASSWORD}}
Open the API configuration section
Confirm that the first test account’s key status is not displayed
```

## AUTIFY-062 — Billing history

```text
Open https://app.citationrocket.com/profile
Sign in with email address {{PAID_TEST_EMAIL}} and password {{PAID_TEST_PASSWORD}}
Open the billing or invoice history section
Confirm that invoices are displayed when the test account has invoices
Switch plans using the configured sandbox flow
Return to invoice history
Confirm that invoice history does not silently become empty after the plan switch
```

---

# Admin prompts

## AUTIFY-070 — Admin dashboard access

```text
Open https://app.citationrocket.com/admin
Sign in with email address {{ADMIN_EMAIL}} and password {{ADMIN_PASSWORD}}
Confirm that the admin dashboard is displayed
Confirm that user management, subscriptions, coupons, plans, prompts, email templates, home content, analytics, API monitoring, settings, system health, and demo controls are visible
Confirm that no admin panel shows an uncaught JavaScript error
```

## AUTIFY-071 — Non-admin admin denial

```text
Open https://app.citationrocket.com/admin
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Confirm that admin dashboard data is not displayed
Confirm that the user is denied access or redirected to a non-admin screen
```

## AUTIFY-072 — Admin user management

```text
Open https://app.citationrocket.com/admin
Sign in with email address {{ADMIN_EMAIL}} and password {{ADMIN_PASSWORD}}
Open User Management
Search for {{FREE_TEST_EMAIL}}
Confirm that the test user is displayed
Filter users by the test user’s plan
Confirm that the result matches the selected plan
Open the test user record
Confirm that plan, status, usage, and email fields are readable
Do not delete the test user
```

## AUTIFY-073 — Admin custom-plan validation

```text
Open https://app.citationrocket.com/admin
Sign in with email address {{ADMIN_EMAIL}} and password {{ADMIN_PASSWORD}}
Open Plan Management
Attempt to create a plan without a name, slug, price, or billing type
Confirm that specific validation errors are displayed
Enter a valid isolated test plan named Autify Test Plan with slug autify-test-plan, price 1, monthly billing, and one test feature
Create the plan
Confirm that the plan appears in the plan list
Edit the test plan description
Confirm that the update is saved
Deactivate the test plan
Confirm that it is no longer offered as an active plan
```

## AUTIFY-074 — Admin coupon management

```text
Open https://app.citationrocket.com/admin
Sign in with email address {{ADMIN_EMAIL}} and password {{ADMIN_PASSWORD}}
Open Coupon Management
Attempt to create a coupon without required fields
Confirm that validation errors identify the missing fields
Attempt to create a fixed-dollar coupon
Confirm that the UI explains whether fixed-dollar coupons are supported
Create the approved isolated percentage test coupon {{TEST_COUPON_CODE}}
Confirm that the coupon appears in the coupon list
Deactivate the isolated test coupon
Confirm that it is no longer active
```

## AUTIFY-075 — Admin prompt and email template editing

```text
Open https://app.citationrocket.com/admin
Sign in with email address {{ADMIN_EMAIL}} and password {{ADMIN_PASSWORD}}
Open Prompt Management
Change only the isolated test prompt value to Autify test prompt
Save the prompt
Confirm that a success message is displayed
Reload the prompt
Confirm that the saved value remains
Open Email Templates
Change only the isolated test template subject to Autify test subject
Save the template
Confirm that a success message is displayed
Reload the template
Confirm that the saved value remains
```

## AUTIFY-076 — Admin system health and demo controls

```text
Open https://app.citationrocket.com/admin
Sign in with email address {{ADMIN_EMAIL}} and password {{ADMIN_PASSWORD}}
Open System Health
Confirm that recent errors and summary information are displayed or that a clear empty state is displayed
Open Demo Manager
Confirm that seed and clear controls are visible
Do not clear data unless an isolated demo database is configured
Confirm that destructive controls require confirmation
```

---

# Batch and extension prompts

## AUTIFY-080 — Batch audit

```text
Open https://app.citationrocket.com/batch-test
Sign in with email address {{PAID_TEST_EMAIL}} and password {{PAID_TEST_PASSWORD}}
Enter two valid test website URLs and one invalid URL
Start the batch audit
Confirm that per-site progress is displayed
Confirm that one invalid URL does not hide the results for valid URLs
Wait for the batch to finish
Confirm that each completed result identifies its own website
Confirm that failed sites show an understandable error
```

## AUTIFY-081 — Extension authentication

```text
Open https://app.citationrocket.com/extension-auth
Confirm that the extension authentication screen is displayed
Sign in with email address {{FREE_TEST_EMAIL}} and password {{FREE_TEST_PASSWORD}}
Confirm that the extension authentication success state is displayed
Refresh the page
Confirm that the authentication state remains valid or that a clear reauthentication message is displayed
Confirm that no authentication token is displayed in page text
```

---

# Help, coming-soon, payment-return, and error screens

## AUTIFY-090 — Help screen

```text
Open https://app.citationrocket.com/help
Confirm that the help screen is displayed
Confirm that support/help content is readable
Confirm that visible links open the correct destination
Confirm that no broken link or uncaught JavaScript error is displayed
```

## AUTIFY-091 — Coming-soon screen

```text
Open https://app.citationrocket.com/coming-soon
Confirm that the coming-soon screen is displayed
Confirm that the feature name and explanation are readable
Confirm that the page does not claim that the feature is currently available
```

## AUTIFY-092 — Payment return screens

```text
Open https://app.citationrocket.com/payment-success
Confirm that the payment-success screen is displayed
Confirm that it does not grant a paid plan without a verified successful payment event
Open https://app.citationrocket.com/payment-cancelled
Confirm that the payment-cancelled screen is displayed
Confirm that it provides a clear path back to pricing or the dashboard
```

## AUTIFY-093 — Not-found screen

```text
Open https://app.citationrocket.com/this-page-does-not-exist
Confirm that the not-found screen is displayed
Confirm that it provides a working path back to the home page or dashboard
Confirm that no stack trace is displayed
```

---

# API and security prompts using DevTools

## AUTIFY-100 — Anonymous protected API requests

```text
Open https://app.citationrocket.com
Open DevTools and open the Network panel
Send a request without an Authorization header to /api/keys/me
Confirm that the response status is 401
Send a request without an Authorization header to /api/audit/{{KNOWN_AUDIT_ID}}/checklist
Confirm that the response status is 401
Send a request without an Authorization header to /api/audit/{{KNOWN_AUDIT_ID}}/reaudit
Confirm that the response status is 401 or that the method is rejected safely
```

## AUTIFY-101 — Anonymous admin API requests

```text
Open https://app.citationrocket.com
Open DevTools and open the Network panel
Send a request without an Authorization header to /api/admin/plans
Confirm that the response status is 401 or 403
Send a POST request without an Authorization header to /api/admin/plans with an isolated test plan body
Confirm that the response status is 401 or 403
Send a request without an Authorization header to /api/admin/coupons/create
Confirm that the response status is 401 or 403
Confirm that no admin data is returned
```

## AUTIFY-102 — Cross-account audit access

```text
Open https://app.citationrocket.com
Sign in with email address {{SECOND_TEST_EMAIL}} and password {{SECOND_TEST_PASSWORD}}
Open DevTools and open the Network panel
Send a request to /api/audit/{{KNOWN_AUDIT_ID}}/checklist using the second user session
Confirm that the response status is 403 or that no first-user data is returned
Send a request to /api/audit/{{KNOWN_AUDIT_ID}}/reaudit using the second user session
Confirm that the response status is 403
```

## AUTIFY-103 — Console and network error sweep

```text
Open https://app.citationrocket.com
Open DevTools and open the Console panel
Navigate through the home page, pricing page, dashboard, profile page, and help page
Confirm that no uncaught JavaScript errors are displayed
Open the Network panel
Confirm that failed API requests display a user-facing error state
Confirm that no request response contains a password, API key, Firebase token, or full private user record
```

---

# Final Autify report prompt

## AUTIFY-999 — Summarize the test run

```text
Review all completed test cases in this project
Group results into PASS, FAIL, BLOCKED, and NOT APPLICABLE
For every FAIL, include the test ID, exact URL, user role, exact reproduction steps, expected result, actual result, severity, and evidence location
For every BLOCKED test, state the missing environment dependency
Separate confirmed product bugs from usability observations and test-environment problems
Identify any security issue involving authentication, authorization, billing, secrets, user data, or cross-account access
Do not call a test PASS unless the expected result was explicitly verified
Produce a production recommendation of READY, READY WITH ACCEPTED LOW-RISK ISSUES, BLOCKED — FIX REQUIRED, or BLOCKED — TEST ENVIRONMENT INCOMPLETE
```