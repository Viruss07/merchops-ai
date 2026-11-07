'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { formatCentsToUSD } from '@/lib/money';
import {
  ApiError,
  authorizePayout,
  getErrorMessage,
  proposePlan,
  simulatePayment,
} from '@/lib/apiClient';
import type { AuditLogEntry, RunwayForecast, StateSnapshot } from '@/types';
import type { CashPlan, CashPlanProposal } from '@/lib/plan/types';
import { RunwayInstrument } from '@/components/runway/RunwayInstrument';

interface JourneyProps {
  snapshot: StateSnapshot;
  forecast: RunwayForecast;
  onSnapshot: (snapshot: StateSnapshot) => void;
  onOpenAudit: () => void;
  onOpenPayouts: () => void;
}

type Act = 1 | 2 | 3 | 4 | 5;

const ACTS: { n: Act; short: string; long: string }[] = [
  { n: 1, short: 'Cliff', long: 'The cliff' },
  { n: 2, short: 'Plan', long: 'The proposal' },
  { n: 3, short: 'Break', long: 'Try to break it' },
  { n: 4, short: 'Fix', long: 'Fix it' },
  { n: 5, short: 'Receipt', long: 'The receipt' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function formatTimestamp(iso: string): string {
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return `${formatDate(date)} · ${time}`;
}

function verdictTone(verdict: CashPlan['verdict']): string {
  return verdict === 'ACCEPTED' ? 'text-safe' : 'text-blocked';
}

export function Journey({
  snapshot,
  forecast,
  onSnapshot,
  onOpenAudit,
  onOpenPayouts,
}: JourneyProps) {
  const [act, setAct] = useState<Act>(1);
  const [proposals, setProposals] = useState<CashPlanProposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [attemptLoading, setAttemptLoading] = useState(false);
  const [collectLoading, setCollectLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [blocked, setBlocked] = useState<{ deficitCents: number; message: string } | null>(null);
  const [collected, setCollected] = useState(false);
  const [approved, setApproved] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const acmeBill = useMemo(
    () =>
      snapshot.bills.find((bill) => bill.id === 'bill-acme-01') ??
      snapshot.bills.find((bill) => bill.vendorName.toLowerCase().includes('acme')),
    [snapshot.bills],
  );
  const apexInvoice = useMemo(
    () =>
      snapshot.invoices.find((invoice) => invoice.id === 'inv-apex-01') ??
      snapshot.invoices.find((invoice) => invoice.status === 'OVERDUE'),
    [snapshot.invoices],
  );

  const firstBreachDay = forecast.firstBreachDay;
  const firstBreachDeficit = forecast.firstBreachDeficitCents ?? forecast.breachDeficitCents ?? 0;
  const asOfDate = snapshot.demoConfig.asOfDate;
  const cleared = snapshot.account.clearedBalanceCents;
  const floor = snapshot.account.minReserveCents;
  const breachBill = useMemo(
    () =>
      snapshot.bills.find(
        (bill) =>
          bill.dueDate === forecast.breachDate &&
          ['PENDING', 'APPROVED', 'IN_FLIGHT'].includes(bill.status),
      ),
    [snapshot.bills, forecast.breachDate],
  );

  const loadProposals = useCallback(async () => {
    setProposalLoading(true);
    setProposalError(null);
    try {
      const next = await proposePlan();
      setProposals(next);
    } catch (error) {
      setProposalError(getErrorMessage(error));
    } finally {
      setProposalLoading(false);
    }
  }, []);

  useEffect(() => {
    if (act >= 2 && act <= 4 && !proposals && !proposalLoading) {
      void loadProposals();
    }
  }, [act, proposals, proposalLoading, loadProposals]);

  const handleAttemptAcme = useCallback(async () => {
    if (!acmeBill || attemptLoading) return;
    setAttemptLoading(true);
    setActionError(null);
    try {
      const response = await authorizePayout({
        billId: acmeBill.id,
        executionMode: 'SIMULATION',
      });
      onSnapshot(response.snapshot);
      setApproved(true);
      setAct(5);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.snapshot) onSnapshot(error.snapshot);
        const rawDeficit = error.details?.deficitCents;
        const deficitCents = typeof rawDeficit === 'number' ? rawDeficit : firstBreachDeficit;
        if (error.code === 'RESERVE_BREACH_BLOCKED') {
          setBlocked({ deficitCents, message: error.message });
        } else {
          setActionError(error.message);
        }
      } else {
        setActionError(getErrorMessage(error));
      }
    } finally {
      setAttemptLoading(false);
    }
  }, [acmeBill, attemptLoading, firstBreachDeficit, onSnapshot]);

  const handleCollectApex = useCallback(async () => {
    if (!apexInvoice || collectLoading) return;
    setCollectLoading(true);
    setActionError(null);
    try {
      const response = await simulatePayment(apexInvoice.id);
      onSnapshot(response.snapshot);
      setCollected(true);
      const refreshed = await proposePlan();
      setProposals(refreshed);
    } catch (error) {
      if (error instanceof ApiError && error.snapshot) onSnapshot(error.snapshot);
      setActionError(getErrorMessage(error));
    } finally {
      setCollectLoading(false);
    }
  }, [apexInvoice, collectLoading, onSnapshot]);

  const handleApproveAcme = useCallback(async () => {
    if (!acmeBill || approveLoading) return;
    setApproveLoading(true);
    setActionError(null);
    try {
      const response = await authorizePayout({
        billId: acmeBill.id,
        executionMode: 'SIMULATION',
      });
      onSnapshot(response.snapshot);
      setApproved(true);
      setAct(5);
    } catch (error) {
      if (error instanceof ApiError && error.snapshot) onSnapshot(error.snapshot);
      setActionError(getErrorMessage(error));
    } finally {
      setApproveLoading(false);
    }
  }, [acmeBill, approveLoading, onSnapshot]);

  const safest = proposals?.plans.find((plan) => plan.id === 'safest') ?? proposals?.plans[0];
  const allAccepted = proposals?.plans.every((plan) => plan.verdict === 'ACCEPTED') ?? false;
  const sourceLabel = proposals?.source === 'OPENROUTER_AI' ? 'OpenRouter' : 'Deterministic rules';

  const stamp = blocked
    ? {
        label: 'Blocked by the floor',
        value: `−${formatCentsToUSD(blocked.deficitCents)}`,
      }
    : forecast.hasReserveBreach
      ? {
          label: 'Below the floor',
          value: `−${formatCentsToUSD(firstBreachDeficit)}`,
        }
      : null;

  const logs = useMemo(
    () =>
      [...snapshot.auditLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 6),
    [snapshot.auditLogs],
  );

  const headline = approved
    ? 'The floor held. The receipt is the proof.'
    : forecast.hasReserveBreach
      ? `Cash crosses the floor on Day ${firstBreachDay}.`
      : 'The floor holds.';

  const breachSentence = forecast.hasReserveBreach ? (
    <>
      {breachBill ? (
        <>
          <strong className="font-medium text-ink">{breachBill.vendorName}</strong> (
          {formatCentsToUSD(breachBill.amountCents)}) lands on {formatDate(breachBill.dueDate)}
          .{' '}
        </>
      ) : null}
      Cleared cash is {formatCentsToUSD(cleared)}. The {formatCentsToUSD(floor)} floor is crossed by{' '}
      {formatCentsToUSD(firstBreachDeficit)}.
    </>
  ) : (
    <>
      Cleared cash is {formatCentsToUSD(cleared)}. The lowest projected balance is{' '}
      {formatCentsToUSD(forecast.minBalanceCents)}, above the {formatCentsToUSD(floor)} floor.
    </>
  );

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 sm:px-6 sm:pt-10">
      <div
        role="tablist"
        aria-label="Demo acts"
        className="grid grid-cols-5 gap-1 border-b border-rule"
      >
        {ACTS.map((item) => {
          const isActive = act === item.n;
          return (
            <button
              key={item.n}
              type="button"
              id={`act-tab-${item.n}`}
              role="tab"
              aria-selected={isActive}
              aria-controls="act-panel"
              onClick={() => setAct(item.n)}
              className={`group flex flex-col items-start border-b-2 pb-2 pt-1 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
                isActive
                  ? 'border-ink text-ink'
                  : 'border-transparent text-ink-3 hover:border-rule-strong hover:text-ink-2'
              }`}
            >
              <span className="mono text-[10px] leading-none">{`0${item.n}`}</span>
              <span className="mt-1 text-[11px] font-medium leading-tight sm:text-xs">
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.long}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        id="act-panel"
        role="tabpanel"
        aria-labelledby={`act-tab-${act}`}
        className="mt-6 grid gap-6 lg:grid-cols-12 lg:gap-10"
      >
        <div className="lg:col-span-5">
          {act === 1 && (
            <div>
              <h1 className="text-[32px] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-[42px]">
                {headline}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-ink-2">{breachSentence}</p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAct(2)}
                  className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                >
                  See the AI&apos;s plan
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onOpenPayouts}
                  className="rounded-md border border-rule-strong px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors duration-200 hover:bg-panel hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                >
                  Open the payout guardrail
                </button>
              </div>
              <p className="mt-4 text-xs text-ink-3">
                AI proposes. Rules decide. Nothing moves without you.
              </p>
            </div>
          )}

          {act === 2 && (
            <div>
              <h2 className="text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-3xl">
                The AI proposes. The rules decide.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                Three plans, checked against the same deterministic runway before any money moves.
              </p>

              <div className="mt-4 overflow-hidden rounded-lg border border-rule bg-panel">
                <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
                  <span className="text-sm font-medium">Proposal</span>
                  <span className="mono text-[10px] text-ink-3">{sourceLabel}</span>
                </div>
                {proposalLoading ? (
                  <div className="flex items-center gap-2 px-4 py-6 text-xs text-ink-3">
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                    Reading the deterministic runway…
                  </div>
                ) : proposalError ? (
                  <div className="px-4 py-4 text-xs text-blocked">
                    <p>{proposalError}</p>
                    <button
                      type="button"
                      onClick={() => void loadProposals()}
                      className="mt-2 inline-flex items-center gap-1.5 font-medium underline underline-offset-2"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry
                    </button>
                  </div>
                ) : (
                  proposals?.plans.map((plan) => (
                    <div key={plan.id} className="border-b border-rule px-4 py-3 last:border-b-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium">{plan.title}</span>
                        <span
                          className={`mono text-[10px] font-semibold ${verdictTone(plan.verdict)}`}
                        >
                          {plan.verdict}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-2">{plan.subtitle}</p>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-3">
                        <span>Lowest {formatCentsToUSD(plan.minProjectedBalanceCents)}</span>
                        {plan.breachDay ? (
                          <span>Breach Day {plan.breachDay}</span>
                        ) : (
                          <span>No breach</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div
                className={`mt-3 rounded-lg border p-3 ${
                  safest?.verdict === 'ACCEPTED'
                    ? 'border-safe bg-safe-field'
                    : 'border-blocked bg-blocked-field'
                }`}
              >
                <div className="flex items-center gap-2">
                  {safest?.verdict === 'ACCEPTED' ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-safe" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="h-3.5 w-3.5 text-blocked" aria-hidden="true" />
                  )}
                  <p className="text-xs font-semibold">Rules decided</p>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
                  {safest?.rulesFailed[0] ??
                    safest?.narrative ??
                    'Waiting for the deterministic verdict.'}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAct(3)}
                  className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                >
                  Try to pay Acme anyway
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setAct(1)}
                  className="text-xs text-ink-3 underline underline-offset-4 hover:text-ink-2"
                >
                  Back to the cliff
                </button>
              </div>
            </div>
          )}

          {act === 3 && (
            <div>
              <h2 className="text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-3xl">
                Try to break it.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                The merchant wants Acme paid today. The payout guardrail runs the same numbers
                before it moves a cent.
              </p>

              {blocked ? (
                <div className="mt-4 rounded-lg border-2 border-blocked bg-blocked-field p-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-blocked" aria-hidden="true" />
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blocked">
                      Blocked by the floor
                    </p>
                  </div>
                  <p className="money mt-2 text-3xl font-semibold text-blocked">
                    {formatCentsToUSD(blocked.deficitCents)} short
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-2">{blocked.message}</p>
                  <p className="mono mt-2 text-[10px] text-ink-3">403 · RESERVE_BREACH_BLOCKED</p>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-rule bg-panel p-4">
                  <p className="text-xs text-ink-2">
                    Acme Supplies is due {acmeBill ? formatDate(acmeBill.dueDate) : 'on Day 10'} for{' '}
                    {acmeBill ? formatCentsToUSD(acmeBill.amountCents) : '—'}. Approving it today
                    would take the balance below the {formatCentsToUSD(floor)} floor.
                  </p>
                </div>
              )}

              {actionError && (
                <p role="alert" className="mt-3 text-xs text-blocked">
                  {actionError}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {blocked ? (
                  <button
                    type="button"
                    onClick={() => setAct(4)}
                    className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                  >
                    Go to the fix
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleAttemptAcme()}
                    disabled={attemptLoading || !acmeBill}
                    className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                  >
                    {attemptLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    )}
                    {attemptLoading
                      ? 'Evaluating…'
                      : `Pay Acme ${acmeBill ? formatCentsToUSD(acmeBill.amountCents) : ''}`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenPayouts}
                  className="text-xs text-ink-3 underline underline-offset-4 hover:text-ink-2"
                >
                  Open the payout guardrail
                </button>
              </div>
            </div>
          )}

          {act === 4 && (
            <div>
              <h2 className="text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-3xl">
                Fix it.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                Collect the overdue invoice. The cash arrives before Acme is due.
              </p>

              {!collected ? (
                <div className="mt-4 rounded-lg border border-rule bg-panel p-4">
                  <p className="text-xs leading-relaxed text-ink-2">
                    {apexInvoice ? (
                      <>
                        <strong className="font-medium text-ink">{apexInvoice.customerName}</strong>{' '}
                        owes {formatCentsToUSD(apexInvoice.amountCents)} on invoice{' '}
                        <span className="mono text-[11px]">{apexInvoice.invoiceNumber}</span>.
                        Collecting it lifts the runway above the floor.
                      </>
                    ) : (
                      'No overdue invoice is available in this scenario.'
                    )}
                  </p>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-safe bg-safe-field p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-safe" aria-hidden="true" />
                    <p className="text-xs font-semibold text-safe">The floor holds</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-2">
                    Cleared cash is {formatCentsToUSD(cleared)}. The lowest projected balance is{' '}
                    {formatCentsToUSD(forecast.minBalanceCents)}. All three plans are now{' '}
                    {allAccepted ? 'accepted' : 're-evaluated'} by the rules.
                  </p>
                </div>
              )}

              {actionError && (
                <p role="alert" className="mt-3 text-xs text-blocked">
                  {actionError}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {!collected ? (
                  <button
                    type="button"
                    onClick={() => void handleCollectApex()}
                    disabled={collectLoading || !apexInvoice}
                    className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                  >
                    {collectLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    )}
                    {collectLoading
                      ? 'Collecting…'
                      : `Collect ${apexInvoice ? apexInvoice.customerName : 'overdue invoice'} ${
                          apexInvoice ? formatCentsToUSD(apexInvoice.amountCents) : ''
                        }`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleApproveAcme()}
                    disabled={approveLoading || !acmeBill}
                    className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                  >
                    {approveLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    )}
                    {approveLoading
                      ? 'Approving…'
                      : `Approve Acme ${acmeBill ? formatCentsToUSD(acmeBill.amountCents) : ''}`}
                  </button>
                )}
                {collected && (
                  <button
                    type="button"
                    onClick={() => setAct(5)}
                    className="text-xs text-ink-3 underline underline-offset-4 hover:text-ink-2"
                  >
                    Skip to the receipt
                  </button>
                )}
              </div>
            </div>
          )}

          {act === 5 && (
            <div>
              <h2 className="text-2xl font-semibold leading-tight tracking-[-0.02em] sm:text-3xl">
                The receipt.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">
                Every decision is in the append-only audit log, including the one the floor refused.
              </p>

              <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-panel">
                {logs.length === 0 ? (
                  <li className="px-4 py-4 text-xs text-ink-3">
                    No events yet. Try the act again.
                  </li>
                ) : (
                  logs.map((log) => <ReceiptRow key={log.id} log={log} />)
                )}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onOpenAudit}
                  className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
                >
                  Open full audit
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setAct(1)}
                  className="text-xs text-ink-3 underline underline-offset-4 hover:text-ink-2"
                >
                  Start over
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-lg border border-rule bg-panel p-4 shadow-sm sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium">30-day runway</h2>
              <span className="mono text-[11px] text-ink-3">as of {formatDate(asOfDate)}</span>
            </div>
            <RunwayInstrument
              className="mt-4"
              days={forecast.days}
              floorCents={floor}
              openingBalanceCents={cleared}
              minBalanceCents={forecast.minBalanceCents}
              firstBreachDay={firstBreachDay}
              firstBreachDeficitCents={firstBreachDeficit}
              stamp={stamp}
            />
            <div className="mt-4 grid grid-cols-3 divide-x divide-rule border-t border-rule pt-3">
              <Readout label="Cleared" value={formatCentsToUSD(cleared)} />
              <Readout label="Floor" value={formatCentsToUSD(floor)} />
              <Readout
                label={firstBreachDay !== undefined ? `Lowest · Day ${firstBreachDay}` : 'Lowest'}
                value={formatCentsToUSD(forecast.minBalanceCents)}
                tone={forecast.hasReserveBreach ? 'blocked' : 'safe'}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-3">
            Deterministic forecast. Integer cents. No LLM arithmetic.
          </p>
        </div>
      </div>
    </section>
  );
}

function Readout({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'safe' | 'blocked';
}) {
  const toneClass =
    tone === 'safe' ? 'text-safe' : tone === 'blocked' ? 'text-blocked' : 'text-ink';
  return (
    <div className="px-3 first:pl-0 last:pr-0">
      <p className="text-[10px] text-ink-3">{label}</p>
      <p className={`money mt-0.5 text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function ReceiptRow({ log }: { log: AuditLogEntry }) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium">{log.action.split('_').join(' ')}</span>
        <span className="mono text-[10px] text-ink-3">{formatTimestamp(log.timestamp)}</span>
      </div>
      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-2">{log.details}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="mono text-[10px] text-ink-3">{log.id}</span>
        <span className="text-[10px] text-ink-3">
          {log.actor.split('_').join(' ').toLowerCase()}
        </span>
        {typeof log.amountCents === 'number' && (
          <span className="money text-[10px] font-medium text-ink-2">
            {formatCentsToUSD(log.amountCents)}
          </span>
        )}
        {log.isSimulated && <span className="mono text-[9px] text-ink-3">[SIMULATED]</span>}
      </div>
    </li>
  );
}
