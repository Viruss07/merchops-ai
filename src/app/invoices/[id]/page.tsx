'use client';

import React, { use, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ExternalLink, Loader2, Mail, RefreshCw, Send } from 'lucide-react';
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
  createPayPalInvoice,
  getErrorMessage,
  simulatePayment,
  syncInvoices,
} from '@/lib/apiClient';
import { formatCentsToUSD } from '@/lib/money';
import {
  INVOICE_STEPS,
  eventsFor,
  formatDate,
  invoiceSkipped,
  invoiceStatus,
  invoiceStep,
} from '@/lib/client/states';
import { ifCollected } from '@/lib/client/whatIf';
import type { Invoice, RunwayForecast, StateSnapshot } from '@/types';
import { ReminderComposer } from './ReminderComposer';

type Busy = null | 'paypal' | 'sync' | 'simulate';

/** One next action, chosen by where the invoice is. The only shadowed panel on the page. */
function NextStep({ invoice, snapshot }: { invoice: Invoice; snapshot: StateSnapshot }) {
  const { setSnapshot } = useAppState();
  const [busy, setBusy] = useState<Busy>(null);
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState<{ title: string; text: string; hint?: string } | null>(null);
  const sandbox = snapshot.capabilities.paypalSandboxEnabled;

  const run = async (
    kind: Exclude<Busy, null>,
    fn: () => Promise<{ snapshot: StateSnapshot }>,
    failTitle: string,
  ) => {
    setBusy(kind);
    setNotice(null);
    try {
      const res = await fn();
      setSnapshot(res.snapshot);
    } catch (caught) {
      if (caught instanceof ApiError && caught.snapshot) setSnapshot(caught.snapshot);
      setNotice({
        title: failTitle,
        text: getErrorMessage(caught),
        hint:
          caught instanceof ApiError && caught.status === 403
            ? 'The PayPal sandbox app needs the Invoicing permission: developer.paypal.com → Apps & Credentials → your app → tick Invoicing → Save. Until then, mark it paid in simulation.'
            : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  if (invoice.status === 'PAID') {
    return (
      <section
        aria-labelledby="next-h"
        className="rounded-lg border border-safe/40 bg-safe-field/60 p-4 sm:p-5"
      >
        <h2 id="next-h" className="flex items-center gap-2 text-base font-semibold text-safe">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Collected
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          {formatCentsToUSD(invoice.amountCents)} from {invoice.customerName} is in cleared cash.
          The runway counts it today, and any bill it unblocked can now be paid.
        </p>
        <Link href="/bills" className={`${btn.secondary} mt-4`}>
          See which bills it unblocked
        </Link>
      </section>
    );
  }

  const overdue = invoice.status === 'OVERDUE';
  return (
    <section
      aria-labelledby="next-h"
      className="rounded-lg border border-rule bg-panel p-4 shadow-card sm:p-5"
    >
      <h2 id="next-h" className="text-base font-semibold">
        {composing
          ? `Remind ${invoice.customerName}`
          : overdue
            ? `Get ${invoice.customerName} to pay`
            : invoice.paypalInvoiceId
              ? 'Waiting for the customer to pay'
              : 'Send it through PayPal'}
      </h2>
      {!composing && (
        <p className="mt-1 text-sm leading-relaxed text-ink-2">
          {overdue
            ? `${formatCentsToUSD(invoice.amountCents)} was due ${formatDate(invoice.dueDate)}, ${invoice.daysOverdue} days ago. Until it's paid, the runway doesn't count it.`
            : invoice.paypalInvoiceId
              ? `PayPal has the invoice. When ${invoice.customerName} pays, PayPal's webhook marks it collected, or check now.`
              : `Due ${formatDate(invoice.dueDate)}. Sending it as a PayPal invoice gives the customer a pay link and lets PayPal confirm the payment.`}
        </p>
      )}

      <div className="mt-4">
        {composing ? (
          <ReminderComposer invoice={invoice} onDone={() => setComposing(false)} />
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {overdue && (
              <button type="button" onClick={() => setComposing(true)} className={btn.primary}>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Draft a reminder with AI
              </button>
            )}
            {!invoice.paypalInvoiceId ? (
              <button
                type="button"
                disabled={!sandbox || busy !== null}
                title={
                  sandbox
                    ? undefined
                    : 'PayPal sandbox credentials are not configured on this server.'
                }
                onClick={() =>
                  run(
                    'paypal',
                    () => createPayPalInvoice(invoice.id),
                    'PayPal did not take the invoice',
                  )
                }
                className={overdue ? btn.secondary : btn.primary}
              >
                {busy === 'paypal' ? (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                {busy === 'paypal' ? 'Sending to PayPal…' : 'Send as a PayPal invoice'}
              </button>
            ) : (
              <>
                {invoice.recipientViewUrl && (
                  <a
                    href={invoice.recipientViewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={overdue ? btn.secondary : btn.primary}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Open the customer&apos;s pay page
                  </a>
                )}
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    run('sync', () => syncInvoices(invoice.id), 'PayPal could not be checked')
                  }
                  className={btn.secondary}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${busy === 'sync' ? 'animate-spin motion-reduce:animate-none' : ''}`}
                    aria-hidden="true"
                  />
                  {busy === 'sync' ? 'Checking…' : 'Check PayPal for payment'}
                </button>
              </>
            )}
            {!overdue && !invoice.paypalInvoiceId && (
              <button type="button" onClick={() => setComposing(true)} className={btn.secondary}>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Draft a reminder
              </button>
            )}
          </div>
        )}
      </div>

      {!composing && (
        <div className="mt-4 border-t border-rule pt-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run(
                'simulate',
                () => simulatePayment(invoice.id),
                'The simulated payment did not go through',
              )
            }
            className={btn.quiet}
          >
            {busy === 'simulate'
              ? 'Recording the payment…'
              : `Simulate ${invoice.customerName} paying ${formatCentsToUSD(invoice.amountCents)}`}
          </button>
          <p className="mt-1 text-xs text-ink-3">
            For the demo: records the payment without PayPal, marked simulated in the ledger.
          </p>
        </div>
      )}

      {!sandbox && !invoice.paypalInvoiceId && !composing && (
        <p className="mt-3 text-xs text-ink-3">
          PayPal sandbox isn&apos;t configured on this server, so invoices stay local. See
          docs/SANDBOX_GUIDE.md.
        </p>
      )}

      {notice && (
        <div className="mt-4">
          <Notice title={notice.title} onDismiss={() => setNotice(null)}>
            <p>{notice.text}</p>
            {notice.hint && <p className="mt-2 text-xs">{notice.hint}</p>}
          </Notice>
        </div>
      )}
    </section>
  );
}

/** What collecting this invoice does to cleared cash and to the floor. A receipt, label left, amount right. */
function MoneyPanel({
  invoice,
  snapshot,
  forecast,
}: {
  invoice: Invoice;
  snapshot: StateSnapshot;
  forecast: RunwayForecast;
}) {
  const after = ifCollected(snapshot, invoice.id);
  const paid = invoice.status === 'PAID';
  const tone = paid
    ? 'safe'
    : after && forecast.hasReserveBreach && !after.forecast.hasReserveBreach
      ? 'safe'
      : invoice.status === 'OVERDUE'
        ? 'risk'
        : 'neutral';
  return (
    <section aria-labelledby="money-h" className={`rounded-lg border p-4 ${TONE_SURFACE[tone]}`}>
      <h2 id="money-h" className="text-sm font-medium text-ink-2">
        {paid ? 'Where the money is' : 'If it’s collected today'}
      </h2>
      <p className="mt-1 text-xl font-semibold text-ink">
        {paid
          ? 'In cleared cash'
          : after && forecast.hasReserveBreach && !after.forecast.hasReserveBreach
            ? 'The floor holds again'
            : after?.forecast.hasReserveBreach
              ? `Still crosses on Day ${after.forecast.firstBreachDay}`
              : 'The runway stays above the floor'}
      </p>
      {!paid && after && (
        <dl className="mt-3">
          <Line
            label="Cleared now"
            value={formatCentsToUSD(snapshot.account.clearedBalanceCents)}
          />
          <Line
            label={`${invoice.customerName} pays`}
            value={`+ ${formatCentsToUSD(invoice.amountCents)}`}
            tone="safe"
          />
          <Line label="Cleared after" value={formatCentsToUSD(after.clearedCents)} total />
          <div className="mt-3 border-t border-rule pt-2">
            <Line
              label="Lowest on the runway"
              value={
                <>
                  <span className="text-ink-3 line-through decoration-1">
                    {formatCentsToUSD(forecast.minBalanceCents)}
                  </span>{' '}
                  {formatCentsToUSD(after.forecast.minBalanceCents)}
                </>
              }
              tone={after.forecast.hasReserveBreach ? 'blocked' : 'safe'}
            />
          </div>
        </dl>
      )}
      {paid && (
        <p className="mt-1 text-sm text-ink-2">
          {formatCentsToUSD(invoice.amountCents)} from {invoice.customerName}, counted as cleared
          cash.
        </p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-ink-2 hover:text-ink">
          PayPal references{snapshot.capabilities.paypalSandboxEnabled ? ' (sandbox)' : ''}
        </summary>
        <dl className="mt-2">
          <Ref label="Invoice" value={invoice.paypalInvoiceId} />
          <Ref label="Customer pay page" value={invoice.recipientViewUrl} />
          <Ref
            label="Demo pay link"
            value={invoice.paypalInvoiceId ? undefined : invoice.paymentUrl}
          />
          {!invoice.paypalInvoiceId && (
            <p className="pt-1 text-xs text-ink-3">Not sent to PayPal yet.</p>
          )}
        </dl>
      </details>
    </section>
  );
}

function InvoiceRoom({
  invoice,
  snapshot,
  forecast,
}: {
  invoice: Invoice;
  snapshot: StateSnapshot;
  forecast: RunwayForecast;
}) {
  const status = invoiceStatus(invoice);
  const after = ifCollected(snapshot, invoice.id);
  const trail = eventsFor(snapshot.auditLogs, invoice.invoiceNumber, invoice.paypalInvoiceId ?? '');
  return (
    <Page>
      <PageHeader
        back={{ href: '/invoices', label: 'Invoices' }}
        title={invoice.customerName}
        meta={
          <>
            <StatusPill label={status.label} tone={status.tone} />
            <span className="mono text-xs">{invoice.invoiceNumber}</span>
            <span>{invoice.description}</span>
          </>
        }
        aside={
          <Figure
            label="Invoice amount"
            value={formatCentsToUSD(invoice.amountCents)}
            tone={invoice.status === 'PAID' ? 'safe' : 'neutral'}
          />
        }
      />

      <div className="py-5">
        <Tracker
          label="Where this invoice is"
          steps={INVOICE_STEPS}
          current={invoiceStep(invoice)}
          skipped={invoiceSkipped(invoice)}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <NextStep invoice={invoice} snapshot={snapshot} />
          <div className="lg:hidden">
            <MoneyPanel invoice={invoice} snapshot={snapshot} forecast={forecast} />
          </div>
          {after && (
            <RunwayCard
              title="The runway if it's collected today"
              forecast={after.forecast}
              floorCents={snapshot.account.minReserveCents}
              clearedCents={after.clearedCents}
              asOf={snapshot.demoConfig.asOfDate}
              caption={
                <>
                  A preview from the same deterministic forecast. Nothing changes until the customer
                  pays.{' '}
                  <Link href="/runway" className="underline">
                    The runway as it is
                  </Link>
                </>
              }
            />
          )}
          <Section
            id="trail"
            title="History"
            description="Every step this invoice took, from the append-only ledger. Newest first."
          >
            <Trail
              logs={trail}
              empty="No events yet. Reminders, PayPal and payment steps appear here."
            />
          </Section>
        </div>
        <aside className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:self-start">
          <div className="hidden lg:block">
            <MoneyPanel invoice={invoice} snapshot={snapshot} forecast={forecast} />
          </div>
          <dl className="rounded-lg border border-rule bg-panel px-4 py-2 text-sm">
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-ink-2">Customer</dt>
              <dd className="truncate text-right">{invoice.customerName}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-rule py-2">
              <dt className="text-ink-2">Billing email</dt>
              <dd className="mono truncate text-right text-xs">{invoice.customerEmail}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-rule py-2">
              <dt className="text-ink-2">Due</dt>
              <dd>{formatDate(invoice.dueDate)}</dd>
            </div>
            {invoice.lastReminderSentAt && (
              <div className="flex items-baseline justify-between gap-3 border-t border-rule py-2">
                <dt className="text-ink-2">Last reminder</dt>
                <dd>{formatDate(invoice.lastReminderSentAt)}</dd>
              </div>
            )}
          </dl>
          <p className="text-xs leading-relaxed text-ink-3">
            The AI drafts reminders and nothing else. It can&apos;t send one, mark an invoice paid,
            or touch the balance. PayPal sandbox; no real money.
          </p>
        </aside>
      </div>
    </Page>
  );
}

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <WithState label="Loading the invoice">
      {({ snapshot, forecast }) => {
        const invoice = snapshot.invoices.find((i) => i.id === id);
        if (!invoice) return <Missing kind="invoice" href="/invoices" />;
        return <InvoiceRoom invoice={invoice} snapshot={snapshot} forecast={forecast} />;
      }}
    </WithState>
  );
}
