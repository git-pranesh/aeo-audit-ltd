# Admin Guide — For the Owner (You)

This is how you run and manage Citation Rocket as the administrator.

---

## 1. How admin access works

You get admin powers in two ways (either is enough in the relevant place):
1. **Email allowlist** — a hardcoded list in the code (`client/src/lib/admin-utils.ts`, `ADMIN_EMAILS`). It currently contains exactly **one** email: `hello@pressense.co` (your account).
2. **`isAdmin` flag** — a true/false field on your user record in the database. The admin dashboard checks this and sends non-admins back to the home page.

> If you ever add a new admin, the cleanest way is to set `isAdmin: true` on their user record. (Verified 2026-07-10: `ADMIN_EMAILS` holds only `hello@pressense.co` — there are no other allowlisted addresses.)

---

## 2. The Admin Dashboard (`/admin`)

Log in with your admin account and go to `/admin`. You'll see a **Quick Stats** row at the top: Total Users, Active Subscriptions, Total Audits, and Monthly Revenue. Everything else is organized into tabs.

The dashboard has **12 tabs** (verified 2026-07-10 in `client/src/pages/admin/admin-dashboard.tsx`), in this order: **Overview, Users, Subscriptions, Coupons, Prompts, Settings, Plans, Home Page, API Usage, Emails, Demo, Health**. The key ones:

### 📊 Overview tab
The default landing tab — an analytics dashboard summarizing users, subscriptions, audits, and revenue.

### 👥 Users tab
- Search for any user.
- Filter by plan (Free, Starter, Pro, Enterprise, Lifetime).
- **Manually change a user's plan** (e.g., grant someone Pro).
- **Reset a user's monthly usage** count.
- **Delete a user.**

### 💳 Subscriptions tab
Review and manage user subscriptions.

### 🏷️ Coupons tab
Create and manage discount / AppSumo redemption codes.

### 🏠 Home Page (Home Page Content) tab
Live-edit the public site copy without touching code:
- Logo icon, text, and subtext.
- Hero title, subtitle, description, and show/hide toggles.
- Platform feature descriptions (ChatGPT, Perplexity, etc.).
- The rotating **loading messages** shown during an audit.
- Footer company details and copyright.

### 🧠 Prompts tab
Edit the **master AI prompt** that controls how audits analyze a website and produce their results. Includes versioning and a **"Restore Default"** button. Change this carefully — it affects every future audit.

### ⚙️ Settings tab
Edit system-level settings (the admin-editable configuration behind the app).

### 📦 Plans tab
Manage plan definitions — audit limits, prices, and per-plan settings (this is where `system/planSettings` values are edited).

### ❤️ Health tab
System monitoring, pulling from `/api/admin/system-health`:
- A live **error log** (the last ~200 system events with category, message, time, and details).
- An **error summary** grouped by category (citation, subscription, auth, etc.).
- Critical failures can also trigger **email alerts** to your admin alert address.

### 📈 API Usage tab
Monitor how much you're spending on third-party AI calls (Perplexity and others) — useful for keeping an eye on costs.

### ✉️ Emails tab
Manage email templates used for transactional / notification emails.

### 🧪 Demo tab
Seed or clear demo data for testing/showcasing.

---

### 🎭 View-As-Plan — a toggle, **not** a tab
This is **not** one of the 12 tabs. It's a floating toggle (fixed at the bottom of the screen for admins) that lets you **see the app exactly as a Free / Starter / Pro / Enterprise user would**, so you can test what each plan unlocks or locks without creating fake accounts.

---

## 3. Common admin tasks

| Task | Where |
| :--- | :--- |
| Give someone a plan for free | Users tab → change their plan |
| Reset someone who hit their limit | Users tab → reset usage |
| Remove a test/junk account | Users tab → delete user |
| Change website headline/copy | Home Page Content tab |
| Change how audits are analyzed | Prompts tab |
| Check if something is breaking | Health tab |
| Watch your AI costs | API Usage tab |
| Preview what a Free user sees | View-As-Plan toggle |

---

## 4. Behind-the-scenes admin work you don't see in the UI

Some maintenance (like bulk-deleting users or wiping all audits for a fresh test) is done directly against the database using the Firebase Admin SDK, which **requires the `FIREBASE_SERVICE_ACCOUNT` secret to be set** (it is). Without that secret, admin data operations silently fail. This is developer-level work rather than a dashboard button.
