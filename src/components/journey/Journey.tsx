'use client';

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Check,
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
import { formatDate } from '@/lib/client/states';
import type { RunwayForecast, StateSnapshot } from '@/types';
import type { CashPlanProposal } from '@/lib/plan/types';
import { RunwayInstrument } from '@/components/runway/RunwayInstrument';
import { useAppState } from '@/components/shell/AppState';
import { btn } from '@/components/ui/kit';

interface JourneyProps {
  snapshot: StateSnapshot;
  forecast: RunwayForecast;
  onSnapshot: (snapshot: StateSnapshot) => void;
}

const PAID_STATES = ['APPROVED', 'IN_FLIGHT', 'DISBURSED'];

/**
 * The guided demo: five numbered steps on one page, each with one button. Every step calls the
 * real API, and the chart on the right redraws from the snapshot each call returns. A step's
 * "done" state comes from the server's data where it can, so a refresh doesn't lose progress.
 */
export function Journey({ snapshot, forecast, onSnapshot }: JourneyProps) {
  const { reset, resetting } = useAppState();
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
  const apexPaid = apex?.status === 'PAID';
  const check = acme ? payoutCheck(snapshot, acme.id) : null;

  const done = [
    seen || !!proposals || !!blocked || apexPaid || acmePaid,
    !!proposals || apexPaid || acmePaid,
    !!blocked || apexPaid || acmePaid,
    apexPaid,
    acmePaid,
  ];
  const current = done.findIndex((d) => !d); // -1 when everything is done
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
      setProposals(await proposePlan());
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
    });

  const payAcme = () =>
    run(5, async () => {
      if (!acme) return;
      const res = await authorizePayout({ billId: acme.id, executionMode: 'SIMULATION' });
      onSnapshot(res.snapshot);
    });

  const restart = async () => {
    await reset();
    setSeen(false);
    setProposals(null);
    setBlocked(null);
    setError(null);
  };

  const stamp = forecast.hasReserveBreach
    ? {
        label: 'Below the reserve',
        value: `−${formatCentsToUSD(forecast.firstBreachDeficitCents ?? forecast.breachDeficitCents ?? 0)}`,
      }
    : null;

  const aiLive = proposals?.source === 'OPENROUTER_AI';
  const passing = proposals?.plans.filter((p) => p.verdict === 'ACCEPTED').length ?? 0;

  return (
    <>
      {/* ---------- 1. What this is, in one screen ---------- */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-3">
          PayPal AI Hackathon 2026
        </p>
        <h1 className="mt-2 max-w-3xl text-[34px] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-[48px]">
          An AI cash-flow assistant that can&apos;t spend your money.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-2">
          MerchOps forecasts a small business&apos;s next 30 days of cash. The AI suggests how to
          avoid running short; fixed rules check every plan and every payment, and nothing is paid
          until the merchant approves it.
        </p>
        <ul className="mt-6 grid max-w-3xl gap-3 sm:grid-cols-3">
          {[
            { icon: Bot, title: 'The AI suggests', body: 'Plans to chase invoices or move bills.' },
            { icon: Scale, title: 'Rules decide', body: 'Code checks every plan and payment.' },
            { icon: UserCheck, title: 'You approve', body: 'No money moves without a click.' },
          ].map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-start gap-3 rounded-lg border border-rule bg-panel p-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium text-ink">{title}</span>
                <span className="block text-xs text-ink-2">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- 2. The guided demo ---------- */}
      <section
        aria-labelledby="try-h"
        className="mx-auto mt-10 grid w-full max-w-6xl gap-6 px-4 pb-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="try-h" className="text-xl font-semibold">
                Try it: 5 steps, about 2 minutes
              </h2>
              <p className="mt-1 text-sm text-ink-2">
                {doneCount === 5
                  ? 'All done. Restart any time.'
                  : `${doneCount} of 5 done. Each button calls the real server.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void restart()}
              disabled={resetting}
              className={btn.small}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {resetting ? 'Restarting…' : 'Restart demo'}
            </button>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden="true">
            <div
              className="h-full rounded-full bg-safe transition-[width] duration-500"
              style={{ width: `${(doneCount / 5) * 100}%` }}
            />
          </div>

          <ol className="mt-5 space-y-3">
            <Step n={1} title="See the problem" done={done[0]} current={current === 0}>
              <p>
                The business has <Money>{formatCentsToUSD(cleared)}</Money> and wants to keep at
                least <Money>{formatCentsToUSD(floor)}</Money> as a safety reserve. On{' '}
                {acme ? formatDate(acme.dueDate) : 'Day 10'}, a <Money>{acmeAmount}</Money> bill
                from Acme Supplies would take cash below that line. That&apos;s the red bar in the
                chart.
              </p>
              {current === 0 && (
                <button type="button" onClick={() => setSeen(true)} className={`${btn.primary} mt-3`}>
                  Got it, next step
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </Step>

            <Step n={2} title="Ask the AI for a plan" done={done[1]} current={current === 1}>
              <p>
                The AI writes three plans. Then plain code replays each one on the forecast and
                decides whether it is safe. The AI never does the arithmetic.
              </p>
              {current === 1 && (
                <ActionButton onClick={askAi} busy={busy === 2} busyLabel="The AI is writing plans (free models take 10–50s)…">
                  <Bot className="h-4 w-4" aria-hidden="true" />
                  Ask the AI
                </ActionButton>
              )}
              {proposals && (
                <div className="mt-3 overflow-hidden rounded-md border border-rule bg-paper">
                  <p className="border-b border-rule px-3 py-2 text-xs text-ink-2">
                    {aiLive ? (
                      <>
                        Written live by <span className="mono">{proposals.model}</span>
                      </>
                    ) : (
                      <>AI unavailable, so built-in templates were used</>
                    )}{' '}
                    · {passing} of {proposals.plans.length} pass the rules
                  </p>
                  <ul>
                    {proposals.plans.map((plan) => (
                      <li key={plan.id} className="border-t border-rule px-3 py-2 first:border-t-0">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-sm font-medium text-ink">{plan.title}</span>
                          <Verdict ok={plan.verdict === 'ACCEPTED'} />
                        </div>
                        <p className="mt-0.5 text-xs text-ink-2">
                          Lowest balance {formatCentsToUSD(plan.minProjectedBalanceCents)}
                          {plan.verdict !== 'ACCEPTED' && plan.rulesFailed[0]
                            ? ` · ${plan.rulesFailed[0].replace(/^RULE_[A-Z_]+:\s*/, '')}`
                            : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <Link href="/plans" className="block border-t border-rule px-3 py-2 text-xs text-ink-2 hover:text-ink">
                    See every rule each plan was checked against →
                  </Link>
                </div>
              )}
              <StepError error={error} step={2} />
            </Step>

            <Step n={3} title="Try to pay the bill anyway" done={done[2]} current={current === 2}>
              <p>
                Pretend you ignore the warning and pay Acme&apos;s <Money>{acmeAmount}</Money>{' '}
                today. The server runs the safety check itself, so a button can&apos;t skip it.
              </p>
              {current === 2 && (
                <ActionButton onClick={tryPayAcme} busy={busy === 3} busyLabel="Checking…">
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                  Pay Acme {acmeAmount} now
                </ActionButton>
              )}
              {blocked && (
                <div className="mt-3 rounded-md border-2 border-blocked bg-blocked-field p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-blocked">
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    Refused: {formatCentsToUSD(blocked.deficitCents)} short of the reserve
                  </p>
                  <p className="mt-1 text-xs text-ink-2">
                    The server said no (HTTP 403). PayPal&apos;s payout fee is counted too, so the
                    fee can never be what breaks the reserve. No money moved.
                  </p>
                </div>
              )}
              <StepError error={error} step={3} />
            </Step>

            <Step n={4} title="Collect the overdue invoice" done={done[3]} current={current === 3}>
              <p>
                Apex Corp owes <Money>{apexAmount}</Money>
                {apex && apex.daysOverdue > 0 ? ` and is ${apex.daysOverdue} days late` : ''}. In
                real use you&apos;d send an AI-drafted
                reminder (see{' '}
                <Link href="/invoices/inv-apex-01" className="underline">
                  the invoice
                </Link>
                ). Here, mark it as paid.
              </p>
              {current === 3 && (
                <ActionButton onClick={collectApex} busy={busy === 4} busyLabel="Collecting…">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Mark {apexAmount} as received
                </ActionButton>
              )}
              {apexPaid && (
                <p className="mt-3 rounded-md border border-safe/40 bg-safe-field p-3 text-sm text-ink">
                  Cash is now <Money>{formatCentsToUSD(cleared)}</Money>. The chart turned green.
                  The lowest point is <Money>{formatCentsToUSD(forecast.minBalanceCents)}</Money>,
                  above the reserve.
                </p>
              )}
              <StepError error={error} step={4} />
            </Step>

            <Step n={5} title="Pay the bill again" done={done[4]} current={current === 4}>
              <p>
                Same button, same check. This time it passes
                {check && !check.wouldBreach && !acmePaid
                  ? `, with ${formatCentsToUSD(check.bufferCents)} to spare`
                  : ''}
                .
              </p>
              {current === 4 && (
                <ActionButton onClick={payAcme} busy={busy === 5} busyLabel="Approving…">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Approve Acme {acmeAmount}
                </ActionButton>
              )}
              {acmePaid && (
                <p className="mt-3 rounded-md border border-safe/40 bg-safe-field p-3 text-sm text-ink">
                  Approved and paid. Every step you took, including the refused payment, is
                  recorded in the{' '}
                  <Link href="/ledger" className="font-medium underline">
                    audit log
                  </Link>
                  .
                </p>
              )}
              <StepError error={error} step={5} />
            </Step>
          </ol>

          {current === -1 && (
            <div className="mt-5 rounded-lg border border-rule bg-panel p-4">
              <p className="text-sm font-medium text-ink">Want proof it can&apos;t be tricked?</p>
              <p className="mt-1 text-sm text-ink-2">
                12 attacks (fake instructions hidden in an invoice, a hidden fee, a double click…)
                run against the real safety code.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/bench" className={btn.primary}>
                  Run the 12 safety tests
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/ledger" className={btn.secondary}>
                  Open the audit log
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* The chart stays in view while the steps scroll. */}
        <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-lg border border-rule bg-panel p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium">Cash over the next 30 days</h2>
              <span className="text-xs text-ink-3">from {formatDate(snapshot.demoConfig.asOfDate)}</span>
            </div>
            <RunwayInstrument
              className="mt-4"
              days={forecast.days}
              floorCents={floor}
              openingBalanceCents={cleared}
              minBalanceCents={forecast.minBalanceCents}
              firstBreachDay={forecast.firstBreachDay}
              firstBreachDeficitCents={forecast.firstBreachDeficitCents}
              stamp={stamp}
            />
            <dl className="mt-4 grid grid-cols-3 divide-x divide-rule border-t border-rule pt-3">
              <Readout label="Cash today" value={formatCentsToUSD(cleared)} />
              <Readout label="Safety reserve" value={formatCentsToUSD(floor)} />
              <Readout
                label="Lowest point"
                value={formatCentsToUSD(forecast.minBalanceCents)}
                tone={forecast.hasReserveBreach ? 'blocked' : 'safe'}
              />
            </dl>
            <p
              className={`mt-3 rounded-md px-3 py-2 text-sm font-medium ${
                forecast.hasReserveBreach ? 'bg-blocked-field text-blocked' : 'bg-safe-field text-safe'
              }`}
            >
              {forecast.hasReserveBreach
                ? `Cash drops below the reserve on Day ${forecast.firstBreachDay}.`
                : 'Cash stays above the reserve for all 30 days.'}
            </p>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            The dashed line is the safety reserve. Every number is computed by code in whole cents.
          </p>
        </aside>
      </section>
    </>
  );
}

function Step({
  n,
  title,
  done,
  current,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      aria-current={current ? 'step' : undefined}
      className={`rounded-lg border p-4 transition-colors ${
        current
          ? 'border-ink bg-panel shadow-sm'
          : done
            ? 'border-rule bg-panel'
            : 'border-rule opacity-60'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold ${
            done
              ? 'bg-safe text-paper'
              : current
                ? 'bg-ink text-paper'
                : 'text-ink-3 ring-1 ring-inset ring-rule-strong'
          }`}
          aria-hidden="true"
        >
          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-ink">
            <span className="sr-only">Step {n}{done ? ', done' : ''}: </span>
            {title}
          </h3>
          <div className="mt-1 text-sm leading-relaxed text-ink-2">{children}</div>
        </div>
      </div>
    </li>
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
      Safe
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blocked">
      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
      Refused
    </span>
  );
}

function Money({ children }: { children: React.ReactNode }) {
  return <strong className="money font-semibold text-ink">{children}</strong>;
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
  const toneClass = tone === 'safe' ? 'text-safe' : tone === 'blocked' ? 'text-blocked' : 'text-ink';
  return (
    <div className="px-3 first:pl-0 last:pr-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`money mt-0.5 text-base font-semibold ${toneClass}`}>{value}</dd>
    </div>
  );
}
