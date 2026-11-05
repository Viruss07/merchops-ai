# Architecture Decision Records (ADRs)

## MerchOps AI — Financial Operations Copilot

This document records the architectural and design decisions made for MerchOps AI, including the context, rationale, and consequences of each choice. Each ADR carries an explicit **Implemented vs Planned** status so the record does not imply capabilities the prototype lacks.

---

### ADR-001: Store and Calculate All Currency in Integer Cents

- **Status**: Accepted — **Implemented (TypeScript); Planned (database)**
- **Context**: Standard floating-point representations (IEEE 754) in programming languages and databases suffer from binary rounding errors (e.g., `0.1 + 0.2 !== 0.3`). In financial systems, rounding discrepancies erode trust and cause ledger imbalances.
- **Decision**: All financial amounts, account balances, invoice totals, bill amounts, and runway forecasts are represented in TypeScript as integer cents (e.g., `$150.00` is represented as `15000`). Floating-point conversion is restricted strictly to final presentation formatting at the UI layer. A future PostgreSQL schema would use integer-cent columns; **no database columns exist in the current in-memory prototype**.
- **Consequences**:
  - Eliminates precision loss and rounding drift completely.
  - Requires explicit division by 100 for display and multiplication by 100 on user input parsing.
  - Standardizes currency across backend and client state.

---

### ADR-002: Deterministic Mathematical Forecasting vs. LLM-Based Calculations

- **Status**: Accepted — **Implemented**
- **Context**: Large Language Models (LLMs) are probabilistic and prone to hallucination, subtle calculation errors, and non-reproducible outputs when executing multi-step mathematical calculations.
- **Decision**: The runway projection algorithm and cash reserve checks are implemented entirely in deterministic TypeScript code. The LLM is **never** permitted to calculate balances, projections, or thresholds. The LLM's role is strictly limited to drafting correspondence.
- **Consequences**:
  - 100% testable, predictable, and verifiable cash flow numbers.
  - LLM cannot hallucinate false balance projections.
  - Reduces LLM token usage and latency for core dashboard rendering.

---

### ADR-003: Mandatory Human-in-the-Loop Approval for Outbound Actions

- **Status**: Accepted — **Implemented**
- **Context**: Autonomous AI agents initiating real-world financial transactions or outbound customer communications introduce unacceptable liability, customer friction, and financial risk.
- **Decision**: The AI agent operates exclusively in an advisory and drafting capacity. Every vendor payout requires explicit merchant confirmation (`confirmed: true`), and reminder drafts require a separate server-side approval call.
- **Consequences**:
  - Prevents unintended fund movement or embarrassing automated collection notices.
  - Every action is associated with a specific merchant approval event in the audit log.
  - Disallows fully autonomous "hands-off" background payout execution.

---

### ADR-004: Strict Isolation of PayPal API Secrets from AI Prompts

- **Status**: Accepted — **Implemented (minimal prompt surface); Planned (dedicated sanitizer)**
- **Context**: Prompt injection, data leakage, and training data retention risks mean credentials sent to third-party AI APIs can be compromised.
- **Decision**: PayPal API keys, OAuth client secrets, webhook secrets, and database connection strings are strictly forbidden from entering any prompt payload. The current draft route interpolates only minimal invoice fields (customer name, invoice number, amount, dates, description). A dedicated `sanitizer.ts` module is **planned**, not present.
- **Consequences**:
  - Even if an LLM is prompted adversarially, it has no access to sensitive secrets.
  - Keeps the prompt surface small without implying a sanitizer module that does not exist.

---

### ADR-005: OpenRouter as Product AI Gateway

- **Status**: Accepted — **Implemented (optional; fallback available)**
- **Context**: We need flexible, highly capable LLM inference (e.g., Anthropic Claude 3.5 Sonnet) with low latency, structured JSON outputs, and transparent usage monitoring.
- **Decision**: Use OpenRouter as the unified API gateway for product AI. When no key is configured, or the call fails/invalid JSON is returned, use a clearly labelled deterministic fallback template.
- **Consequences**:
  - Simplifies switching or benchmarking models without rewriting integration code.
  - Provides a single billing and rate-limiting dashboard.
  - Relies on OpenRouter API availability when a live key is used.

---

### ADR-006: Next.js App Router + TypeScript (PostgreSQL + Render Planned)

- **Status**: Accepted — **Partially Implemented; Planned (PostgreSQL/Render)**
- **Context**: A full-stack solution is required for rapid development, type safety across client and server, relational integrity for financial ledgers, and seamless deployment.
- **Decision**:
  - **Framework**: Next.js App Router (React Server Components + Route Handlers). **Implemented.**
  - **Language**: TypeScript with strict mode. **Implemented.**
  - **Database**: PostgreSQL (relational integrity, foreign keys, transaction isolation). **Planned — not implemented.**
  - **Deployment**: Render (web service + managed PostgreSQL). **Planned — not configured in this repository.**
- **Consequences**:
  - End-to-end type safety from route handler to UI component.
  - The current demo runs with a single process and an in-memory repository; persistence and deployment remain future work.

---

### ADR-007: Webhook Signature Verification and Idempotency Protection

- **Status**: Split — **Webhooks PLANNED (not implemented); Idempotency Implemented (in-process only)**
- **Context**: Webhooks can be intercepted, forged, duplicated, or delivered out of order by payment networks.
- **Decision**:
  1. **PLANNED**: Every incoming webhook request to `/api/webhooks/paypal` must pass cryptographic signature verification via PayPal's verification endpoint. No such route exists today.
  2. **PLANNED**: Processed webhook event IDs would be stored in a deduplication table. No webhook event table exists today.
  3. **IMPLEMENTED (in-process)**: Every outbound payout API call attaches a client-generated UUID idempotency key. A `beginPayout -> IN_FLIGHT -> completePayout/failPayout` state machine prevents double-disbursement within one process, and duplicate replays of a `SUCCEEDED` key return the stored result.
- **Consequences**:
  - Protects against double-disbursing vendor payouts within a single process.
  - **Does not** protect against spoofed webhook injection (no webhooks), restart loss, or multi-instance races. Those require the planned persistent design.

---

### ADR-008: Strict Sandbox Origin Lockdown

- **Status**: Accepted — **Implemented (static check); server-side gate added**
- **Context**: Accidentally addressing live PayPal production endpoints during demo or testing could trigger unauthorized live transactions.
- **Decision**: The payout execution API strictly enforces `PERMITTED_SANDBOX_ORIGIN = 'https://api-m.sandbox.paypal.com'`. If `PAYPAL_API_BASE_URL` is configured to any other origin, the request is immediately rejected with HTTP 500 `INVALID_PAYPAL_ENDPOINT` before obtaining an OAuth token or making any external request. In addition, the live rail is disabled unless the server env `PAYPAL_PAYOUTS_ENABLED=true`; the client cannot enable it.
- **Consequences**:
  - Production endpoints cannot be called under any circumstances.
  - Live dispatch remains unverified even when explicitly enabled.

---

### ADR-009: In-Memory Demo Ledger with Replaceable Repository Pattern

- **Status**: Accepted — **Implemented (in-memory prototype); Planned (durable repository)**
- **Context**: For hackathon partner demos and rapid evaluation, requiring a running PostgreSQL instance adds friction and requires manual database provisioning.
- **Decision**: Implement the prototype using an in-memory singleton repository (`demoStore`) with seeded demo data ($4,200 balance, $2,000 reserve, Apex Corp invoice, Acme Supplies bill). The repository exposes account/invoice/bill/audit access and mutation helpers. HTTP handlers expose a single `GET /api/state` snapshot; the browser does not import the store. The interface remains drop-in replaceable with a database-backed repository later.
- **Consequences**:
  - Zero-friction demo setup: runs with simple `npm run dev`.
  - State resets on server restart, cleanly documented for judges and evaluators.
  - In-memory idempotency and audit records share the same restart limitation.

---

### ADR-010: Deterministic Demo Clock and Server-Authoritative State

- **Status**: Accepted — **Implemented**
- **Context**: Wall-clock dates and client-side state made demo output drift between runs and let the browser and server disagree about balances.
- **Decision**:
  1. `DEMO_AS_OF` defaults to `2026-11-03` (env-overridable, `YYYY-MM-DD`). Runway starts from that date and invoice aging is derived from `dueDate`, so the documented Day-10 scenario is stable.
  2. The server is the single source of truth: `GET /api/state` returns `{account, invoices, bills, auditLogs, capabilities}`, and mutations return a fresh snapshot.
  3. Bills are matched by `dueDate` only, overdue/day-0 items are clamped to Day 1, and PENDING/APPROVED/IN_FLIGHT bills are included.
- **Consequences**:
  - Reproducible demos and tests that do not depend on the machine clock.
  - No client/server divergence from a duplicated in-memory store.
  - The demo clock is not a substitute for real date handling in a production ledger.
