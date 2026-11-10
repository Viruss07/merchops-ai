# MerchOps AI: demo video script (target 2:50, hard limit under 3:00)

Record each scene separately and cut out all the waiting. Every step below exists in the app as of the
`judge-readiness` branch, after the multi-page redesign (Nov 10). The lines in quotes are the gist; say them in your own words.

| Time | Scene | On screen | Say (gist) |
|---|---|---|---|
| 0:00–0:15 | The cliff | `/` hero: "Cash crosses the floor on Day 10.", the 30-day runway with the red Day-10 bar and "Below the floor −$800.00" | "This merchant has $4,200 and a $2,000 safety floor. A $3,000 supplier bill lands on Day 10 while a $1,500 invoice is three weeks overdue. On Day 10 they're $800 below the floor, and today nothing warns them." |
| 0:15–0:40 | The AI proposes | Click "See the AI's plan". Three plans with the *Written by AI* tag and the model name in the header; hover an *Assumes:* line; the green "Rules decided: 2 of 3 plans pass" box | "An AI proposes three ways out. It may only use six actions, and it never does the maths: code re-runs all 30 days for every plan. Two pass. 'Pay on time, no discounts' would cross the floor on Day 10, so the rules reject it. Every plan says what it assumes." |
| 0:40–0:58 | Try to break it | "Try to pay Acme anyway" → "Pay Acme $3,000.00" → "Blocked by the floor: $801.00 short", `403 · RESERVE_BREACH_BLOCKED` | "What if the merchant, or an AI with payout access, pays it anyway? The server refuses. It's $801 short, not $800, because the check includes PayPal's payout fee. A fee can never be what breaks the floor." |
| 0:58–1:35 | Real PayPal Invoicing | `/demo` → "Run it live on PayPal sandbox" → "Create the invoice on PayPal" (show the `INV2-…` id) → "Open the customer pay page" → the sandbox PayPal invoice page → log in as a sandbox *personal* account and pay → back to MerchOps → "Sync with PayPal" → open `/runway`: the breach is gone | "Now it's real. MerchOps creates and sends a PayPal Invoicing v2 invoice. The customer pays it on PayPal. Sync reads the status from PayPal, the invoice is marked paid, and the Day-10 breach disappears." |
| 1:35–1:55 | Real PayPal Payouts | Step 3: "Approve the payout on PayPal" → batch id and "Accepted · awaiting settlement" (or "Settled"); then `/bills/bill-cloud-02`: the tracker and its history | "The merchant approves a supplier payout through PayPal Payouts. The request id is derived from the bill, so a retried click can never pay twice. And we only count the money as gone when PayPal says the payment itself succeeded, not just the batch." |
| 1:55–2:20 | Try to break it, 12 ways | `/bench`: "12 / 12 blocked on this run" with the timestamp; scroll to TRAP-02 (prompt injection in a bill memo), TRAP-07 (batch SUCCESS with an UNCLAIMED item) and TRAP-08 (forged webhook) and read their live evidence lines | "This page attacks the system every time it loads: an instruction hidden in a vendor memo, a hidden fee, a double click, a forged PayPal webhook, a production endpoint. Each one runs against the real code, and you see what the guard returned. Twelve of twelve blocked, live." |
| 2:20–2:40 | Agents | Claude Desktop (or the MCP Inspector) connected to `npm run mcp`: call `get_runway`, then `propose_cash_plan` with a plan that pays Acme on Day 1; show the REJECTED verdict and rule | "Other AI agents can plug in over MCP. They can read the runway and propose plans, and they get the same verdict. There is no tool that sends an invoice or moves money." |
| 2:40–2:55 | Close | `/ledger` filtered to *Guardrails*: the refused payout row, linked to its bill; end on the `/` hero | "Every decision lands in the audit trail, the refusals included. MerchOps: the AI proposes, the rules decide, and nothing moves on PayPal without you." |

## Before recording

- **Keys.** Set `OPENROUTER_API_KEY` so the plans show *Written by AI* (without it they say *Fallback
  template*, which is honest but weaker on camera). Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and
  `PAYPAL_PAYOUTS_ENABLED=true` for the Run-it-live scenes. Check the setup with
  `node scripts/sandbox-check.mjs`.
- **Fresh state.** Press **Reset** in the header before each take. The demo is one shared ledger.
- **Sandbox accounts.** Use a sandbox *personal* account to pay the invoice, never the business account
  that owns the app. Put a real sandbox personal email on the Nexus Cloud bill if you want the payout to
  settle rather than stay UNCLAIMED. Fund the sandbox business account if Payouts returns
  `INSUFFICIENT_FUNDS`.
- **AI latency.** Free models can take 5–25 s. Open "See the AI's plan" (or `/plans`) once before the take: the response
  is cached for an hour, so the take is instant. If every model is down, the plans fall back to labelled
  templates. Say so rather than hiding it.
- **Payout status.** Batch processing in the sandbox can take a minute. Record the dispatch, cut, then show
  the status after a sync. Say "accepted" or "settled" to match what the screen says.
- **Live URL.** If you record on Render, wake it first (`/api/health`).
- **Say the names.** Say "PayPal", "sandbox", "Invoicing", "Payouts" and "AI" out loud. Turn captions on
  and zoom so text reads on a phone. Use no copyrighted music.
- **Claims.** Don't call storage Postgres (the demo runs in memory), and don't mention APIMatic unless its
  Context Plugin really was used to build this project.
- **After uploading:** paste the YouTube link into the README's table and into `docs/DEVPOST.md`.
