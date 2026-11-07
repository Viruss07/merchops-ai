# Experience plan: the first three minutes

The demo has to work at three depths: **ten seconds** (a judge understands the product), **one minute**
(they see the AI propose and the rules decide), **three minutes** (they watch the fix and read the
receipt). The page is one screen, not a scroll story. The instrument stays put; the panels change
around it.

## The arc (verified against the running API)

Scenario as of **2026-11-03**: cleared **$4,200.00**, floor **$2,000.00**, 30 days.

| Act | What the judge sees | What actually happens |
|---|---|---|
| **1 · The cliff** | Instrument shows the bars falling through the floor on **Day 10**. Stamp: **Blocked by the floor · −$800.00**. One sentence: *"Acme Supplies, $3,000, lands on Day 10. Cash is $800 short of the reserve."* Primary: **See the AI's plan**. | `runwayForecast.firstBreachDay = 10`, `firstBreachDeficitCents = 80000`. |
| **2 · The proposal** | Proposal card (labelled **Proposal**, source badge `Deterministic rules` or `OpenRouter`) with the three plans. Beside it, a separate **Rules decided** card. All three read **Rejected** with the exact rule text. | `POST /api/ai/propose-plan` → `safest` min $1,200, `fastest_cash` min $800, `lowest_cost` min $1,200, all `RULE_RESERVE_FLOOR_BREACH` on Day 10. |
| **3 · Try to break it** | Primary: **Pay Acme anyway**. The Acme bar drops through the line; the stamp lands with the deficit. A link opens the real payout modal. | `POST /api/payouts/authorize` → **403 `RESERVE_BREACH_BLOCKED`**, `deficitCents = 80000`, `postPayoutBalanceCents = 120000`. Audit log gains the blocked attempt. |
| **4 · Fix it** | Primary: **Collect Apex Corp ($1,500)**. Bars lift, breach closes, the instrument turns `safe`. Then **Approve Acme payout** succeeds and the runway stays above the floor. | `POST /api/invoices/simulate-payment` → cleared **$5,700**, min **$2,700**, no breach. Re-fetch proposals → **all Accepted** (`safest` $2,700, `fastest_cash` $2,300). `POST /api/payouts/authorize` (SIMULATION) → cleared **$2,700**. |
| **5 · The receipt** | Newest-first audit rows with mono ids: blocked attempt, collection, approval, disbursement. Primary: **Open full audit**. | Existing `AuditLogEntry` records; no new data invented. |

The point a judge should leave with: **the AI's plan was rejected by the rules until the merchant acted,
and the block was recorded.** That is the product.

## Page structure

```
Header (hairline)
Hero
  ├─ Act tabs: 1 Cliff · 2 Proposal · 3 Break it · 4 Fix it · 5 Receipt
  ├─ Left: the sentence + the one primary action + the rules verdict
  └─ Right: RunwayInstrument (floor line, breach, stamp)
Cockpit tabs: Runway · Collections · Payouts · Audit
  └─ existing views, restyled, grids on desktop / stacked lists under sm
```

The hero fits 1280×800 and 390×844 without scrolling. On phone the instrument sits under the sentence
at reduced height; the act tabs wrap.

## Files

- `src/app/globals.css` — tokens, Geist variables, motion tokens, real reduced-motion block.
- `tailwind.config.ts` — map tokens; delete `paypal.*`; add `font-sans`/`font-mono`.
- `src/app/layout.tsx` — Geist Sans/Mono, metadata.
- `src/app/page.tsx` — header + `<Journey>` + cockpit tabs.
- `src/components/runway/RunwayInstrument.tsx` — new, the signature object.
- `src/components/journey/Journey.tsx` — new, five acts, fetches the proposal, calls the real APIs.
- `src/components/journey/ProposalCard.tsx` — proposal vs. verdict, never merged.
- `src/components/Navbar.tsx`, `Navigation.tsx` — quiet header, tabs that fit 390 px.
- `src/components/views/RunwayView.tsx` — reuse the instrument at detail size; remove KPI card grid.
- `src/components/views/{Collections,Payouts,Audit}View.tsx` — remove gradient banners and PayPal blue;
  add stacked lists under `sm`.
- `src/lib/apiClient.ts` — add `proposePlan()`; expose API `details` on `ApiError` (read-only).

## Rounds

**P0 — first screen.** Tokens, Geist, header, act 1, instrument with floor line + breach stamp, one
primary action, phone fit. Verify: first screen ≤ viewport, no horizontal overflow, breach text present.

**P1 — acts 2–4 + phone.** Proposal fetch, verdict card, blocked attempt, collect, approve, re-fetch.
Verify: pre-collection verdicts Rejected; post-collection Accepted; cleared balance transitions
$4,200 → $5,700 → $2,700; audit rows appear; 390 px no overflow.

**P2 — receipt, polish, dark.** Act 5, dark tokens, focus rings, reduced motion, contrast, grid
stacked lists, final screenshots.

After each round: `npm run typecheck`, `npm test`, `npm run build`, screenshot at 1280×800 and
390×844 in light and dark, and re-check overflow + first-screen fit. Commit per round; ask before push.

## Acceptance checks

- [ ] At 1280×800 and 390×844 the hero (header + act 1) is fully visible; `scrollWidth ≤ innerWidth`.
- [ ] The instrument shows a floor line labelled `$2,000.00` and a Day-10 breach of `−$800.00`.
- [ ] Proposal and verdict are separate cards; the verdict names the failed rule and the day.
- [ ] "Pay Acme anyway" produces a real 403 and a visible stamp with `−$800.00`.
- [ ] Collecting Apex lifts the bars, closes the breach, and flips the proposals to Accepted.
- [ ] Approving Acme after the collection succeeds and leaves the runway above the floor.
- [ ] The receipt lists the blocked attempt, the collection, the approval and the disbursement.
- [ ] No `paypal.blue`/`darkblue`/`light` tokens remain; no gradient text or banners.
- [ ] Reduced motion removes travel/scale, keeps colour/order, and stops auto-advance.
- [ ] `typecheck`, `test`, `build` pass.
