'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Clock, Loader2, Lock, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { WithState } from '@/components/shell/WithState';
import { useAppState } from '@/components/shell/AppState';
import { RunwayCard } from '@/components/runway/RunwayCard';
import {
  Figure,
  Line,
  Missing,
  Notice,
  Page,
  PageHeader,
  Ref,
  Section,
  StatusPill,
  TONE_SURFACE,
  Tracker,
  Trail,
  btn,
} from '@/components/ui/kit';
import {
  ApiError,
  authorizePayout,
  getErrorMessage,
  syncPayout,
  type PayoutExecutionMode,
} from '@/lib/apiClient';
import { calculatePayoutFeeCents, formatCentsToUSD } from '@/lib/money';
import { derivePayoutRequestId } from '@/lib/idempotency';
import { BILL_STEPS, billStatus, billStep, eventsFor, formatDate } from '@/lib/client/states';
import { ifPaidToday, payoutCheck } from '@/lib/client/whatIf';
import type { Bill, StateSnapshot } from '@/types';

function policyFor(bill: Bill, snapshot: StateSnapshot) {
  return (() => {
    const check = payoutCheck(snapshot, bill.id);
    return { ...check, fee: check.feeCents };
  })();
}

/** The payout guardrail, on the page: pick the rail, see the reserve check, confirm, authorize. */
function NextStep({
  bill,
  snapshot,
  rail,
  setRail,
}: {
  bill: Bill;
  snapshot: StateSnapshot;
  rail: PayoutExecutionMode;
  setRail: (r: PayoutExecutionMode) => void;
}) {
  const { setSnapshot } = useAppState();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<null | 'pay' | 'try' | 'sync'>(null);
  const [refusal, setRefusal] = useState<{
    code: string;
    message: string;
    deficit?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const sandbox = snapshot.capabilities.paypalSandboxEnabled;
  const policy = policyFor(bill, snapshot);
  const overdue = snapshot.invoices.find((i) => i.status === 'OVERDUE');

  useEffect(() => setConfirmed(false), [rail]);

  const authorize = async (kind: 'pay' | 'try') => {
    setBusy(kind);
    setError(null);
    setRefusal(null);
    try {
      const res = await authorizePayout({ billId: bill.id, executionMode: rail });
      setSnapshot(res.snapshot);
      setDone(res.message);
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.snapshot) setSnapshot(caught.snapshot);
        if (caught.code === 'RESERVE_BREACH_BLOCKED') {
          const d = caught.details?.deficitCents;
          setRefusal({
            code: `${caught.status} · ${caught.code}`,
            message: caught.message,
            deficit: typeof d === 'number' ? d : undefined,
          });
          return;
        }
      }
      setError(getErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  if (bill.status === 'DISBURSED') {
    return (
      <section
        aria-labelledby="next-h"
        className={`rounded-lg border p-4 sm:p-5 ${TONE_SURFACE.safe}`}
      >
        <h2 id="next-h" className="flex items-center gap-2 text-base font-semibold text-safe">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Paid
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          {done ??
            `${formatCentsToUSD(bill.amountCents)} went to ${bill.vendorName}. The ledger was debited only once settlement was confirmed.`}
        </p>
        <Link href="/ledger" className={`${btn.secondary} mt-4`}>
          See it in the audit log
        </Link>
      </section>
    );
  }

  if (bill.status === 'IN_FLIGHT') {
    return (
      <section
        aria-labelledby="next-h"
        className={`rounded-lg border p-4 shadow-card sm:p-5 ${TONE_SURFACE.risk}`}
      >
        <h2 id="next-h" className="flex items-center gap-2 text-base font-semibold">
          <Clock className="h-4 w-4 text-risk" aria-hidden="true" />
          Waiting for PayPal to settle
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          PayPal accepted the batch. {formatCentsToUSD(bill.amountCents)} stays reserved, not
          debited, until PayPal confirms it. A second payout for this bill is locked until then.
        </p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('sync');
            setError(null);
            try {
              const res = await syncPayout(bill.id);
              setSnapshot(res.snapshot);
              setDone(res.message);
            } catch (caught) {
              if (caught instanceof ApiError && caught.snapshot) setSnapshot(caught.snapshot);
              setError(getErrorMessage(caught));
            } finally {
              setBusy(null);
            }
          }}
          className={`${btn.primary} mt-4`}
        >
          <RefreshCw
            className={`h-4 w-4 ${busy === 'sync' ? 'animate-spin motion-reduce:animate-none' : ''}`}
            aria-hidden="true"
          />
          {busy === 'sync' ? 'Checking PayPal…' : 'Check settlement with PayPal'}
        </button>
        {done && <p className="mt-3 text-sm text-ink-2">{done}</p>}
        {error && (
          <p role="alert" className="mt-3 text-sm text-blocked">
            {error}
          </p>
        )}
      </section>
    );
  }

  const blocked = policy.wouldBreach;
  return (
    <section
      aria-labelledby="next-h"
      className="rounded-lg border border-rule bg-panel p-4 shadow-card sm:p-5"
    >
      <h2 id="next-h" className="text-base font-semibold">
        {bill.status === 'FAILED'
          ? 'The last payout failed. Nothing moved.'
          : `Pay ${bill.vendorName}`}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">
        Due {formatDate(bill.dueDate)}, in {bill.daysUntilDue} days. The reserve check runs here and
        again on the server before anything reaches PayPal.
      </p>

      <fieldset className="mt-4">
        <legend className="text-xs text-ink-2">How it&apos;s paid</legend>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {(
            [
              [
                'SIMULATION',
                'Simulated payout',
                'Settles in the demo ledger. No PayPal call.',
                true,
              ],
              [
                'PAYPAL_SANDBOX',
                'PayPal Payouts (sandbox)',
                `POST /v1/payments/payouts. Fee ${formatCentsToUSD(calculatePayoutFeeCents(bill.amountCents))}, in the check.`,
                sandbox,
              ],
            ] as const
          ).map(([value, title, sub, enabled]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${
                rail === value ? 'border-ink bg-paper' : 'border-rule hover:bg-paper'
              } ${enabled ? '' : 'cursor-not-allowed opacity-50'}`}
            >
              <input
                type="radio"
                name="rail"
                value={value}
                checked={rail === value}
                disabled={!enabled || busy !== null}
                onChange={() => setRail(value)}
                className="mt-0.5 accent-[var(--ink)]"
              />
              <span>
                <span className="block font-medium text-ink">{title}</span>
                <span className="block text-xs text-ink-3">
                  {enabled ? sub : 'PayPal sandbox isn’t configured on this server.'}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {blocked ? (
        <div className="mt-4 rounded-md border-2 border-blocked bg-blocked-field p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-blocked">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            Blocked by the reserve
          </p>
          <p className="money mt-1 text-2xl font-semibold text-blocked">
            {formatCentsToUSD(policy.deficitCents)} short
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            Paying it now would leave {formatCentsToUSD(policy.postPayoutBalanceCents)}, under the{' '}
            {formatCentsToUSD(snapshot.account.minReserveCents)} reserve. Bring cash in first.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {overdue && (
              <Link href={`/invoices/${overdue.id}`} className={btn.primary}>
                Collect {overdue.customerName} {formatCentsToUSD(overdue.amountCents)}
              </Link>
            )}
            <Link href="/plans" className={btn.secondary}>
              Ask the AI for a plan
            </Link>
          </div>
          <div className="mt-4 border-t border-blocked/30 pt-3">
            <button
              type="button"
              onClick={() => void authorize('try')}
              disabled={busy !== null}
              className={btn.quiet}
            >
              {busy === 'try' ? 'Asking the server…' : 'Send it to the server anyway'}
            </button>
            <p className="mt-1 text-xs text-ink-3">
              The button isn&apos;t the guard. Try it: the server runs the same check and refuses.
            </p>
          </div>
        </div>
      ) : (
        <>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-rule bg-paper p-3 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy !== null}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--ink)]"
            />
            <span className="text-ink">
              I&apos;ve checked the balance after this payout and approve sending{' '}
              <strong className="font-semibold">{formatCentsToUSD(bill.amountCents)}</strong> to{' '}
              {bill.vendorName}.
            </span>
          </label>
          <button
            type="button"
            disabled={!confirmed || busy !== null}
            onClick={() => void authorize('pay')}
            className={`${btn.primary} mt-3 w-full sm:w-auto`}
          >
            {busy === 'pay' ? (
              <Loader2
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {busy === 'pay'
              ? 'Authorizing…'
              : `Approve payout · ${formatCentsToUSD(bill.amountCents)}`}
          </button>
        </>
      )}

      {refusal && (
        <div className="stamp mt-4 inline-block rounded-md border-2 border-blocked bg-panel px-3 py-2 text-blocked">
          <p className="text-sm font-semibold">The server refused it</p>
          <p className="mt-0.5 text-xs text-ink-2">{refusal.message}</p>
          <p className="mono mt-1 text-[11px] text-ink-3">{refusal.code}</p>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <Notice
            tone="blocked"
            title="The payout didn't go through"
            onDismiss={() => setError(null)}
          >
            {error}
          </Notice>
        </div>
      )}
      <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-3">
        <Lock className="h-3 w-3" aria-hidden="true" />
        The AI can propose paying this bill. It can&apos;t approve it.
      </p>
    </section>
  );
}

function MoneyPanel({ bill, snapshot }: { bill: Bill; snapshot: StateSnapshot }) {
  const paid = bill.status === 'DISBURSED';
  const policy = policyFor(bill, snapshot);
  const tone = paid
    ? 'safe'
    : bill.status === 'IN_FLIGHT'
      ? 'risk'
      : policy.wouldBreach
        ? 'blocked'
        : 'neutral';
  return (
    <section aria-labelledby="money-h" className={`rounded-lg border p-4 ${TONE_SURFACE[tone]}`}>
      <h2 id="money-h" className="text-sm font-medium text-ink-2">
        {paid
          ? 'Where the money is'
          : bill.status === 'IN_FLIGHT'
            ? 'Reserved, not debited'
            : 'The reserve check'}
      </h2>
      <p className="mt-1 text-xl font-semibold text-ink">
        {paid
          ? `With ${bill.vendorName}`
          : bill.status === 'IN_FLIGHT'
            ? 'Held until PayPal confirms'
            : policy.wouldBreach
              ? `${formatCentsToUSD(policy.deficitCents)} under the reserve`
              : `${formatCentsToUSD(policy.bufferCents)} to spare`}
      </p>
      {!paid && (
        <dl className="mt-3">
          <Line
            label="Cleared now"
            value={formatCentsToUSD(snapshot.account.clearedBalanceCents)}
          />
          <Line label={`To ${bill.vendorName}`} value={`− ${formatCentsToUSD(bill.amountCents)}`} />
          {policy.reservedCents > 0 && (
            <Line
              label="Reserved for payouts in flight"
              value={`− ${formatCentsToUSD(policy.reservedCents)}`}
            />
          )}
          <Line
            label="PayPal payout fee"
            hint="2%, at most $1.00, counted on both rails"
            value={`− ${formatCentsToUSD(policy.fee)}`}
          />
          <Line
            label="Left after"
            value={formatCentsToUSD(policy.postPayoutBalanceCents)}
            total
            tone={policy.wouldBreach ? 'blocked' : 'neutral'}
          />
          <Line label="Safety reserve" value={formatCentsToUSD(snapshot.account.minReserveCents)} />
        </dl>
      )}
      {paid && (
        <p className="mt-1 text-sm text-ink-2">
          {formatCentsToUSD(bill.amountCents)}, debited from cleared cash on settlement.
        </p>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-ink-2 hover:text-ink">
          Request references
        </summary>
        <dl className="mt-2">
          <Ref label="PayPal-Request-Id" value={derivePayoutRequestId(bill.id, snapshot.demoConfig.payoutEpoch)} />
          <Ref label="Verified batch" value={snapshot.capabilities.verifiedBatchId} />
        </dl>
        <p className="mt-1 text-xs text-ink-3">
          The same id on every retry in this demo run, so a double click can&apos;t pay twice.
        </p>
      </details>
    </section>
  );
}

function BillRoom({ bill, snapshot }: { bill: Bill; snapshot: StateSnapshot }) {
  const [rail, setRail] = useState<PayoutExecutionMode>('SIMULATION');
  const status = billStatus(bill);
  const policy = policyFor(bill, snapshot);
  const open = bill.status === 'PENDING' || bill.status === 'APPROVED' || bill.status === 'FAILED';
  const after = open ? ifPaidToday(snapshot, bill.id, true) : null;
  const trail = eventsFor(snapshot.auditLogs, bill.billNumber);
  const stoppedAt = open && policy.wouldBreach ? 1 : bill.status === 'FAILED' ? 3 : undefined;

  return (
    <Page>
      <PageHeader
        back={{ href: '/bills', label: 'Bills' }}
        title={bill.vendorName}
        meta={
          <>
            {open && policy.wouldBreach ? (
              <StatusPill label="Blocked by the reserve" tone="blocked" />
            ) : (
              <StatusPill label={status.label} tone={status.tone} />
            )}
            <span className="mono text-xs">{bill.billNumber}</span>
            <span>{bill.category}</span>
          </>
        }
        aside={
          <Figure
            label="Bill amount"
            value={formatCentsToUSD(bill.amountCents)}
            tone={bill.status === 'DISBURSED' ? 'safe' : 'neutral'}
          />
        }
      />

      <div className="py-5">
        <Tracker
          label="Where this payout is"
          steps={BILL_STEPS}
          current={open && !policy.wouldBreach ? 2 : billStep(bill)}
          stoppedAt={stoppedAt}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <NextStep bill={bill} snapshot={snapshot} rail={rail} setRail={setRail} />
          <div className="lg:hidden">
            <MoneyPanel bill={bill} snapshot={snapshot} />
          </div>
          {after && (
            <RunwayCard
              title="The runway if you pay it today"
              forecast={after.forecast}
              floorCents={snapshot.account.minReserveCents}
              clearedCents={after.clearedCents}
              asOf={snapshot.demoConfig.asOfDate}
              stamp={
                after.clearedCents < snapshot.account.minReserveCents
                  ? {
                      label: 'Blocked by the reserve',
                      value: `−${formatCentsToUSD(snapshot.account.minReserveCents - after.clearedCents)}`,
                    }
                  : undefined
              }
              caption="A preview from the same deterministic forecast, PayPal’s fee counted as the reserve check counts it. Nothing has moved."
            />
          )}
          <Section
            id="trail"
            title="History"
            description="Every step this bill took, including the ones the reserve refused. Newest first."
          >
            <Trail
              logs={trail}
              empty="No events yet. Approvals, refusals and PayPal steps appear here."
            />
          </Section>
        </div>
        <aside className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:self-start">
          <div className="hidden lg:block">
            <MoneyPanel bill={bill} snapshot={snapshot} />
          </div>
          <dl className="rounded-lg border border-rule bg-panel px-4 py-2 text-sm">
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-ink-2">Pay to</dt>
              <dd className="mono truncate text-right text-xs">{bill.vendorEmail}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-rule py-2">
              <dt className="text-ink-2">Due</dt>
              <dd>{formatDate(bill.dueDate)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-rule py-2">
              <dt className="text-ink-2">For</dt>
              <dd className="truncate text-right">{bill.description}</dd>
            </div>
          </dl>
          <p className="text-xs leading-relaxed text-ink-3">
            Two checks guard this payout: the floor, with PayPal&apos;s fee included, and one
            PayPal-Request-Id per bill. Both run on the server. PayPal sandbox; no real money.
          </p>
        </aside>
      </div>
    </Page>
  );
}

export default function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <WithState label="Loading the bill">
      {({ snapshot }) => {
        const bill = snapshot.bills.find((b) => b.id === id);
        if (!bill) return <Missing kind="bill" href="/bills" />;
        return <BillRoom bill={bill} snapshot={snapshot} />;
      }}
    </WithState>
  );
}
