# Project Plan & Delivery Roadmap

## MerchOps AI — PayPal AI Hackathon 2026

**Key Milestones**:
- **Current Status**: Phase 1 — Foundational Documentation & Governance
- **Early Review Checkpoint**: November 5, 2026
- **Final Submission Deadline**: November 12, 2026 at 12:00 PM PST

---

## 1. Phased Delivery Roadmap

```
Nov 1 - Nov 2        Nov 3 - Nov 4         Nov 5            Nov 6 - Nov 9          Nov 10 - Nov 12
[Phase 1: Docs] ───> [Phase 2: DB & Core] ───> [Early Review] ───> [Phase 3: Sandbox/UI] ───> [Final Submission]
```

### Phase 1: Foundation & Governance (Status: Active)
- [x] Local Git repository setup & GitHub remote verification
- [x] Non-negotiable financial rules definition (`AGENTS.md`)
- [x] Foundational documentation suite (`README.md`, `PLAN.md`, `ARCHITECTURE.md`, `SANDBOX_GUIDE.md`, `HACKATHON.md`, `DECISIONS.md`)
- [x] Environment configuration template (`.env.example`)
- [ ] Merchant approval of foundational documentation

---

### Phase 2: Data Architecture & Deterministic Engines (Target: Nov 3 – Nov 4)
*Goal: Build the solid data layer and verified deterministic calculation engines before integrating AI or external APIs.*
- Initialize Next.js App Router project with TypeScript and Zod.
- Configure PostgreSQL schema:
  - `merchants` (tenants)
  - `accounts` & `ledger_entries` (all balances in integer cents)
  - `invoices` (receivables with due date, status, integer cent amount)
  - `bills` (payables with due date, status, integer cent amount)
  - `audit_logs` (immutable record of all decisions, approvals, and transactions)
  - `webhook_events` (processed PayPal event IDs for deduplication)
- Build **Runway Engine**:
  - Deterministic 30-day projection algorithm.
  - Zero LLM dependency for financial calculation.
  - Cash reserve threshold breach detection.
- Unit tests for arithmetic precision (cents) and forecasting logic.

---

### Phase 3: Collections Engine & AI Copilot (Target: Nov 4 – Nov 5)
*Goal: Complete the invoice tracking and OpenRouter reminder drafting flow.*
- Overdue invoice detection and aging categorization (Current, 1–15 days, 16–30 days, 30+ days).
- OpenRouter integration with strict prompt templates:
  - Prompt sanitization: Zero secrets, isolated merchant context.
  - Generates courteous, firm, or urgent drafts depending on overdue severity.
- Merchant approval workflow:
  - UI staging area: review, edit, approve, or discard reminder.
  - Approval state persisted to audit log.
- PayPal payment generation:
  - Generate sandbox invoice/order payment link to append to reminder.

---

### Phase 4: Early Review Checkpoint (Target: November 5, 2026)
*Deliverables for Early Review*:
- [ ] End-to-end working demonstration of Runway calculation.
- [ ] Working invoice list in AG Grid.
- [ ] AI-generated reminder drafting with human review/approval UI.
- [ ] Verified local database schema with integer cents.
- [ ] Interim architecture review and feedback consolidation.

---

### Phase 5: Payouts Engine & Reserve Protection (Target: Nov 6 – Nov 7)
*Goal: Safe vendor bill scheduling without liquidity risk.*
- Vendor bill management view with AG Grid.
- Reserve-safe payout evaluator:
  - Compares pending payout amount against projected 30-day runway.
  - Blocks or warns if payout breaches `min_reserve_cents`.
- Two-step merchant authorization interface (explicit button + confirmation modal).
- PayPal Sandbox Payouts API payload generation with UUIDv4 idempotency keys.

---

### Phase 6: PayPal Sandbox Integration & Webhook Pipeline (Target: Nov 8 – Nov 9)
*Goal: Real-time settlement and automated ledger reconciliation.*
- PayPal OAuth token client (cached, auto-refreshing).
- Sandbox webhook listener endpoint (`/api/webhooks/paypal`):
  - Cryptographic signature validation via PayPal's certificate verification endpoint.
  - Replay prevention: check `webhook_events` table before processing.
  - Handles `PAYMENT.CAPTURE.COMPLETED` and `INVOICING.INVOICE.PAID`.
- Automatic ledger update (integer cents) triggering immediate runway recalculation.

---

### Phase 7: UI Polish, AG Studio, & AG Grid Integration (Target: Nov 9 – Nov 10)
- Integrate AG Studio / Tailwind design system for high-trust financial cockpit.
- AG Grid tables for high-density invoices and vendor bills with sorting, filtering, and status badges.
- Real-time Runway visual chart (30-day projected balance line vs. reserve threshold line).

---

### Phase 8: Deployment & Demo Hardening (Target: Nov 11 – Nov 12, 12:00 PM PST)
- Deploy Next.js web application and PostgreSQL database to Render.
- Configure public webhook URL with PayPal Sandbox webhook simulator.
- Rehearse and record end-to-end Demo Video:
  1. Merchant dashboard shows impending cash crunch.
  2. Overdue invoice selected -> AI generates polite collection email.
  3. Merchant approves -> Sandbox payment link dispatched.
  4. Simulated customer payment via PayPal Sandbox.
  5. Webhook verified -> Ledger updated -> Runway restored to green.
  6. Merchant executes vendor payout safely under reserve protection.
- Final submission on hackathon portal before Nov 12, 12:00 PM PST.

---

## 2. Risk Mitigation & Verification Matrix

| Risk / Unknown | Impact | Mitigation Strategy | Owner |
|---|---|---|---|
| Floating-point rounding errors | Critical | Enforce integer cents across DB, TypeScript types, and Zod schemas. | Backend |
| LLM hallucinations in cash flow | Critical | Math is 100% deterministic code; LLM only formats text explanations. | AI Engine |
| Unauthorized fund movement | Critical | AI has no access to PayPal tokens; all payouts require user click + confirmation. | Security |
| Webhook replay or forgery | High | Verify PayPal signature and record event IDs in DB with unique constraint. | Integration |
| PayPal Payouts Sandbox permissions | Medium | Test Sandbox Payouts early; fallback to mock simulation mode if delayed (strictly a simulation, never executes a real PayPal transaction). | Integration |

