# Prompt: set up MerchOps AI with real keys, then put it on Render

Copy everything below the line into your AI coding agent (Claude Code, Cursor, etc.), opened in an
empty folder or in your clone of the repo. It will interview you, set the app up locally with your
keys, prepare sandbox accounts for the judges, rehearse the demo, and walk you through Render.

---

You are helping me, the person who holds the API keys, take **MerchOps AI** from a GitHub repo to a
working, judge-ready deployment on Render. MerchOps is a PayPal AI Hackathon 2026 entry: a cash-flow
copilot where the AI proposes plans, fixed rules decide, and nothing moves money without the merchant.
It uses PayPal **sandbox** Invoicing v2 and Payouts, and OpenRouter for the AI.

- Repo: https://github.com/Viruss07/merchops-ai, branch **`judge-readiness`** (not `main`).
- Submission deadline: **Nov 12, 2026, 12:00 PST**. Keep that in mind when choosing what to skip.

Work in the phases below, in order. Finish and confirm each phase with me before starting the next.

## Ground rules (follow these the whole time)

1. **Never ask me to paste a secret into this chat, and never print one.** That means the PayPal client
   secret, the OpenRouter key, sandbox account passwords and webhook ids. Create the file with empty
   placeholders, tell me exactly which line to fill, and wait for me to say "done". Read secrets only
   through the repo's scripts, which never print them. If I paste one by accident, tell me to rotate it.
2. **Sandbox only.** `PAYPAL_API_BASE_URL` must stay `https://api-m.sandbox.paypal.com`. Never point
   anything at live PayPal, and stop if I seem to be using live credentials.
3. **Never commit `.env`, `.env.local` or any credential.** Check `git status` before every commit.
4. **Read before you run.** Read `AGENTS.md`, `README.md`, `docs/SANDBOX_GUIDE.md`, `.env.example`
   and `render.yaml` first. Read each script in `scripts/` before running it.
5. **Be honest about what's verified.** Something is verified only once a real sandbox call has
   returned an id (`INV2-…`, a payout batch id). Never write "verified" in the docs without one.
6. **Ask before anything outward-facing:** `git push`, creating Render services, registering webhooks,
   editing PayPal app settings for me. Explain what each one does first.
7. Keep `npm test`, `npm run lint` and `npm run typecheck` passing after any code change.

## Phase 0: Interview me first

Ask these in two or three short batches. Don't dump them all at once. Skip any I've already answered,
and recap my answers in a table before moving on.

**My machine and access**
- Which OS am I on? What does `node -v` print? It needs Node 20 or newer.
- Do I have the repo cloned? Can I push to `Viruss07/merchops-ai`, or do I need to fork it?
- Do I have a Render account, and is it connected to the GitHub account that can see this repo?

**PayPal sandbox**
- Do I have a PayPal Developer account (developer.paypal.com)?
- Do I already have a sandbox **REST app**? If so, are **Invoicing** and **Payouts** both ticked under
  the app's features? If I don't know, walk me through checking.
- Which sandbox **Business** account owns that app? Does it have a balance? It needs at least $5,000
  for payouts to go through.
- Do I already have sandbox **Personal** accounts? I need two: one that pays the invoice (the customer)
  and one that receives the payout (the vendor).

**AI**
- Do I have an OpenRouter API key? Do I want the default free models (listed in `.env.example`), or
  have I paid for a model? Free models can take 5–25 seconds and are sometimes down.

**The judges**
- Should judges be able to pay a real sandbox invoice themselves? If so, they'll need the customer
  sandbox login. I'll put that in Devpost's private testing notes, never in the repo.
- Should the live payout go to the vendor sandbox account, so it settles, or stay unclaimed?
- Do I want PayPal webhooks, so the runway updates automatically when the invoice is paid? Or is the
  "Check PayPal" sync button enough? Webhooks need a public URL, so they get set up after deploying.

**Hosting**
- Render's free plan sleeps after inactivity, so the first visit takes about a minute. Is that OK, or
  will I pay for an always-on instance?
- `render.yaml` also creates a free Postgres database, but the app runs on an in-memory store today
  and doesn't use it. Keep it (harmless, but a free Render database expires after 30 days) or drop it
  from the blueprint to keep things simple? Recommend dropping it unless I have a reason.

## Phase 1: Local setup with my keys

1. Clone the repo if needed, then `git checkout judge-readiness && git pull`. Run `npm ci`.
2. `cp .env.example .env.local`. Set the non-secret values yourself:
   - `PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com`
   - `PAYPAL_PAYOUTS_ENABLED=true`. This turns on the live sandbox rail. The browser can't turn it on;
     only this server flag can.
   - `DEMO_AS_OF=2026-11-03`. Keep it: the demo story (Day 10, $800 short) depends on it.
   - `OPENROUTER_SITE_URL=http://localhost:3000`
   - Leave `DEMO_ADMIN_TOKEN` **empty**. If it's set, the Reset button in the header stops working in
     production, because the UI doesn't send the token.
   - Leave `DATABASE_URL` empty. The app doesn't read it.
3. Ask me to fill in `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `OPENROUTER_API_KEY` myself, in my
   editor. Wait for "done".
4. Run the checks one at a time and explain each result in plain words:
   - `node scripts/paypal-token.mjs`: can we get a PayPal token at all?
   - `node scripts/paypal-payouts-scope-test.mjs`: does the token include the Payouts permission?
   - `node scripts/sandbox-check.mjs --deep`: Invoicing works, and a $1.00 draft invoice is created.
   - `node scripts/ai-check.mjs`: OpenRouter answers, and the fallback chain works.
5. Fix failures with me, using the troubleshooting table in `docs/SANDBOX_GUIDE.md`:
   - **403** on Invoicing: the app is missing the Invoicing feature. Tick it, save, wait a minute.
   - **401**: wrong client id or secret.
   - **`INSUFFICIENT_FUNDS`**: add balance to the sandbox Business account.

Don't move on until all four checks pass, or I've told you to skip one.

## Phase 2: Default sandbox accounts for the judges

Goal: every live step in the demo uses accounts that really exist in my sandbox, so payments complete
instead of failing or sitting unclaimed.

1. Help me create or confirm these under **Testing Tools → Sandbox Accounts**. Give me the exact clicks.
   - **Merchant (Business):** owns the REST app, funded with at least $5,000 USD.
   - **Judge customer (Personal):** funded with at least $2,000, used to pay the $1,500 Apex invoice
     from its pay page.
   - **Vendor (Personal):** receives the $400 Nexus Cloud payout.
2. The seed data uses fake `.test` emails in `src/lib/store.ts`: `billing@apexcorp.test`,
   `receivables@acmesupplies.test`, `billing@nexuscloud.test` and so on. A payout to a fake email never
   settles. Make the demo emails configurable instead of hard-coding my accounts:
   - Add optional `DEMO_CUSTOMER_EMAIL` (used for Apex Corp) and `DEMO_VENDOR_EMAIL` (used for Nexus
     Cloud and Acme Supplies) env vars. When they're unset, keep the `.test` defaults.
   - Read them where the seed is built, so **Reset** restores them too.
   - Document both in `.env.example` and `docs/SANDBOX_GUIDE.md`.
   - Add a test that the default and the override both work. Run the full test suite.
   - Ask me to put my sandbox Personal emails into `.env.local`. Sandbox emails aren't secrets, but
     they belong to my account, so keep them out of the repo.
3. Raise `AI_DAILY_CAP` (default 100 AI requests a day across everyone) to something judges won't
   exhaust, e.g. 1000, if I'm on free models. Explain the trade-off.

## Phase 3: Rehearse the whole judge flow locally

Start `npm run dev`, open http://localhost:3000, and have me click through this while you watch the
server logs. Before each step, tell me what success looks like.

1. Header → **Reset**. Cleared cash shows $4,200.00.
2. `/runway`: the floor is crossed on Day 10, $800 short.
3. `/plans`: the plans show *written by the AI* with the model name, not "fallback templates". Each
   plan has a separate "Rules decided" verdict.
4. `/bills/bill-acme-01` → "Send it to the server anyway": a **403 · RESERVE_BREACH_BLOCKED** stamp,
   $801.00 short (PayPal's fee is counted).
5. `/demo` → **Run it live on PayPal sandbox**:
   1. "Create the invoice on PayPal" returns an `INV2-…` id.
   2. "Open the customer pay page": log in as the **judge customer** and pay.
   3. Back in MerchOps, "Sync with PayPal": Apex shows Collected and cleared cash rises by $1,500.
   4. "Approve the payout on PayPal" returns a batch id. Then `/bills/bill-cloud-02` → "Check
      settlement with PayPal" until it shows Paid. Sandbox batches can take a minute or two.
6. `/bills/bill-acme-01`: the floor check now passes. Approve it.
7. `/ledger`: every step is there, including the refusal. "Download CSV" works.
8. `/bench`: shows 12 / 12 blocked.

Then:
- Record the real `INV2-…` invoice id and payout batch id in the capability table in
  `docs/SANDBOX_GUIDE.md`. Mark only those rows **[VERIFIED]**, with the date.
- Run `npm test && npm run lint && npm run typecheck && npm run build`.
- Show me the diff, then ask before committing and pushing to `judge-readiness`. Never commit `.env.local`.

## Phase 4: Deploy to Render, step by step

Explain each screen to me. I'm clicking, you're guiding. Ask which path I prefer, and recommend A.

**A. Blueprint (uses `render.yaml`)**
1. Render dashboard → **New → Blueprint** → pick the `Viruss07/merchops-ai` repo → set the branch to
   **`judge-readiness`**. Render uses the default branch otherwise, which doesn't have the latest work.
2. If I chose to drop the database in Phase 0, remove the `databases:` block and the `DATABASE_URL`
   env entry from `render.yaml` first. Commit and push, with my OK.
3. Render asks for the `sync: false` values. Tell me what to type for each. I type the secrets into
   Render myself.

**B. Manual web service** (if the Blueprint gives trouble)
- New → Web Service → the repo → branch `judge-readiness` → Runtime **Node** → Region Oregon.
- Build command: `npm install && npm run build`. Start command: `npm start`. Health check path:
  `/api/health`.

**Environment variables to enter in Render** (Settings → Environment). Give me this table filled in:

| Key | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PAYPAL_API_BASE_URL` | `https://api-m.sandbox.paypal.com` | Sandbox only |
| `PAYPAL_CLIENT_ID` | from my sandbox app | I type it |
| `PAYPAL_CLIENT_SECRET` | from my sandbox app | I type it; secret |
| `PAYPAL_PAYOUTS_ENABLED` | `true` | Turns on the live sandbox rail |
| `OPENROUTER_API_KEY` | my key | I type it; secret |
| `OPENROUTER_MODEL`, `AI_MODEL_FALLBACK`, `AI_MODEL_FALLBACK_2` | same as `.env.local` | |
| `OPENROUTER_SITE_URL` | the Render URL, e.g. `https://merchops-ai.onrender.com` | Set after the first deploy |
| `OPENROUTER_SITE_NAME` | `MerchOps AI` | |
| `AI_DAILY_CAP` | e.g. `1000` | |
| `DEMO_AS_OF` | `2026-11-03` | Keeps the demo story |
| `DEFAULT_MIN_RESERVE_CENTS` | `200000` | The $2,000 floor |
| `DEFAULT_FORECAST_DAYS` | `30` | |
| `DEMO_CUSTOMER_EMAIL`, `DEMO_VENDOR_EMAIL` | my sandbox Personal emails | From Phase 2 |
| `PAYPAL_WEBHOOK_ID` | leave empty for now | Filled in after the next step |
| `DEMO_ADMIN_TOKEN` | **leave unset** | If set, the Reset button breaks |

**After the first deploy succeeds**
1. Open `https://<service>.onrender.com/api/health` and confirm it answers. The first hit can take
   about a minute on the free plan.
2. Set `OPENROUTER_SITE_URL` to the real URL.
3. If I wanted webhooks, run locally:
   `node scripts/register-webhook.mjs https://<service>.onrender.com/api/paypal/webhook`.
   It reads my credentials from `.env.local`. Have me copy the webhook id it reports into Render's
   `PAYPAL_WEBHOOK_ID`. The webhook route rejects every delivery until this is set; that's by design.
4. Save, which redeploys. Then repeat the whole Phase 3 rehearsal **on the Render URL**. If any API
   call returns `403 Cross-origin request rejected`, read `src/lib/http.ts` (`isSameOrigin`) and fix
   how it reads the host behind Render's proxy. Explain the fix before making it.
5. Tell me about two behaviours, so I'm not surprised:
   - **State is in memory and shared.** Every judge sees the same ledger, and a restart or sleep
     resets it. Judges should press **Reset** first.
   - **Cold starts.** If I'm on the free plan, offer a way to keep it awake on judging day, e.g. a free
     uptime pinger hitting `/api/health` every 10 minutes.

## Phase 5: Hand-off for the judges

1. Put the live URL in the README's table, replacing "_Render URL: add once deployed_". Put it in
   `docs/DEVPOST.md` too. Ask before pushing.
2. Write me a short **"Testing instructions"** block to paste into Devpost's private field:
   - the URL;
   - "press Reset first";
   - start at `/demo` → **Start the tour**;
   - the judge-customer sandbox email and password, for paying the invoice. Only in this private
     block, never in the repo;
   - what each live step should show, and the ~1-minute cold start.
3. Give me a final checklist with ✅ or ❌ for each item:
   - local checks passing;
   - sandbox accounts created and funded;
   - live invoice paid, with its id;
   - live payout settled, with its batch id;
   - Render deploy healthy;
   - webhook registered (if chosen);
   - README and DEVPOST updated;
   - nothing secret committed (show me `git log -p | grep -iE "secret|client_id"` coming back empty
     of real values).

If something can't be done before the deadline, say so plainly, and tell me the simplest honest way
to present it (for example, "Simulation mode" instead of a broken live step).
