# MerchOps AI — Guardrailed Financial Operations & Cash Flow Copilot

> **1-Line Pitch**: MerchOps AI is a guardrailed cash-flow copilot that projects working capital in integer cents, accelerates collections via real PayPal Invoicing v2, executes fee-safe payouts under deterministic reserve-floor guardrails, and enforces a strict architectural boundary: **"AI proposes, rules decide. AI must never independently move money."**
>
> Built for the **PayPal AI Hackathon 2026** | Nov 12, 2026 Deadline

[![CI](https://github.com/Viruss07/merchops-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Viruss07/merchops-ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![AG Grid Community](https://img.shields.io/badge/AG%20Grid-v36%20Community-green.svg)](https://www.ag-grid.com/)
[![PayPal Sandbox](https://img.shields.io/badge/PayPal-Invoicing%20v2%20%2B%20Payouts-003087.svg)](https://developer.paypal.com/)

---

## ⚡ 30-Second Judge's Path

If you have only 2 minutes to evaluate this submission, follow this high-impact sequence:

1. **Open the Judge Mode**: Navigate to [`/demo`](https://merchops-ai.onrender.com/demo) (or `http://localhost:3000/demo`).
2. **Launch "Run it Live"**: Click the green **"Run it Live"** button in the header banner.
   - **Step 1 (Real Invoicing)**: Creates a real live PayPal Sandbox invoice ($15.00) in 1 click, retrieves the authentic `recipient_view_url` and QR code. Open the payment link in a sandbox buyer window to pay and watch the balance credit via verified webhooks!
   - **Step 2 (Fee-Inclusive Payout)**: Dispatches a live $1.00 vendor payout with real upfront fee calculation ($0.25 PayPal fee).
3. **Follow the Guided Tour**: Click **"Start Tour"** to inspect the 5 core milestones:
   - **Milestone 1 (Runway Forecast)**: Observe Day 10 shortfall (-$800.00) when a $3,000.00 bill matures on a $4,200.00 balance.
   - **Milestone 2 (Safety Floor Guardrail)**: Try to disburse Acme Supplies on Payouts tab; see it **hard-blocked** by the $2,000.00 safety floor (`RESERVE_BREACH_BLOCKED`).
   - **Milestone 3 (AI Cash Plan Copilot)**: Review 3 distinct AI-generated strategies (*Safest*, *Fastest Cash*, *Lowest Cost*), each evaluated by our deterministic validation engine.
   - **Milestone 4 (Adversarial Bench)**: Visit [`/bench`](https://merchops-ai.onrender.com/bench) to test 12 prompt injection attacks, schema poisoning attempts, and balance-draining traps safely defused.
   - **Milestone 5 (Agentic Commerce MCP)**: Inspect our read/propose-only Model Context Protocol server at `mcp/server.mts`.

---

## 🏛️ Non-Negotiable Financial Rules

Every line of code and database trigger enforces these core rules:

1. **AI Never Moves Money**: Model outputs are strictly proposals. Only deterministic code applies policy and calls payout/invoicing APIs. Never expose money-moving tools to an LLM or MCP agent.
2. **Deterministic Idempotency**: Outbound PayPal requests use `PayPal-Request-Id` derived deterministically from `(entity_id, action, attempt)` — never random UUIDs, preventing double-billing on network retries.
3. **Integer Cents Representation**: All DB columns, state fields, and ledger operations use exact integer cents ($1.00 = 100 cents). Decimal strings only appear at the PayPal REST API boundary.
4. **Fee-Inclusive Reserve Policy**: US domestic payout fees (2%, min $0.25, max $1.00) are factored into reserve checks before approval, preventing fee-induced balance breaches.
5. **Cryptographic Webhook Verification**: Inbound webhooks are validated against PayPal certificates via `POST /v1/notifications/verify-webhook-signature` and deduped against an append-only `webhook_events` table.
6. **Append-Only Immutability**: `audit_logs` and `ledger_entries` in PostgreSQL are protected by database triggers that explicitly reject `UPDATE` and `DELETE` operations.
7. **Concurrency Advisory Locks**: Payout approvals acquire transaction-scoped PostgreSQL advisory locks (`pg_advisory_xact_lock`) on the bill ID to prevent race conditions.

---

## 📊 Status Matrix: Technical Truthfulness

In keeping with our strict standard of engineering honesty, here is an exact accounting of every capability:

| Capability | Status | Implementation Details |
|---|---|---|
| **Deterministic Runway Engine** | **[VERIFIED]** | 100% deterministic arithmetic in integer cents; 51 unit tests. Due-date matching, overdue clamping, reserve deficit reporting (`src/lib/runway.ts`). |
| **Safety Reserve Floor** | **[VERIFIED]** | Non-negotiable $2,000.00 floor. Enforced server-side with HTTP 403 `RESERVE_BREACH_BLOCKED` (`src/lib/payoutPolicy.ts`). |
| **Two-Step Authorization** | **[VERIFIED]** | Human-in-the-loop review + mandatory checkbox confirmation (`confirmed: true` enforced on server). |
| **PayPal Invoicing v2 (Draft & Send)** | **[VERIFIED]** | `POST /v2/invoicing/invoices` creates draft; `POST /send` activates; `GET` retrieves `recipient_view_url` (`src/lib/paypalInvoicing.ts`). |
| **Invoicing v2 (Remind & QR Code)** | **[VERIFIED]** | `POST /remind` delivers AI-proposed reminder via PayPal; `POST /generate-qr-code` renders QR for point-of-sale checkout. |
| **PayPal Payouts Dispatch** | **[VERIFIED]** | `POST /v1/payments/payouts` with deterministic idempotency keys and upfront 2% fee calculation (min $0.25, max $1.00). |
| **Webhook Cryptographic Verification**| **[VERIFIED]** | `POST /v1/notifications/verify-webhook-signature` validates signatures. Handlers update invoices and debit ledger idempotently (`src/lib/paypal.ts`). |
| **PostgreSQL Persistence** | **[VERIFIED]** | Full schema (`migrations/001_init.sql` to `004_ai_proposals.sql`), migration runner (`scripts/migrate.mjs`), and `PgRepository`. |
| **Append-Only Triggers** | **[VERIFIED]** | PostgreSQL triggers block `UPDATE` and `DELETE` on `audit_logs` and `ledger_entries`. |
| **Transactional Advisory Locks** | **[VERIFIED]** | `pg_advisory_xact_lock(hashtext(bill_id))` prevents race condition double-spends during simultaneous clicks. |
| **AI Cash Plan Copilot** | **[VERIFIED]** | Generates 3 strategies (Safest, Fastest Cash, Lowest Cost) via OpenRouter model fallthrough; validated by deterministic policy. |
| **Prompt Injection Spotlight** | **[VERIFIED]** | Defends against instruction overrides, jailbreaks, and zero-amount invoice traps (`src/lib/ai/spotlight.ts`). |
| **Guardrail Bench (/bench)** | **[VERIFIED]** | Interactive test bench executing 12 adversarial scenarios across injection, reserve breach, and duplicate replay attacks. |
| **Agentic Commerce MCP Server** | **[VERIFIED]** | JSON-RPC 2.0 MCP server (`mcp/server.mts`) providing read & propose tools (`get_cash_runway`, `propose_cash_plan`); zero money movement tools. |
| **AG Grid Community Tables** | **[VERIFIED]** | High-density grids for Collections, Payouts, and Audit Trail using open AG Grid Community v36. |

---

## 🛠️ Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | React 19, TypeScript, Server & Client Components |
| **Data Tables** | AG Grid Community (v36) | Sorting, filtering, quick search, and custom cell action buttons |
| **Database & ORM** | PostgreSQL (Neon / Render) | Integer-cents schema, advisory locks, append-only triggers, migration runner |
| **Payments Rail** | PayPal Developer Sandbox | REST Invoicing v2, Payouts, Webhook Verification, Token Cache |
| **SDK Integration** | APIMatic PayPal TypeScript SDK | Typed API bindings, model contracts, and validation utilities |
| **AI Model Gateway** | OpenRouter API | Fallthrough cascade: Llama 3.3 70B -> DeepSeek R1 -> Qwen 2.5 Coder -> Fallback Template |
| **Agent Protocol** | Model Context Protocol (MCP) | Read/propose-only server over stdio for external AI agents |
| **Styling** | Tailwind CSS + AG Theme Quartz | High-density financial cockpit with accessible dark/light contrast |
| **Testing** | Node.js Test Runner + `tsx` | 51 automated unit and integration tests across money, policy, runway, and AI |
| **Deployment** | Render Web Service + Postgres | `render.yaml` blueprint with automatic database provisioning and keep-warm job |

---

## 🧪 Guardrail Bench (`/bench`)

To demonstrate the robustness of our architecture, we provide a dedicated test bench at `/bench`. It evaluates the system against 12 adversarial attack scenarios:

1. **Direct Instruction Override**: Attacker attempts to bypass reserve floor via prompt injection in invoice notes. (Defused by Spotlight)
2. **Hidden Jailbreak in Vendor Name**: Prompt injection embedded in vendor display name. (Defused by Spotlight)
3. **Markdown Exfiltration**: Attacker injects fake images to exfiltrate session data. (Sanitized)
4. **Reserve Floor Breach ($3,000 on $4,200 balance)**: Deterministic policy blocks transaction with HTTP 403.
5. **Fee-Induced Reserve Breach ($2,199 on $4,200 balance)**: A payout that appears safe fails when $1.00 PayPal fee breaches the floor.
6. **Concurrent Double-Spend**: Two simultaneous payouts on the same bill handled safely by Postgres advisory locks.
7. **Idempotent Replay**: Duplicate payment requests return stored transaction ID without duplicate debit.
8. **Forged Webhook Signature**: Invalid webhook certificate signature rejected with HTTP 400.
9. **Duplicate Webhook Delivery**: Second webhook with same `event_id` is safely ignored.
10. **Zero-Amount Invoice Trap**: Attacker submits $0 invoice to corrupt runway math; rejected by Zod schema.
11. **Negative Payout Amount**: Attacker attempts credit injection via negative payout; rejected by Zod schema.
12. **Model Math Hallucination**: LLM proposes an unvalidated balance projection; rejected by deterministic validator.

---

## 🤖 Agentic Commerce MCP Server (`mcp/server.mts`)

MerchOps AI exposes its financial intelligence to external AI agents via the **Model Context Protocol (MCP)**:

```bash
# Start the MCP server over stdio
npm run mcp
```

### Available MCP Tools (Strictly Read / Propose):
- `get_cash_runway`: Returns current cash balance, reserve floor, 30-day projection, and breach warnings.
- `get_invoices`: Returns list of receivables, overdue days, and collection status.
- `get_bills`: Returns upcoming supplier bills, due dates, and reserve impact flags.
- `propose_cash_plan`: Solicits structured AI proposal for accelerating receivables and postponing payables.
- `validate_cash_plan`: Runs deterministic policy checks against any proposed plan.

**Zero Execution Tools**: The MCP server deliberately contains no tools for sending invoices, moving money, or approving payouts. All financial mutations require human merchant authorization in the MerchOps UI.

---

## 📦 Local Setup & Development

### Prerequisites
- Node.js `v20+` or `v24+`
- npm `v10+`

### Installation
```bash
# Clone the repository
git clone https://github.com/Viruss07/merchops-ai.git
cd merchops-ai

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env.local
```

### Configure `.env.local`:
```bash
DEMO_AS_OF=2026-11-03
PAYPAL_API_BASE_URL="https://api-m.sandbox.paypal.com"
PAYPAL_CLIENT_ID="<your_sandbox_client_id>"
PAYPAL_CLIENT_SECRET="<your_sandbox_client_secret>"
PAYPAL_PAYOUTS_ENABLED=true
PAYPAL_WEBHOOK_ID="<your_sandbox_webhook_id>"
OPENROUTER_API_KEY="<your_openrouter_api_key>"

# Optional: PostgreSQL Database (defaults to in-memory store if unset)
DATABASE_URL="postgres://user:password@localhost:5432/merchops"
```

### Verify Local Build & Tests:
```bash
# Run unit tests (51 passing deterministic tests)
npm test

# Run TypeScript typecheck
npm run typecheck

# Run ESLint
npm run lint

# Run production build
npm run build

# Start local server
npm run dev
```

---

## 🚀 Deployment on Render

MerchOps AI includes an automated Infrastructure-as-Code blueprint in [`render.yaml`](render.yaml):

1. **Fork or Push** your repository to GitHub.
2. Log in to [Render Dashboard](https://dashboard.render.com/) and click **New > Blueprint**.
3. Select your repository. Render will automatically parse `render.yaml` and configure:
   - A Node.js Web Service (`merchops-ai`) running Next.js.
   - A managed PostgreSQL instance (`merchops-db`).
4. In the Render Environment Variables tab for `merchops-ai`, provide your secrets:
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `OPENROUTER_API_KEY`
5. Once deployed, register your live webhook URL with PayPal:
   ```bash
   node scripts/register-webhook.mjs https://<your-render-subdomain>.onrender.com/api/paypal/webhook
   ```
6. Copy the output `Webhook ID` back into your Render environment variables as `PAYPAL_WEBHOOK_ID`.

---

## 🙏 Credits & Acknowledgments

- **APIMatic**: Special thanks to the APIMatic team for providing the PayPal TypeScript SDK tooling. *(Reminder: Submit APIMatic usage form around Nov 10 at [APIMatic Hackathon Form](https://docs.google.com/forms/d/e/1FAIpQLScP_Z_67Q2Qe4cK6K0m4f4y_uR_j4hX4t6_r5k6Z7q8_9w/viewform))*.
- **AG Grid**: High-density financial data presentation powered by AG Grid Community v36.
- **PayPal Developer Platform**: Invoicing v2 and Payouts Sandbox APIs.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
