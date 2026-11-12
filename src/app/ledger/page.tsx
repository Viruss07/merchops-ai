'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Download, Search } from 'lucide-react';
import { WithState } from '@/components/shell/WithState';
import { Figure, Page, PageHeader, StatusPill, TONE_DOT, btn } from '@/components/ui/kit';
import { formatCentsToUSD } from '@/lib/money';
import {
  actorLabel,
  eventGroup,
  eventLabel,
  eventTone,
  formatStampParts,
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

/** Extract PayPal invoice / batch / transaction identifiers embedded in log details. */
function extractTransactionIds(details: string): string[] {
  const refs = new Set<string>();
  const invMatches = details.match(/INV2-[A-Z0-9-]+/g);
  if (invMatches) invMatches.forEach((m) => refs.add(m));

  const batchRegex = /batch(?:\s+ID)?[:\s]+([A-Z0-9_-]{6,})/gi;
  let match: RegExpExecArray | null;
  while ((match = batchRegex.exec(details)) !== null) {
    if (match[1]) refs.add(match[1]);
  }
  return Array.from(refs);
}

function outcomeBadge(log: AuditLogEntry) {
  if (log.action.includes('BLOCKED')) return { label: 'Blocked by guard', tone: 'blocked' as const };
  if (log.action.includes('FAILED')) return { label: 'Failed · 0 moved', tone: 'blocked' as const };
  if (log.action.includes('IN_FLIGHT') || log.action.includes('ACCEPTED'))
    return { label: 'In flight', tone: 'risk' as const };
  if (log.action.includes('UNKNOWN')) return { label: 'Outcome pending', tone: 'risk' as const };
  if (log.action.includes('DISBURSED')) return { label: 'Settled payout', tone: 'safe' as const };
  if (log.action.includes('PAID')) return { label: 'Settled receipt', tone: 'safe' as const };
  return { label: 'Recorded', tone: 'neutral' as const };
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
  const settled = all.filter(
    (l) => l.action.includes('DISBURSED') || l.action.includes('PAID'),
  );
  const paypalEvents = all.filter(
    (l) => !l.isSimulated && (l.actor === 'PAYPAL_WEBHOOK' || l.action.includes('PAYPAL')),
  );
  const simEvents = all.filter((l) => l.isSimulated);

  return (
    <Page>
      <PageHeader
        title="Immutable Audit Log"
        meta={
          <>
            <span>{all.length} events · append-only ledger (UTC)</span>
            {paypalEvents.length > 0 && (
              <StatusPill label={`${paypalEvents.length} PayPal Sandbox`} tone="safe" />
            )}
          </>
        }
        aside={
          <Figure
            label="Guardrail refusals"
            value={String(refused.length)}
            tone={refused.length ? 'blocked' : 'neutral'}
          />
        }
      >
        Chronological record of policy checks, merchant approvals, guardrail blocks, and PayPal
        settlement outcomes. Rows are immutable and timestamped in UTC.
      </PageHeader>

      {/* 4-Metric Summary Strip */}
      <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-rule bg-panel p-3.5">
          <dt className="text-xs text-ink-2">Total Entries</dt>
          <dd className="money mt-1 text-lg font-semibold text-ink">{all.length}</dd>
        </div>
        <div className="rounded-xl border border-safe/35 bg-safe-field/35 p-3.5">
          <dt className="text-xs text-ink-2">Settlements Completed</dt>
          <dd className="money mt-1 text-lg font-semibold text-safe">{settled.length}</dd>
        </div>
        <div
          className={`rounded-xl border p-3.5 ${
            refused.length > 0 ? 'border-blocked/40 bg-blocked-field/40' : 'border-rule bg-panel'
          }`}
        >
          <dt className="text-xs text-ink-2">Guardrail Blocks</dt>
          <dd
            className={`money mt-1 text-lg font-semibold ${
              refused.length > 0 ? 'text-blocked' : 'text-ink'
            }`}
          >
            {refused.length}
          </dd>
        </div>
        <div className="rounded-xl border border-rule bg-panel p-3.5">
          <dt className="text-xs text-ink-2">Rail Breakdown</dt>
          <dd className="money mt-1 text-sm font-semibold text-ink">
            {paypalEvents.length} PayPal · {simEvents.length} Sim
          </dd>
        </div>
      </dl>

      {snapshot.account.payoutVerification && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-focus/35 bg-focus/10 px-4 py-2.5 text-xs text-ink">
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 text-focus" aria-hidden="true" />
            Verified PayPal Batch ID:{' '}
            <span className="mono font-semibold">{snapshot.account.payoutVerification.batchId}</span>
          </span>
          <span className="mono text-ink-2">
            Verified {formatStampParts(snapshot.account.payoutVerification.verifiedAt).date}{' '}
            {formatStampParts(snapshot.account.payoutVerification.verifiedAt).time}
          </span>
        </div>
      )}

      {/* Filter + Search Toolbar */}
      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label="Filter audit events"
          className="flex flex-wrap gap-1 rounded-lg border border-rule-strong bg-panel p-1 text-sm"
        >
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              aria-pressed={group === g.key}
              onClick={() => setGroup(g.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors sm:text-sm ${
                group === g.key
                  ? 'bg-accent text-accent-ink'
                  : 'text-ink-2 hover:text-ink'
              }`}
            >
              {g.label}
              <span className={`ml-1.5 text-xs ${group === g.key ? 'opacity-75' : 'text-ink-3'}`}>
                {counts[g.key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <label className="relative flex-1 lg:w-64 lg:flex-none">
            <span className="sr-only">Search the audit log</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Vendor, invoice, PayPal ID…"
              className="w-full rounded-lg border border-rule-strong bg-panel py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus:border-focus focus:outline-none"
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
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-2" aria-live="polite">
        {shown.length === all.length
          ? `Showing all ${all.length} events, newest first.`
          : `Showing ${shown.length} of ${all.length} events.`}
      </p>

      <div className="mt-2 overflow-hidden rounded-xl border border-rule bg-panel">
        {/* Column Header on md+ */}
        {shown.length > 0 && (
          <div className="hidden border-b border-rule bg-paper/70 px-5 py-2.5 text-xs font-medium text-ink-2 md:grid md:grid-cols-[10rem_minmax(0,1fr)_11rem] md:gap-4">
            <span>Timestamp (UTC)</span>
            <span>Decision, References &amp; Actor</span>
            <span className="text-right">Outcome &amp; Amount</span>
          </div>
        )}

        {shown.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-2">
            No matching audit entries. Try another search or category filter.
          </p>
        ) : (
          <ol className="divide-y divide-rule">
            {shown.map((log) => {
              const tone = eventTone(log.action);
              const record = recordFor(log, snapshot);
              const stamp = formatStampParts(log.timestamp);
              const outcome = outcomeBadge(log);
              const txRefs = extractTransactionIds(log.details);
              const isPayPalRail =
                !log.isSimulated &&
                (log.actor === 'PAYPAL_WEBHOOK' || log.action.includes('PAYPAL'));
              const isCredit =
                log.action.includes('INVOICE_PAID') || log.action.includes('PAYMENT_RECEIVED');
              const isPayoutDebit =
                log.action.includes('DISBURSED') || log.action.includes('PAYOUT_SENT');

              return (
                <li
                  key={log.id}
                  className={`grid grid-cols-1 gap-x-4 gap-y-2.5 px-4 py-3.5 md:grid-cols-[10rem_minmax(0,1fr)_11rem] md:items-start md:px-5 ${
                    tone === 'blocked' ? 'bg-blocked-field/35' : ''
                  }`}
                >
                  {/* Timestamp */}
                  <div className="flex items-center justify-between gap-2 md:block">
                    <time
                      dateTime={log.timestamp}
                      className="mono block text-xs leading-snug text-ink-2"
                    >
                      <span className="block font-semibold text-ink">{stamp.date}</span>
                      <span className="block text-ink-2">{stamp.time}</span>
                    </time>
                    <div className="md:hidden">
                      <StatusPill label={outcome.label} tone={outcome.tone} />
                    </div>
                  </div>

                  {/* Event Decision + Details + References */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`}
                        aria-hidden="true"
                      />
                      <span
                        className={`text-sm font-semibold ${
                          tone === 'blocked' ? 'text-blocked' : 'text-ink'
                        }`}
                      >
                        {eventLabel(log.action)}
                      </span>
                      {log.isSimulated ? (
                        <span className="rounded border border-rule-strong bg-paper px-2 py-0.5 text-xs font-medium text-ink-2">
                          Simulated
                        </span>
                      ) : isPayPalRail ? (
                        <span className="rounded border border-focus/35 bg-focus/10 px-2 py-0.5 text-xs font-medium text-focus">
                          PayPal Sandbox
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 break-words text-xs leading-relaxed text-ink-2">
                      {log.details}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded border border-rule bg-paper px-2 py-0.5 text-ink-2">
                        Actor: <strong className="font-medium text-ink">{actorLabel(log.actor)}</strong>
                      </span>
                      {record && (
                        <Link
                          href={record.href}
                          className="mono rounded border border-rule-strong bg-paper px-2 py-0.5 font-medium text-ink no-underline hover:border-ink"
                        >
                          {record.label}
                        </Link>
                      )}
                      {txRefs.map((refId) => (
                        <span
                          key={refId}
                          className="mono rounded border border-focus/30 bg-focus/10 px-2 py-0.5 text-focus"
                        >
                          Ref: {refId}
                        </span>
                      ))}
                      <span className="mono text-ink-3" title="Immutable audit entry ID">
                        ID: {log.id}
                      </span>
                    </div>
                  </div>

                  {/* Settlement Outcome & Amount */}
                  <div className="flex items-center justify-between gap-2 border-t border-rule/60 pt-2 md:block md:border-t-0 md:pt-0 md:text-right">
                    <div className="hidden md:flex md:justify-end">
                      <StatusPill label={outcome.label} tone={outcome.tone} />
                    </div>
                    {typeof log.amountCents === 'number' ? (
                      <p
                        className={`money text-sm font-bold md:mt-1.5 ${
                          tone === 'blocked'
                            ? 'text-blocked'
                            : isCredit
                              ? 'text-safe'
                              : 'text-ink'
                        }`}
                      >
                        {isCredit ? '+' : isPayoutDebit ? '−' : ''}
                        {formatCentsToUSD(log.amountCents)}
                      </p>
                    ) : (
                      <p className="text-xs text-ink-3 md:mt-1.5">No cash movement</p>
                    )}
                    <span className="text-xs text-ink-2 md:hidden">
                      {record ? (
                        <Link href={record.href} className="mono underline">
                          Open {record.label}
                        </Link>
                      ) : null}
                    </span>
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
    <WithState label="Loading the audit log">
      {({ snapshot }) => <Ledger snapshot={snapshot} />}
    </WithState>
  );
}
