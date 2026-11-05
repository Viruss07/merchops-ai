# PayPal Sandbox Setup & Testing Guide

## MerchOps AI — PayPal AI Hackathon 2026

This guide explains how to configure the PayPal Developer Sandbox for MerchOps AI and how to run the optional manual checks. **No Sandbox verification has been executed or recorded in this repository.** Nothing in this document is a claim that OAuth, Payouts scope, or live payout dispatch has been verified.

---

## 1. Status: What Exists vs. What Is Assumed

In accordance with our financial and security rules, we separate PayPal platform documentation from code that exists in this repository.

### Documented PayPal Platform Capabilities (not verified by this repo)
These are standard PayPal developer capabilities described in PayPal documentation. They have **not** been exercised by this application:
- OAuth 2.0 client-credentials grant (`POST /v1/oauth2/token`).
- Orders API v2 checkout create/capture.
- Invoicing API v2 draft/send/retrieve.
- Webhook signature verification endpoint.
- Sandbox Webhook Simulator.

### Implemented in This Repository
- **OAuth client-credentials request helper** used only by the gated Payouts rail.
- **Payouts payload generation** (`POST /v1/payments/payouts`) behind the server-side `PAYPAL_PAYOUTS_ENABLED` gate.
- **Strict Sandbox origin lockdown** (`https://api-m.sandbox.paypal.com` only).
- **Default simulation rail** that never calls PayPal.
- **Batch polling** (`GET /v1/payments/payouts/{batch_id}`) and an in-flight sync endpoint.
- **Webhook receiver + signature verification** at `POST /api/paypal/webhook`.
- **Idempotent payout reconciliation** using the in-memory payout record.
- **Manual scripts** for OAuth and Payouts-scope checks.

### Not Implemented
- Durable webhook event table / cross-instance replay protection.
- Invoicing/Orders API creation and capture.
- Durable payout/idempotency persistence.
- Verified live PayPal settlement or webhook delivery.

### Working Assumptions (To Be Confirmed Manually)
- **Assumption 1 (Payouts API Sandbox Enablement)**: The Sandbox business account has Payouts enabled and sufficient balance. *Mitigation*: keep the default simulation rail; use the manual scope script; never claim live dispatch works until recorded.
- **Assumption 2 (Webhook Delivery Latency)**: The receiver is implemented but has not been configured or verified against live PayPal delivery. Keep the simulation rail as the default and reconcile in-flight payouts with `POST /api/payouts/sync`.
- **Assumption 3 (Multi-Currency)**: All demo transactions are `USD`; multi-currency is out of scope.

### Pending Sandbox Verification Tests

The following tests have **not** been executed in application code:

- [ ] Confirm Sandbox Business and Personal accounts are available.
- [ ] Create a Sandbox REST application and obtain credentials.
- [ ] Obtain an OAuth access token successfully (`scripts/paypal-auth-test.mjs`).
- [ ] Verify whether the Payouts API scope is present (`scripts/paypal-payouts-scope-test.mjs`).
- [ ] Test `POST /v1/payments/payouts` with `PAYPAL_PAYOUTS_ENABLED=true` and record the actual HTTP status/response.
- [ ] Verify payout status and recipient-side results.
- [ ] Configure a webhook and verify delivery — **blocked: receiver exists, but needs a public URL and `PAYPAL_WEBHOOK_ID`**.
- [ ] Test webhook signature verification — **blocked: implemented, but requires a real PayPal delivery**.
- [ ] Test duplicate webhook delivery — **blocked: implemented idempotently, but requires a real PayPal delivery**.
- [ ] Record all results as VERIFIED, DOCUMENTED, ASSUMED, or UNVERIFIED.

---

## 2. Sandbox Setup Instructions

### Step 1: Create Developer Accounts
1. Log in to the [PayPal Developer Dashboard](https://developer.paypal.com/).
2. Navigate to **Testing Tools** > **Sandbox Accounts**.
3. Create two sandbox accounts:
   - **Merchant Account** (Business Type): Represents the MerchOps AI merchant user.
   - **Customer Account** (Personal Type): Represents the customer paying overdue invoices.

### Step 2: Create a REST API App
1. Go to **Apps & Credentials** > select **Sandbox** mode.
2. Click **Create App**:
   - App Name: `MerchOps-AI-Dev`
   - App Type: `Merchant`
   - Link to your sandbox Merchant Account.
3. Note the generated credentials:
   - **Client ID**
   - **Client Secret**

### Step 3: Configure Environment Variables
Copy these values into your `.env.local` file (derived from `.env.example`):

```bash
PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com
PAYPAL_CLIENT_ID=your_sandbox_client_id_here
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret_here

# Default: false. The live rail is server-side gated; the browser cannot enable it.
# Set to true only when you intentionally want to exercise live Sandbox dispatch.
PAYPAL_PAYOUTS_ENABLED=false

# Required to verify PayPal webhook signatures. Without it, the webhook route
# rejects deliveries; use the sync endpoint for in-flight reconciliation.
PAYPAL_WEBHOOK_ID=
```

The app must never receive these secrets in a browser bundle or an LLM prompt.

### Step 4: Webhooks (Implemented, Unverified)
The receiver is `POST /api/paypal/webhook`. Register that public URL in the PayPal Sandbox webhook simulator and set `PAYPAL_WEBHOOK_ID`. Without the ID, deliveries are rejected. A real delivery has not been verified; keep the simulation rail as the default.

---

## 3. Manual Verification Scripts

These scripts are **opt-in, manual, and never part of `npm test` or CI**. They read credentials only from `process.env`, never print tokens/secrets, and set a non-zero `process.exitCode` on failure.

```bash
# Requires real sandbox credentials + network. Does not move money.
node scripts/paypal-auth-test.mjs

# Requires real sandbox credentials + network. Does not move money.
node scripts/paypal-payouts-scope-test.mjs
```

Offline/demo checks (require a running app, no live PayPal):

```bash
# Builds and starts the app, then exercises reset, reserve blocking,
# collection, payout, idempotent replay, and reset again.
node scripts/run-e2e.mjs

# API-level seed/scenario check against a running server.
BASE_URL=http://localhost:3000 node scripts/verify-chart-render.mjs
```

`run-e2e.mjs` forces `PAYPAL_PAYOUTS_ENABLED=false`, so it can never trigger a live payout.

---

## 4. End-to-End Demo Flow

The default flow is local simulation and does not involve PayPal network calls.

```mermaid
sequenceDiagram
    autonumber
    actor Merchant as Merchant (User)
    participant App as MerchOps AI
    participant OpenRouter as OpenRouter (optional)
    participant PaypalSim as Simulation Rail (default)
    participant PaypalLive as PayPal Sandbox (gated, unverified)

    Merchant->>App: Opens Runway Dashboard (DEMO_AS_OF=2026-11-03)
    App-->>Merchant: Alerts: $800 reserve breach on Day 10
    Merchant->>App: Inspects overdue invoices
    App->>OpenRouter: Request reminder draft (minimal fields)
    OpenRouter-->>App: Returns draft (or fallback template)
    Merchant->>App: Reviews & approves reminder (server-side)
    Note over App: No outbound email is sent
    Merchant->>App: Simulates Apex settlement
    App->>PaypalSim: Local ledger update (+$1,500, MERCHANT attributed)
    App-->>Merchant: Balance $5,700; runway healthy
    Merchant->>App: Reviews Acme bill & confirms payout
    App->>PaypalSim: Local payout (-$3,000), deterministic request id
    alt PAYPAL_PAYOUTS_ENABLED=true + credentials configured
        App->>PaypalLive: POST /v1/payments/payouts (unverified)
    end
    App-->>Merchant: Balance $2,700; reserve preserved
```

---

## 5. Troubleshooting Sandbox Issues

| Issue | Likely Cause | Resolution |
|---|---|---|
| `401 Unauthorized` | Invalid Client ID/Secret or expired token | Check `.env.local` credentials. Never paste credentials into logs or AI prompts. |
| Live rail unavailable | `PAYPAL_PAYOUTS_ENABLED` is false | This is the safe default. Set it to `true` server-side only when intentionally testing live dispatch. |
| `PAYPAL_CREDENTIALS_MISSING` | Missing sandbox credentials | Populate `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`, or use the default simulation rail. |
| Payout rejected | Insufficient funds or Payouts not enabled on the sandbox account | Verify the Sandbox Merchant balance/permissions. Simulation remains available. |
| Webhook not received | Receiver exists but has not been configured/verified | Expected in simulation mode. Use `/api/payouts/sync` for in-flight reconciliation. |
