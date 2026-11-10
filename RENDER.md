# Hosting MerchOps AI on Render (free plan)

This guide takes the repo to a public URL judges can open, on Render's **free** plan, with a free
keep-warm cron so the app never sleeps. It takes about 20 minutes. You don't need a credit card.

What you end up with:

- One Render **web service** running the Next.js app (`render.yaml` describes it).
- A **GitHub Actions cron**, every 10 minutes, so Render's free instance never goes to sleep. It also
  pre-loads the AI plans once an hour, so the demo's "Ask the AI" step answers instantly.
- Optional: a PayPal webhook, so sandbox payments update the app without pressing "Check".

> **Secrets rule.** Never paste a key into a chat, an issue, a commit or this file. Keys go only into
> Render's Environment tab and your local `.env` (which git ignores).

---

## 0. Before you start

You need:

| Thing | Where | Notes |
| --- | --- | --- |
| GitHub access to the repo | `github.com/Viruss07/merchops-ai` | Deploy from branch **`judge-readiness`** (or `main` once it's merged). |
| Render account | [dashboard.render.com](https://dashboard.render.com) | Sign up with GitHub. Free plan, no card. |
| PayPal sandbox REST app | [developer.paypal.com](https://developer.paypal.com/dashboard/applications/sandbox) → Apps & Credentials | Tick **Invoicing** and **Payouts** under the app's features. Copy the **Client ID** and **Secret**. |
| OpenRouter key | [openrouter.ai/keys](https://openrouter.ai/keys) | Free models are enough. Without a key the app falls back to built-in plan templates. |

Check the keys locally first. Each script prints PASS/FAIL and never prints a secret:

```bash
npm ci
```

```bash
node scripts/sandbox-check.mjs --deep
```

```bash
node scripts/ai-check.mjs
```

`sandbox-check` should pass OAuth, Payouts scope and Invoicing. A `WARN` on the webhook list (HTTP
403) is fine: webhooks are optional.

---

## 1. Create the service from the Blueprint

1. Push the branch you want to deploy to GitHub.
2. In Render: **New** → **Blueprint** → pick the `merchops-ai` repo and branch → **Connect**.
3. Render reads `render.yaml` and shows one service, `merchops-ai` (Node, free, Oregon). Click **Apply**.
4. Render asks for the values marked `sync: false`. Fill them in:

| Variable | Value | Required? |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID` | Sandbox app Client ID | Yes, for live PayPal |
| `PAYPAL_CLIENT_SECRET` | Sandbox app Secret | Yes, for live PayPal |
| `OPENROUTER_API_KEY` | Your OpenRouter key | Yes, for live AI |
| `PAYPAL_WEBHOOK_ID` | Leave empty for now (step 4) | Optional |
| `PAYPAL_PAYOUT_RECEIVER_EMAIL` | A sandbox **Personal** account email, e.g. `sb-xxxx@personal.example.com` | Optional, see below |

Everything else is set by the Blueprint: `NODE_ENV=production`, `NODE_VERSION=22`,
`PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com` (sandbox only, never change it),
`PAYPAL_PAYOUTS_ENABLED=true`, `DEMO_AS_OF=2026-11-03`, the reserve and forecast defaults, and the
free AI model chain.

**About `PAYPAL_PAYOUT_RECEIVER_EMAIL`.** The demo vendors use made-up `.test` emails. PayPal accepts
payouts to them but leaves them `UNCLAIMED`, so the app correctly keeps them "in flight" and never
marks them settled. To show a payout that fully settles, create a sandbox Personal account
(developer.paypal.com → Sandbox → Accounts → Create account → Personal) and put its email here.
Every live sandbox payout then goes to that account and reaches `SUCCESS`.

The first build takes 3–5 minutes (`npm ci --include=dev && npm run build`). When the log says
`Your service is live`, open `https://<your-service>.onrender.com`.

### Settings worth knowing

- **Build command:** `npm ci --include=dev && npm run build`. `--include=dev` matters: with
  `NODE_ENV=production`, plain `npm ci` skips TypeScript and Tailwind and the build fails.
- **Start command:** `npm start`. Next.js binds to Render's `PORT` automatically.
- **Health check:** `/api/health`. Render restarts the service if it stops answering.
- **Auto-deploy:** on. Every push to the connected branch redeploys.
- **No database.** The app keeps its demo state in memory on purpose: every restart or redeploy
  starts the story from Day 0, which is what judges should see. (`db/` and `scripts/migrate.mjs` are
  for a future Postgres milestone and are not used.)

---

## 2. Smoke-test the live URL

Replace the host with yours:

```bash
curl -s https://<your-service>.onrender.com/api/health
```

Expect `{"ok":true,...,"db":"memory"}`. Then in the browser:

1. **Home page → Try it: 5 steps.** Click through all five. Step 2 should say
   "Written live by &lt;model&gt;". If it says "AI unavailable", check `OPENROUTER_API_KEY`.
2. **Bonus: the same flow on the real PayPal sandbox → Run it on PayPal.** All three cards should go
   green and show a real `INV2-…` invoice id and a payout batch id. No PayPal login is needed. If
   step 1 fails with a permission error, tick **Invoicing** on the sandbox app and save.
3. **Safety tests:** should show 12 / 12 blocked.
4. Footer should say **Connected to PayPal sandbox**.

Press the ↺ button in the header (or **Restart demo**) to put everything back to Day 0.

---

## 3. Keep it awake: the free cron job

Render's free web services **sleep after 15 minutes without traffic** and take about a minute to
wake. Render's own Cron Jobs are a paid feature, so we use free schedulers that just ping the app.

### Option A (set up already): GitHub Actions

`.github/workflows/keep-warm.yml` runs every 10 minutes. It:

- GETs `/api/health` (keeps the instance awake), and
- once an hour, POSTs `/api/ai/propose-plan` so the server's one-hour AI cache is always warm.

To turn it on:

1. GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Name `PRODUCTION_URL`, value `https://<your-service>.onrender.com` (no trailing slash).
3. **Actions** tab → **Keep Warm & Production Health** → **Run workflow** once to test it. It should
   go green.

Notes:

- Scheduled workflows only run from the repo's **default branch**. If you deploy from
  `judge-readiness`, merge it into `main` (or make it the default branch) for the cron to fire.
- GitHub can delay scheduled runs by a few minutes when it's busy. That's still well inside
  Render's 15-minute window most of the time; add Option B too if you want certainty.
- GitHub disables scheduled workflows after 60 days with no commits. Not an issue for judging.

### Option B (backup, 2 minutes): cron-job.org

1. Make a free account at [cron-job.org](https://cron-job.org).
2. **Create cronjob** → URL `https://<your-service>.onrender.com/api/health` → every **10 minutes** →
   Save.

Running both is fine. They only read the health probe.

### Free-hour budget

The free plan gives **750 instance hours a month** per workspace. One service awake 24/7 uses about
744 hours in a 31-day month, so keep **only this one free service** awake in the workspace during
judging. If you have other free services, suspend them.

---

## 4. Optional: PayPal webhook

Without a webhook the app still works: the "Check PayPal" / "Check settlement" buttons poll PayPal.
With one, a payment made on PayPal updates the app on its own.

1. Register it from your machine (uses your local `.env` keys; prints only the webhook id):

   ```bash
   node scripts/register-webhook.mjs https://<your-service>.onrender.com/api/paypal/webhook
   ```

   If it fails with HTTP 403, register it by hand instead: developer.paypal.com → your sandbox app →
   **Add Webhook** → that URL → tick `INVOICING.INVOICE.PAID`, `PAYMENT.CAPTURE.COMPLETED` and the
   `PAYMENT.PAYOUTS-ITEM.*` events (SUCCEEDED, FAILED, UNCLAIMED, RETURNED, BLOCKED) → Save, then copy the **Webhook ID**.
2. Render → service → **Environment** → set `PAYPAL_WEBHOOK_ID` → **Save, rebuild and deploy**.

The route rejects any delivery whose signature PayPal doesn't verify against that id.

---

## 5. Before you submit

- [ ] Health URL returns `ok: true`.
- [ ] The 5-step demo and the one-click PayPal run both work on the live URL.
- [ ] `PRODUCTION_URL` secret is set and the keep-warm workflow shows green runs.
- [ ] The live URL is in `README.md` (the "Live demo" row) and in the Devpost submission.
- [ ] The demo has been reset (↺) so judges start at Day 0.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Build fails: `Cannot find module 'typescript'` or Tailwind errors | Build command is missing `--include=dev`. Use the one in `render.yaml`. |
| First visit takes ~1 minute | The instance was asleep. Set up the keep-warm cron (step 3). |
| Demo data reset on its own | Render restarted or redeployed the instance. State is in memory by design; press ↺ to be sure you're at Day 0. |
| "Ask the AI" takes 30–50s or says "AI unavailable" | Free models are slow or briefly down. The keep-warm job pre-loads plans hourly; the app falls back to templates if every model fails. Check `OPENROUTER_API_KEY`. |
| "PayPal said no" on the invoice step | The sandbox app is missing **Invoicing**, or the Client ID/Secret are wrong or from a Live app. |
| Payout stays "in flight" | Expected when the receiver isn't a real sandbox account (it's `UNCLAIMED`). Set `PAYPAL_PAYOUT_RECEIVER_EMAIL` to a sandbox Personal account. |
| Payout fails with HTTP 400 | The sandbox Business account may have no balance. Add funds in developer.paypal.com → Sandbox → Accounts. |
| `403 Cross-origin request rejected` from curl | The API only accepts same-origin calls. Send an `origin: https://<your-service>.onrender.com` header, or use the browser. |
