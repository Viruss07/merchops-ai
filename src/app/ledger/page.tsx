'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Search } from 'lucide-react';
import { WithState } from '@/components/shell/WithState';
import { Figure, Page, PageHeader, TONE_DOT, btn } from '@/components/ui/kit';
import { formatCentsToUSD } from '@/lib/money';
import {
  actorLabel,
  eventGroup,
  eventLabel,
  eventTone,
  formatStamp,
  newestFirst,
  type EventGroup,
} from '@/lib/client/states';
import type { AuditLogEntry, StateSnapshot } from '@/types';

const GROUPS: { key: 'all' | EventGroup; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'payouts', label: 'Payouts' },
  { key: 'collections', label: 'Collections' },
  { key: 'guardrails', label: 'Guardrails' },
  { key: 'system', label: 'System' },
];

/** The invoice or bill a ledger row is about, found by the number its details name. */
function recordFor(log: AuditLogEntry, snapshot: StateSnapshot) {
  const invoice = snapshot.invoices.find((i) => log.details.includes(i.invoiceNumber));
  if (invoice) return { href: `/invoices/${invoice.id}`, label: invoice.invoiceNumber };
  const bill = snapshot.bills.find((b) => log.details.includes(b.billNumber));
  if (bill) return { href: `/bills/${bill.id}`, label: bill.billNumber };
  return null;
}

function csv(logs: AuditLogEntry[]): string {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = logs.map((l) =>
    [
      l.timestamp,
      l.id,
      l.actor,
      l.action,
      typeof l.amountCents === 'number' ? (l.amountCents / 100).toFixed(2) : '',
      l.isSimulated ? 'yes' : 'no',
      l.details,
    ]
      .map((v) => cell(String(v)))
      .join(','),
  );
  return ['timestamp,id,actor,event,amount_usd,simulated,details', ...rows].join('\n');
}

function Ledger({ snapshot }: { snapshot: StateSnapshot }) {
  const [group, setGroup] = useState<'all' | EventGroup>('all');
  const [query, setQuery] = useState('');
  const all = useMemo(() => newestFirst(snapshot.auditLogs), [snapshot.auditLogs]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    for (const log of all) c[eventGroup(log.action)] = (c[eventGroup(log.action)] ?? 0) + 1;
    return c;
  }, [all]);
  const shown = all.filter((log) => {
    if (group !== 'all' && eventGroup(log.action) !== group) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return [log.details, eventLabel(log.action), log.action, actorLabel(log.actor), log.id].some(
      (v) => v.toLowerCase().includes(q),
    );
  });
  const refused = all.filter((l) => l.action.includes('BLOCKED'));

  return (
    <Page>
      <PageHeader
        title="Ledger"
        meta={<span>{all.length} events · append-only, no edits or deletes</span>}
        aside={
          <Figure
            label="Refused by the rules"
            value={String(refused.length)}
            tone={refused.length ? 'blocked' : 'neutral'}
          />
        }
      >
        Every decision MerchOps made or you approved, including the payouts the floor refused. The
        database rejects updates and deletes on this table.
      </PageHeader>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label="Show"
          className="flex flex-wrap gap-1 rounded-md border border-rule-strong bg-panel p-0.5 text-sm"
        >
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              aria-pressed={group === g.key}
              onClick={() => setGroup(g.key)}
              className={`rounded px-2.5 py-1 transition-colors ${group === g.key ? 'bg-accent text-accent-ink' : 'text-ink-2 hover:text-ink'}`}
            >
              {g.label}
              <span className={`ml-1.5 text-xs ${group === g.key ? 'opacity-70' : 'text-ink-3'}`}>
                {counts[g.key] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="relative flex-1 lg:w-64 lg:flex-none">
            <span className="sr-only">Search the ledger</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Vendor, invoice, PayPal id…"
              className="w-full rounded-md border border-rule-strong bg-panel py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:border-focus focus:outline-none"
            />
          </label>
          <button
            type="button"
            className={btn.secondary}
            onClick={() => {
              const url = URL.createObjectURL(new Blob([csv(shown)], { type: 'text/csv' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = 'merchops-ledger.csv';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Download CSV</span>
          </button>
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-3" aria-live="polite">
        {shown.length === all.length
          ? `All ${all.length} events, newest first.`
          : `${shown.length} of ${all.length} events shown.`}
      </p>

      <div className="mt-2 overflow-hidden rounded-lg border border-rule bg-panel">
        {shown.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-3">
            Nothing matches. Try another filter.
          </p>
        ) : (
          <ol>
            {shown.map((log) => {
              const tone = eventTone(log.action);
              const record = recordFor(log, snapshot);
              return (
                <li
                  key={log.id}
                  className={`grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-rule px-4 py-3 first:border-t-0 sm:grid-cols-[8rem_minmax(0,1fr)_8rem] sm:px-5 ${
                    tone === 'blocked' ? 'bg-blocked-field/40' : ''
                  }`}
                >
                  <time
                    dateTime={log.timestamp}
                    className="mono col-span-2 text-xs text-ink-3 sm:col-span-1 sm:pt-0.5"
                  >
                    {formatStamp(log.timestamp)}
                  </time>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`}
                        aria-hidden="true"
                      />
                      <span
                        className={
                          tone === 'blocked' ? 'font-medium text-blocked' : 'font-medium text-ink'
                        }
                      >
                        {eventLabel(log.action)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{log.details}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-3">
                      <span>{actorLabel(log.actor)}</span>
                      {log.isSimulated && <span>simulated</span>}
                      <span className="mono">{log.id}</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right sm:pt-0.5">
                    {typeof log.amountCents === 'number' && (
                      <span className="money text-sm font-medium text-ink">
                        {formatCentsToUSD(log.amountCents)}
                      </span>
                    )}
                    {record && (
                      <Link
                        href={record.href}
                        className="mono text-xs text-ink-2 underline decoration-rule-strong hover:text-ink"
                      >
                        {record.label}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Page>
  );
}

export default function LedgerPage() {
  return (
    <WithState label="Loading the ledger">
      {({ snapshot }) => <Ledger snapshot={snapshot} />}
    </WithState>
  );
}
