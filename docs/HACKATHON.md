# PayPal AI Hackathon 2026 — Project Blueprint & Evaluation Guide

## MerchOps AI — Financial Operations Copilot for Small Merchants

---

## 1. Hackathon Deadlines & Milestones

- **Early Review Checkpoint**: **November 5, 2026**
  - Expected: Core database architecture, deterministic Runway calculation, working invoice list, and AI reminder drafting staging area.
- **Final Submission Deadline**: **November 12, 2026 at 12:00 PM PST**
  - Expected: Deployed application on Render, working PayPal Sandbox integration with live webhooks, comprehensive README, and a polished 3-minute video walkthrough.

---

## 2. Core Evaluation Alignment

| Evaluation Pillar | Hackathon Criterion | How MerchOps AI Delivers |
|---|---|---|
| **AI Innovation & Copilot Experience** | Meaningful AI application beyond trivial chat | MerchOps AI serves as an operational copilot. It synthesizes customer payment histories to draft tone-adaptive reminders and translates complex 30-day cash projections into plain-English advice—while leaving math to deterministic code. |
| **PayPal Ecosystem Depth** | Meaningful utilization of PayPal developer capabilities | Integrates multiple PayPal endpoints: Invoicing API v2, Orders/Capture v2, Payouts API v1, and signed Webhook listeners. Demonstrates true payment lifecycle management. |
| **Real-World Business Impact** | Tangible problem solving for merchants | 82% of small business failures stem from poor cash flow management. MerchOps AI provides early shortfall detection, accelerates receivables collection, and guards reserves against unplanned payouts. |
| **Security & Financial Integrity** | Production-grade safety standards | Zero autonomous fund movement, strict secret isolation from LLM context, integer-cent arithmetic, cryptographic webhook verification, and an immutable audit trail. |
| **Execution & Polish** | Smooth UX, responsive design, reliable demo | Next.js App Router, AG Grid for fast tabular data handling, AG Studio design language, and zero-flicker state updates. |

---

## 3. Demo Storyboard (Script for Submission Video)

### Scene 1: The Cash Crunch (0:00 - 0:45)
- **Visual**: The merchant opens the MerchOps AI dashboard.
- **Narrative**: *"Meet Alex, who runs a specialty retail shop. Alex has $4,200 in the bank, but a $5,000 supplier bill is due in 10 days. The MerchOps AI Runway engine alerts Alex in red: a projected cash reserve breach of -$800 will occur on Day 10."*
- **Highlight**: Deterministic 30-day runway graph showing the projected deficit line.

### Scene 2: AI-Powered Collections (0:45 - 1:30)
- **Visual**: Alex clicks into the **Collections** module.
- **Narrative**: *"MerchOps AI scans accounts receivable and spots an overdue $1,500 invoice from client Apex Corp. Instead of manually writing an awkward email, the copilot drafts a polite, professional reminder containing a direct PayPal checkout link."*
- **Action**: Alex reviews the draft in the staging area, makes a minor tweak, and clicks **Approve & Send**.
- **Rule Highlight**: *"The AI never sends messages or initiates charges without explicit merchant consent."*

### Scene 3: Instant Customer Payment & Webhook (1:30 - 2:05)
- **Visual**: The customer opens the payment link in PayPal Sandbox and completes payment.
- **System Action**: PayPal fires a `PAYMENT.CAPTURE.COMPLETED` webhook. MerchOps AI verifies the cryptographic signature, checks idempotency, and logs the transaction.
- **Result**: The dashboard updates instantaneously: account balance rises to $5,700, and the Runway trajectory turns green!

### Scene 4: Protected Vendor Payout (2:05 - 2:45)
- **Visual**: Alex navigates to **Payouts** to handle the upcoming $3,000 supplier bill.
- **Narrative**: *"Now that working capital is restored, Alex reviews the supplier bill. MerchOps AI verifies that even after disbursing $3,000, the remaining $2,700 maintains the merchant's $2,000 safety reserve."*
- **Action**: Alex clicks **Authorize Payout**. The system dispatches the payout via the PayPal Payouts API with a verified idempotency key.

### Scene 5: Audit Trail & Conclusion (2:45 - 3:00)
- **Visual**: Alex opens the **Audit Log** showing immutable records of every recommendation, approval, and settlement.
- **Narrative**: *"MerchOps AI: Deterministic precision. Intelligent assistance. Total merchant control."*

---

## 4. Final Submission Checklist

- [ ] Repository public on GitHub with clean commit history.
- [ ] Deployed working URL on Render.
- [ ] Verified PayPal Sandbox merchant and buyer flow.
- [ ] Working OpenRouter AI reminder generation.
- [ ] High-density tables powered by AG Grid.
- [ ] 3-minute demo video recorded and uploaded (YouTube / Loom / Vimeo).
- [ ] All 11 Financial Safety Rules upheld and documented.
- [ ] Devpost / hackathon portal submission text completed.

