# Project Plan & Delivery Roadmap

## MerchOps AI — PayPal AI Hackathon 2026

**Key Milestones**:
- **Current Status**: Working single-process prototype (in-memory repository; no auth, database, or webhooks)
- **Early Review Checkpoint**: November 5, 2026
- **Final Submission Deadline**: November 12, 2026 at 12:00 PM PST

> **Status legend**: `[x]` = implemented in this repository; `[ ]` = planned/not implemented. Roadmap phases below are historical targets, not claims of completion. The current prototype is described in "Current Implemented State"; everything else is **TARGET-STATE**.

---

## Current Implemented State

- **Runway Engine**: Deterministic integer-cent forecast from a deterministic clock (`DEMO_AS_OF`, default `2026-11-03`). Bills matched by `dueDate` only (no double counting), overdue/day-0 clamped to Day 1, PENDING/APPROVED/IN_FLIGHT included, `minBalanceCents` and `firstBreachDeficitCents` reported.
- **Server-authoritative state**: `GET /api/state` returns `{account, invoices, bills, auditLogs, capabilities:{paypalSandboxEnabled}}`. The browser does not import the in-memory store; mutations return a fresh snapshot.
- **In-memory repository**: Account, invoices, bills, audit logs, and idempotency keys live in a server-side singleton. State resets on server restart.
- **Payouts**: Reserve check (HTTP 403 `RESERVE_BREACH_BLOCKED`), two-step `confirmed: true` enforcement, UUID idempotency keys, and an in-process `beginPayout -> IN_FLIGHT -> completePayout/failPayout` state machine. Duplicate replays of a `SUCCEEDED` key return the stored result.
- **Security controls**: Same-origin enforcement + Zod validation on all mutation routes; rate-limited, validated OpenRouter draft route; `/api/reset` requires `{confirm:true}` + same-origin (+ `x-demo-admin-token` in production when configured); live PayPal rail gated server-side by `PAYPAL_PAYOUTS_ENABLED=true`.
- **Collections**: Reminder drafting with honest fallback, server-side approval at `POST /api/reminders/approve`, and simulated settlement attributed to `MERCHANT`.
- **NOT implemented**: authentication/user accounts, tenant isolation, database persistence, PayPal webhooks/signature verification, Invoicing/Orders APIs, outbound email, multi-instance-safe idempotency.

---

## 1. Phased Delivery Roadmap (Target-State)

```
Nov 1 - Nov 2        Nov 3 - Nov 4         Nov 5            Nov 6 - Nov 9          Nov 10 - Nov 12
[Phase 1: Docs] ───> [Phase 2: DB & Core] ───> [Early Review] ───> [Phase 3: Sandbox/UI] ───> [Final Submission]
```

### Phase 1: Foundation & Governance (Implemented)
- [x] Local Git repository setup & GitHub remote verification
- [x] Non-negotiable financial rules definition (`AGENTS.md`)
- [x] Foundational documentation suite (`README.md`, `PLAN.md`, `ARCHITECTURE.md`, `SANDBOX_GUIDE.md`, `HACKATHON.md`, `DECISIONS.md`)
- [x] Environment configuration template (`.env.example`)
- [ ] Merchant approval of foundational documentation

---

### Phase 2: Data Architecture & Deterministic Engines (Partially Implemented)
*Goal: Build the solid data layer and verified deterministic calculation engines before integrating AI or external APIs.*

- [x] Next.js App Router project with TypeScript and Zod.
- [ ] **PLANNED — PostgreSQL schema**: no database exists today. The target schema would include `merchants`, `accounts`/`ledger_entries` (integer cents), `invoices`, `bills`, `audit_logs`, and `webhook_events`; these are **not implemented**.
- [x] In-memory repository backing `GET /api/state` and all mutations.
- [x] **Runway Engine**: deterministic projection, zero LLM dependency, reserve breach detection, deterministic `DEMO_AS_OF` clock.
- [x] Unit tests for arithmetic precision (cents), forecasting logic, and payout policy.

---

### Phase 3: Collections Engine & AI Copilot (Implemented, with limitations)
*Goal: Complete the invoice tracking and OpenRouter reminder drafting flow.*

- [x] Overdue invoice detection and aging categorization derived from `dueDate`.
- [x] OpenRouter integration with a minimal domain prompt and honest fallback template.
- [x] Merchant review/edit/discard/approve flow; approval persisted server-side at `POST /api/reminders/approve`.
- [x] Audit entry for approval (in-memory).
- [ ] **PLANNED**: live PayPal invoice/order payment link creation. Current links are simulated.

---

### Phase 4: Early Review Checkpoint (Target: November 5, 2026)
*Deliverables for Early Review*:
- [x] End-to-end working demonstration of Runway calculation.
- [x] Working invoice list in AG Grid.
- [x] AI-generated reminder drafting with human review/approval UI.
- [ ] **PLANNED**: verified local database schema with integer cents. The prototype is in-memory only.
- [x] Interim architecture review and feedback consolidation.

---

### Phase 5: Payouts Engine & Reserve Protection (Implemented)
*Goal: Safe vendor bill scheduling without liquidity risk.*

- [x] Vendor bill management view with AG Grid.
- [x] Reserve-safe payout evaluator that blocks payouts breaching `minReserveCents`.
- [x] Two-step merchant authorization interface (`confirmed: true` enforced server-side).
- [x] PayPal Sandbox Payouts payload generation with UUID idempotency keys and in-process `IN_FLIGHT` state machine.
- [ ] Live PayPal Sandbox dispatch verification (implemented but **unverified**; requires credentials + `PAYPAL_PAYOUTS_ENABLED=true`).

---

### Phase 6: PayPal Sandbox Integration & Webhook Pipeline (NOT IMPLEMENTED)
*Goal: Real-time settlement and automated ledger reconciliation.*

- [x] PayPal OAuth token client helper (used only on the gated sandbox rail).
- [ ] **PLANNED**: Sandbox webhook listener endpoint (`/api/webhooks/paypal`) with signature validation.
- [ ] **PLANNED**: Replay prevention via a durable webhook event table.
- [ ] **PLANNED**: Handlers for `PAYMENT.CAPTURE.COMPLETED` and `INVOICING.INVOICE.PAID`.
- [ ] **PLANNED**: automatic ledger update from webhooks; today settlement is simulated locally.

---

### Phase 7: UI Polish & AG Grid Integration (Implemented)
- [x] Tailwind design system for the financial cockpit.
- [x] AG Grid tables for invoices, vendor bills, and audit logs with sorting/filtering/status badges.
- [x] Runway visual chart (30-day projected balance vs. reserve threshold).
- [x] Server-authoritative `/api/state` snapshot feeding the UI.

---

### Phase 8: Deployment & Demo Hardening (Planned)
- [ ] **PLANNED**: Deploy Next.js application and PostgreSQL database to Render (no database exists yet).
- [ ] **PLANNED**: Configure public webhook URL with PayPal Sandbox webhook simulator (no webhook receiver exists yet).
- [x] Deterministic demo scenario documented and reproducible via `DEMO_AS_OF`.
- [ ] Record the end-to-end demo video and submit on the hackathon portal before Nov 12, 12:00 PM PST.

---

## 2. Risk Mitigation & Verification Matrix

| Risk / Unknown | Impact | Mitigation Strategy | Status |
|---|---|---|---|
| Floating-point rounding errors | Critical | Enforce integer cents across TypeScript types and Zod schemas. | Implemented |
| LLM hallucinations in cash flow | Critical | Math is 100% deterministic code; LLM only drafts text. | Implemented |
| Unauthorized fund movement | Critical | AI has no PayPal token access; payouts require `confirmed: true` and reserve checks. | Implemented |
| Idempotency across restarts / instances | High | In-process key map only. A durable, multi-instance design is **not implemented**. | Limitation |
| Webhook replay or forgery | High | Signature verification + durable event IDs. | **Not implemented** |
| PayPal Payouts Sandbox permissions | Medium | Live rail disabled by default; manual scripts check auth/scope. Fallback is simulation only. | Unverified |

---

## 3. Honest Limitations for Judges

- No authentication or user accounts; the app is a single-tenant demo.
- No tenant isolation; do not deploy as a multi-tenant service.
- No database persistence; all state resets on server restart.
- No PayPal webhook receiver or signature verification.
- No live Invoicing/Orders integration and no outbound email.
- Idempotency is in-process only and not multi-instance safe.
- PayPal live dispatch remains unverified unless sandbox credentials are supplied and `PAYPAL_PAYOUTS_ENABLED=true`.
