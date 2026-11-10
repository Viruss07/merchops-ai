# Design system: The runway is the instrument

MerchOps is a 30-day cash runway with a hard floor. Every bill lands on the runway, every collection
lifts it, and the $2,000 reserve floor is a line nothing may cross. The AI drafts plans; the floor
decides. The interface should read like a measuring instrument, not a SaaS dashboard.

Product truth lives in `PRODUCT.md`; the build plan is in `docs/design/experience-plan.md`.

## Tokens (`src/app/globals.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#f3f4f2` | `#0b0e11` | Page canvas |
| `panel` | `#ffffff` | `#12161b` | Surfaces (sections, the instrument) |
| `ink` | `#14181c` | `#eef1f3` | Text and the primary action (the one accent) |
| `ink-2` | `#4c545c` | `#a9b2ba` | Secondary text |
| `ink-3` | `#6b747d` | `#828c96` | Tertiary text, dates, captions |
| `rule` / `rule-strong` | `#e2e5e3` / `#cfd4d1` | `#20262c` / `#303840` | Hairlines, borders |
| `safe` / `safe-field` | `#17795a` / `#e4f3ec` | `#5ed3a6` / `#0e2b22` | Cash above the floor, collected, settled |
| `risk` / `risk-field` | `#a8610b` / `#fbf0df` | `#f0b45b` / `#32230c` | Cash approaching the floor, overdue |
| `blocked` / `blocked-field` | `#b4232a` / `#fbe7e6` | `#f59a9e` / `#381518` | Below the floor, a payout the rules refused |
| `focus` | `#2f5bd0` | `#8fb0ff` | Focus rings and caret only, never an accent |

No PayPal brand tokens exist. PayPal appears only as a factual mention with its ids.

Radius sets hierarchy: controls `md` (10px), sections `lg` (14px). One shadowed element per screen
(the instrument).

## Type

- **Geist Sans** through the `geist` package (self-hosted, no network fetch at build). Tabular figures
  everywhere, `ss01`/`cv11`, slight negative tracking. Display and money track tighter (`.money`).
- **Geist Mono** only for ids, dates and request references. Never as a costume for ordinary text.
- Money is set large and tight so a figure reads as one shape.

## Signature move: the floor line

`RunwayInstrument` (`src/components/runway/RunwayInstrument.tsx`) is the product's one object.

- 30 daily bars grow from a shared baseline with `scaleY`, never by animating `height`.
- The reserve floor is a real horizontal rule across the bars, labelled with the amount. It appears
  once per screen and is never decoration.
- A breach is drawn as the bar physically crossing the rule; the part below the line is `blocked` red.
- When the rules refuse a payout, a stamp lands beside the line: **"Blocked by the floor · −$800.00"**.
  When an overdue invoice is collected, the bars lift and the breach closes on screen.

The instrument is reused at hero size (the journey) and at detail size (the Runway tab). Same geometry,
same colours, same floor.

## Pages (one shell, every record has a page)

The root layout (`src/app/layout.tsx`) holds the shell, so every page shares it: a sticky translucent
header on the canvas (`bg-paper/80` + blur), the mark (a ring with the floor drawn through it), quiet
links (Runway, Invoices, Bills, Plans, Ledger, Bench, Judge mode), the cleared cash, an in-place Reset
confirm, and the one ink action, **Get a plan**. `AppStateProvider` (`src/components/shell/AppState.tsx`)
holds one snapshot for every page, so the header, the runway and every list always show the same numbers.

| Route | What it is |
|---|---|
| `/` | The five-act journey around the hero instrument, then "Waiting on you": each row links to the page that resolves it |
| `/runway` | The instrument at hero size, the floor verdict, what lands on which day (each a link), day by day |
| `/invoices`, `/invoices/[id]` | List; the invoice room: tracker, next step (AI reminder you approve, PayPal invoice, simulate), "if it's collected today" receipt and runway, history |
| `/bills`, `/bills/[id]` | List; the bill room: the payout guardrail on the page (rail, floor check, confirm), "send it to the server anyway", the runway if paid today, history |
| `/plans` | Each AI **Proposal** beside its separate **Rules decided** verdict; actions link to their records |
| `/ledger` | The append-only log: filters, search, CSV, every row linked to its invoice or bill |
| `/bench` | Twelve attacks, run live against the real guard |
| `/demo` | Judge mode: the seven tour steps and the live PayPal sandbox run |

## Components

- Kit (`src/components/ui/kit.tsx`): `btn` (primary, secondary, small, quiet), `StatusPill`, `Tracker`
  (done = filled safe green with a check, current = ink ring, stopped by a rule = red, skipped = hairline,
  never shown as done), `PageHeader`, `Figure`, `Section`, `Line` (receipt rows), `Ref` (mono ids),
  `Notice`, `Trail` (date · event · who · amount), `ListRow`, `Missing`, `Skeleton`.
- Record rooms follow one layout: header with status pill and amount, the tracker, then a main column
  (`NextStep`, the one shadowed panel; a what-if `RunwayCard`; history) and a 22rem sticky side column
  (the state-tinted money panel, details). Under `lg` the money panel moves directly under the next step.
- What-if previews (`src/lib/client/whatIf.ts`) reuse the deterministic engine. `payoutCheck` mirrors the
  server's floor check exactly (fee always counted, approved and in-flight payouts reserved), so no page
  can say a payout passes when the server would refuse it.
- `JudgeTour` (`src/components/shell/JudgeTour.tsx`): non-modal, bottom-right, walks the real pages,
  folded by default on phones.
- Language: every status, event and actor goes through `src/lib/client/states.ts`; no raw enum
  (`OVERDUE`, `RULE_RESERVE_PRESERVED`, `AI_COPILOT`) reaches the screen.

## Layout and rules

- Max width 6xl; record rooms = main column + 22rem sticky side column. The first screen (header + hero) fits 1280×800 and 390×844 without scrolling.
- Borders are 1px hairlines. One shadowed element per screen.
- One primary button per screen; everything else is secondary.
- **Motion follows the cash.** Motion is allowed only when it shows where the cash goes, what a rule
  decided, or what the AI proposed. Tokens: `--t-tap` 120 ms, `--t-state` 220 ms, `--t-travel` 480 ms,
  `--t-focal` 700 ms; `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`; stagger 140 ms capped at five.
  Animate transform, opacity, clip-path, stroke-dashoffset and colour only.
- Refused: scroll-reveal fades, hover lifts, parallax, count-ups, looping decoration, gradient text,
  gradient banners, rows of identical KPI cards, emoji icons, mono as decoration, eyebrow labels.
- `prefers-reduced-motion` keeps colour, opacity and order and drops travel and scale. Nothing
  auto-advances under reduced motion.
