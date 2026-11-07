# MerchOps AI — Product Specification

> **Positioning**: *"An AI CFO that can't touch your money."*  
> **Target Audience**: Small & medium specialty retailers, ecommerce operators, and wholesale merchants managing tight cashflow cycles.  
> **Event**: PayPal AI Hackathon 2026.

---

## 1. Problem Statement & Market Reality

For small businesses, **cash flow insolvency kills profitable companies**. 82% of small business failures stem from cash flow mismanagement—not lack of demand.
- Customer invoices are paid late (average 12–28 days overdue).
- Supplier inventory bills mature unpredictably with severe late penalties or shipping halts.
- Existing tools either provide retrospective accounting (QuickBooks/Xero) or generic dashboards without guardrails.
- Unchecked AI agents cannot be trusted to independently execute financial transactions: prompt injections, missing fees, and model hallucinations risk catastrophic double-spend or reserve breaches.

---

## 2. Core Value Proposition

MerchOps AI couples **predictive AI intelligence** with a **deterministic financial safety engine**:
1. **Integer-Cent Cash Runway Engine**: Computes exact cleared cash vs. mandatory safety reserve floor ($2,000.00).
2. **Deterministic Rules Prover**: AI proposes 3 alternative plans ("Safest", "Fastest Cash", "Lowest Cost"); deterministic code mathematically proves each plan safe before any human can approve it.
3. **Real PayPal Rail**: Live PayPal Invoicing v2 for receivables acceleration and fee-inclusive PayPal Payouts for supplier disbursements.
4. **Agentic Commerce via MCP**: Exposes strictly read-only and propose-only tools to external agents (e.g. Claude Desktop) via the Model Context Protocol.

---

## 3. Five Design & Operating Principles

1. **AI Proposes, Rules Decide**: AI output is strictly a candidate proposal (`ai_proposals`). Only deterministic server code applies financial policy and executes mutations.
2. **Cash State is Always Visible**: Clear distinction between Cleared Cash, Reserved/In-Flight Cash, and Projected Horizon Cash.
3. **Single Next Action**: Every screen highlights the highest-leverage financial action (e.g., accelerating overdue receivables before bills mature).
4. **Clickable Proof**: Every external identifier (`invoice_id`, `payout_batch_id`, `request_id`, `event_id`) is shown in monospace and links directly to verified sandbox evidence.
5. **Radical Honesty**: Offline simulations are explicitly tagged `[SIMULATED]`. Real PayPal interactions are tagged `[VERIFIED]`.

---

## 4. Competitive Differentiation & Moat

| Capability | Generic AI Finance Tools | MerchOps AI |
|---|---|---|
| **Disbursement Execution** | Direct tool-call without guardrails | Two-step interactive human confirmation |
| **Idempotency** | Random UUIDv4 per request | Deterministic `(entity_id, action)` key |
| **Transaction Fees** | Ignored by model | Fee-inclusive reserve floor check |
| **Audit Trail** | Mutable application logs | PostgreSQL trigger-enforced append-only log |
| **Agentic Access** | Unrestricted read/write | Read & propose-only Model Context Protocol |

---

## 5. Accessibility & Inclusivity (WCAG 2.2 AA)

- **Color Contrast**: 4.5:1 minimum text contrast; semantic states (safe/breach) reinforced with icons (`ShieldCheck`, `AlertCircle`), not color alone.
- **Screen Reader Support**: Money figures explicitly tagged with formatted text and integer cent descriptors.
- **Focus States**: High-visibility focus rings on all interactive buttons, modal dialogs, and AG Grid cells.
- **Motion Reduction**: `motion-reduce:animate-none` applied to all loading skeletons and pulse animations.
- **Viewport Support**: Fully responsive layout verified down to 390px mobile screens.
