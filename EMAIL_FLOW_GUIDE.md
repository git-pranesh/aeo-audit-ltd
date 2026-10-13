# 📧 Email Notification System - Complete Flow

## **3 Automated Emails:**

---

## 1️⃣ **SIGNUP WELCOME EMAIL** 🎉

### **When It's Sent:**
When a user **creates an account for the first time** (Email signup OR Google signup)

### **The Flow:**
```
User visits homepage
   ↓
Clicks "Sign Up" button
   ↓
Enters email/password (or clicks "Sign in with Google")
   ↓
Account created in Firebase Auth ✅
   ↓
User profile created in Firestore (Free plan)
   ↓
Frontend calls: POST /api/auth/send-welcome-email
   ↓
📧 SIGNUP WELCOME EMAIL SENT! ✅
   ↓
User receives: "🎉 Welcome to AI Citation Audit - Let's Get Started!"
```

### **Email Contains:**
- 🎉 Welcome message with user's name
- 🎁 Free plan features (1 audit/month, 3 topics)
- 🚀 Quick start guide (4 steps to run first audit)
- 🔗 "Run Your First Audit" button
- 💼 Option to upgrade to paid plan
- 📚 Link to help center

### **Code Location:**
- **Service**: `server/email-service.ts` → `sendSignupWelcomeEmail()`
- **Endpoint**: `server/routes.ts` → `POST /api/auth/send-welcome-email`
- **Triggered from**: `client/src/lib/auth-service.ts` → `signUpWithEmail()` and `signInWithGoogle()`

---

## 2️⃣ **SUBSCRIPTION WELCOME EMAIL** 💳

### **When It's Sent:**
When a user **subscribes to a paid plan** (Starter/Pro/Enterprise, Monthly or Annual)

### **The Flow:**
```
User on Pricing page
   ↓
Clicks "Upgrade to Pro" (Monthly or Annual)
   ↓
Redirected to DODO checkout
   ↓
Enters card details and pays
   ↓
DODO processes payment ✅
   ↓
DODO webhook: POST /api/webhooks/dodo
Event: "payment.completed" or "subscription.created"
   ↓
Server upgrades user in Firestore
   ↓
📧 SUBSCRIPTION WELCOME EMAIL SENT! ✅
   ↓
User receives: "🎉 Welcome to AI Citation Audit - Pro Plan Activated!"
```

### **Email Contains:**
- 🎉 Subscription confirmation
- 💼 Plan name (Starter/Pro/Enterprise)
- 💰 Price and billing period (Monthly or Annual)
- ✅ Full feature list for the plan
- 🚀 Next steps and recommendations
- 🔗 "Get Started Now" button
- 📞 Support contact info

### **Code Location:**
- **Service**: `server/email-service.ts` → `sendWelcomeEmail()`
- **Triggered from**: `server/routes.ts` → DODO webhook handler
- **Webhook Events**: `payment.completed`, `subscription.created`, `subscription.active`, `subscription.renewed`

---

## 3️⃣ **CANCELLATION EMAIL** 😢

### **When It's Sent:**
When a user's **subscription is cancelled or expires**

### **The Flow:**
```
User cancels subscription in DODO
(or subscription expires / payment fails)
   ↓
DODO webhook: POST /api/webhooks/dodo
Event: "subscription.cancelled" or "subscription.expired"
   ↓
Server downgrades user to Free plan in Firestore
   ↓
📧 CANCELLATION EMAIL SENT! ✅
   ↓
User receives: "Subscription Cancelled - We'll Miss You 😢"
```

### **Email Contains:**
- 😢 Sorry to see you go message
- ⚠️ "You still have access until [end date]"
- 📋 What happens next (downgrade to free plan)
- 💾 All audit history is preserved
- 💡 Feedback request (why did you cancel?)
- 🔄 "View Pricing Plans" button to resubscribe
- 💙 "Hope to see you again" closing

### **Code Location:**
- **Service**: `server/email-service.ts` → `sendCancellationEmail()`
- **Triggered from**: `server/routes.ts` → DODO webhook handler
- **Webhook Events**: `subscription.cancelled`, `subscription.canceled`, `subscription.expired`

---

## 📊 **Summary Table:**

| # | Email Type | Trigger | When | Recipient |
|---|------------|---------|------|-----------|
| 1️⃣ | **Signup Welcome** | User creates account | Immediately after signup | All new users |
| 2️⃣ | **Subscription Welcome** | User subscribes | After payment success | Paid subscribers |
| 3️⃣ | **Cancellation** | Subscription cancelled | When DODO cancels | Former paid users |

---

## 🔐 **Email Sender Configuration:**

All emails are sent from:
- **From Email**: `MAILERSEND_FROM_EMAIL` (e.g., `info@aicitationaudit.com`)
- **From Name**: `MAILERSEND_FROM_NAME` (e.g., `AI Citation Audit`)
- **API Key**: `MAILERSEND_API_KEY`

---

## ⚙️ **Error Handling:**

✅ **If email fails to send:**
- User account is still created successfully
- Subscription still processes normally
- Error is logged but doesn't block the flow
- Non-critical failure (email is optional)

✅ **Email sending is async:**
- Doesn't slow down signup/payment
- Happens in background
- Logged in server console

---

## 🎯 **User Journey with Emails:**

```
Day 1: User signs up
   → 📧 Email 1: "Welcome! Run your first audit"
   
Day 2: User upgrades to Pro (Annual)
   → 📧 Email 2: "Pro Plan Activated - $1,490/year"
   
Day 365: User cancels subscription
   → 📧 Email 3: "Subscription Cancelled - We'll miss you"
```

---

## 🛠️ **Customization:**

All email templates are in: `server/email-service.ts`

You can customize:
- Subject lines
- Email body content
- HTML styling
- CTA button text
- Footer text

Just edit the HTML templates in the respective functions! 🎨

