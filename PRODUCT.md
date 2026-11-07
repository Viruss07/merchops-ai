# MerchOps AI — Product Specification

> **Positioning**: *"An AI CFO that can't touch your money."*
> **Audience**: Small and mid-size merchants managing tight cash cycles.
> **Event**: PayPal AI Hackathon 2026.

---

## 1. Problem

A merchant can be profitable and still fail because the timing of cash does not match the timing of
bills. Receivables arrive late, supplier bills mature on a fixed date, and the account carries a
minimum reserve the business cannot safely spend below. Generic dashboards show the past; generic AI
agents are trusted to act. Neither gives a merchant a clear answer to one question:

> **On which day does cash cross the floor, by how much, and what is the safest move before then?**

---

## 2. What MerchOps does

MerchOps projects a 30-day cash runway from the cleared balance and the known bills and invoices,
with a hard reserve floor. It then separates two jobs:

1. **The AI proposes.** Given the runway, it drafts candidate plans ("Safest", "Fastest Cash",
   "Lowest Cost") with a narrative. Each plan is a proposal, never an action.
2. **Deterministic rules decide.** Server-side code replays every plan through the same runway math
   and policy checks. A plan that crosses the floor is rejected with the exact day and deficit. The
   merchant can still attempt a payout; the same policy blocks it, and the block is written to an
   append-only audit log.

Money moves only after an explicit merchant approval, through a two-step payout flow. Every external
identifier is shown in monospace and every financial event is recorded.

---

## 3. Product truths (what the demo actually does)

- All amounts are **integer cents**. Display formatting lives in `src/lib/money.ts`.
- The runway is computed deterministically in `src/lib/runway.ts`; the LLM never computes figures.
- The proposal engine (`src/lib/plan/engine.ts`) returns `source: OPENROUTER_AI | DETERMINISTIC_RULES`.
  Without an OpenRouter key it falls back to deterministic rules and labels itself as such.
- Payout policy lives in `src/lib/payoutPolicy.ts`; the API is authoritative. The UI may display a
  pre-check, but the server decision is final.
- The demo store is in-memory. "Simulated" payouts and simulated invoice receipts are labelled
  `[SIMULATED]`; real PayPal Sandbox activity is labelled `[VERIFIED]`.
- The reserve floor in the demo scenario is **$2,000.00**; cleared cash is **$4,200.00** on 2026-11-03.
- The demo scenario breaches the floor on **Day 10** by **$800.00** (Acme Supplies, $3,000.00).

---

## 4. Principles

1. **AI proposes, rules decide.** AI output is a candidate. Deterministic server code applies policy
   and executes mutations.
2. **The floor is visible.** Cleared cash, the reserve floor and the projected path are on screen
   together, always.
3. **One next action.** Every screen names the highest-leverage move and makes it the primary button.
4. **Clickable proof.** `invoice_id`, `payout_batch_id`, `request_id` and `event_id` are shown in
   monospace and can be traced to the audit log.
5. **Radical honesty.** Simulated and verified states are labelled. No invented metrics.

---

## 5. Accessibility (WCAG 2.2 AA)

- 4.5:1 minimum text contrast; state is reinforced with text and iconography, not colour alone.
- Money figures expose the formatted amount and the integer-cent value to assistive tech.
- Visible focus rings on every interactive control and grid cell.
- `prefers-reduced-motion` removes travel and scale, keeps colour and order, and stops auto-advance.
- Layout verified at 1280×800 and 390×844.
