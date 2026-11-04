# MerchOps AI — Autonomous Financial Operations & Cash Flow Copilot

> Built for the **PayPal AI Hackathon 2026**  
> **Core Architectural Principle**: *"AI proposes, rules decide. AI must never independently move money."*

---

## What MerchOps AI Does

Small merchants struggle with fragmented working capital management: juggling late-paying customers, imminent supplier bills, and the constant risk of overdraft fees or cash crunches.

**MerchOps AI** is a guardrailed financial operations cockpit that bridges accounts receivable (AR) and accounts payable (AP) under **deterministic cash reserve protection**:
1. **Anticipates Cash Shortfalls**: Projects 30-day daily cash balances using pure deterministic arithmetic.
2. **Accelerates Receivables**: AI drafts polite, context-aware payment reminders for overdue invoices with one-click payment links.
3. **Protects Working Capital**: Enforces a non-negotiable safety reserve floor ($2,000.00), automatically blocking payouts that would trigger a liquidity breach.
4. **Guarantees Human Control**: Outbound disbursements require a two-step merchant confirmation flow with UUIDv4 idempotency keys.

---

## Main Features & Core Modules

### 1. Runway & Cash-Flow Forecasting
- **Deterministic 30-Day Engine**: Day-by-day cash trajectory calculated in exact integer cents ($1.00 = 100 cents). Zero LLM math hallucinations.
- **Safety Floor Monitoring**: Enforces a minimum cash reserve floor ($2,000.00).
- **Proactive Breach Alerts**: Flags impending deficits in advance (e.g., Day 10 shortfall of -$800.00 when a $3,000 supplier bill matures on a $4,200 balance).
- **Interactive Visual Timeline**: 30-day trajectory bar chart with reserve floor guideline and full expandable ledger table.

### 2. Collections (Accounts Receivable)
- **Overdue Invoice Management**: Tracks receivables, aging buckets, and customer payment status.
- **AI-Assisted Reminders**: Proposes tailored payment reminder emails matching invoice aging and customer relationship context.
- **Human-in-the-Loop Review**: Slide-over drawer lets merchants edit, review, and approve drafts before staging.
- **Simulated Settlement**: One-click settlement simulator updates cash balance in real time to demonstrate working capital recovery.

### 3. Payouts (Accounts Payable)
- **Dynamic Reserve Guardrail**: Evaluates pending vendor disbursements against projected cash balance.
- **Automated Breach Blocking**: Disallows payouts that breach the reserve floor (returns HTTP 403 `RESERVE_BREACH_BLOCKED`).
- **Two-Step Authorization Flow**: Requires explicit liquidity impact review and checkbox confirmation.
- **Idempotency Protection**: Unique UUIDv4 idempotency key per transaction prevents duplicate dispatches (returns HTTP 409 `DUPLICATE_REQUEST` on replays).
- **Dual Execution Rails**:
  - *Verified Simulation Rail*: Instant local ledger settlement with complete audit logging.
  - *Live PayPal Sandbox Rail*: Authenticates via OAuth Client Credentials and dispatches to PayPal Sandbox Payouts with strict origin lockdown (`https://api-m.sandbox.paypal.com`).

### 4. Operations & Audit Trail
- **Chronological Ledger**: Tracks all balance updates, reminder approvals, simulated customer payments, and blocked/authorized payouts.
- **Action Differentiation**: Clearly tags events (`PAYOUT_DISBURSED_SIMULATED`, `PAYOUT_BLOCKED_RESERVE_BREACH`, `INVOICE_PAID_SIMULATED`, `REMINDER_DRAFT_APPROVED`).
- **Audit Filtering**: Filter events by Payouts, Collections, or Reserve Guardrails.

---

## Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | React 19, TypeScript, Server & Client Components |
| **Data Tables** | AG Grid Community (v36) | High-performance interactive data grids for Collections, Payouts, and Audit Trail |
| **Styling** | Tailwind CSS + AG Theme Quartz | Modern high-trust financial dashboard with custom AG Grid theme integration |
| **Icons** | Lucide React | Consistent iconography across indicators and navigation |
| **Testing** | Node.js Test Runner (`node:test`) | Fast, zero-dependency unit and integration test suite |
| **Calculations** | Pure TypeScript Functions | 100% deterministic integer cents math (`lib/money.ts`, `lib/runway.ts`) |
| **Payment Integration** | PayPal REST APIs (Sandbox) | Client Credentials OAuth (`/v1/oauth2/token`), Payouts (`/v1/payments/payouts`) |
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
   # PayPal Sandbox Credentials (from developer.paypal.com)
   PAYPAL_API_BASE_URL="https://api-m.sandbox.paypal.com"
   PAYPAL_CLIENT_ID="<your_sandbox_client_id>"
   PAYPAL_CLIENT_SECRET="<your_sandbox_client_secret>"

   # OpenRouter AI API Key (optional — system gracefully uses fallback template if omitted)
   OPENROUTER_API_KEY="<your_openrouter_api_key>"
   ```

4. **Run the Automated Test Suite**:
   ```bash
   npm test
   ```

5. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Partner & Judge Demo Walkthrough

A complete, 3–4 minute walkthrough script is provided in [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).

### Quick Demo Summary:
1. **Day 0 (Initial State)**: Cash is **$4,200.00**. Minimum safety floor is **$2,000.00**.
2. **The Problem (Runway Tab)**: On Day 10, Acme Supplies' **$3,000.00** bill matures. Paying it drops cash to **$1,200.00**, breaching the safety floor by **-$800.00**.
3. **The Guardrail (Payouts Tab)**: Attempting to pay Acme Supplies is **blocked** by reserve policy.
4. **The Resolution (Collections Tab)**: Merchant opens Apex Corp's overdue invoice ($1,500.00), reviews an AI-drafted reminder, and simulates customer settlement. Cash rises to **$5,700.00**.
5. **The Safe Execution (Payouts Tab)**: With $5,700.00 in cash, post-payout balance will be $2,700.00 (+$700 buffer above reserve). Acme Supplies payout is unlocked. Merchant authorizes payout with 2-step confirmation and idempotency protection.
6. **Audit Trail (Audit Tab)**: All actions are chronologically logged with exact amounts and timestamps.

To reset the scenario at any time, click **"Reset Demo"** in the top navigation bar.

---

## Status Matrix: Verified vs. Simulated vs. Limitations

In keeping with our strict standard of technical truthfulness, here is an exact accounting of every capability:

| Capability | Status | Implementation Details |
|---|---|---|
| **Deterministic Runway Engine** | **VERIFIED** | 100% deterministic code in integer cents. Verified via automated unit tests. |
| **Reserve Floor Enforcement** | **VERIFIED** | Enforces $2,000 safety floor; blocks unsafe payouts with HTTP 403. |
| **Two-Step Authorization** | **VERIFIED** | Merchant review + confirmation checkbox mandatory for disbursements. |
| **Idempotency Protection** | **VERIFIED (Demo)** | UUIDv4 key generated per session. Verified duplicate rejection (HTTP 409). Resets on server restart. |
| **PayPal Sandbox OAuth** | **VERIFIED** | Client Credentials token fetch against Sandbox returned HTTP 200. |
| **PayPal Payouts OAuth Scope** | **VERIFIED** | `https://uri.paypal.com/payments/payouts` verified present in token. |
| **Strict Sandbox Origin Guard** | **VERIFIED** | Strict lockdown: only `https://api-m.sandbox.paypal.com` permitted; rejects any other origin. |
| **Payout Simulation Mode** | **VERIFIED** | Tested and verified local ledger settlement with complete audit logging. |
| **OpenRouter AI Reminder Drafts** | **FALLBACK WORKING** | Fallback template fully functional and honestly labelled. Live OpenRouter key unverified in production. |
| **Customer Payment Simulation** | **SIMULATED** | Local ledger demonstration. Clearly labelled as simulation with zero live money movement. |
| **Actual PayPal Sandbox Payout Dispatch** | **UNVERIFIED** | API payload generation implemented; live execution against PayPal Sandbox endpoints intentionally unverified to avoid untested state transitions. |
| **Outbound Email Transport** | **NOT IMPLEMENTED** | Reminders are staged locally in the audit log; no SMTP/SES/SendGrid service is connected. |
| **PayPal Invoicing API Creation** | **NOT IMPLEMENTED** | Demo uses simulated checkout links; live PayPal Invoicing API integration is pending Phase 6. |
| **Database Persistence** | **IN-MEMORY DEMO** | Prototype state is held in an in-memory repository for demo agility. Resets on server restart. |
| **Webhook Signature Verification** | **PENDING** | Webhook listener and cryptographic signature validation slated for Phase 6. |

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
