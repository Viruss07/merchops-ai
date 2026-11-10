'use client';

import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { WithState } from '@/components/shell/WithState';
import { useAppState } from '@/components/shell/AppState';
import { Figure, ListRow, Page, PageHeader, StatusPill, btn } from '@/components/ui/kit';
import { ApiError, getErrorMessage, syncInvoices } from '@/lib/apiClient';
import { formatCentsToUSD } from '@/lib/money';
import { invoiceStatus } from '@/lib/client/states';
import type { Invoice } from '@/types';

const ORDER: Record<Invoice['status'], number> = { OVERDUE: 0, CURRENT: 1, PAID: 2 };

function SyncButton({ enabled }: { enabled: boolean }) {
  const { setSnapshot } = useAppState();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'safe' | 'risk'; text: string } | null>(null);
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        disabled={!enabled || busy}
        title={
          enabled ? undefined : 'PayPal sandbox credentials are not configured on this server.'
        }
        onClick={async () => {
          setBusy(true);
          setNote(null);
          try {
            const res = await syncInvoices();
            setSnapshot(res.snapshot);
            setNote({ tone: 'safe', text: res.message });
          } catch (caught) {
            if (caught instanceof ApiError && caught.snapshot) setSnapshot(caught.snapshot);
            setNote({ tone: 'risk', text: getErrorMessage(caught) });
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
        {busy ? 'Checking PayPal…' : 'Check PayPal for payments'}
      </button>
      {note && (
        <p className={`text-xs ${note.tone === 'safe' ? 'text-safe' : 'text-risk'}`}>{note.text}</p>
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
        const owed = open.reduce((s, i) => s + i.amountCents, 0);
        const overdue = invoices.filter((i) => i.status === 'OVERDUE');
        return (
          <Page>
            <PageHeader
              title="Invoices"
              meta={
                <>
                  {overdue.length > 0 && (
                    <StatusPill label={`${overdue.length} overdue`} tone="risk" />
                  )}
                  <span>
                    {open.length} open · {invoices.length - open.length} collected
                  </span>
                </>
              }
              aside={<Figure label="Owed to you" value={formatCentsToUSD(owed)} />}
            >
              Money your customers owe. Collections go out as PayPal Invoicing v2 invoices; the AI
              drafts the reminder and you approve every word.
            </PageHeader>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-2">
                Open one to collect it, remind the customer, or send it to PayPal.
              </p>
              <SyncButton enabled={snapshot.capabilities.paypalSandboxEnabled} />
            </div>

            <ul className="mt-4 overflow-hidden rounded-lg border border-rule bg-panel">
              {invoices.map((invoice) => {
                const status = invoiceStatus(invoice);
                return (
                  <ListRow
                    key={invoice.id}
                    href={`/invoices/${invoice.id}`}
                    title={invoice.customerName}
                    sub={`${invoice.invoiceNumber} · ${invoice.description}`}
                    status={<StatusPill label={status.label} tone={status.tone} />}
                    amount={formatCentsToUSD(invoice.amountCents)}
                    amountTone={invoice.status === 'PAID' ? 'safe' : 'neutral'}
                  />
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-ink-3">
              Overdue invoices are left off the runway until they&apos;re paid. Current ones count
              on their due date.
            </p>
          </Page>
        );
      }}
    </WithState>
  );
}
