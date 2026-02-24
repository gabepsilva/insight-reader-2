## Payments & Subscriptions Architecture

### Goal

Enable users of the desktop app to purchase and manage a subscription (e.g. monthly/annual) with:

- **No secrets in the desktop client**.
- **Minimal backend surface area** (serverless is fine).
- **Simple UX** for upgrading, managing billing, and handling entitlement in the app.

This document is a design you can implement; it does **not** assume any specific deployment platform beyond “we can run a small HTTPS backend or serverless function”.

---

### Provider Choice

- **Stripe Billing + Stripe Checkout** is the primary recommendation:
  - Handles **cards, wallets, tax, invoices, trials, coupons**.
  - Provides **hosted Checkout** and **Billing Portal** so you do not have to build payment forms.
  - Very mature desktop/SaaS usage pattern, strong docs and test tooling.

Alternatives (Paddle, Lemon Squeezy, etc.) can plug into a similar shape, but the rest of this doc is written for Stripe.

---

### High-Level Architecture

- **Desktop app (Tauri frontend)**
  - Shows “Upgrade to Pro” / “Manage subscription”.
  - Talks only to your **backend** (never directly to Stripe with a secret key).
  - Stores a short-lived **entitlement token** / license status for offline use.

- **Backend (Payments API)**
  - Exposes **authenticated HTTPS endpoints** for the app:
    - `POST /api/billing/create-checkout-session`
    - `POST /api/billing/create-portal-session`
    - `GET /api/billing/status`
  - Uses **Stripe secret key** server-side only.
  - Receives **Stripe webhooks** and updates your user’s subscription status in your database.

- **Stripe**
  - Checkout session for starting a subscription.
  - Customer Portal for changing/cancelling plans.
  - Webhooks: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`, etc.

The desktop app asks your backend “is this user active?” and **never needs to know about payment details**.

---

### Secrets and Keys

- **Stripe Secret Key (`sk_live_...`)**
  - **MUST live only on backend/serverless**, never shipped in the desktop app.
  - Used to create Checkout/Portal sessions, read subscriptions, etc.

- **Stripe Publishable Key (`pk_live_...`)**
  - Can be embedded in the backend or used in a very thin web front-end (if you ever embed Stripe Elements).
  - For the basic hosted Checkout flow described here, the desktop app **does not need to know** the publishable key directly (the Checkout page is hosted by Stripe).

- **Webhook Signing Secret**
  - Used only in the backend to verify incoming Stripe webhooks.
  - Store in your backend environment/config, **never** in the app.

**Rule of thumb**: The desktop app should have **zero Stripe secrets**. It only talks to your backend over HTTPS.

---

### User Identity Model

Pick a canonical user identifier that both your backend and Stripe can reference:

- Example: `internal_user_id` from your existing auth system.
- Store this as `metadata.user_id` on the Stripe `Customer` and/or `Subscription`.

Desktop app auth strategies:

- **If you already have login**:
  - Reuse existing authentication (e.g. email/password, OAuth).
  - All billing endpoints are called with the user’s auth token.

- **If you don’t have login yet** (pure desktop licensing):
  - Consider a simple **account model**:
    - User signs up with email and password (or magic link).
    - Desktop logs in and stores an access token.
  - This is strongly recommended for multi-device support and recovery.

---

### Core Flows

#### 1. Start Subscription (Upgrade to Pro)

1. User clicks **“Upgrade”** in the desktop app.
2. App calls backend `POST /api/billing/create-checkout-session` with:
   - Auth token (who is the user).
   - Chosen price ID (e.g. `price_monthly`, `price_yearly`).
3. Backend:
   - Looks up or creates a **Stripe Customer** for this user.
   - Calls `stripe.checkout.sessions.create({ mode: 'subscription', ... })`.
   - Sets `success_url` and `cancel_url` to **special deep-link URLs** that route back to the desktop app, e.g.:
     - `insight-reader://billing/success`
     - `insight-reader://billing/cancel`
   - Returns the Checkout `url` to the desktop app.
4. Desktop app:
   - Opens the `url` in the user’s default browser.
5. User completes Checkout in browser.
6. Stripe triggers webhooks to backend; backend:
   - On `checkout.session.completed`, marks user as **active** in DB.
   - Generates/updates a **license/entitlement record** for this user.

The desktop app does **not** need to poll Stripe directly; it asks your backend later.

#### 2. Returning to the App After Purchase

To give immediate feedback after purchase:

- `success_url` in Checkout includes a **deep link** back to the app, e.g.:

  - `insight-reader://billing/success?session_id={CHECKOUT_SESSION_ID}`

- Configure your Tauri app to **handle that custom protocol** and:
  - When launched/opened via this URL, call `GET /api/billing/status` to refresh the current user’s entitlement.
  - Update UI to show “Pro active”.

If deep links are too complex initially, you can do a simpler version:

- After user completes Checkout, they click a “I’m done” button in the app which triggers a **manual refresh**:
  - App calls `GET /api/billing/status`.

#### 3. Manage Subscription (Billing Portal)

1. User clicks **“Manage subscription”** in the app.
2. App calls `POST /api/billing/create-portal-session`.
3. Backend uses Stripe API to create a **Billing Portal** session for this user’s customer.
4. Backend returns the `url`.
5. App opens the URL in browser.

Stripe handles plan changes, card updates, cancellations; your backend just reacts to webhooks to update entitlement.

#### 4. Entitlement Check (On App Start)

On app startup and periodically:

1. Desktop app reads cached **entitlement token/status** from local storage.
2. If token is missing, expired, or app has network:
   - Call `GET /api/billing/status`.
3. Backend returns:
   - `plan`: `free` | `pro` | `trial`
   - `expires_at` or `renewal_date`
   - Any feature flags.
4. App updates:
   - Which UI features are unlocked.
   - Local cache of entitlement (for brief offline use).

You can implement the entitlement as a **signed JWT** or just a plain API result plus local storage; JWT is useful if you want cryptographic offline validation later.

---

### Backend Endpoints (Shape)

**`POST /api/billing/create-checkout-session`**

- Auth: required (user must be logged in / identified).
- Request:
  - `price_id`
  - Optional: `mode` (default `subscription`).
- Behavior:
  - Ensure user has a matching Stripe Customer.
  - Create Checkout session with:
    - `mode: 'subscription'`
    - `line_items: [{ price: price_id, quantity: 1 }]`
    - `customer: <stripe_customer_id>`
    - `success_url`, `cancel_url` with deep links.
  - Return `{ url }`.

**`POST /api/billing/create-portal-session`**

- Auth: required.
- Behavior:
  - Fetch Stripe Customer for user.
  - Create Billing Portal session.
  - Return `{ url }`.

**`GET /api/billing/status`**

- Auth: required.
- Behavior:
  - Look up user in your DB.
  - Return a normalized status:
    - `{"plan": "free" | "pro" | "trial", "active": boolean, "expires_at": timestamp | null}`.

---

### Webhooks and State Sync

Configure a webhook endpoint, e.g. `POST /api/stripe/webhook`:

- Verify signature using Stripe’s webhook signing secret.
- Handle events:
  - `checkout.session.completed`: mark user as active, attach subscription.
  - `customer.subscription.created/updated`: update plan, period, and status.
  - `customer.subscription.deleted`: mark as cancelled/ended.
  - `invoice.payment_failed`: optionally mark as past-due and downgrade after grace period.

Store a concise per-user record:

- `stripe_customer_id`
- `stripe_subscription_id`
- `plan` (monthly/annual)
- `status` (`active`, `trialing`, `past_due`, `canceled`)
- `current_period_end`

The desktop app **only sees** the normalized status via `/api/billing/status`.

---

### Desktop App Integration (Tauri)

At a high level:

- **Settings / Account screen**
  - Shows current plan and renewal date.
  - Button: **Upgrade** (calls `create-checkout-session`).
  - Button: **Manage subscription** (calls `create-portal-session`).
  - Status: “Pro active”, “Trial (X days left)”, or “Free”.

- **Feature gating**
  - Use a simple `entitlements` object from `/api/billing/status`:
    - `can_use_feature_x: boolean`.
  - Wrap premium UI elements behind these flags.

- **Offline behavior**
  - If last-known entitlement is `pro` and cached `expires_at` is still in the future:
    - Allow features and show “offline – cannot verify; will re-check when online”.
  - If cache is stale or past `expires_at`, fall back to free mode until verification.

---

### Local Development & Testing

- Use **Stripe test mode** with test keys:
  - `sk_test_...`, `pk_test_...`.
- Point your backend to Stripe test environment.
- On your local machine:
  - Run backend with env vars for test keys.
  - Use `stripe listen` CLI to forward webhooks to `localhost`.
  - Run your Tauri desktop app against this backend base URL.

---

### Implementation Checklist

- **Stripe setup**
  - [ ] Create Stripe account, enable Billing.
  - [ ] Create products/prices (monthly, annual).
  - [ ] Configure webhook endpoint and obtain signing secret.

- **Backend**
  - [ ] Add environment variables for Stripe secret key + webhook secret.
  - [ ] Implement `create-checkout-session`, `create-portal-session`, `billing/status`.
  - [ ] Implement `/api/stripe/webhook` with event handlers.
  - [ ] Add DB tables/fields for users’ Stripe IDs and subscription state.

- **Desktop app**
  - [ ] Add Settings/Account UI for plan & billing actions.
  - [ ] Implement HTTPS calls to backend billing endpoints.
  - [ ] Implement feature gating using entitlement status.
  - [ ] (Optional) Implement deep-link handling for `insight-reader://billing/*`.

- **Security**
  - [ ] Verify that **no Stripe secret or webhook secret** is embedded in the desktop bundle.
  - [ ] Ensure all backend endpoints require authenticated user context.

---

## What to Do (Step-by-Step)

Do these in order. Each step unblocks the next.

### Phase 1: Stripe + backend (no app changes yet)

1. **Create a Stripe account** (if you don't have one)  
   - [dashboard.stripe.com](https://dashboard.stripe.com) → sign up.  
   - Stay in **Test mode** (toggle in dashboard) while building.

2. **Create product and prices in Stripe**  
   - Dashboard → **Products** → Add product (e.g. "Insight Reader Pro").  
   - Add at least one **recurring price** (e.g. monthly or yearly).  
   - Copy the **Price ID** (e.g. `price_xxx`) — you'll use it in the backend.

3. **Decide where your backend will run**  
   - Options: small Node/Express or similar server, or serverless (Vercel, Netlify, AWS Lambda, etc.).  
   - You need:  
     - A public HTTPS URL for the app to call.  
     - A public HTTPS URL for Stripe webhooks (e.g. `https://your-api.com/api/stripe/webhook`).

4. **Create the backend project** (if you don't have one)  
   - One service that:  
     - Accepts HTTP requests from the desktop app.  
     - Calls Stripe with the **secret key** (never in the app).  
     - Has a **database or store** for: user id, `stripe_customer_id`, `stripe_subscription_id`, plan, status, `current_period_end`.  
   - Set env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and your Price ID(s).

5. **Implement the three billing endpoints**  
   - `POST /api/billing/create-checkout-session` — create Stripe Checkout session, return `{ url }`.  
   - `POST /api/billing/create-portal-session` — create Stripe Billing Portal session, return `{ url }`.  
   - `GET /api/billing/status` — read from your DB, return `{ plan, active, expires_at }`.  
   - All must require **auth** (identify the user; see "User Identity Model" above).

6. **Implement the webhook**  
   - `POST /api/stripe/webhook`: verify Stripe signature, then handle `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` (and optionally `invoice.payment_failed`).  
   - In handlers: create/update the user's subscription row in your DB.  
   - In Stripe Dashboard → **Developers → Webhooks**: add endpoint URL, get **Webhook signing secret**, put it in `STRIPE_WEBHOOK_SECRET`.  
   - Local testing: use `stripe listen --forward-to localhost:YOUR_PORT/api/stripe/webhook` and use the CLI's printed signing secret.

7. **Add simple auth if you don't have it**  
   - Desktop app must identify the user (e.g. login with email + password or magic link).  
   - Backend issues a token; app sends it on every billing request (e.g. `Authorization: Bearer <token>`).  
   - Backend maps token → user id → Stripe customer / subscription.

### Phase 2: Desktop app

8. **Add an Account / Billing screen**  
   - Show: current plan ("Free" / "Pro" / "Trial"), renewal date if any.  
   - Buttons: **Upgrade** (opens Checkout), **Manage subscription** (opens Portal).  
   - Call your backend with the user's auth token; open the returned `url` in the system browser.

9. **Call billing status on startup**  
   - On app launch (and after returning from Checkout/Portal):  
     - `GET /api/billing/status`.  
   - Store result in app state + optional local cache (e.g. `plan`, `expires_at`) for offline hint.

10. **Gate Pro features**  
    - Use `plan === 'pro'` or `active === true` from `/api/billing/status` to show/hide or enable/disable premium features.  
    - No Stripe keys or logic in the app — only "call backend, show UI based on response".

11. **(Optional) Deep link back into the app**  
    - Set Checkout `success_url` to something like `insight-reader://billing/success`.  
    - Register the `insight-reader://` protocol in Tauri/installer so the app opens and can refresh billing status.  
    - If you skip this, user can tap "I'm done" in the app to refresh status manually.

### Phase 3: Go live

12. **Switch Stripe to Live mode**  
    - Create live product/price if needed.  
    - Replace test keys with live keys in backend env.  
    - Update webhook endpoint to live URL and set live webhook signing secret.

13. **Security pass**  
    - Confirm no `sk_live_` or webhook secret in desktop bundle or front-end code.  
    - Confirm all billing endpoints require a valid user token.

After that you're done: users can subscribe via Stripe Checkout, manage via Portal, and the app only talks to your backend to know if they're Pro.