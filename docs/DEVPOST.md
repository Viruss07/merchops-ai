# MerchOps AI — Devpost Hackathon Submission

**Tagline**: *An AI CFO that can't touch your money: integer-cent runway forecasting, deterministic guardrails, and real PayPal Invoicing + Payouts for resilient small businesses.*

---

## 1. Project Overview

### The Problem
Running out of cash is one of the most common reasons small businesses fail, and it usually shows up on a specific day: a supplier bill lands before a late customer pays. Merchants constantly struggle with late customer invoices while vendor supplier bills mature unpredictably. Autonomous AI tools promise to help, but giving an LLM direct access to move money is catastrophic: models miss transaction fees, fall for prompt injections, and hallucinate amounts.

### The Solution: MerchOps AI
MerchOps AI couples **predictive AI intelligence** with a **deterministic financial safety engine**:
- **Integer-Cent Cash Runway Engine**: Real-time 30-day projection measuring cleared cash against a strict $2,000.00 safety reserve floor.
- **Cash Plan Copilot**: AI proposes structured cash strategies ("Safest", "Fastest Cash", "Lowest Cost"). Our deterministic validator proves each plan safe or rejects it before any human confirmation.
- **Real PayPal Invoicing v2**: Merchants send invoices, customers pay via live sandbox links, and verified webhooks automatically recompute the cash runway in real time.
- **Fee-Inclusive PayPal Payouts**: Outbound disbursements enforce deterministic `PayPal-Request-Id` idempotency, calculate PayPal fees (2%, max $1.00), and require two-step interactive merchant confirmation.
- **Agentic Commerce via MCP**: External AI agents (like Claude Desktop) interact through a read-only and propose-only Model Context Protocol server.

---

## 2. How We Built It

- **Application**: Next.js 15 App Router, TypeScript, React 19, Tailwind CSS.
- **Interface**: one shared shell and a page per record (runway, each invoice, each bill, plans, ledger), each with one next step, a what-if runway preview and its own history.
- **Persistence**: the demo runs on an in-memory store. A Postgres schema with append-only triggers on audit and ledger, a `webhook_events` dedupe table, and a `PgRepository` with advisory locks is written, but not yet wired into the routes.
- **Concurrency & retries**: a bill state machine (a second authorization on an in-flight bill is refused) plus a deterministic `PayPal-Request-Id`, so a retried click can't pay twice.
- **PayPal APIs**: 
  - OAuth 2.0 Client Credentials with token caching & strict origin lockdown (`https://api-m.sandbox.paypal.com`)
  - Invoicing v2 (`createDraft`, `send`, `get`, `remind`, `cancel`, `QR`)
  - Payouts v1 (`createPayoutBatch`, `getPayoutBatch`, `getPayoutItem`)
  - Webhooks v1 with cryptographic signature verification (`POST /v1/notifications/verify-webhook-signature`)
- **AI Models & Defense**: OpenRouter free-model fallback chain (`recursive/flint-v1.0:free` -> `dots-studio/dots-3-note-preview:free` -> `nvidia/nemotron-3.5-super-vl:free`). The model's JSON plans are parsed against a closed action schema, grounded (no invented dollar figures), and re-simulated by the deterministic validator; prompt-injection spotlighting on customer and vendor text.

---

## 3. Video Demo Script (< 3 Minutes)

The scene-by-scene script, timings and recording checklist are in [DEMO_VIDEO_SCRIPT.md](../DEMO_VIDEO_SCRIPT.md).

- **YouTube**: add the link once uploaded

---

## 4. Verification Evidence & Sandbox Credentials

- **Live URL**: add the Render URL
- **Sandbox Base**: `https://api-m.sandbox.paypal.com`
- **Payer**: any PayPal sandbox Personal account (judges can create one in their developer dashboard)
- **Receiver**: the vendor email on the Nexus Cloud bill (a sandbox Personal account)
- **Audit & Proof**: All real transaction IDs, batch IDs, and webhook logs are visible on the dashboard in monospace with 1-click copy.

