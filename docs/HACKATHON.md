# PayPal AI Hackathon 2026 — Project Blueprint & Evaluation Guide

## MerchOps AI — Financial Operations Copilot for Small Merchants

---

## 1. Hackathon Deadlines & Milestones

- **Early Review Checkpoint**: **November 5, 2026**
  - Original target: core database architecture, deterministic Runway calculation, working invoice list, and AI reminder drafting area. **Delivered without a database**: the prototype uses an in-memory repository.
- **Final Submission Deadline**: **November 12, 2026 at 12:00 PM PST**
  - Expected: Deployed application, deterministic Runway + Collections + Payouts demo, simulation rail by default, optional gated PayPal Sandbox payout rail, comprehensive README, and a polished 3-minute video walkthrough. Live webhooks, Invoicing/Orders APIs, auth, and database persistence are **not implemented**.

---

## 2. Core Evaluation Alignment

| Evaluation Pillar | Hackathon Criterion | How MerchOps AI Delivers |
|---|---|---|
| **AI Innovation & Copilot Experience** | Meaningful AI application beyond trivial chat | MerchOps AI serves as an operational copilot. It drafts tone-adaptive reminders and translates deterministic 30-day projections into plain-English advice—while leaving math to deterministic code. |
| **PayPal Ecosystem Depth** | Meaningful utilization of PayPal developer capabilities | Implements PayPal OAuth client-credentials and Sandbox Payouts payloads behind a server-side gate. The default rail is local simulation. Invoicing, Orders, and webhooks are **not implemented**. PayPal OAuth/scope and live dispatch remain **unverified**. |
| **Real-World Business Impact** | Tangible problem solving for merchants | Cash-flow pressure is a leading cause of small business failure. MerchOps AI provides early shortfall detection, accelerates receivables collection, and guards reserves against unplanned payouts. |
| **Security & Financial Integrity** | Production-grade safety standards | Zero autonomous fund movement, integer-cent arithmetic, same-origin + Zod validation, a server-side live-rail gate, and an audit log. The audit log is **in-memory and not immutable**; there is **no authentication** and **no webhook verification**. |
| **Execution & Polish** | Smooth UX, responsive design, reliable demo | Next.js App Router, AG Grid for fast tabular data handling, deterministic `DEMO_AS_OF` clock, and server-authoritative `/api/state` snapshots. |

---

## 3. Demo Storyboard (Script for Submission Video)

### Scene 1: The Cash Crunch (0:00 - 0:45)
- **Visual**: The merchant opens the MerchOps AI dashboard.
- **Narrative**: *"Meet Alex, who runs a specialty retail shop. Alex has $4,200 in the bank, but a $3,000 supplier bill is due on Day 10 (2026-11-13). The MerchOps AI Runway engine alerts Alex in red: a projected cash reserve breach of -$800 will occur on Day 10."*
- **Highlight**: Deterministic 30-day runway graph showing the projected deficit line. The clock is fixed by `DEMO_AS_OF=2026-11-03`, so the scenario is identical on every run.

### Scene 2: AI-Powered Collections (0:45 - 1:30)
- **Visual**: Alex clicks into the **Collections** module.
- **Narrative**: *"MerchOps AI scans accounts receivable and spots an overdue $1,500 invoice from client Apex Corp. Instead of manually writing an awkward email, the copilot drafts a polite, professional reminder. The displayed PayPal link is a simulation link."*
- **Action**: Alex reviews the draft in the staging area, makes a minor tweak, and clicks **Approve Reminder Draft**. Approval is persisted server-side; no email is sent.
- **Rule Highlight**: *"The AI never sends messages or initiates charges without explicit merchant consent."*

### Scene 3: Simulated Customer Payment (1:30 - 2:05)
- **Visual**: Alex uses the **Simulate Pay** action for Apex Corp.
- **System Action (SIMULATED)**: The local ledger marks the invoice paid and attributes the event to `MERCHANT`. **No PayPal webhook is involved**; webhooks are not implemented.
- **Result**: The dashboard updates: account balance rises to $5,700, and the Runway trajectory turns green.

### Scene 4: Protected Vendor Payout (2:05 - 2:45)
- **Visual**: Alex navigates to **Payouts** to handle the upcoming $3,000 supplier bill.
- **Narrative**: *"Now that working capital is restored, Alex reviews the supplier bill. MerchOps AI verifies that even after disbursing $3,000, the remaining $2,700 maintains the merchant's $2,000 safety reserve."*
- **Action (SIMULATED by default)**: Alex clicks **Authorize Payout**. The payout is recorded on the local simulation rail with a UUID idempotency key. Replaying the key returns the stored result instead of paying twice.
- **Live rail note**: A PayPal Sandbox dispatch is implemented but disabled unless the server env `PAYPAL_PAYOUTS_ENABLED=true`; the client cannot enable it. Live dispatch remains **unverified**.

### Scene 5: Audit Trail & Conclusion (2:45 - 3:00)
- **Visual**: Alex opens the **Audit Log** showing the sequence of recommendations, approvals, and simulated settlements.
- **Narrative**: *"MerchOps AI: Deterministic precision. Intelligent assistance. Total merchant control."*
- **Honesty note**: The audit log is in-memory and resets on server restart; it is not an immutable production ledger.

---

## 4. Final Submission Checklist

- [ ] Repository public on GitHub with clean commit history.
- [ ] Deployed working URL (deployment is planned; not configured in this repository).
- [ ] PayPal Sandbox credentials configured and manual auth/scope scripts run (results still **unverified** until recorded).
- [ ] Working OpenRouter AI reminder generation or clearly labelled fallback.
- [ ] High-density tables powered by AG Grid.
- [ ] 3-minute demo video recorded and uploaded (YouTube / Loom / Vimeo).
- [ ] All 11 Financial Safety Rules reviewed, with an explicit implemented / planned / not-implemented status for each (see `docs/DECISIONS.md` and `docs/ARCHITECTURE.md`).
- [ ] Devpost / hackathon portal submission text completed.

### Honest Submission Notes

- Default payout rail is **simulation**; live PayPal Sandbox dispatch is gated by `PAYPAL_PAYOUTS_ENABLED=true` and remains **unverified**.
- PayPal webhooks/signature verification, Invoicing/Orders APIs, authentication, tenant isolation, database persistence, outbound email, and multi-instance-safe idempotency are **not implemented**.
- In-memory state (including audit logs and idempotency keys) resets on server restart.

