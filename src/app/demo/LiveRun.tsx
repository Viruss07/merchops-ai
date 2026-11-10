'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, Loader2 } from 'lucide-react';
import { useAppState } from '@/components/shell/AppState';
import { Notice, Ref, TONE_SURFACE, btn } from '@/components/ui/kit';
import {
  ApiError,
  authorizePayout,
  createPayPalInvoice,
  getErrorMessage,
  syncInvoices,
} from '@/lib/apiClient';
import type { StateSnapshot } from '@/types';

type Stage = 0 | 1 | 2 | 3;

/** The real money path on PayPal sandbox: an invoice, the customer pays it, a payout goes out. */
export function LiveRun({ snapshot }: { snapshot: StateSnapshot }) {
  const { setSnapshot } = useAppState();
  const [stage, setStage] = useState<Stage>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; permission: boolean } | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ id: string | null; status: string } | null>(null);
  const sandbox = snapshot.capabilities.paypalSandboxEnabled;

  const step = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (caught) {
      if (caught instanceof ApiError && caught.snapshot) setSnapshot(caught.snapshot);
      const text = getErrorMessage(caught);
      setError({ text, permission: caught instanceof ApiError && caught.status === 403 });
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    {
      title: 'Create a real PayPal invoice',
      body: 'Invoicing v2 issues Apex Corp’s $1,500.00 invoice on the sandbox and returns the customer’s pay page.',
      action: 'Create the invoice on PayPal',
      run: () =>
        step(async () => {
          const res = await createPayPalInvoice('inv-apex-01');
          setSnapshot(res.snapshot);
          setInvoiceId(res.paypalInvoiceId);
          setPayUrl(res.recipientViewUrl);
          setStage(1);
        }),
    },
    {
      title: 'Pay it as the customer, then sync',
      body: 'Open the pay page, pay with a sandbox personal account, then sync. PayPal’s answer, not ours, marks it paid.',
      action: 'Sync with PayPal',
      run: () =>
        step(async () => {
          const res = await syncInvoices('inv-apex-01');
          setSnapshot(res.snapshot);
          if (res.snapshot.invoices.find((i) => i.id === 'inv-apex-01')?.status === 'PAID')
            setStage(2);
          else
            setError({
              text: 'PayPal doesn’t report it paid yet. Pay it on the customer page, then sync again.',
              permission: false,
            });
        }),
    },
    {
      title: 'Pay Nexus Cloud $400.00 through Payouts',
      body: 'POST /v1/payments/payouts with a fixed PayPal-Request-Id. The floor check includes PayPal’s fee; settlement is confirmed, never assumed.',
      action: 'Approve the payout on PayPal',
      run: () =>
        step(async () => {
          const res = await authorizePayout({
            billId: 'bill-cloud-02',
            executionMode: 'PAYPAL_SANDBOX',
          });
          setSnapshot(res.snapshot);
          setBatch({ id: res.batchId ?? null, status: res.status });
          setStage(3);
        }),
    },
  ];

  return (
    <section aria-labelledby="live-h" className="rounded-lg border border-rule bg-panel p-4 sm:p-5">
      <h2 id="live-h" className="text-lg font-semibold">
        Run it live on PayPal sandbox
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        Three real sandbox calls, in order. Every id they return lands in the ledger.
      </p>

      {!sandbox && (
        <div className="mt-4">
          <Notice tone="neutral" title="PayPal sandbox isn’t configured on this server">
            Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (see docs/SANDBOX_GUIDE.md) to run these.
            The tour works without them, in simulation.
          </Notice>
        </div>
      )}

      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => {
          const done = stage > i;
          const current = stage === i;
          return (
            <li
              key={s.title}
              className={`rounded-md border p-3 ${done ? TONE_SURFACE.safe : current ? 'border-ink bg-paper' : 'border-rule'}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-medium ${
                    done
                      ? 'bg-safe text-paper'
                      : current
                        ? 'ring-[1.5px] ring-inset ring-ink'
                        : 'text-ink-3 ring-1 ring-inset ring-rule-strong'
                  }`}
                  aria-hidden="true"
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${current || done ? 'text-ink' : 'text-ink-3'}`}
                  >
                    {s.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{s.body}</p>
                  {i === 0 && invoiceId && (
                    <dl className="mt-2">
                      <Ref label="PayPal invoice" value={invoiceId} />
                    </dl>
                  )}
                  {i === 1 && payUrl && stage === 1 && (
                    <a
                      href={payUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={`${btn.small} mt-2`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      Open the customer pay page
                    </a>
                  )}
                  {i === 2 && batch && (
                    <dl className="mt-2">
                      <Ref label="Payout batch" value={batch.id} />
                      <Ref
                        label="Status"
                        value={
                          batch.status === 'DISBURSED'
                            ? 'Settled'
                            : 'Accepted · awaiting settlement'
                        }
                      />
                    </dl>
                  )}
                  {current && (
                    <button
                      type="button"
                      onClick={() => void s.run()}
                      disabled={!sandbox || busy}
                      className={`${btn.primary} mt-3`}
                    >
                      {busy && (
                        <Loader2
                          className="h-4 w-4 animate-spin motion-reduce:animate-none"
                          aria-hidden="true"
                        />
                      )}
                      {s.action}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="mt-4">
          <Notice tone="blocked" title="PayPal said no" onDismiss={() => setError(null)}>
            <p>{error.text}</p>
            {error.permission && (
              <p className="mt-2 text-xs">
                The sandbox app needs the Invoicing permission:{' '}
                <a
                  href="https://developer.paypal.com/dashboard/applications/sandbox"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  developer.paypal.com
                </a>{' '}
                → Apps &amp; Credentials → your app → tick Invoicing → Save.
              </p>
            )}
          </Notice>
        </div>
      )}

      {stage === 3 && (
        <p className="mt-4 text-sm text-ink-2">
          Done. Every call is in the{' '}
          <Link href="/ledger" className="font-medium text-ink underline">
            ledger
          </Link>{' '}
          with its PayPal id.
        </p>
      )}
      <p className="mono mt-4 text-[11px] text-ink-3">api-m.sandbox.paypal.com</p>
    </section>
  );
}
