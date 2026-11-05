# MerchOps AI — Guardrailed Financial Operations & Cash Flow Copilot

> Built for the **PayPal AI Hackathon 2026**  
> **Core Architectural Principle**: *"AI proposes, rules decide. AI must never independently move money."*

---

## What MerchOps AI Does

Small merchants struggle with fragmented working capital management: juggling late-paying customers, imminent supplier bills, and the constant risk of overdraft fees or cash crunches.

**MerchOps AI** is a guardrailed financial operations cockpit that bridges accounts receivable (AR) and accounts payable (AP) under **deterministic cash reserve protection**:
1. **Anticipates Cash Shortfalls**: Projects 30-day daily cash balances using pure deterministic arithmetic.
2. **Accelerates Receivables**: AI drafts polite, context-aware payment reminders for overdue invoices. Payment links are simulated; live Invoicing/Orders integration is not implemented.
3. **Protects Working Capital**: Enforces a non-negotiable safety reserve floor ($2,000.00), automatically blocking payouts that would trigger a liquidity breach.
4. **Guarantees Human Control**: Outbound disbursements require a two-step merchant confirmation flow with UUIDv4 idempotency keys.

---

## Main Features & Core Modules

### 1. Runway & Cash-Flow Forecasting
- **Deterministic 30-Day Engine**: Day-by-day cash trajectory calculated in exact integer cents ($1.00 = 100 cents). Zero LLM math hallucinations.
- **Deterministic Demo Clock**: `DEMO_AS_OF` defaults to `2026-11-03` (env-overridable, `YYYY-MM-DD`). Runway starts from that date and invoice aging is derived from `dueDate`, so the documented scenario is stable regardless of the real wall clock.
- **Safety Floor Monitoring**: Enforces a minimum cash reserve floor ($2,000.00).
- **Proactive Breach Alerts**: Flags impending deficits in advance (e.g., Day 10 shortfall of -$800.00 when a $3,000 supplier bill matures on a $4,200 balance).
- **Correct Bill Matching**: Bills are matched by `dueDate` only (no double counting via `daysUntilDue`), overdue/day-0 items are clamped to Day 1, and `PENDING`/`APPROVED`/`IN_FLIGHT` bills are included. The forecast reports `minBalanceCents` and `firstBreachDeficitCents`.
- **Interactive Visual Timeline**: 30-day trajectory bar chart with reserve floor guideline and full expandable ledger table.

### 2. Collections (Accounts Receivable)
- **Overdue Invoice Management**: Tracks receivables, aging buckets, and customer payment status.
- **AI-Assisted Reminders**: Proposes tailored payment reminder emails matching invoice aging and customer relationship context. The draft route is rate-limited and Zod-validated.
- **Human-in-the-Loop Review**: Slide-over drawer lets merchants edit, review, and approve drafts. Approval is persisted server-side at `POST /api/reminders/approve`.
- **Simulated Settlement**: One-click settlement simulator updates cash balance in real time. The settlement is attributed to `MERCHANT` (not `PAYPAL_WEBHOOK`) and is clearly labelled as a local simulation.

### 3. Payouts (Accounts Payable)
- **Dynamic Reserve Guardrail**: Evaluates pending vendor disbursements against projected cash balance.
- **Automated Breach Blocking**: Disallows payouts that breach the reserve floor (returns HTTP 403 `RESERVE_BREACH_BLOCKED`).
- **Two-Step Authorization Flow**: Requires explicit liquidity impact review and checkbox confirmation (`confirmed: true` is enforced server-side).
- **In-Process Idempotency State Machine**: UUID idempotency keys are validated with Zod and tracked in-process through `beginPayout -> IN_FLIGHT -> completePayout/failPayout`. The reserve check plus status transition is atomic within the Node process: a duplicate replay of a `SUCCEEDED` key returns the stored result, and concurrent requests cannot double-disburse. This is **not durable and not multi-instance safe** — keys reset on server restart.
- **Dual Execution Rails**:
  - *Simulation Rail (default)*: Instant local ledger settlement with audit logging.
  - *Gated PayPal Sandbox Rail*: Implemented but **disabled unless the server env `PAYPAL_PAYOUTS_ENABLED=true`**. The browser/client cannot enable it. Strict origin lockdown (`https://api-m.sandbox.paypal.com`) applies. Live dispatch is implemented but **unverified**.

### 4. Operations & Audit Trail
- **Chronological Ledger**: Tracks all balance updates, reminder approvals, simulated customer payments, and blocked/authorized payouts.
- **Action Differentiation**: Clearly tags events (`PAYOUT_DISBURSED_SIMULATED`, `PAYOUT_BLOCKED_RESERVE_BREACH`, `INVOICE_PAID_SIMULATED`, `REMINDER_DRAFT_APPROVED`).
- **Audit Filtering**: Filter events by Payouts, Collections, or Reserve Guardrails.
- **Honest Scope**: The audit log is an in-memory array with UUID IDs. It is **not immutable** and resets on server restart.

---

## Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | React 19, TypeScript, Server & Client Components |
| **Data Tables** | AG Grid Community (v36) | High-performance interactive data grids for Collections, Payouts, and Audit Trail |
| **Styling** | Tailwind CSS + AG Theme Quartz | Modern high-trust financial dashboard with custom AG Grid theme integration |
| **Icons** | Lucide React | Consistent iconography across indicators and navigation |
| **Testing** | Node.js Test Runner (`node:test`) + `tsx` | Unit tests for deterministic money/runway/policy logic. Live PayPal calls are never part of `npm test`. |
| **Calculations** | Pure TypeScript Functions | 100% deterministic integer cents math (`src/lib/money.ts`, `src/lib/runway.ts`, `src/lib/payoutPolicy.ts`) |
| **Persistence** | In-memory repository (demo) | State lives in a server-side singleton. PostgreSQL is planned but **not implemented**; state resets on server restart. |
| **Payment Integration** | PayPal REST APIs (Sandbox) | Client Credentials OAuth (`/v1/oauth2/token`), Payouts (`/v1/payments/payouts`). Live rail gated by `PAYPAL_PAYOUTS_ENABLED` and unverified. |
| **AI Integration** | OpenRouter API | Model: `anthropic/claude-3.5-sonnet` with honest fallback template |

---

## AG Grid Community Integration

MerchOps AI meaningfully integrates **AG Grid Community** to deliver a high-density, professional financial operations experience:

1. **Collections Grid (`src/components/collections/InvoicesGrid.tsx`)**:
   - Interactive table of merchant receivables with column sorting (Amount, Due Date, Days Overdue).
   - Text and numeric filtering on amounts and aging buckets.
   - Instant quick search across customer names, invoice numbers, and descriptions.
   - Embedded interactive cell action buttons: **Draft Reminder** (opens AI drafting drawer) and **Simulate Pay** (opens settlement simulation modal).

2. **Payouts Grid (`src/components/payouts/BillsGrid.tsx`)**:
   - High-density payables table tracking vendor bills, due dates, and amounts.
   - Dynamic **Projected Balance** column reflecting post-payout cash positions.
   - Real-time **Reserve Impact** status badges highlighting reserve floor safety vs. breach.
   - Action buttons: launches the **Two-Step Payout Authorization Modal** (locked when breaching, active when safe).

3. **Audit Trail Grid (`src/components/audit/AuditGrid.tsx`)**:
   - Structured audit ledger table with timestamp sorting and instant search across event details.
   - Toggleable between AG Grid Table View and Chronological Feed View.

*Note on Licensing*: This integration strictly uses the free, open **AG Grid Community** edition (`ag-grid-community` and `ag-grid-react`). No Enterprise features, proprietary modules, or license keys are required. AG Grid was selected specifically to provide merchants with enterprise-grade sorting, filtering, and rapid financial scanning.

---

## Installation & Local Setup

### Prerequisites
- Node.js `v20+` or `v24+`
- npm `v10+`

### Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Viruss07/merchops-ai.git
   cd merchops-ai
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the example environment template:
   ```bash
   cp .env.example .env.local
   ```
   Configure the following variables in `.env.local`:
   ```bash
   # Deterministic demo clock (YYYY-MM-DD). Invalid values fall back to 2026-11-03.
   DEMO_AS_OF=2026-11-03

   # Server-side gate for the live PayPal Sandbox payout rail (default: false).
   # The browser cannot enable this. Live dispatch remains unverified.
   PAYPAL_PAYOUTS_ENABLED=false

   # Optional: extra protection for /api/reset in production.
   # When set, requests must include a matching `x-demo-admin-token` header.
   DEMO_ADMIN_TOKEN=

   # PayPal Sandbox Credentials (from developer.paypal.com)
   PAYPAL_API_BASE_URL="https://api-m.sandbox.paypal.com"
   PAYPAL_CLIENT_ID="<your_sandbox_client_id>"
   PAYPAL_CLIENT_SECRET="<your_sandbox_client_secret>"

   # OpenRouter AI API Key (optional — system gracefully uses fallback template if omitted)
   OPENROUTER_API_KEY="<your_openrouter_api_key>"
   ```
   `AUTH_SECRET`, `DATABASE_URL`, and `PAYPAL_WEBHOOK_ID` are **RESERVED / NOT YET USED** (no auth, database persistence, or webhook receiver exists). `DEFAULT_MIN_RESERVE_CENTS` and `DEFAULT_FORECAST_DAYS` are consumed by the server.

4. **Run Lint, Typecheck, and Tests**:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```
   `npm test` runs the deterministic unit suite with the Node.js test runner and `tsx`. It never calls live PayPal endpoints.

5. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

### Continuous Integration

The CI workflow (`.github/workflows/ci.yml`) runs on push and pull request: `npm ci`, then `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. None of these steps require PayPal credentials, a database, or a live server.

### Manual Verification Scripts (not part of `npm test`)

- `node scripts/run-e2e.mjs` — builds/starts the app on a free port and exercises the deterministic HTTP flow (baseline, reserve block, collection, payout, idempotent replay, reset).
- `node scripts/verify-chart-render.mjs` — API-level check of the seed scenario against a running server (`BASE_URL`, default `http://localhost:3000`).
- `node scripts/paypal-auth-test.mjs` and `node scripts/paypal-payouts-scope-test.mjs` — optional manual PayPal Sandbox checks that require secrets and network access. They print no secrets or tokens.

### Security Model (Current)

- The server is the single source of truth. `GET /api/state` returns `{account, invoices, bills, auditLogs, capabilities: {paypalSandboxEnabled}}`; the browser does not import the in-memory store, and mutations return a fresh snapshot.
- All mutation routes enforce same-origin requests and Zod validation.
- The live PayPal rail is a server-side decision: the client cannot enable it, and `PAYPAL_PAYOUTS_ENABLED` must be `true`.
- `/api/reset` requires `{confirm: true}` plus a same-origin request, and in production a matching `x-demo-admin-token` header when `DEMO_ADMIN_TOKEN` is set.
- There is **no authentication, no user accounts, and no tenant isolation**. Do not deploy this as a multi-tenant service.

---

## Partner & Judge Demo Walkthrough

A complete, 3–4 minute walkthrough script is provided in [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).

### Quick Demo Summary:
The scenario is deterministic: `DEMO_AS_OF` defaults to **2026-11-03**, so day offsets are stable even when the demo is run later.
1. **Day 0 (Initial State)**: Cash is **$4,200.00**. Minimum safety floor is **$2,000.00**.
2. **The Problem (Runway Tab)**: On Day 10 (**2026-11-13**), Acme Supplies' **$3,000.00** bill matures. Paying it drops cash to **$1,200.00**, breaching the safety floor by **-$800.00**.
3. **The Guardrail (Payouts Tab)**: Attempting to pay Acme Supplies is **blocked** by reserve policy (HTTP 403 `RESERVE_BREACH_BLOCKED`).
4. **The Resolution (Collections Tab)**: Merchant opens Apex Corp's overdue invoice ($1,500.00), reviews an AI-drafted reminder, approves it, and simulates customer settlement. Cash rises to **$5,700.00**.
5. **The Safe Execution (Payouts Tab)**: With $5,700.00 in cash, post-payout balance will be $2,700.00 (+$700 buffer above reserve). Acme Supplies payout is unlocked. Merchant authorizes payout with 2-step confirmation; replaying the same idempotency key returns the stored result instead of paying twice.
6. **Audit Trail (Audit Tab)**: All actions are chronologically logged with exact amounts and timestamps (in-memory; resets on server restart).

To reset the scenario at any time, click **"Reset Demo"** in the top navigation bar. The reset restores $4,200.00, the overdue Apex invoice, the pending Acme bill, and the Day-10 breach.

---

## Status Matrix: Verified vs. Simulated vs. Limitations

In keeping with our strict standard of technical truthfulness, here is an exact accounting of every capability:

| Capability | Status | Implementation Details |
|---|---|---|
| **Deterministic Runway Engine** | **VERIFIED** | 100% deterministic code in integer cents; unit-tested. Bills matched by `dueDate` only, overdue/day-0 clamped to Day 1, includes PENDING/APPROVED/IN_FLIGHT, reports `minBalanceCents` and `firstBreachDeficitCents`. |
| **Reserve Floor Enforcement** | **VERIFIED** | Enforces the $2,000 floor and blocks unsafe payouts with HTTP 403 `RESERVE_BREACH_BLOCKED`. |
| **Two-Step Authorization** | **VERIFIED** | Merchant review + explicit confirmation; the API requires `confirmed: true`. |
| **Idempotency Protection** | **IN-PROCESS ONLY** | UUID keys validated with Zod and tracked through `beginPayout -> IN_FLIGHT -> completePayout/failPayout`. Duplicate replays of a `SUCCEEDED` key return the stored result; concurrent requests cannot double-disburse within one process. **Not durable, not multi-instance safe**, and resets on server restart. |
| **PayPal Sandbox OAuth** | **UNVERIFIED / ASSUMED** | Client Credentials flow is implemented; no credential-backed HTTP verification is recorded in this repository. Manual script requires secrets. |
| **PayPal Payouts OAuth Scope** | **UNVERIFIED / ASSUMED** | Payouts scope presence is not confirmed. A manual scope-check script exists but has not been run as part of verification. |
| **Strict Sandbox Origin Guard** | **VERIFIED (STATIC)** | Only `https://api-m.sandbox.paypal.com` is permitted; any other configured origin is rejected before a token is requested. |
| **Live PayPal Sandbox Payout Dispatch** | **IMPLEMENTED, UNVERIFIED** | Server-side gated by `PAYPAL_PAYOUTS_ENABLED=true`; the client cannot enable it. Requires credentials. No recorded live dispatch has been verified. |
| **Payout Simulation Mode** | **VERIFIED** | Local ledger settlement with audit logging; this is the default rail. |
| **OpenRouter AI Reminder Drafts** | **FALLBACK WORKING / LIVE UNVERIFIED** | Fallback template fully functional and honestly labelled. Draft route is rate-limited and Zod-validated; a live OpenRouter key is not verified in production. |
| **Customer Payment Simulation** | **SIMULATED** | Local ledger demonstration, attributed to `MERCHANT` (not `PAYPAL_WEBHOOK`). Clearly labelled with zero live money movement. |
| **Reminder Approval Persistence** | **VERIFIED (IN-MEMORY)** | Persisted server-side at `POST /api/reminders/approve`; resets on server restart. |
| **Audit Trail** | **IN-MEMORY, NOT IMMUTABLE** | UUID-ID entries in an in-memory array. Not append-only/immutable, and resets on server restart. |
| **Authentication / User Accounts** | **NOT IMPLEMENTED** | No login, sessions, roles, or auth middleware. Same-origin checks are not authentication. |
| **Tenant Isolation** | **NOT IMPLEMENTED** | Single demo merchant; no row-level or request-level tenancy. |
| **Database Persistence** | **NOT IMPLEMENTED** | Prototype uses an in-memory repository. PostgreSQL is planned/reserved only. State resets on server restart. |
| **PayPal Webhooks / Signature Verification** | **NOT IMPLEMENTED** | No webhook receiver or cryptographic verification exists. `PAYPAL_WEBHOOK_ID` is reserved/unused. |
| **PayPal Invoicing / Orders APIs** | **NOT IMPLEMENTED** | Demo uses simulated checkout links; no live Invoicing or Orders integration. |
| **Outbound Email Transport** | **NOT IMPLEMENTED** | Reminders are staged locally in the audit log; no SMTP/SES/SendGrid service is connected. |
| **Multi-instance-safe Idempotency** | **NOT IMPLEMENTED** | Keys live in one Node process. Horizontal scaling or restarts would break deduplication. |

**Known operational limitation:** all state (account, invoices, bills, audit log, idempotency keys) is in memory and resets when the server restarts. Payout dispatch against PayPal remains unverified unless valid sandbox credentials are supplied **and** `PAYPAL_PAYOUTS_ENABLED=true`.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
