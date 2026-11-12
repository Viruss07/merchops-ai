'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ExternalLink, RefreshCw } from 'lucide-react';
import { WithState } from '@/components/shell/WithState';
import { useAppState } from '@/components/shell/AppState';
import { Figure, Page, PageHeader, StatusPill, btn } from '@/components/ui/kit';
import { ApiError, getErrorMessage, syncInvoices } from '@/lib/apiClient';
import { formatCentsToUSD } from '@/lib/money';
import { formatDate, invoiceStatus } from '@/lib/client/states';
import type { Invoice } from '@/types';

const ORDER: Record<Invoice['status'], number> = { OVERDUE: 0, CURRENT: 1, PAID: 2 };

function SyncButton({ enabled }: { enabled: boolean }) {
  const { setSnapshot } = useAppState();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'safe' | 'risk' | 'blocked'; text: string } | null>(
    null,
  );
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        disabled={!enabled || busy}
        title={
          enabled ? undefined : 'PayPal sandbox mode is not enabled in this environment.'
        }
        onClick={async () => {
          setBusy(true);
          setNote(null);
          try {
            const res = await syncInvoices();
            setSnapshot(res.snapshot);
            const tone =
              res.outcome === 'UNPAID' || res.outcome === 'PARTIALLY_PAID' ? 'risk' : 'safe';
            setNote({ tone, text: res.message });
          } catch (caught) {
            if (caught instanceof ApiError && caught.snapshot) setSnapshot(caught.snapshot);
            setNote({ tone: 'blocked', text: getErrorMessage(caught) });
          } finally {
            setBusy(false);
          }
        }}
        className={btn.secondary}
      >
        <RefreshCw
          className={`h-4 w-4 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`}
          aria-hidden="true"
        />
        {busy ? 'Checking PayPal…' : 'Sync PayPal Invoices'}
      </button>
      {note && (
        <p
          className={`text-xs font-medium ${
            note.tone === 'safe'
              ? 'text-safe'
              : note.tone === 'blocked'
                ? 'text-blocked'
                : 'text-risk'
          }`}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <WithState label="Loading invoices">
      {({ snapshot }) => {
        const invoices = [...snapshot.invoices].sort(
          (a, b) => ORDER[a.status] - ORDER[b.status] || a.dueDate.localeCompare(b.dueDate),
        );
        const open = invoices.filter((i) => i.status !== 'PAID');
        const paid = invoices.filter((i) => i.status === 'PAID');
        const owed = open.reduce((s, i) => s + i.amountCents, 0);
        const overdue = invoices.filter((i) => i.status === 'OVERDUE');
        const overdueTotal = overdue.reduce((s, i) => s + i.amountCents, 0);
        const paidTotal = paid.reduce((s, i) => s + i.amountCents, 0);

        return (
          <Page>
            <PageHeader
              title="Invoices & Receivables"
              meta={
                <>
                  {overdue.length > 0 && (
                    <StatusPill label={`${overdue.length} overdue`} tone="risk" />
                  )}
                  <span>
                    {open.length} open · {paid.length} collected
                  </span>
                </>
              }
              aside={<Figure label="Open receivables" value={formatCentsToUSD(owed)} />}
            >
              Money customers owe. Collections use PayPal Invoicing v2; AI drafts payment
              reminders only for your approval.
            </PageHeader>

            {/* Summary KPI Strip */}
            <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-rule bg-panel p-3.5">
                <dt className="text-xs text-ink-2">Total Open</dt>
                <dd className="money mt-1 text-lg font-semibold text-ink">
                  {formatCentsToUSD(owed)}
                </dd>
                <p className="mt-0.5 text-xs text-ink-2">{open.length} open invoices</p>
              </div>
              <div
                className={`rounded-xl border p-3.5 ${
                  overdue.length > 0
                    ? 'border-risk/40 bg-risk-field/40'
                    : 'border-rule bg-panel'
                }`}
              >
                <dt className="text-xs text-ink-2">Overdue (Excluded from Runway)</dt>
                <dd
                  className={`money mt-1 text-lg font-semibold ${
                    overdue.length > 0 ? 'text-risk' : 'text-ink'
                  }`}
                >
                  {formatCentsToUSD(overdueTotal)}
                </dd>
                <p className="mt-0.5 text-xs text-ink-2">
                  {overdue.length > 0
                    ? `${overdue.length} invoice needing collection`
                    : 'Zero overdue invoices'}
                </p>
              </div>
              <div className="rounded-xl border border-safe/35 bg-safe-field/35 p-3.5">
                <dt className="text-xs text-ink-2">Collected</dt>
                <dd className="money mt-1 text-lg font-semibold text-safe">
                  {formatCentsToUSD(paidTotal)}
                </dd>
                <p className="mt-0.5 text-xs text-ink-2">{paid.length} settled invoices</p>
              </div>
            </dl>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-2">
                Select an invoice to draft an AI reminder, send via PayPal, or record collection.
              </p>
              <SyncButton enabled={snapshot.capabilities.paypalSandboxEnabled} />
            </div>

            {/* Desktop/Tablet Table */}
            <div className="mt-4 hidden overflow-x-auto rounded-xl border border-rule bg-panel md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rule bg-paper/70 text-left text-xs font-medium text-ink-2">
                    <th scope="col" className="px-4 py-3">
                      Customer &amp; Description
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Invoice &amp; Due
                    </th>
                    <th scope="col" className="px-4 py-3">
                      PayPal Link
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Amount
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {invoices.map((invoice) => {
                    const status = invoiceStatus(invoice);
                    return (
                      <tr key={invoice.id} className="transition-colors hover:bg-paper/60">
                        <td className="px-4 py-3.5">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="font-semibold text-ink no-underline hover:underline"
                          >
                            {invoice.customerName}
                          </Link>
                          <p className="mt-0.5 text-xs text-ink-2">{invoice.description}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs text-ink-2">
                          <span className="mono font-medium text-ink">{invoice.invoiceNumber}</span>
                          <span className="block">{formatDate(invoice.dueDate, { year: true })}</span>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          {invoice.paypalInvoiceId ? (
                            <span className="inline-flex items-center gap-1 rounded border border-focus/30 bg-focus/10 px-2 py-0.5 font-mono text-focus">
                              Synced
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </span>
                          ) : (
                            <span className="text-ink-3">Not sent yet</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <StatusPill label={status.label} tone={status.tone} />
                        </td>
                        <td
                          className={`money whitespace-nowrap px-4 py-3.5 text-right font-semibold ${
                            invoice.status === 'PAID' ? 'text-safe' : 'text-ink'
                          }`}
                        >
                          {formatCentsToUSD(invoice.amountCents)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className={
                              invoice.status === 'OVERDUE' ? btn.small : btn.quiet
                            }
                          >
                            {invoice.status === 'OVERDUE'
                              ? 'Collect / Remind'
                              : invoice.status === 'PAID'
                                ? 'View receipt'
                                : 'Manage'}
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (<md) */}
            <ul className="mt-4 space-y-2.5 md:hidden">
              {invoices.map((invoice) => {
                const status = invoiceStatus(invoice);
                return (
                  <li key={invoice.id}>
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="block rounded-xl border border-rule bg-panel p-4 no-underline transition-colors hover:border-rule-strong"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {invoice.customerName}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-ink-2">
                            {invoice.invoiceNumber} · Due {formatDate(invoice.dueDate, { year: false })}
                          </p>
                        </div>
                        <p
                          className={`money shrink-0 text-sm font-bold ${
                            invoice.status === 'PAID' ? 'text-safe' : 'text-ink'
                          }`}
                        >
                          {formatCentsToUSD(invoice.amountCents)}
                        </p>
                      </div>
                      <p className="mt-1.5 text-xs text-ink-2">{invoice.description}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-2.5">
                        <StatusPill label={status.label} tone={status.tone} />
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-ink">
                          {invoice.status === 'OVERDUE' ? 'Collect / Remind' : 'Open details'}
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 text-xs text-ink-2">
              Overdue invoices are excluded from projected runway inflows until collected. Current
              invoices count on their scheduled due date.
            </p>
          </Page>
        );
      }}
    </WithState>
  );
}
