# MerchOps AI: an AI cash-flow copilot that can't touch your money

**For small merchants who invoice and pay suppliers through PayPal.** MerchOps forecasts the next 30 days of
cash in integer cents, spots the day the balance will cross the merchant's safety floor, has an AI propose
three ways out, and checks every proposal against the same deterministic forecast before a human approves
anything. Collections go out as real **PayPal Invoicing v2** invoices; supplier payments go out through
**PayPal Payouts**, with the fee included in the reserve check.

> **AI proposes. Rules decide. Nothing moves without you.**

Built for the PayPal AI Hackathon 2026.

| | |
|---|---|
| **Live demo** | _Render URL: add once deployed_ |
| **Demo video** | _YouTube link: add once recorded_ |
| **Repo** | https://github.com/Viruss07/merchops-ai (MIT) |

---

## The problem

A merchant with $4,200.00 in cleared cash and a $2,000.00 floor looks healthy today. But a $3,000.00
supplier bill lands on Day 10 while a $1,500.00 customer invoice is three weeks overdue, so on Day 10 the
account is $800.00 below the floor. Spreadsheets don't show that until it happens. An AI "CFO" with payout
access might pay the bill anyway: miss the fee, follow an instruction hidden in a memo, or pay twice on a
retried click.

MerchOps puts the model on the proposing side only. Code owns the arithmetic, the guardrails and every
PayPal call. A human owns the approval.

## Judge's path (3 minutes)

Open `/` (live URL above, or `http://localhost:3000` locally). **No keys are needed for steps 1 to 5.**

1. **The cliff.** The runway instrument shows $4,200.00 cleared, a $2,000.00 floor, and the Day-10 breach
   (−$800.00). Arithmetic is deterministic integer cents ([`src/lib/runway.ts`](src/lib/runway.ts)).
2. **The proposal.** "See the AI's plan": three plans (Safest, Fastest cash, Lowest cost). Each one is
   labelled *Written by AI* or *Fallback template*, lists its assumptions (for example "Apex Corp pays
   $1,500.00 by Day 3"), and gets a verdict from the validator, which re-simulates all 30 days
   ([`src/lib/plan/validate.ts`](src/lib/plan/validate.ts)). Expected: 2 accepted, "Lowest cost" rejected
   for a Day-10 breach.
3. **Try to break it.** Approve Acme Supplies anyway. The server answers HTTP 403 `RESERVE_BREACH_BLOCKED`
   with the deficit. The check includes the PayPal payout fee
   ([`src/lib/store.ts`](src/lib/store.ts) `beginPayout`).
4. **Fix it.** Collect Apex Corp (simulated in this step), and the same Acme payment is approved.
5. **The bench.** [`/bench`](src/app/bench/page.tsx) runs 12 attacks (prompt injection, hidden fee,
   double click, swapped receiver, unsettled batch, forged webhook, production endpoint, and more) **live
   on each page load** against the real guard functions, and shows what each guard returned
   ([`src/lib/bench/run.ts`](src/lib/bench/run.ts)).
6. **Run it live on PayPal** (needs sandbox keys). `/demo` → "Run it live": creates and sends a real
   Invoicing v2 invoice for Apex Corp ($1,500.00) and shows PayPal's `recipient_view_url`. Pay it with a
   sandbox *personal* account, then press Sync: MerchOps reads the invoice from PayPal, marks it PAID, and the
   breach disappears. Then pay Nexus Cloud ($400.00) through `POST /v1/payments/payouts` with a deterministic
   `PayPal-Request-Id`.
7. **Agents.** `npm run mcp` starts an MCP server for Claude Desktop and other agents (tools below). None of
   its tools can move money.

## How PayPal is used

All calls are typed REST in [`src/lib/paypal.ts`](src/lib/paypal.ts), locked to
`https://api-m.sandbox.paypal.com` (any other origin throws `PAYPAL_ENDPOINT_INVALID`).

| PayPal API | What MerchOps does with it |
|---|---|
| OAuth 2.0 client credentials | Cached token, refreshed before expiry (and retried once with a fresh token on invoice creation) |
| Invoicing v2: create, send | Turns a receivable into a real invoice and returns the payer link |
| Invoicing v2: get | Sync reads the invoice status from PayPal, so a payment counts even without a webhook |
| Invoicing v2: remind | Sends the merchant-approved, AI-drafted reminder through PayPal |
| Payouts v1: create batch, get batch | Pays suppliers. `PayPal-Request-Id` is derived from the bill id, so a retry can't pay twice |
| Webhooks: verify-webhook-signature | Every delivery is verified before it is applied; unverifiable events fail closed |
| Webhook events | `INVOICING.INVOICE.PAID`, `PAYMENT.PAYOUTS-ITEM.SUCCEEDED / FAILED / DENIED / BLOCKED / RETURNED / REVERSED` |

**Settlement rules.**
- Cash is debited only when every payout item reports `SUCCESS`. A batch status of `SUCCESS` means PayPal
  finished processing the batch, not that the money arrived, so items that are `UNCLAIMED` or `ONHOLD` stay
  pending.
- An HTTP 5xx or 429, or a timeout, on payout creation is an **unknown outcome**. The payout stays
  reserved until sync resolves it; MerchOps never tells the merchant "nothing moved" when it can't know that.
- A webhook credits an invoice only when it matches by PayPal invoice id or invoice number. Nothing is
  guessed.

## How AI is used

| Feature | Model | What the AI may do | What code does |
|---|---|---|---|
| Cash Plan Copilot ([`plan/engine.ts`](src/lib/plan/engine.ts)) | OpenRouter free models: `recursive/flint-v1.0:free` → `dots-studio/dots-3-note-preview:free` → `nvidia/nemotron-3.5-super-vl:free` (each env-overridable) | Return three plans as JSON, built only from 6 closed action types | Strict schema parse (unknown actions and extra fields are dropped); grounding check (no dollar figures the code didn't compute); a full 30-day re-simulation and policy checks; the verdict |
| Reminder drafts ([`api/ai/draft-reminder`](src/app/api/ai/draft-reminder/route.ts)) | Same chain | Draft the email text | Output schema validation, rate limit, merchant approval before PayPal `/remind` |
| Prompt-injection spotlight ([`ai/spotlight.ts`](src/lib/ai/spotlight.ts)) | n/a | n/a | Customer and vendor text is delimited as untrusted and scanned for override patterns before it reaches a prompt |

With no `OPENROUTER_API_KEY`, or when every model fails, plans come from deterministic templates. The UI
labels them *Fallback template* and still runs them through the same validator.

## Money rules the code enforces

1. **AI never moves money.** No model output is executable. Payouts need a merchant approval in the UI.
2. **Integer cents everywhere.** Decimal strings appear only at the PayPal boundary (`centsToPayPalAmount`).
3. **Fee-inclusive reserve.** Each payout, and each payout already in flight, reserves `amount + fee`. The
   fee estimate is the higher of PayPal's two published US schedules (2% capped at $1.00, or a flat $0.25).
4. **Deterministic idempotency.** `PayPal-Request-Id = merchops-payout-<billId>-v1`.
5. **Verified webhooks only**, applied idempotently.
6. **Sandbox only.** The API origin is hard-locked.

## Status: what's verified and how

| Capability | Status | Evidence |
|---|---|---|
| Runway engine, plan validator, payout policy, fee math | Verified | `npm test` (64 tests) |
| Guardrail bench (12 attacks) | Verified, live | `/bench` and `tests/bench.test.ts` |
| AI plan parsing, grounding, fallback | Verified | `tests/plan.test.ts` |
| MCP server (stdio, 6 tools) | Verified | `npm run mcp`, then `tools/list` |
| PayPal Invoicing v2 and Payouts calls | Implemented | Run "Run it live" with sandbox keys; `node scripts/sandbox-check.mjs` checks auth and scopes |
| Webhook verification | Implemented | `scripts/register-webhook.mjs`, then pay an invoice |
| Persistence | **In-memory at runtime** | The Postgres schema (`db/migrations/`: append-only triggers on audit and ledger, `webhook_events`) and `PgRepository` with advisory locks exist, but the API routes currently use the in-memory store. State resets when the server restarts. |

The demo is single-tenant with no login: everyone who opens the live URL shares one ledger, and the header
**Reset** button restores the seeded scenario.

## Agentic commerce: MCP server

```bash
npm run mcp   # stdio; add to Claude Desktop as a command server
```

| Tool | Kind |
|---|---|
| `get_runway`, `list_invoices`, `list_bills`, `get_audit_trail` | Read |
| `propose_cash_plan` | Propose. Runs the agent's plan through the same validator and returns the verdict and rules |
| `stage_invoice` | Propose. Creates an **unsent draft** invoice in the PayPal sandbox for the merchant to review. Nothing is sent or paid |

The MCP server reads the seeded demo ledger in its own process. No tool sends an invoice, approves a payout
or moves money.

## Run it locally

```bash
git clone https://github.com/Viruss07/merchops-ai.git && cd merchops-ai
npm install
npm run dev            # http://localhost:3000 (works with no keys)
npm test               # 64 tests
```

Optional `.env.local` (see [`.env.example`](.env.example)):

| Variable | Enables |
|---|---|
| `OPENROUTER_API_KEY` | AI-written plans and reminder drafts (otherwise labelled templates) |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Run it live: real Invoicing v2 |
| `PAYPAL_PAYOUTS_ENABLED=true` | Real sandbox Payouts (otherwise payouts use the simulation rail) |
| `PAYPAL_WEBHOOK_ID` | Webhook verification (otherwise webhooks are rejected, and Sync polls PayPal instead) |

Without PayPal keys, "Run it live" step 1 reports that credentials aren't configured. Everything else works.

**Deploy:** [`render.yaml`](render.yaml) is a Render Blueprint (web service plus Postgres). Set the PayPal and
OpenRouter secrets, then register the webhook:
`node scripts/register-webhook.mjs https://<service>.onrender.com/api/paypal/webhook`.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Zod · Tailwind · **AG Grid Community v36** for the
Collections, Payouts and Audit grids · OpenRouter · PayPal REST (sandbox) · MCP TypeScript SDK · Node test
runner · Render Blueprint.

## Docs

[Architecture](docs/ARCHITECTURE.md) · [Decisions](docs/DECISIONS.md) · [Sandbox guide](docs/SANDBOX_GUIDE.md)
· [Demo script](docs/DEMO_SCRIPT.md) · [Video script](docs/VIDEO_SCRIPT.md) · [Product](PRODUCT.md) · [Design](DESIGN.md)

## License

MIT. See [LICENSE](LICENSE).
