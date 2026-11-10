'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, Loader2, Play, RefreshCw, X } from 'lucide-react';
import { useAppState } from '@/components/shell/AppState';
import { btn } from '@/components/ui/kit';
import { formatCentsToUSD } from '@/lib/money';
import {
  ApiError,
  authorizePayout,
  createPayPalInvoice,
  getErrorMessage,
  recordPayPalPayment,
  syncPayout,
} from '@/lib/apiClient';
import type { StateSnapshot } from '@/types';

const INVOICE_ID = 'inv-beacon-02';
const BILL_ID = 'bill-cloud-02';

type StepState = 'idle' | 'running' | 'done' | 'failed';

/**
 * The real money path on PayPal sandbox, in one click and with no logins:
 * 1. Invoicing v2 creates and sends a real invoice.
 * 2. The merchant records the customer's payment on it; PayPal must then report it PAID.
 * 3. Payouts sends a vendor payment, after the same reserve check as everything else.
 * Every id PayPal returns is shown here and written to the audit log.
 */
export function LiveRun({ snapshot }: { snapshot: StateSnapshot }) {
  const { setSnapshot } = useAppState();
  const [states, setStates] = useState<StepState[]>(['idle', 'idle', 'idle']);
  const [ids, setIds] = useState<{ invoice?: string; payUrl?: string; batch?: string }>({});
  const [payoutStatus, setPayoutStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const invoice = snapshot.invoices.find((i) => i.id === INVOICE_ID);
  const bill = snapshot.bills.find((b) => b.id === BILL_ID);
  const running = states.includes('running');
  const finished = states.every((s) => s === 'done');

  const mark = (i: number, s: StepState) =>
    setStates((prev) => prev.map((v, j) => (j === i ? s : v)));

  const runAll = async () => {
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
      const current = created.snapshot.invoices.find((i) => i.id === INVOICE_ID);
      if (current?.status !== 'PAID') {
        const paid = await recordPayPalPayment(INVOICE_ID);
        setSnapshot(paid.snapshot);
      }
      mark(1, 'done');

      // 3. Pay the vendor through PayPal Payouts.
      step = 2;
      mark(2, 'running');
      const payout = await authorizePayout({ billId: BILL_ID, executionMode: 'PAYPAL_SANDBOX' });
      setSnapshot(payout.snapshot);
      setIds((v) => ({ ...v, batch: payout.batchId ?? undefined }));
      setPayoutStatus(payout.message ?? payout.status);
      mark(2, 'done');
    } catch (caught) {
      if (caught instanceof ApiError && caught.snapshot) setSnapshot(caught.snapshot);
      mark(step, 'failed');
      setError(getErrorMessage(caught));
    }
  };

  const checkSettlement = async () => {
    setSyncing(true);
    try {
      const res = await syncPayout(BILL_ID);
      setSnapshot(res.snapshot);
      setPayoutStatus(res.message);
    } catch (caught) {
      if (caught instanceof ApiError && caught.snapshot) setSnapshot(caught.snapshot);
      setPayoutStatus(getErrorMessage(caught));
    } finally {
      setSyncing(false);
    }
  };

  const steps = [
    {
      title: `Send a real PayPal invoice to ${invoice?.customerName ?? 'Beacon'}`,
      body: `Invoicing v2 creates and sends a ${invoice ? formatCentsToUSD(invoice.amountCents) : ''} invoice on the sandbox.`,
      detail: ids.invoice && (
        <>
          <span className="mono">{ids.invoice}</span>
          {ids.payUrl && (
            <a href={ids.payUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 underline">
              view on PayPal <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </>
      ),
    },
    {
      title: 'Mark it paid on PayPal',
      body: 'The merchant records the customer’s payment on PayPal. Cash is credited only after PayPal itself reports the invoice paid.',
      detail: states[1] === 'done' && <>PayPal confirms: marked as paid</>,
    },
    {
      title: `Pay ${bill?.vendorName ?? 'the vendor'} through PayPal Payouts`,
      body: `A real ${bill ? formatCentsToUSD(bill.amountCents) : ''} payout, sent only after the reserve check passes, including PayPal’s fee.`,
      detail: ids.batch && (
        <>
          Batch <span className="mono">{ids.batch}</span>
        </>
      ),
    },
  ];

  return (
    <section aria-labelledby="live-h" className="rounded-lg border border-rule bg-panel p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h2 id="live-h" className="text-xl font-semibold">
            Bonus: the same flow on the real PayPal sandbox
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            One click makes three real PayPal sandbox API calls. You don&apos;t need a PayPal login.
            It uses a different invoice and bill from the steps above, so it works in any order.
          </p>
        </div>
        {!finished && (
          <button type="button" onClick={() => void runAll()} disabled={running} className={`${btn.primary} shrink-0`}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
            )}
            {running ? 'Talking to PayPal…' : states.includes('failed') ? 'Try again' : 'Run it on PayPal'}
          </button>
        )}
      </div>

      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => {
          const st = states[i];
          return (
            <li
              key={s.title}
              className={`rounded-md border p-3 ${
                st === 'done'
                  ? 'border-safe/40 bg-safe-field/60'
                  : st === 'failed'
                    ? 'border-blocked/40 bg-blocked-field/60'
                    : st === 'running'
                      ? 'border-ink bg-paper'
                      : 'border-rule'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    st === 'done'
                      ? 'bg-safe text-paper'
                      : st === 'failed'
                        ? 'bg-blocked text-paper'
                        : 'text-ink-2 ring-1 ring-inset ring-rule-strong'
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
                  <p className="text-sm font-medium text-ink">{s.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{s.body}</p>
                  {s.detail && <p className="mt-2 break-all text-xs text-ink">{s.detail}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-blocked/40 bg-blocked-field/60 p-3 text-sm text-ink">
          <span className="font-medium text-blocked">PayPal said no: </span>
          {error}
        </p>
      )}

      {finished && (
        <div className="mt-4 flex flex-col gap-3 rounded-md border border-rule bg-paper p-3 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {payoutStatus} Every id is in the{' '}
            <Link href="/ledger" className="font-medium text-ink underline">
              audit log
            </Link>
            .
          </p>
          {bill?.status === 'IN_FLIGHT' && (
            <button type="button" onClick={() => void checkSettlement()} disabled={syncing} className={`${btn.small} shrink-0`}>
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
              Check settlement with PayPal
            </button>
          )}
        </div>
      )}
      <p className="mono mt-4 text-[11px] text-ink-3">api-m.sandbox.paypal.com · test money only</p>
    </section>
  );
}
