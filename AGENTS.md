# AGENTS.md — Guidelines for AI Agents Working on MerchOps AI

This document establishes non-negotiable operational boundaries, architectural rules, and coding standards for all AI coding assistants working in the `merchops-ai` repository.

---

## 1. Core Mission & Persona

**MerchOps AI** is an intelligent financial operations copilot designed for small merchants participating in the **PayPal AI Hackathon 2026**.
Its primary modules are:
1. **Runway**: Deterministic 30-day cash-flow forecasting.
2. **Collections**: Overdue invoice tracking with AI-drafted payment reminders.
3. **Payouts**: Vendor payout planning with dynamic cash reserve protection.

---

## 2. Non-Negotiable Financial Rules

AI agents generating, modifying, or refactoring code in this repository **must enforce these 11 rules**:

1. **AI Never Moves Money Independently**: The AI engine may analyze, forecast, draft reminders, or propose payout schedules, but it must **never** execute a monetary transaction autonomously.
2. **Strict Secret Isolation**: AI agents and LLM prompts must **never** receive, read, or output PayPal API secrets, database credentials, or private authentication keys.
3. **Integer Cents Representation**: All financial amounts, calculations, ledger entries, and database columns must use integer cents (e.g., `$150.00` is represented as `15000`). Never use floating-point types (`FLOAT`, `REAL`, or JavaScript `number` arithmetic without quantization) for monetary figures.
4. **Ownership and Balance Validation**: Always validate record ownership (tenant/merchant ID) and account balances directly against the PostgreSQL database before preparing any action.
5. **Mandatory Human-in-the-Loop Approval**: Every outbound payout or money-moving action requires explicit, interactive merchant confirmation via UI approval.
6. **Deterministic Idempotency Keys**: Every external API request that initiates a payout, invoice mutation, or outbound payment must include a deterministic `PayPal-Request-Id` derived from `(entity_id, action[, attempt])`. Never use a random key like UUIDv4 per attempt, as a random key per attempt makes duplicate payments possible during network retries.
7. **Webhook Signature Verification**: All inbound PayPal webhooks must be cryptographically verified against PayPal's public certificates before any payload processing.
8. **Safe Duplicate Processing**: Webhook consumers must handle duplicate and out-of-order events idempotently using database-tracked event IDs.
9. **Immutable Audit Trail**: All financial events, status transitions, AI recommendations, and merchant approval decisions must be permanently recorded in an immutable audit log table.
10. **Zero Secrets in Code**: Never commit credentials, `.env` files, API tokens, or webhook secrets to Git.
11. **Explicit Separation of Verified vs. Assumed Capabilities**: When developing integrations, clearly label whether a PayPal API capability has been verified in sandbox testing or remains an assumption.

---

## 3. Frozen Technology Stack

Do not introduce alternate frameworks or incompatible libraries. The stack is frozen as:
- **Operating System / Dev Env**: Cross-Platform (macOS / Linux / Windows 11)
- **Application Framework**: Next.js App Router (TypeScript)
- **Frontend / UI**: React (Server & Client Components), Tailwind CSS, AG Studio, AG Grid (where dense tabular data is presented)
- **Validation**: Zod (for all API request/response bodies, forms, and env variables)
- **Database**: PostgreSQL (Prisma or Drizzle ORM to be decided, using integer-cent fields)
- **Product AI / LLM Gateway**: OpenRouter API (structured generation for reminders & explanations)
- **Payment & Payout Engine**: PayPal Developer Sandbox (REST APIs: Invoicing, Orders, Payouts, Webhooks)
- **Deployment Target**: Render

---

## 4. Coding & Architecture Directives

- **Deterministic Math Only**: Forecasts and runway metrics must be calculated purely through deterministic TypeScript functions and SQL aggregates. The LLM must **never** compute runway numbers; it only interprets deterministic calculation outputs for human readability.
- **Type Safety**: Enforce strict TypeScript (`"strict": true`). No `any` types.
- **Data Validation**: Validate all inbound payloads (webhooks, user requests, external API responses) with Zod schemas.
- **Error Handling**: Gracefully handle network timeouts, rate limits, and PayPal API error responses. Provide clear user-facing messages without leaking internal system traces.

