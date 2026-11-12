'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Clock, ExternalLink, Loader2, Play, RefreshCw, X } from 'lucide-react';
import { useAppState } from '@/components/shell/AppState';
import { TONE_SURFACE, btn } from '@/components/ui/kit';
import { formatCentsToUSD } from '@/lib/money';
import {
  ApiError,
  authorizePayout,
  createPayPalInvoice,
  getErrorMessage,
  recordPayPalPayment,
} from '@/lib/apiClient';
import { usePayoutSettlement } from '@/lib/client/payoutPolling';
import { PAYPAL_SANDBOX_ACCOUNTS_URL } from '@/lib/paypalBalance';
import type { StateSnapshot } from '@/types';

const INVOICE_ID = 'inv-beacon-02';
const BILL_ID = 'bill-cloud-02';

type StepState = 'idle' | 'running' | 'done' | 'failed';

function findBatchIdForBill(snapshot: StateSnapshot, billNumber?: string): string | undefined {
  if (!billNumber) return undefined;
  for (const log of snapshot.auditLogs) {
    if (!log.details.includes(billNumber)) continue;
    const match = /batch(?:\s+ID)?[:\s]+([A-Z0-9_-]{6,})/i.exec(log.details);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

/**
 * The real money path on PayPal sandbox, in one click and with no logins:
 * 1. Invoicing v2 creates and sends a real invoice.
 * 2. The merchant records the customer's payment on it; PayPal must then report it PAID.
 * 3. Payouts sends a vendor payment, after the same reserve check as everything else.
 * Every id PayPal returns is shown here and written to the audit log.
 */
export function LiveRun({ snapshot }: { snapshot: StateSnapshot }) {
  const { setSnapshot, reset, resetting } = useAppState();
  const [states, setStates] = useState<StepState[]>(['idle', 'idle', 'idle']);
  const [ids, setIds] = useState<{ invoice?: string; payUrl?: string; batch?: string }>({});
  const [payoutStatus, setPayoutStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runSubmittingRef = useRef(false);

  const invoice = snapshot.invoices.find((i) => i.id === INVOICE_ID);
  const bill = snapshot.bills.find((b) => b.id === BILL_ID);

  const billFailed = bill?.status === 'FAILED';
  const billInFlight = bill?.status === 'IN_FLIGHT';
  const billDisbursed = bill?.status === 'DISBURSED';

  const effectiveInvoiceId = ids.invoice ?? invoice?.paypalInvoiceId;
  const effectivePayUrl = ids.payUrl ?? invoice?.recipientViewUrl;
  const storedBatchId =
    bill?.paypalBatchId ?? ids.batch ?? findBatchIdForBill(snapshot, bill?.billNumber);

  const settlement = usePayoutSettlement({
    billId: BILL_ID,
    active: billInFlight && snapshot.capabilities.paypalSandboxEnabled,
    initialBatchId: storedBatchId ?? null,
    onSnapshot: setSnapshot,
  });

  const effectiveBatchId = storedBatchId ?? settlement.batchId ?? undefined;

  const effectiveStates: [StepState, StepState, StepState] = [
    states[0] === 'running' || states[0] === 'failed'
      ? states[0]
      : states[0] === 'done' || Boolean(effectiveInvoiceId)
        ? 'done'
        : 'idle',
    states[1] === 'running' || states[1] === 'failed'
      ? states[1]
      : states[1] === 'done' || invoice?.status === 'PAID'
        ? 'done'
        : 'idle',
    billDisbursed
      ? 'done'
      : billFailed || states[2] === 'failed'
        ? 'failed'
        : states[2] === 'running' || billInFlight
          ? 'running'
          : 'idle',
  ];

  const running =
    states[0] === 'running' || states[1] === 'running' || states[2] === 'running';
  const finished = billDisbursed && effectiveStates.every((s) => s === 'done');

  const persistedFailureText = billFailed
    ? snapshot.auditLogs.find(
        (log) => log.action === 'PAYOUT_FAILED' && (!bill?.billNumber || log.details.includes(bill.billNumber)),
      )?.details
    : undefined;
  const effectiveError = billDisbursed
    ? null
    : error ??
      settlement.terminalError ??
      (billFailed ? persistedFailureText ?? 'This payout failed. Reset the demo before retrying.' : null);
  const effectivePayoutStatus =
    billDisbursed
      ? `Paid · PayPal confirmed settlement to ${bill?.vendorName ?? 'the vendor'}${bill?.actualFeeCents != null ? ` (fee ${formatCentsToUSD(bill.actualFeeCents)})` : ''}`
      : billInFlight
        ? 'Payout processing'
        : payoutStatus;

  const mark = (i: number, s: StepState) =>
    setStates((prev) => prev.map((v, j) => (j === i ? s : v)));

  const runAll = async () => {
    if (runSubmittingRef.current || running || billInFlight || billDisbursed) return;
    runSubmittingRef.current = true;
    setError(null);
    let step = 0;
    try {
      // 1. Create the invoice (skipped if this invoice is already on PayPal).
      mark(0, 'running');
      const created = await createPayPalInvoice(INVOICE_ID);
      setSnapshot(created.snapshot);
      setIds((v) => ({ ...v, invoice: created.paypalInvoiceId, payUrl: created.recipientViewUrl ?? undefined }));
      mark(0, 'done');

      // 2. Record the customer's payment on PayPal and wait for PayPal to say PAID.
      step = 1;
      mark(1, 'running');
      let latestSnapshot = created.snapshot;
      const current = created.snapshot.invoices.find((i) => i.id === INVOICE_ID);
      if (current?.status !== 'PAID') {
        const paid = await recordPayPalPayment(INVOICE_ID);
        latestSnapshot = paid.snapshot;
        setSnapshot(paid.snapshot);
      }
      mark(1, 'done');

      // 3. Pay the vendor through PayPal Payouts (skip duplicate call if already in flight/disbursed).
      step = 2;
      mark(2, 'running');
      const currentBill = latestSnapshot.bills.find((b) => b.id === BILL_ID);
      if (currentBill?.status === 'DISBURSED') {
        setPayoutStatus(`Paid · PayPal confirmed settlement to ${currentBill.vendorName}`);
        mark(2, 'done');
      } else if (currentBill?.status === 'IN_FLIGHT') {
        setIds((v) => ({ ...v, batch: currentBill.paypalBatchId ?? v.batch }));
        setPayoutStatus('Payout processing');
        mark(2, 'idle');
      } else {
        const payout = await authorizePayout({ billId: BILL_ID, executionMode: 'PAYPAL_SANDBOX' });
        setSnapshot(payout.snapshot);
        setIds((v) => ({ ...v, batch: payout.batchId ?? undefined }));
        setPayoutStatus(payout.message ?? payout.status);
        mark(2, payout.status === 'DISBURSED' ? 'done' : 'idle');
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.snapshot) setSnapshot(caught.snapshot);
      mark(step, 'failed');
      setPayoutStatus(null);
      setError(getErrorMessage(caught));
    } finally {
      runSubmittingRef.current = false;
    }
  };

  const steps = [
    {
      title: `Send a real PayPal invoice to ${invoice?.customerName ?? 'Beacon'}`,
      body: `Invoicing v2 creates and sends a ${invoice ? formatCentsToUSD(invoice.amountCents) : ''} invoice on the sandbox.`,
      detail: effectiveInvoiceId && (
        <>
          <span className="mono">{effectiveInvoiceId}</span>
          {effectivePayUrl && (
            <a href={effectivePayUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 underline">
              view on PayPal <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </>
      ),
    },
    {
      title: 'Mark it paid on PayPal',
      body: 'The merchant records the customer’s payment on PayPal. Cash is credited only after PayPal itself reports the invoice paid.',
      detail: effectiveStates[1] === 'done' && <>PayPal confirms: marked as paid</>,
    },
    {
      title: `Pay ${bill?.vendorName ?? 'the vendor'} through PayPal Payouts`,
      body: `A real ${bill ? formatCentsToUSD(bill.amountCents) : ''} payout, sent only after the reserve check passes, including PayPal’s fee.`,
      detail: effectiveBatchId && (
        <>
          Batch <span className="mono">{effectiveBatchId}</span>
          {billDisbursed ? ' · Paid' : billInFlight ? ' · Payout processing' : ''}
        </>
      ),
    },
  ];

  return (
    <section aria-labelledby="live-h" className="rounded-xl border border-focus/35 bg-panel p-5 shadow-xs sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-focus/35 bg-focus/10 px-2.5 py-0.5 text-xs font-semibold text-focus">
              PAYPAL SANDBOX READY
            </span>
            <span className="text-xs text-ink-2">Live API Integration</span>
          </div>
          <h2 id="live-h" className="mt-1.5 text-lg font-bold tracking-tight text-ink sm:text-xl">
            Live PayPal Sandbox Settlement Path
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            Execute 3 live PayPal Sandbox API transactions (Invoicing v2 → Record Payment → Payouts v1). No sandbox login required.
          </p>
        </div>
        {!finished && !billInFlight && (
          billFailed ? (
            <button
              type="button"
              onClick={() => void reset()}
              disabled={resetting}
              className={`${btn.primary} shrink-0`}
            >
              <RefreshCw className={`h-4 w-4 ${resetting ? 'animate-spin' : ''}`} aria-hidden="true" />
              {resetting ? 'Resetting…' : 'Reset Demo to Retry'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void runAll()}
              disabled={running || billInFlight || billDisbursed}
              className={`${btn.primary} shrink-0`}
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              )}
              {running
                ? 'Calling PayPal APIs…'
                : effectiveStates.includes('failed')
                  ? 'Retry PayPal Sandbox'
                  : 'Run on PayPal Sandbox'}
            </button>
          )
        )}
      </div>

      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => {
          const st = effectiveStates[i];
          return (
            <li
              key={s.title}
              className={`rounded-xl border p-4 transition-all ${
                st === 'done'
                  ? 'border-safe/45 bg-safe-field/50 shadow-xs'
                  : st === 'failed'
                    ? 'border-blocked/45 bg-blocked-field/50'
                    : st === 'running'
                      ? 'border-focus bg-focus/10 shadow-xs ring-1 ring-focus/25'
                      : 'border-rule bg-paper/70'
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    st === 'done'
                      ? 'bg-safe text-paper'
                      : st === 'failed'
                        ? 'bg-blocked text-paper'
                        : st === 'running'
                          ? 'bg-focus text-paper'
                          : 'bg-panel text-ink-2 ring-1 ring-inset ring-rule-strong'
                  }`}
                  aria-hidden="true"
                >
                  {st === 'done' ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : st === 'failed' ? (
                    <X className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : st === 'running' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    i + 1
                  )}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{s.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{s.body}</p>
                  {s.detail && (
                    <div className="mt-2.5 break-all rounded border border-rule bg-panel px-2 py-1 font-mono text-xs text-ink">
                      {s.detail}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {effectiveError && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-blocked/40 bg-blocked-field/70 p-3.5 text-sm text-ink shadow-xs"
        >
          <p>
            <span className="font-bold text-blocked">PayPal API error: </span>
            {effectiveError}
          </p>
          {(effectiveError.includes('INSUFFICIENT_FUNDS') ||
            effectiveError.toLowerCase().includes('insufficient') ||
            Boolean(snapshot.paypalBalance.lastInsufficientFundsAt)) && (
            <p className="mt-2 text-xs text-ink-2">
              Replenish Sandbox funds in{' '}
              <a
                href={PAYPAL_SANDBOX_ACCOUNTS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-blocked underline"
              >
                PayPal Developer Sandbox Accounts
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
              . Failed payouts never debit internal cash or retry automatically.
            </p>
          )}
        </div>
      )}

      {billInFlight && (
        <div
          role="status"
          className={`mt-4 flex flex-col gap-3 rounded-xl border p-4 text-sm shadow-xs sm:flex-row sm:items-center sm:justify-between ${TONE_SURFACE.risk}`}
        >
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold text-ink">
              {settlement.isSyncing || settlement.phase === 'polling' ? (
                <Loader2 className="h-4 w-4 animate-spin text-risk motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Clock className="h-4 w-4 text-risk" aria-hidden="true" />
              )}
              Payout processing
              {effectiveBatchId && (
                <span className="mono rounded border border-rule-strong bg-paper/80 px-2 py-0.5 text-xs font-normal text-ink">
                  {effectiveBatchId}
                </span>
              )}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">
              {settlement.networkWarning
                ? settlement.networkWarning
                : settlement.phase === 'timed_out'
                  ? `PayPal is still processing batch ${effectiveBatchId ?? 'pending'}. Use Refresh PayPal status to re-check.`
                  : 'PayPal reported PENDING. Automatically checking settlement status — ledger will debit once on SUCCESS.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void settlement.refreshNow()}
            disabled={settlement.isSyncing}
            className={`${btn.small} shrink-0`}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${settlement.isSyncing ? 'animate-spin motion-reduce:animate-none' : ''}`}
              aria-hidden="true"
            />
            {settlement.isSyncing ? 'Refreshing PayPal status…' : 'Refresh PayPal status'}
          </button>
        </div>
      )}

      {finished && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-safe/40 bg-safe-field/50 p-4 text-sm text-ink-2 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium text-ink">
            {effectivePayoutStatus} · Every PayPal ID &amp; webhook is logged in the{' '}
            <Link href="/ledger" className="font-bold text-safe underline">
              audit ledger
            </Link>
            .
          </p>
        </div>
      )}
      <p className="mono mt-3 text-xs text-ink-2">
        Endpoint: api-m.sandbox.paypal.com · Sandbox environment ready
      </p>
    </section>
  );
}
