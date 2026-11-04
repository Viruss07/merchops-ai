# Architecture Decision Records (ADRs)

## MerchOps AI — Financial Operations Copilot

This document records the architectural and design decisions made for MerchOps AI, including the context, rationale, and consequences of each choice.

---

### ADR-001: Store and Calculate All Currency in Integer Cents

- **Status**: Accepted
- **Context**: Standard floating-point representations (IEEE 754) in programming languages and databases suffer from binary rounding errors (e.g., `0.1 + 0.2 !== 0.3`). In financial systems, rounding discrepancies erode trust and cause ledger imbalances.
- **Decision**: All financial amounts, account balances, invoice totals, bill amounts, and runway forecasts are stored in PostgreSQL as `BIGINT` and represented in TypeScript as integer cents (e.g., `$150.00` is represented as `15000`). Floating-point conversion is restricted strictly to final presentation formatting at the UI layer.
- **Consequences**:
  - Eliminates precision loss and rounding drift completely.
  - Requires explicit division by 100 for display and multiplication by 100 on user input parsing.
  - Standardizes currency across backend, database, and client state.

---

### ADR-002: Deterministic Mathematical Forecasting vs. LLM-Based Calculations

- **Status**: Accepted
- **Context**: Large Language Models (LLMs) are probabilistic and prone to hallucination, subtle calculation errors, and non-reproducible outputs when executing multi-step mathematical calculations.
- **Decision**: The 30-day runway projection algorithm and cash reserve checks are implemented entirely in deterministic TypeScript code and SQL aggregation queries. The LLM is **never** permitted to calculate balances, projections, or thresholds. The LLM's role is strictly limited to explaining deterministic results and drafting correspondence.
- **Consequences**:
  - 100% testable, predictable, and verifiable cash flow numbers.
  - LLM cannot hallucinate false balance projections.
  - Reduces LLM token usage and latency for core dashboard rendering.

---

### ADR-003: Mandatory Human-in-the-Loop Approval for Outbound Actions

- **Status**: Accepted
- **Context**: Autonomous AI agents initiating real-world financial transactions or outbound customer communications introduce unacceptable liability, customer friction, and financial risk.
- **Decision**: The AI agent operates exclusively in an advisory and drafting capacity. Every message sent to a customer and every vendor payout dispatched through PayPal requires explicit, interactive merchant confirmation via UI approval.
- **Consequences**:
  - Prevents unintended fund movement or embarrassing automated collection notices.
  - Clear user accountability: every action is associated with a specific merchant approval event in the audit log.
  - Disallows fully autonomous "hands-off" background payout execution.

---

### ADR-004: Strict Isolation of PayPal API Secrets from AI Prompts

- **Status**: Accepted
- **Context**: Prompt injection, data leakage, and training data retention risks mean credentials sent to third-party AI APIs can be compromised.
- **Decision**: AI prompts are processed through a strict `Prompt Sanitizer`. PayPal API keys, OAuth client secrets, webhook secrets, and database connection strings are strictly forbidden from entering any prompt payload. The AI layer interacts with anonymized or minimal domain objects (e.g., invoice number, amount, customer name).
- **Consequences**:
  - Even if an LLM is prompted adversarially, it has no access to sensitive secrets.
  - Enforces zero-trust boundaries within the application backend.

---

### ADR-005: OpenRouter as Product AI Gateway

- **Status**: Accepted
- **Context**: We need flexible, highly capable LLM inference (e.g., Anthropic Claude 3.5 Sonnet) with low latency, structured JSON outputs, and transparent usage monitoring.
- **Decision**: Use OpenRouter as the unified API gateway for product AI.
- **Consequences**:
  - Simplifies switching or benchmarking models without rewriting integration code.
  - Provides a single billing and rate-limiting dashboard.
  - Relies on OpenRouter API availability during the hackathon evaluation.

---

### ADR-006: Next.js App Router + TypeScript + PostgreSQL + Render

- **Status**: Accepted
- **Context**: A full-stack solution is required for rapid development, type safety across client and server, relational integrity for financial ledgers, and seamless deployment.
- **Decision**:
  - **Framework**: Next.js App Router (React Server Components + Server Actions / Route Handlers).
  - **Language**: TypeScript with strict mode.
  - **Database**: PostgreSQL (relational integrity, foreign keys, transaction isolation).
  - **Deployment**: Render (web service + managed PostgreSQL).
- **Consequences**:
  - End-to-end type safety from database query to UI component.
  - Native support for secure API route handlers (e.g., webhook listeners).
  - Straightforward migration path to production environments.

---

### ADR-007: Webhook Signature Verification and Idempotency Protection

- **Status**: Accepted
- **Context**: Webhooks can be intercepted, forged, duplicated, or delivered out of order by payment networks.
- **Decision**:
  1. Every incoming webhook request to `/api/webhooks/paypal` must pass cryptographic signature verification via PayPal's verification endpoint.
  2. Every processed webhook event ID (`transmission_id`) is stored in a `webhook_events` database table with a unique constraint. Duplicate deliveries are immediately acknowledged with `200 OK` and bypassed.
  3. All outbound payment/payout API calls attach a client-generated UUIDv4 idempotency key.
- **Consequences**:
  - Protects against double-crediting invoices or double-disbursing vendor payouts.
  - Prevents spoofed webhook injection attacks.

---

### ADR-008: Strict Sandbox Origin Lockdown

- **Status**: Accepted
- **Context**: Accidentally addressing live PayPal production endpoints during demo or testing could trigger unauthorized live transactions.
- **Decision**: The payout execution API strictly enforces `PERMITTED_SANDBOX_ORIGIN = 'https://api-m.sandbox.paypal.com'`. If `PAYPAL_API_BASE_URL` is configured to any other origin, the request is immediately rejected with HTTP 500 `INVALID_PAYPAL_ENDPOINT` before obtaining an OAuth token or making any external request.
- **Consequences**:
  - Production endpoints cannot be called under any circumstances.
  - Fail-safe isolation for sandbox development.

---

### ADR-009: In-Memory Demo Ledger with Replaceable Repository Pattern

- **Status**: Accepted
- **Context**: For hackathon partner demos and rapid evaluation, requiring a running PostgreSQL instance adds friction and requires manual database provisioning.
- **Decision**: Implement the initial prototype using an in-memory singleton repository (`demoStore`) with seeded demo data ($4,200 balance, $2,000 reserve, Apex Corp invoice, Acme Supplies bill). The interface (`getAccount`, `getInvoices`, `getBills`, `getAuditLogs`, `markBillDisbursed`) is isolated to remain drop-in replaceable with Prisma/PostgreSQL without altering UI components.
- **Consequences**:
  - Zero-friction demo setup: runs with simple `npm run dev`.
  - State resets on server restart, cleanly documented for judges and evaluators.
  - Clean separation of concerns between storage interface and business logic.


