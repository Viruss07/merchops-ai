'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { WithState } from '@/components/shell/WithState';
import { useAppState } from '@/components/shell/AppState';
import { Notice, Page, PageHeader, StatusPill, TONE_SURFACE, btn } from '@/components/ui/kit';
import { getErrorMessage, proposePlan } from '@/lib/apiClient';
import { formatCentsToUSD } from '@/lib/money';
import type { CashPlan, CashPlanProposal, PlanAction } from '@/lib/plan/types';
import type { StateSnapshot } from '@/types';

/** "RULE_RESERVE_PRESERVED: Lowest balance…" → "Lowest balance…": the rule's words, not its code. */
const ruleText = (rule: string) => rule.replace(/^RULE_[A-Z_]+:\s*/, '');

/** A proposed action in words, linked to the record it touches. */
function ActionLine({ action, snapshot }: { action: PlanAction; snapshot: StateSnapshot }) {
  const invoice =
    'invoiceId' in action ? snapshot.invoices.find((i) => i.id === action.invoiceId) : undefined;
  const bill = 'billId' in action ? snapshot.bills.find((b) => b.id === action.billId) : undefined;
  const who = invoice ? (
    <Link
      href={`/invoices/${invoice.id}`}
      className="font-medium text-ink underline decoration-rule-strong"
    >
      {invoice.customerName}
    </Link>
  ) : bill ? (
    <Link
      href={`/bills/${bill.id}`}
      className="font-medium text-ink underline decoration-rule-strong"
    >
      {bill.vendorName}
    </Link>
  ) : (
    <span className="font-medium text-blocked">an id that isn&apos;t in the ledger</span>
  );
  const amount = invoice
    ? formatCentsToUSD(invoice.amountCents)
    : bill
      ? formatCentsToUSD(bill.amountCents)
      : '';
  let text: React.ReactNode;
  switch (action.type) {
    case 'CHASE_INVOICE':
      text = (
        <>
          Chase {who} for {amount}, {action.tone.toLowerCase()} tone
        </>
      );
      break;
    case 'SEND_INVOICE_REMINDER':
      text = (
        <>
          Send {who} a reminder for {amount}
        </>
      );
      break;
    case 'OFFER_EARLY_PAY_DISCOUNT':
      text = (
        <>
          Offer {who} {action.discountBps / 100}% off to pay early
        </>
      );
      break;
    case 'SCHEDULE_BILL':
      text = (
        <>
          Pay {who} {amount} on Day {action.payOnDay}
        </>
      );
      break;
    case 'DEFER_BILL':
      text = (
        <>
          Ask {who} for {action.deferDays} more days on {amount}
        </>
      );
      break;
    case 'HOLD_PAYOUT':
      text = (
        <>
          Hold the {who} payout of {amount}
        </>
      );
      break;
  }
  return (
    <li className="border-t border-rule py-2 first:border-t-0">
      <p className="text-sm text-ink">{text}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{action.rationale}</p>
    </li>
  );
}

function PlanRow({
  plan,
  snapshot,
  index,
}: {
  plan: CashPlan;
  snapshot: StateSnapshot;
  index: number;
}) {
  const accepted = plan.verdict === 'ACCEPTED';
  return (
    <li
      className="detail-in grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]"
      style={{ animationDelay: `${Math.min(index, 4) * 140}ms` }}
      aria-labelledby={`plan-${plan.id}`}
    >
      <section className="rounded-lg border border-rule bg-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-xs text-ink-2">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Proposal · {plan.origin === 'AI' ? 'written by the AI' : 'fallback template'}
          </p>
        </div>
        <h2 id={`plan-${plan.id}`} className="mt-1 text-lg font-semibold">
          {plan.title}
        </h2>
        <p className="text-sm text-ink-2">{plan.subtitle}</p>
        <p className="mt-3 text-sm leading-relaxed text-ink">{plan.narrative}</p>
        <ul className="mt-3 rounded-md border border-rule bg-paper px-3">
          {plan.actions.map((action, i) => (
            <ActionLine key={i} action={action} snapshot={snapshot} />
          ))}
        </ul>
        {plan.assumptions.length > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            <span className="text-ink-2">It assumes:</span> {plan.assumptions.join(' ')}
          </p>
        )}
      </section>

      <section
        aria-label={`Rules decided on ${plan.title}`}
        className={`rounded-lg border p-4 sm:p-5 ${TONE_SURFACE[accepted ? 'safe' : 'blocked']}`}
      >
        <p className="text-xs text-ink-2">Rules decided</p>
        <p
          className={`mt-1 flex items-center gap-2 text-lg font-semibold ${accepted ? 'text-safe' : 'text-blocked'}`}
        >
          {accepted ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <X className="h-4 w-4" aria-hidden="true" />
          )}
          {accepted ? 'Passes' : 'Refused'}
        </p>
        {!accepted && plan.rejectionReason && (
          <p className="mt-1 text-sm text-ink-2">{ruleText(plan.rejectionReason)}</p>
        )}
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex items-baseline justify-between">
            <dt className="text-ink-2">Lowest balance</dt>
            <dd
              className={`money font-semibold ${plan.reserveBreached ? 'text-blocked' : 'text-ink'}`}
            >
              {formatCentsToUSD(plan.minProjectedBalanceCents)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-ink-2">Ends the month at</dt>
            <dd className="money font-semibold">
              {formatCentsToUSD(plan.projectedEndingCashCents)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-ink-2">The floor</dt>
            <dd className={plan.reserveBreached ? 'font-medium text-blocked' : 'text-ink'}>
              {plan.reserveBreached ? `Crossed on Day ${plan.breachDay}` : 'Never crossed'}
            </dd>
          </div>
        </dl>
        <ul className="mt-3 space-y-1 border-t border-rule pt-3 text-xs">
          {plan.rulesFailed.map((rule) => (
            <li key={rule} className="flex gap-1.5 text-blocked">
              <X className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {ruleText(rule)}
            </li>
          ))}
          {plan.rulesPassed.map((rule) => (
            <li key={rule} className="flex gap-1.5 text-ink-2">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-safe" aria-hidden="true" />
              {ruleText(rule)}
            </li>
          ))}
        </ul>
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

  // Plans are for the numbers on screen: ask again when the ledger changes (a payment, a reset).
  useEffect(() => {
    const key = `${balanceKey}:${resetCount}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    void ask();
  }, [balanceKey, resetCount, ask]);

  const passing = proposal?.plans.filter((p) => p.verdict === 'ACCEPTED').length ?? 0;

  return (
    <Page>
      <PageHeader
        title="Plans"
        meta={
          proposal && !loading ? (
            <>
              <StatusPill
                label={`${passing} of ${proposal.plans.length} pass the rules`}
                tone={passing === proposal.plans.length ? 'safe' : passing ? 'risk' : 'blocked'}
              />
              <span title={proposal.fallbackReason}>
                {proposal.source === 'OPENROUTER_AI'
                  ? `AI · ${proposal.model}`
                  : 'AI offline · fallback templates'}
              </span>
              {proposal.source === 'OPENROUTER_AI' && (
                <span>
                  {proposal.groundingVerified
                    ? 'Every figure checked against the ledger'
                    : 'Some narrative figures did not match the ledger'}
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
            {loading ? 'Asking…' : 'Ask again'}
          </button>
        }
      >
        The AI proposes three ways through the next 30 days. Each one is replayed on the
        deterministic runway, and the rules decide. A plan that passes still moves nothing: you act
        on it from the invoice or bill.
      </PageHeader>

      {proposal?.fallbackReason && !loading && (
        <div className="mt-5">
          <Notice tone="neutral" title="These plans come from the fallback templates">
            {proposal.fallbackReason} The rules check them exactly the same way.
          </Notice>
        </div>
      )}
      {error && (
        <div className="mt-5">
          <Notice
            tone="blocked"
            title="No plans this time"
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
            Asking the model for plans, then replaying each one on the runway…
          </p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="h-56 rounded-lg border border-rule bg-panel" />
              <div className="h-56 rounded-lg border border-rule bg-panel" />
            </div>
          ))}
        </div>
      ) : (
        proposal && (
          <ol className={`mt-6 space-y-5 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {proposal.plans.map((plan, index) => (
              <PlanRow
                key={`${plan.id}-${proposal.generatedAt}`}
                plan={plan}
                snapshot={snapshot}
                index={index}
              />
            ))}
          </ol>
        )
      )}

      <p className="mt-6 text-xs text-ink-3">
        Left: what the AI wrote. Right: what the fixed rules in plan/validate.ts decided. They are
        kept apart on purpose.
      </p>
    </Page>
  );
}

export default function PlansPage() {
  return (
    <WithState label="Loading plans">{({ snapshot }) => <Plans snapshot={snapshot} />}</WithState>
  );
}
