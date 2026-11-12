'use client';

import React, { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  RefreshCw,
  Send,
  ShieldAlert,
} from 'lucide-react';
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
  type PayoutExecutionMode,
} from '@/lib/apiClient';
import { usePayoutSettlement } from '@/lib/client/payoutPolling';
import { calculatePayoutFeeCents, formatCentsToUSD } from '@/lib/money';
import { derivePayoutRequestId } from '@/lib/idempotency';
import { BILL_STEPS, billStatus, billStep, eventsFor, formatDate } from '@/lib/client/states';
import { ifPaidToday, payoutCheck } from '@/lib/client/whatIf';
import { PayPalBalanceCard } from '@/components/bills/PayPalBalanceCard';
import {
  evaluateBillPayPalBalance,
  PAYPAL_SANDBOX_ACCOUNTS_URL,
} from '@/lib/paypalBalance';
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
  const [busy, setBusy] = useState<null | 'pay' | 'try'>(null);
  const authSubmittingRef = useRef(false);
  const [refusal, setRefusal] = useState<{
    code: string;
    message: string;
    deficit?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const sandbox = snapshot.capabilities.paypalSandboxEnabled;
  const policy = policyFor(bill, snapshot);
  const walletCheck = evaluateBillPayPalBalance({
    paypalBalance: snapshot.paypalBalance,
    billAmountCents: bill.amountCents,
    feeCents: snapshot.demoConfig.paypalPayoutFeeCents,
  });
  const overdue = snapshot.invoices.find((i) => i.status === 'OVERDUE');
  const settlement = usePayoutSettlement({
    billId: bill.id,
    active: bill.status === 'IN_FLIGHT' && sandbox && bill.paypalBatchStatus !== 'SIMULATED',
    initialBatchId: bill.paypalBatchId ?? null,
    onSnapshot: setSnapshot,
  });

  useEffect(() => {
    setConfirmed(false);
    setRefusal(null);
    setError(null);
  }, [rail, bill.id]);

  const authorize = async (kind: 'pay' | 'try') => {
    if (authSubmittingRef.current || busy !== null) return;
    authSubmittingRef.current = true;
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
        if (
          caught.code === 'RESERVE_BREACH_BLOCKED' ||
          caught.code === 'PAYPAL_INSUFFICIENT_BALANCE'
        ) {
          const d = caught.details?.deficitCents ?? caught.details?.shortfallCents;
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
      authSubmittingRef.current = false;
      setBusy(null);
    }
  };

  if (bill.status === 'DISBURSED') {
    return (
      <section
        aria-labelledby="next-h"
        className={`rounded-lg border p-4 sm:p-5 ${TONE_SURFACE.safe}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="next-h" className="flex items-center gap-2 text-base font-semibold text-safe">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Paid
          </h2>
          {bill.paypalBatchId && (
            <span className="mono rounded border border-safe/35 bg-paper/80 px-2 py-0.5 text-xs text-ink">
              Batch {bill.paypalBatchId}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-sm text-ink-2">
          {done ??
            `${formatCentsToUSD(bill.amountCents)} settled to ${bill.vendorName}${bill.actualFeeCents != null ? ` (PayPal fee ${formatCentsToUSD(bill.actualFeeCents)})` : ''}. The internal ledger was debited once upon settlement confirmation.`}
        </p>
        <Link href="/ledger" className={`${btn.secondary} mt-4`}>
          See it in the audit log
        </Link>
      </section>
    );
  }

  if (bill.status === 'IN_FLIGHT') {
    const retainedBatchId = bill.paypalBatchId ?? settlement.batchId;
    const isActivelyPolling = settlement.phase === 'polling' || settlement.isSyncing;

    return (
      <section
        aria-labelledby="next-h"
        className={`rounded-lg border p-4 shadow-card sm:p-5 ${TONE_SURFACE.risk}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="next-h" className="flex items-center gap-2 text-base font-semibold text-ink">
            {isActivelyPolling ? (
              <Loader2 className="h-4 w-4 animate-spin text-risk motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Clock className="h-4 w-4 text-risk" aria-hidden="true" />
            )}
            Payout processing
          </h2>
          {retainedBatchId && (
            <span className="mono rounded border border-rule-strong bg-paper/80 px-2 py-0.5 text-xs text-ink">
              Batch {retainedBatchId}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
          {settlement.phase === 'polling'
            ? `PayPal accepted the batch and reports ${settlement.paypalStatus ?? 'PENDING'}. Settlement is being checked automatically — ${formatCentsToUSD(bill.amountCents)} stays reserved (never debited twice) until PayPal reports SUCCESS.`
            : settlement.phase === 'timed_out'
              ? `PayPal is still processing batch ${retainedBatchId ?? 'pending'}. Automatic polling paused cleanly; use Refresh PayPal status to check again.`
              : `PayPal accepted batch ${retainedBatchId ?? 'pending'}. ${formatCentsToUSD(bill.amountCents)} stays reserved, not debited, until PayPal confirms SUCCESS.`}
        </p>
        {settlement.networkWarning && (
          <p
            role="status"
            className="mt-3 rounded-md border border-risk/40 bg-paper/85 px-3 py-2 text-xs text-ink-2"
          >
            {settlement.networkWarning}
          </p>
        )}
        {settlement.terminalError && (
          <p role="alert" className="mt-3 text-sm text-blocked">
            {settlement.terminalError}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={settlement.isSyncing || busy !== null}
            onClick={() => void settlement.refreshNow()}
            className={btn.primary}
          >
            <RefreshCw
              className={`h-4 w-4 ${settlement.isSyncing ? 'animate-spin motion-reduce:animate-none' : ''}`}
              aria-hidden="true"
            />
            {settlement.isSyncing ? 'Refreshing PayPal status…' : 'Refresh PayPal status'}
          </button>
          <span className="text-xs text-ink-3">
            Checks existing batch only — no duplicate payout is submitted.
          </span>
        </div>
      </section>
    );
  }

  if (bill.status === 'FAILED') {
    const billEvents = eventsFor(snapshot.auditLogs, bill.billNumber);
    const failedEvent = billEvents.find((log) => log.action === 'PAYOUT_FAILED');
    const isInsufficientFundsFailure = failedEvent
      ? failedEvent.details.includes('INSUFFICIENT_FUNDS')
      : Boolean(snapshot.paypalBalance.lastInsufficientFundsAt);

    return (
      <section
        aria-labelledby="next-h"
        className={`rounded-lg border p-4 sm:p-5 ${TONE_SURFACE.blocked}`}
      >
        <h2 id="next-h" className="flex items-center gap-2 text-base font-semibold text-blocked">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          Payout failed · Nothing moved
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          {failedEvent?.details ??
            snapshot.paypalBalance.lastInsufficientFundsMessage ??
            'The last PayPal payout attempt failed. Failed status is preserved, internal ledger was not debited, and automatic retry is disabled.'}
        </p>
        <div className="mt-3 rounded-md border border-blocked/35 bg-paper/80 px-3 py-2.5 text-xs text-ink-2">
          <p className="font-medium text-ink">
            {isInsufficientFundsFailure
              ? 'PayPal Sandbox returned INSUFFICIENT_FUNDS'
              : 'Payout locked in FAILED state'}
          </p>
          <p className="mt-0.5">
            Internal cleared cash ({formatCentsToUSD(snapshot.account.clearedBalanceCents)}) was
            preserved without debit, and duplicate submission is blocked until you replenish funds
            and reset/issue a fresh batch.
          </p>
          <a
            href={PAYPAL_SANDBOX_ACCOUNTS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 font-semibold text-blocked underline"
          >
            Open PayPal Developer Sandbox Accounts Dashboard
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      </section>
    );
  }

  const blocked = policy.wouldBreach;
  const paypalWalletBlocked = rail === 'PAYPAL_SANDBOX' && walletCheck.status === 'INSUFFICIENT';
  return (
    <section
      aria-labelledby="next-h"
      className="rounded-lg border border-rule bg-panel p-4 shadow-card sm:p-5"
    >
      <h2 id="next-h" className="text-base font-semibold">
        Pay {bill.vendorName}
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
                `POST /v1/payments/payouts. PayPal API fee ${formatCentsToUSD(snapshot.demoConfig.paypalPayoutFeeCents)}; reserve check buffers ${formatCentsToUSD(calculatePayoutFeeCents(bill.amountCents))}.`,
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
          {rail === 'PAYPAL_SANDBOX' && walletCheck.status === 'INSUFFICIENT' && (
            <div
              role="alert"
              className="mt-4 rounded-md border-2 border-blocked bg-blocked-field p-4"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-blocked">
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                Blocked before calling PayPal · Insufficient Sandbox balance
              </p>
              <p className="money mt-1 text-2xl font-semibold text-blocked">
                {formatCentsToUSD(walletCheck.shortfallCents)} short
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">
                Needs{' '}
                <strong className="money text-ink">
                  {formatCentsToUSD(walletCheck.requiredCents)}
                </strong>{' '}
                ({formatCentsToUSD(bill.amountCents)} payout +{' '}
                {formatCentsToUSD(walletCheck.feeCents)} PayPal fee), while Sandbox wallet holds{' '}
                <strong className="money text-ink">
                  {formatCentsToUSD(walletCheck.availableCents ?? 0)}
                </strong>
                . Replenish Sandbox funds before submitting.
              </p>
              <a
                href={PAYPAL_SANDBOX_ACCOUNTS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blocked underline"
              >
                Replenish Sandbox funds at PayPal Developer Dashboard
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          )}

          {rail === 'PAYPAL_SANDBOX' && walletCheck.status === 'UNAVAILABLE' && (
            <div
              role="status"
              className="mt-4 flex items-start gap-2.5 rounded-md border border-risk/45 bg-risk-field/60 p-3 text-xs text-ink-2"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-risk" aria-hidden="true" />
              <div>
                <p className="font-semibold text-ink">
                  PayPal balance unavailable · Internal cash does not confirm wallet funds
                </p>
                <p className="mt-0.5 leading-relaxed">
                  Internal cleared cash (
                  <span className="money">
                    {formatCentsToUSD(snapshot.account.clearedBalanceCents)}
                  </span>
                  ) cannot guarantee your Sandbox Business wallet covers{' '}
                  <span className="money">{formatCentsToUSD(walletCheck.requiredCents)}</span>. Check
                  your wallet on{' '}
                  <a
                    href={PAYPAL_SANDBOX_ACCOUNTS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-focus underline"
                  >
                    PayPal Developer Sandbox Accounts
                  </a>{' '}
                  before dispatching.
                </p>
              </div>
            </div>
          )}

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-rule bg-paper p-3 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy !== null || paypalWalletBlocked}
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
            disabled={!confirmed || busy !== null || paypalWalletBlocked}
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
              : paypalWalletBlocked
                ? 'Blocked · Top up PayPal Sandbox'
                : `Approve payout · ${formatCentsToUSD(bill.amountCents)}`}
          </button>
        </>
      )}

      {refusal && (
        <div className="stamp mt-4 inline-block rounded-lg border-2 border-blocked bg-panel px-3 py-2 text-blocked">
          <p className="text-sm font-semibold">The server refused it</p>
          <p className="mt-0.5 text-xs text-ink-2">{refusal.message}</p>
          <p className="mono mt-1 text-xs text-ink-2">{refusal.code}</p>
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
            label="PayPal Payouts API fee"
            hint="Actual flat USD fee per Payouts v1 item (separate from reserve buffer)"
            value={`− ${formatCentsToUSD(snapshot.demoConfig.paypalPayoutFeeCents)}`}
          />
          <Line
            label="Reserve fee buffer cap"
            hint="2% conservative cap (max $1.00) reserved by deterministic rules"
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
          {bill.paypalBatchId && <Ref label="PayPal batch" value={bill.paypalBatchId} />}
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

      <div className="mb-5">
        <PayPalBalanceCard snapshot={snapshot} bill={bill} />
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
