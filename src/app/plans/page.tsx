'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  Check,
  ChevronDown,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { WithState } from '@/components/shell/WithState';
import { useAppState } from '@/components/shell/AppState';
import { Notice, Page, PageHeader, StatusPill, TONE_SURFACE, btn } from '@/components/ui/kit';
import { getErrorMessage, proposePlan } from '@/lib/apiClient';
import { formatCentsToUSD } from '@/lib/money';
import type { CashPlan, CashPlanProposal, PlanAction } from '@/lib/plan/types';
import type { StateSnapshot } from '@/types';

/** "RULE_RESERVE_PRESERVED: Lowest balance…" → "Lowest balance…": the rule's words, not its code. */
const ruleText = (rule: string) => rule.replace(/^RULE_[A-Z_]+:\s*/, '');

function actionSummaryText(action: PlanAction, snapshot: StateSnapshot): React.ReactNode {
  const invoice =
    'invoiceId' in action ? snapshot.invoices.find((i) => i.id === action.invoiceId) : undefined;
  const bill = 'billId' in action ? snapshot.bills.find((b) => b.id === action.billId) : undefined;
  const who = invoice ? (
    <Link
      href={`/invoices/${invoice.id}`}
      className="font-medium text-ink underline decoration-rule-strong hover:decoration-ink"
    >
      {invoice.customerName}
    </Link>
  ) : bill ? (
    <Link
      href={`/bills/${bill.id}`}
      className="font-medium text-ink underline decoration-rule-strong hover:decoration-ink"
    >
      {bill.vendorName}
    </Link>
  ) : (
    <span className="font-medium text-blocked">unrecognized record</span>
  );
  const amount = invoice
    ? formatCentsToUSD(invoice.amountCents)
    : bill
      ? formatCentsToUSD(bill.amountCents)
      : '';

  switch (action.type) {
    case 'CHASE_INVOICE':
      return (
        <>
          Chase {who} for {amount} ({action.tone.toLowerCase()} tone)
        </>
      );
    case 'SEND_INVOICE_REMINDER':
      return (
        <>
          Send {who} a reminder for {amount}
        </>
      );
    case 'OFFER_EARLY_PAY_DISCOUNT':
      return (
        <>
          Offer {who} {action.discountBps / 100}% early-pay discount
        </>
      );
    case 'SCHEDULE_BILL':
      return (
        <>
          Schedule {who} ({amount}) for Day {action.payOnDay}
        </>
      );
    case 'DEFER_BILL':
      return (
        <>
          Request {action.deferDays}-day deferral from {who} ({amount})
        </>
      );
    case 'HOLD_PAYOUT':
      return (
        <>
          Hold {who} payout ({amount})
        </>
      );
  }
}

function selectRecommendedId(plans: CashPlan[]): string | null {
  const accepted = plans.filter((p) => p.verdict === 'ACCEPTED');
  if (accepted.length === 0) return null;
  const safest = accepted.find((p) => p.id === 'safest');
  if (safest) return safest.id;
  return accepted.reduce((best, p) =>
    p.minProjectedBalanceCents > best.minProjectedBalanceCents ? p : best,
  ).id;
}

function ComparisonMatrix({
  plans,
  recommendedId,
}: {
  plans: CashPlan[];
  recommendedId: string | null;
}) {
  return (
    <section
      aria-labelledby="compare-h"
      className="mt-6 rounded-xl border border-rule bg-panel p-4 shadow-xs sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="compare-h" className="text-sm font-semibold text-ink">
            Side-by-Side Comparison
          </h2>
          <p className="text-xs text-ink-2">
            Every proposal evaluated deterministically on the 30-day runway.
          </p>
        </div>
        {recommendedId && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-safe/40 bg-safe-field/60 px-2.5 py-0.5 text-xs font-semibold text-safe">
            <Award className="h-3.5 w-3.5" aria-hidden="true" />
            Recommended Option Selected
          </span>
        )}
      </div>

      {/* Desktop/Tablet comparison table */}
      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs text-ink-2">
              <th scope="col" className="pb-2.5 pr-4 font-medium">
                Strategy
              </th>
              <th scope="col" className="pb-2.5 pr-4 font-medium">
                Rules Verdict
              </th>
              <th scope="col" className="pb-2.5 pr-4 text-right font-medium">
                Lowest Balance
              </th>
              <th scope="col" className="pb-2.5 pr-4 text-right font-medium">
                Ends 30d At
              </th>
              <th scope="col" className="pb-2.5 pr-4 font-medium">
                Reserve Guard
              </th>
              <th scope="col" className="pb-2.5 text-right font-medium">
                Steps
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {plans.map((plan) => {
              const accepted = plan.verdict === 'ACCEPTED';
              const isRec = plan.id === recommendedId;
              return (
                <tr key={plan.id} className={isRec ? 'bg-safe-field/30' : ''}>
                  <td className="py-3 pr-4">
                    <a
                      href={`#plan-${plan.id}`}
                      className="font-semibold text-ink no-underline hover:underline"
                    >
                      {plan.title}
                    </a>
                    {isRec && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-safe px-2 py-0.5 text-xs font-semibold text-paper">
                        Recommended
                      </span>
                    )}
                    <span className="block text-xs text-ink-2">{plan.subtitle}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusPill
                      label={accepted ? 'Approved' : 'Blocked'}
                      tone={accepted ? 'safe' : 'blocked'}
                    />
                  </td>
                  <td
                    className={`money py-3 pr-4 text-right font-semibold ${
                      plan.reserveBreached ? 'text-blocked' : 'text-safe'
                    }`}
                  >
                    {formatCentsToUSD(plan.minProjectedBalanceCents)}
                  </td>
                  <td className="money py-3 pr-4 text-right font-semibold text-ink">
                    {formatCentsToUSD(plan.projectedEndingCashCents)}
                  </td>
                  <td className="py-3 pr-4 text-xs">
                    {plan.reserveBreached ? (
                      <span className="font-medium text-blocked">
                        Breaches Day {plan.breachDay}
                      </span>
                    ) : (
                      <span className="font-medium text-safe">Protected</span>
                    )}
                  </td>
                  <td className="money py-3 text-right text-xs text-ink-2">
                    {plan.actions.length} moves
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked comparison cards */}
      <ul className="mt-4 grid gap-2.5 md:hidden">
        {plans.map((plan) => {
          const accepted = plan.verdict === 'ACCEPTED';
          const isRec = plan.id === recommendedId;
          return (
            <li
              key={plan.id}
              className={`rounded-lg border p-3 ${
                isRec ? 'border-safe/50 bg-safe-field/35' : 'border-rule bg-paper'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <a
                    href={`#plan-${plan.id}`}
                    className="block text-sm font-semibold text-ink no-underline hover:underline"
                  >
                    {plan.title}
                  </a>
                  {isRec && (
                    <span className="mt-1 inline-block rounded-full bg-safe px-2 py-0.5 text-xs font-semibold text-paper">
                      Recommended
                    </span>
                  )}
                </div>
                <StatusPill
                  label={accepted ? 'Approved' : 'Blocked'}
                  tone={accepted ? 'safe' : 'blocked'}
                />
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-2 border-t border-rule pt-2 text-xs">
                <div>
                  <dt className="text-ink-2">Lowest balance</dt>
                  <dd
                    className={`money font-semibold ${
                      plan.reserveBreached ? 'text-blocked' : 'text-safe'
                    }`}
                  >
                    {formatCentsToUSD(plan.minProjectedBalanceCents)}
                  </dd>
                </div>
                <div className="text-right">
                  <dt className="text-ink-2">Ends 30d at</dt>
                  <dd className="money font-semibold text-ink">
                    {formatCentsToUSD(plan.projectedEndingCashCents)}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PlanRow({
  plan,
  snapshot,
  index,
  recommended,
}: {
  plan: CashPlan;
  snapshot: StateSnapshot;
  index: number;
  recommended: boolean;
}) {
  const accepted = plan.verdict === 'ACCEPTED';
  return (
    <li
      id={`plan-${plan.id}`}
      className={`detail-in grid gap-4 rounded-xl border p-4 shadow-xs sm:p-5 lg:grid-cols-[minmax(0,1fr)_21rem] ${
        recommended
          ? 'border-safe/60 bg-panel ring-1 ring-safe/30'
          : 'border-rule bg-panel'
      }`}
      style={{ animationDelay: `${Math.min(index, 4) * 120}ms` }}
      aria-labelledby={`plan-h-${plan.id}`}
    >
      {/* Left: AI Proposal */}
      <section className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-focus/30 bg-focus/10 px-2.5 py-0.5 text-xs font-medium text-focus">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {plan.origin === 'AI' ? 'AI Recommendation' : 'Policy Template Proposal'}
          </span>
          {recommended && (
            <span className="inline-flex items-center gap-1 rounded-full bg-safe px-2.5 py-0.5 text-xs font-semibold text-paper">
              <Award className="h-3 w-3" aria-hidden="true" />
              Recommended
            </span>
          )}
        </div>

        <h3 id={`plan-h-${plan.id}`} className="mt-2.5 text-lg font-bold text-ink">
          {plan.title}
        </h3>
        <p className="mt-0.5 text-sm text-ink-2">{plan.subtitle}</p>

        {/* Key action steps (concise scannable summary) */}
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-2">
            Proposed Actions ({plan.actions.length})
          </p>
          <ul className="mt-2 divide-y divide-rule rounded-lg border border-rule bg-paper px-3.5">
            {plan.actions.map((action, i) => (
              <li key={i} className="py-2.5 text-sm text-ink">
                {actionSummaryText(action, snapshot)}
              </li>
            ))}
          </ul>
        </div>

        {/* Lengthy explanations moved into clean expandable drawer */}
        <details className="group mt-3.5 rounded-lg border border-rule bg-paper/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-semibold text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            <span>Strategy rationale, action notes &amp; assumptions</span>
            <ChevronDown
              className="h-4 w-4 text-ink-2 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="space-y-3 border-t border-rule px-3.5 py-3 text-xs leading-relaxed text-ink-2">
            <p className="text-sm leading-relaxed text-ink">{plan.narrative}</p>
            <ul className="space-y-2 border-t border-rule pt-2.5">
              {plan.actions.map((action, i) => (
                <li key={i}>
                  <span className="font-semibold text-ink">Move {i + 1}:</span> {action.rationale}
                </li>
              ))}
            </ul>
            {plan.assumptions.length > 0 && (
              <p className="border-t border-rule pt-2.5 text-xs text-ink-2">
                <strong className="text-ink">Assumptions:</strong> {plan.assumptions.join(' ')}
              </p>
            )}
          </div>
        </details>
      </section>

      {/* Right: Deterministic Rules Decision */}
      <section
        aria-label={`Deterministic rules decision for ${plan.title}`}
        className={`flex flex-col justify-between rounded-xl border p-4 ${TONE_SURFACE[accepted ? 'safe' : 'blocked']}`}
      >
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-2">
              Deterministic Rules
            </p>
            {accepted ? (
              <ShieldCheck className="h-4 w-4 text-safe" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-blocked" aria-hidden="true" />
            )}
          </div>

          <p
            className={`mt-1.5 flex items-center gap-2 text-lg font-bold ${
              accepted ? 'text-safe' : 'text-blocked'
            }`}
          >
            {accepted ? (
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <X className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {accepted ? 'Approved by Guardrails' : 'Refused by Guardrails'}
          </p>

          {!accepted && plan.rejectionReason && (
            <p className="mt-1.5 rounded-md border border-blocked/30 bg-panel/70 px-2.5 py-1.5 text-xs font-medium text-ink">
              {ruleText(plan.rejectionReason)}
            </p>
          )}

          <dl className="mt-3.5 space-y-2 border-t border-rule/80 pt-3 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-ink-2">Lowest balance</dt>
              <dd
                className={`money font-semibold ${
                  plan.reserveBreached ? 'text-blocked' : 'text-safe'
                }`}
              >
                {formatCentsToUSD(plan.minProjectedBalanceCents)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-ink-2">Ends month at</dt>
              <dd className="money font-semibold text-ink">
                {formatCentsToUSD(plan.projectedEndingCashCents)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-ink-2">Safety floor</dt>
              <dd
                className={`text-xs font-semibold ${
                  plan.reserveBreached ? 'text-blocked' : 'text-safe'
                }`}
              >
                {plan.reserveBreached ? `Crossed Day ${plan.breachDay}` : 'Never crossed'}
              </dd>
            </div>
          </dl>
        </div>

        <details className="group mt-3.5 border-t border-rule/80 pt-2.5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            <span>
              Rule checks ({plan.rulesPassed.length} passed
              {plan.rulesFailed.length > 0 ? `, ${plan.rulesFailed.length} failed` : ''})
            </span>
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <ul className="mt-2 space-y-1.5 text-xs">
            {plan.rulesFailed.map((rule) => (
              <li key={rule} className="flex items-start gap-1.5 text-blocked">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{ruleText(rule)}</span>
              </li>
            ))}
            {plan.rulesPassed.map((rule) => (
              <li key={rule} className="flex items-start gap-1.5 text-ink-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-safe" aria-hidden="true" />
                <span>{ruleText(rule)}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>
    </li>
  );
}

function Plans({ snapshot }: { snapshot: StateSnapshot }) {
  const { resetCount } = useAppState();
  const [proposal, setProposal] = useState<CashPlanProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const balanceKey = `${snapshot.account.clearedBalanceCents}:${snapshot.invoices.map((i) => i.status).join()}:${snapshot.bills.map((b) => b.status).join()}`;
  const lastKey = useRef<string | null>(null);

  const ask = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProposal(await proposePlan());
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const key = `${balanceKey}:${resetCount}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    void ask();
  }, [balanceKey, resetCount, ask]);

  const passing = proposal?.plans.filter((p) => p.verdict === 'ACCEPTED').length ?? 0;
  const recommendedId = proposal ? selectRecommendedId(proposal.plans) : null;

  return (
    <Page>
      <PageHeader
        title="AI Recovery Plans"
        meta={
          proposal && !loading ? (
            <>
              <StatusPill
                label={`${passing} of ${proposal.plans.length} pass rules`}
                tone={passing === proposal.plans.length ? 'safe' : passing ? 'risk' : 'blocked'}
              />
              <span>
                {proposal.source === 'OPENROUTER_AI'
                  ? 'AI Copilot (Live)'
                  : 'Deterministic Policy Templates'}
              </span>
              {proposal.source === 'OPENROUTER_AI' && (
                <span>
                  {proposal.groundingVerified
                    ? 'Ledger figures verified'
                    : 'Narrative numbers adjusted to ledger'}
                </span>
              )}
            </>
          ) : undefined
        }
        aside={
          <button
            type="button"
            onClick={() => void ask()}
            disabled={loading}
            className={btn.secondary}
          >
            {loading ? (
              <Loader2
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            )}
            {loading ? 'Evaluating…' : 'Regenerate Plans'}
          </button>
        }
      >
        Compare candidate cash-recovery strategies side by side. AI proposes candidate moves; fixed
        deterministic rules calculate balances in integer cents and veto any plan that breaches the
        safety reserve.
      </PageHeader>

      {proposal?.fallbackReason && !loading && (
        <div className="mt-5">
          <Notice tone="neutral" title="Using deterministic policy templates">
            Live AI plan generation is unavailable in this environment, so MerchOps generated
            standard policy templates and verified every projection with the exact same reserve
            rules.
          </Notice>
        </div>
      )}

      {error && (
        <div className="mt-5">
          <Notice
            tone="blocked"
            title="Unable to generate plans"
            action={
              <button type="button" onClick={() => void ask()} className={btn.small}>
                Try again
              </button>
            }
          >
            {error}
          </Notice>
        </div>
      )}

      {loading && !proposal ? (
        <div className="mt-6 space-y-3" role="status" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Generating candidate plans and evaluating deterministic runway rules…
          </p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_21rem]">
              <div className="h-48 rounded-xl border border-rule bg-panel" />
              <div className="h-48 rounded-xl border border-rule bg-panel" />
            </div>
          ))}
        </div>
      ) : (
        proposal && (
          <>
            <ComparisonMatrix plans={proposal.plans} recommendedId={recommendedId} />

            <ol className={`mt-6 space-y-5 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
              {proposal.plans.map((plan, index) => (
                <PlanRow
                  key={`${plan.id}-${proposal.generatedAt}`}
                  plan={plan}
                  snapshot={snapshot}
                  index={index}
                  recommended={plan.id === recommendedId}
                />
              ))}
            </ol>
          </>
        )
      )}

      <p className="mt-6 text-xs text-ink-2">
        Proposals move zero money on their own. Open an individual invoice or bill to execute an
        approved step.
      </p>
    </Page>
  );
}

export default function PlansPage() {
  return (
    <WithState label="Loading plans">{({ snapshot }) => <Plans snapshot={snapshot} />}</WithState>
  );
}
