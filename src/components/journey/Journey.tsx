'use client';

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCcw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { formatCentsToUSD } from '@/lib/money';
import {
  ApiError,
  authorizePayout,
  getErrorMessage,
  proposePlan,
  simulatePayment,
} from '@/lib/apiClient';
import { payoutCheck } from '@/lib/client/whatIf';
import { billStatus, formatDate, invoiceStatus, isOpenBill } from '@/lib/client/states';
import { findLowestBalancePoint } from '@/lib/runway';
import { evaluateBillPayPalBalance } from '@/lib/paypalBalance';
import type { RunwayForecast, StateSnapshot } from '@/types';
import type { CashPlanProposal } from '@/lib/plan/types';
import { RunwayInstrument } from '@/components/runway/RunwayInstrument';
import { useAppState } from '@/components/shell/AppState';
import { StatusPill, btn } from '@/components/ui/kit';

interface JourneyProps {
  snapshot: StateSnapshot;
  forecast: RunwayForecast;
  onSnapshot: (snapshot: StateSnapshot) => void;
}

const PAID_STATES = ['APPROVED', 'IN_FLIGHT', 'DISBURSED'];

const STEP_META = [
  { n: 1 as const, short: 'Spot cliff', title: 'Identify the Cash Cliff' },
  { n: 2 as const, short: 'AI plan', title: 'Ask AI for Guarded Strategies' },
  { n: 3 as const, short: 'Guard test', title: 'Attempt Unsafe Payout (Guardrail Test)' },
  { n: 4 as const, short: 'Collect', title: 'Collect Overdue Receivables' },
  { n: 5 as const, short: 'Safe pay', title: 'Execute Safe Payout' },
];

/**
 * Financial Operations Cockpit + collapsible 5-step Guided Verification Tour.
 * Cash, safety reserve, projected low balance, and 30-day runway lead the layout; the interactive
 * walkthrough sits cleanly tucked beneath as an expandable verification drawer.
 */
export function Journey({ snapshot, forecast, onSnapshot }: JourneyProps) {
  const { reset, resetting } = useAppState();
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [selectedStep, setSelectedStep] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [seen, setSeen] = useState(false);
  const [proposals, setProposals] = useState<CashPlanProposal | null>(null);
  const [blocked, setBlocked] = useState<{ deficitCents: number; message: string } | null>(null);
  const [busy, setBusy] = useState<null | 2 | 3 | 4 | 5>(null);
  const [error, setError] = useState<{ step: number; text: string } | null>(null);

  const acme = snapshot.bills.find((b) => b.id === 'bill-acme-01');
  const apex = snapshot.invoices.find((i) => i.id === 'inv-apex-01');
  const floor = snapshot.account.minReserveCents;
  const cleared = snapshot.account.clearedBalanceCents;
  const acmeAmount = acme ? formatCentsToUSD(acme.amountCents) : '$3,000.00';
  const apexAmount = apex ? formatCentsToUSD(apex.amountCents) : '$1,500.00';

  const acmePaid = !!acme && PAID_STATES.includes(acme.status);
  const acmeFailed = acme?.status === 'FAILED';
  const acmeInFlight = acme?.status === 'IN_FLIGHT';
  const apexPaid = apex?.status === 'PAID';
  const check = acme ? payoutCheck(snapshot, acme.id) : null;
  const lowestPoint = findLowestBalancePoint(forecast);
  const peakDeficit = Math.max(0, floor - forecast.minBalanceCents);

  const openBills = snapshot.bills.filter(isOpenBill);
  const openBillsTotal = openBills.reduce((s, b) => s + b.amountCents, 0);
  const openInvoices = snapshot.invoices.filter((i) => i.status !== 'PAID');
  const overdueInvoices = openInvoices.filter((i) => i.status === 'OVERDUE');
  const overdueTotal = overdueInvoices.reduce((s, i) => s + i.amountCents, 0);
  const openReceivablesTotal = openInvoices.reduce((s, i) => s + i.amountCents, 0);

  const deficit = forecast.firstBreachDeficitCents ?? forecast.breachDeficitCents ?? 0;
  const safeBuffer = forecast.minBalanceCents - floor;

  const done = [
    seen || !!proposals || !!blocked || apexPaid || acmePaid,
    !!proposals || apexPaid || acmePaid,
    !!blocked || apexPaid || acmePaid,
    apexPaid,
    acmePaid,
  ];
  const currentIdx = done.findIndex((d) => !d); // -1 when all 5 done
  const naturalStep = (currentIdx === -1 ? 5 : currentIdx + 1) as 1 | 2 | 3 | 4 | 5;
  const activeStep = selectedStep ?? naturalStep;
  const doneCount = done.filter(Boolean).length;

  const run = useCallback(
    async (step: 2 | 3 | 4 | 5, fn: () => Promise<void>) => {
      setBusy(step);
      setError(null);
      try {
        await fn();
      } catch (caught) {
        if (caught instanceof ApiError && caught.snapshot) onSnapshot(caught.snapshot);
        setError({ step, text: getErrorMessage(caught) });
      } finally {
        setBusy(null);
      }
    },
    [onSnapshot],
  );

  const askAi = () =>
    run(2, async () => {
      const res = await proposePlan();
      setProposals(res);
      setSelectedStep(2);
    });

  const tryPayAcme = () =>
    run(3, async () => {
      if (!acme) return;
      try {
        const res = await authorizePayout({ billId: acme.id, executionMode: 'SIMULATION' });
        onSnapshot(res.snapshot);
      } catch (caught) {
        if (caught instanceof ApiError && caught.code === 'RESERVE_BREACH_BLOCKED') {
          if (caught.snapshot) onSnapshot(caught.snapshot);
          const raw = caught.details?.deficitCents;
          setBlocked({
            deficitCents: typeof raw === 'number' ? raw : (check?.deficitCents ?? 0),
            message: caught.message,
          });
          setSelectedStep(3);
          return;
        }
        throw caught;
      }
    });

  const collectApex = () =>
    run(4, async () => {
      if (!apex) return;
      const res = await simulatePayment(apex.id);
      onSnapshot(res.snapshot);
      setSelectedStep(4);
    });

  const payAcme = () =>
    run(5, async () => {
      if (!acme) return;
      const res = await authorizePayout({ billId: acme.id, executionMode: 'SIMULATION' });
      onSnapshot(res.snapshot);
      setSelectedStep(5);
    });

  const restart = async () => {
    await reset();
    setSeen(false);
    setProposals(null);
    setBlocked(null);
    setError(null);
    setSelectedStep(null);
  };

  const stamp = forecast.hasReserveBreach
    ? {
        label: 'Below reserve',
        value: `−${formatCentsToUSD(deficit)}`,
      }
    : null;

  const aiLive = proposals?.source === 'OPENROUTER_AI';
  const passing = proposals?.plans.filter((p) => p.verdict === 'ACCEPTED').length ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-6 sm:px-6 sm:pt-8">
      {/* ---------- 1. Cockpit Header & Primary KPI Hierarchy ---------- */}
      <section aria-labelledby="cockpit-h">
        <div className="flex flex-col gap-4 border-b border-rule pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
              <span className="font-semibold text-ink">{snapshot.account.businessName}</span>
              <span aria-hidden="true" className="text-ink-3">
                ·
              </span>
              <StatusPill
                label={
                  forecast.hasReserveBreach
                    ? `Reserve Breach Risk · Day ${forecast.firstBreachDay}`
                    : 'Reserve Floor Protected · 30d'
                }
                tone={forecast.hasReserveBreach ? 'blocked' : 'safe'}
              />
              {snapshot.account.payoutVerification && (
                <span className="inline-flex items-center gap-1 rounded-full border border-focus/30 bg-focus/10 px-2.5 py-0.5 text-xs font-medium text-focus">
                  <Check className="h-3 w-3" aria-hidden="true" />
                  PayPal Batch Verified
                </span>
              )}
            </div>
            <h1 id="cockpit-h" className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Financial Operations Cockpit
            </h1>
            <p className="mt-1 text-sm text-ink-2">
              Cash policy enforcement across receivables and vendor disbursements ·{' '}
              <span
                className="mono text-xs text-ink-2"
                title="Runway projections anchor to this scenario date; live PayPal settlements log UTC timestamps."
              >
                Scenario baseline: {formatDate(snapshot.demoConfig.asOfDate, { year: true })}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/plans" className={btn.primary}>
              <Bot className="h-4 w-4" aria-hidden="true" />
              AI Recovery Plans
            </Link>
            <Link href="/bills" className={btn.secondary}>
              Bills ({openBills.length})
            </Link>
            <Link href="/invoices" className={btn.secondary}>
              Invoices ({openInvoices.length})
            </Link>
          </div>
        </div>

        {/* 4-Card KPI Strip: Cash, Reserve Floor, Projected Low, Runway */}
        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-rule bg-panel p-4 shadow-xs">
            <dt className="text-xs font-medium text-ink-2">Cleared Cash</dt>
            <dd className="money mt-1.5 text-2xl font-bold text-ink sm:text-3xl">
              {formatCentsToUSD(cleared)}
            </dd>
            <p className="mt-1 text-xs text-ink-2">
              {overdueTotal > 0 ? (
                <span className="text-risk">
                  +{formatCentsToUSD(overdueTotal)} overdue not counted
                </span>
              ) : openReceivablesTotal > 0 ? (
                <span>+{formatCentsToUSD(openReceivablesTotal)} open receivables</span>
              ) : (
                <span className="text-safe">All receivables collected</span>
              )}
            </p>
          </div>

          <div className="rounded-xl border border-rule bg-panel p-4 shadow-xs">
            <dt className="text-xs font-medium text-ink-2">Safety Reserve Floor</dt>
            <dd className="money mt-1.5 text-2xl font-bold text-ink sm:text-3xl">
              {formatCentsToUSD(floor)}
            </dd>
            <p className="mt-1 text-xs text-ink-2">Hard deterministic rule · PayPal fees included</p>
          </div>

          <div
            className={`rounded-xl border p-4 shadow-xs ${
              forecast.hasReserveBreach
                ? 'border-blocked/45 bg-blocked-field/45'
                : 'border-safe/45 bg-safe-field/45'
            }`}
          >
            <dt className="text-xs font-medium text-ink-2">Projected 30-Day Low</dt>
            <dd
              className={`money mt-1.5 text-2xl font-bold sm:text-3xl ${
                forecast.hasReserveBreach ? 'text-blocked' : 'text-safe'
              }`}
            >
              {formatCentsToUSD(forecast.minBalanceCents)}
            </dd>
            <p className="mt-1 text-xs font-medium text-ink-2">
              {forecast.hasReserveBreach ? (
                <span className="text-blocked">
                  −{formatCentsToUSD(peakDeficit)} below floor{' '}
                  {lowestPoint.isOpening ? 'today' : `on Day ${lowestPoint.dayNumber}`}
                  {forecast.firstBreachDay !== undefined &&
                  (lowestPoint.isOpening
                    ? forecast.firstBreachDay !== 0
                    : lowestPoint.dayNumber !== forecast.firstBreachDay)
                    ? forecast.firstBreachDay === 0
                      ? ' (breach today)'
                      : ` (breach Day ${forecast.firstBreachDay})`
                    : ''}
                </span>
              ) : (
                <span className="text-safe">+{formatCentsToUSD(safeBuffer)} buffer above floor</span>
              )}
            </p>
          </div>

          <div className="rounded-xl border border-rule bg-panel p-4 shadow-xs">
            <dt className="text-xs font-medium text-ink-2">Runway &amp; Ending Cash</dt>
            <dd
              className={`money mt-1.5 text-2xl font-bold sm:text-3xl ${
                forecast.hasReserveBreach ? 'text-blocked' : 'text-ink'
              }`}
            >
              {forecast.hasReserveBreach ? `Day ${forecast.firstBreachDay} Cliff` : '30d Safe'}
            </dd>
            <p className="mt-1 text-xs text-ink-2">
              Ends 30d at{' '}
              <span className="money font-semibold text-ink">
                {formatCentsToUSD(forecast.projectedEndingBalanceCents)}
              </span>{' '}
              · {openBills.length} open bills ({formatCentsToUSD(openBillsTotal)})
            </p>
          </div>
        </dl>
      </section>

      {/* ---------- 2. Primary Cockpit Workspace: Runway Instrument + Live Queue ---------- */}
      <section
        aria-label="Runway and live obligations"
        className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
      >
        <div className="min-w-0 rounded-xl border border-rule bg-panel p-4 shadow-card sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-3.5">
            <div>
              <h2 className="text-base font-semibold text-ink">30-Day Liquidity Runway</h2>
              <p className="mt-0.5 text-xs text-ink-2">
                Deterministic daily balance from scenario baseline{' '}
                {formatDate(snapshot.demoConfig.asOfDate, { year: true })} (excludes unpaid overdue
                invoices)
              </p>
            </div>
            <Link href="/runway" className={btn.small}>
              Day-by-day forecast
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <RunwayInstrument
            className="mt-4"
            days={forecast.days}
            floorCents={floor}
            openingBalanceCents={cleared}
            minBalanceCents={forecast.minBalanceCents}
            firstBreachDay={forecast.firstBreachDay}
            firstBreachDeficitCents={forecast.firstBreachDeficitCents}
            size="hero"
            stamp={stamp}
          />

          <div
            className={`mt-4 flex flex-col gap-3 rounded-lg border p-3.5 text-xs sm:flex-row sm:items-center sm:justify-between ${
              forecast.hasReserveBreach
                ? 'border-blocked/35 bg-blocked-field/50 text-ink'
                : 'border-safe/35 bg-safe-field/50 text-ink'
            }`}
          >
            <p className="leading-relaxed">
              {forecast.hasReserveBreach ? (
                <>
                  <strong className="font-semibold text-blocked">Guardrail active:</strong> Cash
                  drops below the {formatCentsToUSD(floor)} safety reserve on Day{' '}
                  {forecast.firstBreachDay} by −{formatCentsToUSD(deficit)}. Collect overdue
                  receivables or stage vendor payouts before releasing blocked bills.
                </>
              ) : (
                <>
                  <strong className="font-semibold text-safe">Liquidity verified:</strong> Cash
                  stays at least {formatCentsToUSD(safeBuffer)} above the {formatCentsToUSD(floor)}{' '}
                  safety reserve across all {forecast.days.length} forecast days.
                </>
              )}
            </p>
            {forecast.hasReserveBreach && (
              <Link href="/plans" className={`${btn.small} shrink-0`}>
                Compare recovery plans
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        <aside className="min-w-0 flex flex-col gap-4">
          {/* Operational Bills Queue */}
          <div className="rounded-xl border border-rule bg-panel p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">Payables &amp; Reserve Guard</h2>
              <Link href="/bills" className="text-xs font-medium text-ink-2 hover:text-ink underline">
                All bills
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-rule">
              {snapshot.bills.slice(0, 4).map((bill) => {
                const policy = isOpenBill(bill) ? payoutCheck(snapshot, bill.id) : null;
                const floorBlocked =
                  isOpenBill(bill) && bill.status !== 'IN_FLIGHT' && !!policy?.wouldBreach;
                const walletCheck =
                  !floorBlocked && isOpenBill(bill) && bill.status !== 'IN_FLIGHT'
                    ? evaluateBillPayPalBalance({
                        paypalBalance: snapshot.paypalBalance,
                        billAmountCents: bill.amountCents,
                        feeCents: snapshot.demoConfig.paypalPayoutFeeCents,
                      })
                    : null;
                const walletBlocked = walletCheck?.status === 'INSUFFICIENT';
                const status = floorBlocked
                  ? { label: `Blocked −${formatCentsToUSD(policy.deficitCents)}`, tone: 'blocked' as const }
                  : walletBlocked && walletCheck
                    ? {
                        label: `PayPal short · ${formatCentsToUSD(walletCheck.shortfallCents)}`,
                        tone: 'blocked' as const,
                      }
                    : billStatus(bill);

                return (
                  <li key={bill.id} className="py-2.5 first:pt-0 last:pb-0">
                    <Link
                      href={`/bills/${bill.id}`}
                      className="flex items-center justify-between gap-3 rounded-md py-0.5 no-underline transition-colors hover:bg-paper/70"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{bill.vendorName}</p>
                        <p className="text-xs text-ink-2">
                          {bill.billNumber} · Due {formatDate(bill.dueDate, { year: false })}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="money text-sm font-semibold text-ink">
                          {formatCentsToUSD(bill.amountCents)}
                        </span>
                        <StatusPill label={status.label} tone={status.tone} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Operational Receivables Queue */}
          <div className="rounded-xl border border-rule bg-panel p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">Receivables Queue</h2>
              <Link href="/invoices" className="text-xs font-medium text-ink-2 hover:text-ink underline">
                All invoices
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-rule">
              {snapshot.invoices.slice(0, 3).map((inv) => {
                const status = invoiceStatus(inv);
                return (
                  <li key={inv.id} className="py-2.5 first:pt-0 last:pb-0">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="flex items-center justify-between gap-3 rounded-md py-0.5 no-underline transition-colors hover:bg-paper/70"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{inv.customerName}</p>
                        <p className="text-xs text-ink-2">
                          {inv.invoiceNumber} · Due {formatDate(inv.dueDate, { year: false })}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="money text-sm font-semibold text-ink">
                          {formatCentsToUSD(inv.amountCents)}
                        </span>
                        <StatusPill label={status.label} tone={status.tone} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Compact Guardrail Architecture Strip */}
          <div className="rounded-xl border border-rule bg-panel p-4 shadow-xs">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-2">
              Guardrail Pipeline
            </p>
            <ul className="mt-2.5 space-y-2 text-xs text-ink-2">
              <li className="flex items-center gap-2">
                <Bot className="h-3.5 w-3.5 shrink-0 text-focus" aria-hidden="true" />
                <span>
                  <strong className="text-ink">AI Suggests:</strong> Plans &amp; reminder copy
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Scale className="h-3.5 w-3.5 shrink-0 text-safe" aria-hidden="true" />
                <span>
                  <strong className="text-ink">Rules Guard:</strong> Deterministic floor &amp; fee
                  math
                </span>
              </li>
              <li className="flex items-center gap-2">
                <UserCheck className="h-3.5 w-3.5 shrink-0 text-ink" aria-hidden="true" />
                <span>
                  <strong className="text-ink">You Authorize:</strong> Explicit payout approval
                </span>
              </li>
            </ul>
          </div>
        </aside>
      </section>

      {/* ---------- 3. Collapsible Guided Verification Tour (Secondary Dominance) ---------- */}
      <section
        aria-labelledby="try-h"
        className="rounded-xl border border-rule bg-panel/90 shadow-xs"
      >
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="try-h" className="text-sm font-semibold text-ink">
                Guided Verification Tour
              </h2>
              <span className="rounded-full border border-rule bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-2">
                {doneCount}/5 verified
              </span>
              <span className="text-xs text-ink-2">
                {doneCount === 5
                  ? 'All verification checks completed'
                  : `Next: Step ${naturalStep} (${STEP_META[naturalStep - 1].short})`}
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {STEP_META.map((item, idx) => {
                const isDone = done[idx];
                const isSelected = walkthroughOpen && activeStep === item.n;
                return (
                  <button
                    key={item.n}
                    type="button"
                    onClick={() => {
                      setSelectedStep(item.n);
                      setWalkthroughOpen(true);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      isSelected
                        ? 'border-ink bg-accent text-accent-ink'
                        : isDone
                          ? 'border-safe/40 bg-safe-field/50 text-safe hover:bg-safe-field'
                          : 'border-rule bg-paper text-ink-2 hover:border-rule-strong hover:text-ink'
                    }`}
                  >
                    {isDone ? (
                      <Check className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <span className="mono">{item.n}.</span>
                    )}
                    <span>{item.short}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void restart()}
              disabled={resetting}
              className={btn.small}
            >
              <RotateCcw className="h-3.5 w-3.5 text-ink-2" aria-hidden="true" />
              {resetting ? 'Restarting…' : 'Restart'}
            </button>
            <button
              type="button"
              onClick={() => setWalkthroughOpen((v) => !v)}
              aria-expanded={walkthroughOpen}
              className={btn.secondary}
            >
              {walkthroughOpen ? 'Collapse walkthrough' : 'Expand walkthrough'}
              {walkthroughOpen ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <div className="h-1 w-full bg-rule/70" aria-hidden="true">
          <div
            className="h-full bg-safe transition-[width] duration-500"
            style={{ width: `${(doneCount / 5) * 100}%` }}
          />
        </div>

        {walkthroughOpen && (
          <div className="border-t border-rule p-4 sm:p-5">
            {activeStep === 1 && (
              <StepPanel
                n={1}
                title={STEP_META[0].title}
                done={done[0]}
                onNext={() => setSelectedStep(2)}
              >
                <p>
                  Start with <Money>{formatCentsToUSD(cleared)}</Money> cleared cash and a strict{' '}
                  <Money>{formatCentsToUSD(floor)}</Money> reserve floor. On{' '}
                  {acme ? formatDate(acme.dueDate) : 'Day 10'}, Acme Supplies&apos;{' '}
                  <Money>{acmeAmount}</Money> bill drops projected cash below the floor on the
                  cockpit runway chart above.
                </p>
                {!done[0] && (
                  <button
                    type="button"
                    onClick={() => {
                      setSeen(true);
                      setSelectedStep(2);
                    }}
                    className={`${btn.primary} mt-3`}
                  >
                    Mark Step 1 reviewed &amp; continue
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </StepPanel>
            )}

            {activeStep === 2 && (
              <StepPanel
                n={2}
                title={STEP_META[1].title}
                done={done[1]}
                onPrev={() => setSelectedStep(1)}
                onNext={() => setSelectedStep(3)}
              >
                <p>
                  Generate candidate recovery plans and let deterministic server rules evaluate each
                  strategy against the reserve floor in integer cents.
                </p>
                <ActionButton
                  onClick={askAi}
                  busy={busy === 2}
                  busyLabel="Evaluating candidate plans…"
                >
                  <Bot className="h-4 w-4" aria-hidden="true" />
                  {proposals ? 'Regenerate AI Plans' : 'Generate AI Plans'}
                </ActionButton>
                {proposals && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-rule bg-paper">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-3.5 py-2 text-xs font-medium text-ink-2">
                      <span>
                        {aiLive ? 'AI Copilot Proposal' : 'Deterministic Policy Templates'}
                      </span>
                      <span className="rounded-full bg-safe-field px-2 py-0.5 font-semibold text-safe">
                        {passing} of {proposals.plans.length} plans pass rules
                      </span>
                    </div>
                    <ul className="divide-y divide-rule">
                      {proposals.plans.map((plan) => (
                        <li key={plan.id} className="p-3">
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-sm font-semibold text-ink">{plan.title}</span>
                            <Verdict ok={plan.verdict === 'ACCEPTED'} />
                          </div>
                          <p className="mt-1 text-xs text-ink-2">
                            Min projected balance:{' '}
                            <span className="money font-semibold text-ink">
                              {formatCentsToUSD(plan.minProjectedBalanceCents)}
                            </span>
                            {plan.verdict !== 'ACCEPTED' && plan.rulesFailed[0]
                              ? ` · ${plan.rulesFailed[0].replace(/^RULE_[A-Z_]+:\s*/, '')}`
                              : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/plans"
                      className="block border-t border-rule px-3.5 py-2 text-xs font-medium text-focus hover:underline"
                    >
                      Open full side-by-side plan comparison →
                    </Link>
                  </div>
                )}
                <StepError error={error} step={2} />
              </StepPanel>
            )}

            {activeStep === 3 && (
              <StepPanel
                n={3}
                title={STEP_META[2].title}
                done={done[2]}
                onPrev={() => setSelectedStep(2)}
                onNext={() => setSelectedStep(4)}
              >
                <p>
                  Attempt to disburse Acme&apos;s <Money>{acmeAmount}</Money> bill before collecting
                  overdue cash. Server policy runs fee-inclusive reserve verification before touching
                  PayPal.
                </p>
                {!acmePaid && (
                  <ActionButton
                    onClick={tryPayAcme}
                    busy={busy === 3}
                    busyLabel="Running server policy check…"
                  >
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    Try paying Acme {acmeAmount} now
                  </ActionButton>
                )}
                {blocked && (
                  <div className="mt-4 rounded-xl border border-blocked/40 bg-blocked-field/60 p-3.5">
                    <p className="flex items-center gap-2 text-sm font-bold text-blocked">
                      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Blocked by Guardrail: {formatCentsToUSD(blocked.deficitCents)} short of
                      reserve
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
                      Server returned HTTP 403 (RESERVE_BREACH_BLOCKED). PayPal payout fees are
                      included in the floor check. Zero funds were disbursed.
                    </p>
                  </div>
                )}
                <StepError error={error} step={3} />
              </StepPanel>
            )}

            {activeStep === 4 && (
              <StepPanel
                n={4}
                title={STEP_META[3].title}
                done={done[3]}
                onPrev={() => setSelectedStep(3)}
                onNext={() => setSelectedStep(5)}
              >
                <p>
                  Apex Corp owes <Money>{apexAmount}</Money>
                  {apex && apex.daysOverdue > 0 ? ` (${apex.daysOverdue} days overdue)` : ''}.
                  Simulate collecting this invoice to replenish cleared liquidity.
                </p>
                {!apexPaid && (
                  <ActionButton
                    onClick={collectApex}
                    busy={busy === 4}
                    busyLabel="Recording invoice collection…"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Mark {apexAmount} as collected
                  </ActionButton>
                )}
                {apexPaid && (
                  <div className="mt-4 rounded-xl border border-safe/40 bg-safe-field/60 p-3.5 text-sm text-ink">
                    <p className="font-semibold text-safe">
                      Cleared cash replenished to <Money>{formatCentsToUSD(cleared)}</Money>
                    </p>
                    <p className="mt-1 text-xs text-ink-2">
                      Lowest projected balance is now{' '}
                      <Money>{formatCentsToUSD(forecast.minBalanceCents)}</Money>, above the safety
                      floor.
                    </p>
                  </div>
                )}
                <StepError error={error} step={4} />
              </StepPanel>
            )}

            {activeStep === 5 && (
              <StepPanel
                n={5}
                title={STEP_META[4].title}
                done={done[4]}
                onPrev={() => setSelectedStep(4)}
              >
                <p>
                  With liquidity replenished, approve Acme&apos;s <Money>{acmeAmount}</Money>{' '}
                  payout. The deterministic policy engine confirms the transaction
                  {check && !check.wouldBreach && !acmePaid && !acmeFailed
                    ? ` leaves a ${formatCentsToUSD(check.bufferCents)} buffer above reserve`
                    : ''}
                  .
                </p>
                {!acmePaid && !acmeFailed && (
                  <ActionButton
                    onClick={payAcme}
                    busy={busy === 5}
                    busyLabel="Authorizing payout…"
                  >
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Approve Acme {acmeAmount} payout
                  </ActionButton>
                )}
                {acmeFailed && (
                  <div className="mt-4 space-y-3 rounded-xl border border-blocked/45 bg-blocked-field/60 p-3.5 text-sm text-ink">
                    <p className="font-semibold text-blocked">
                      Payout Blocked or Failed at PayPal (Zero Ledger Debit)
                    </p>
                    <p className="text-xs text-ink-2">
                      Acme&apos;s payout is marked failed so no duplicate payout can be submitted and
                      your internal cleared cash was not debited. Inspect the{' '}
                      <Link href="/bills/bill-acme-01" className="font-semibold text-ink underline hover:text-blocked">
                        Acme bill room
                      </Link>{' '}
                      or restart the guided flow to reset demo state.
                    </p>
                    <ActionButton onClick={restart} busy={resetting} busyLabel="Resetting demo…">
                      Reset Demo to Retry
                    </ActionButton>
                  </div>
                )}
                {acmePaid && (
                  <div className="mt-4 rounded-xl border border-safe/40 bg-safe-field/60 p-3.5 text-sm text-ink">
                    <p className="font-semibold text-safe">
                      {acmeInFlight
                        ? 'Payout Authorized · In Flight at PayPal'
                        : 'Payout Authorized & Recorded'}
                    </p>
                    <p className="mt-1 text-xs text-ink-2">
                      Every decision and settlement outcome is permanently logged in the{' '}
                      <Link href="/ledger" className="font-semibold text-ink underline hover:text-safe">
                        immutable audit log
                      </Link>
                      .
                    </p>
                  </div>
                )}
                <StepError error={error} step={5} />
              </StepPanel>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function StepPanel({
  n,
  title,
  done,
  onPrev,
  onNext,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${
              done ? 'bg-safe text-paper' : 'bg-accent text-accent-ink'
            }`}
          >
            {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
          </span>
          <h3 className="text-sm font-bold text-ink">{title}</h3>
          <StatusPill label={done ? 'Verified' : 'Pending action'} tone={done ? 'safe' : 'neutral'} />
        </div>
        <div className="flex items-center gap-1.5">
          {onPrev && (
            <button type="button" onClick={onPrev} className={btn.small}>
              Prev
            </button>
          )}
          {onNext && (
            <button type="button" onClick={onNext} className={btn.small}>
              Next
            </button>
          )}
        </div>
      </div>
      <div className="text-sm leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

function ActionButton({
  onClick,
  busy,
  busyLabel,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  busyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className={`${btn.primary} mt-3`}>
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function StepError({ error, step }: { error: { step: number; text: string } | null; step: number }) {
  if (!error || error.step !== step) return null;
  return (
    <p role="alert" className="mt-2 text-sm text-blocked">
      {error.text}
    </p>
  );
}

function Verdict({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-safe">
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
      Rules Pass
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blocked">
      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
      Blocked
    </span>
  );
}

function Money({ children }: { children: React.ReactNode }) {
  return <strong className="money font-semibold text-ink">{children}</strong>;
}
