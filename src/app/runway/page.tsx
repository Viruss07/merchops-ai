'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { WithState } from '@/components/shell/WithState';
import { RunwayCard } from '@/components/runway/RunwayCard';
import { Figure, Page, PageHeader, Section, StatusPill, btn } from '@/components/ui/kit';
import { formatCentsToUSD } from '@/lib/money';
import { dayOnRunway, formatDate, isOpenBill } from '@/lib/client/states';
import type { RunwayForecast, StateSnapshot } from '@/types';

type Landing = {
  key: string;
  day: number;
  date: string;
  href: string;
  who: string;
  what: string;
  amountCents: number;
  direction: 'in' | 'out';
  counted: boolean;
};

/** Everything that lands on the runway, in day order, each a link to the record it comes from. */
function landings(snapshot: StateSnapshot): Landing[] {
  const asOf = snapshot.demoConfig.asOfDate;
  const rows: Landing[] = [];
  for (const invoice of snapshot.invoices) {
    if (invoice.status === 'PAID') continue;
    const day = Math.max(1, dayOnRunway(asOf, invoice.dueDate));
    rows.push({
      key: invoice.id,
      day,
      date: invoice.dueDate,
      href: `/invoices/${invoice.id}`,
      who: invoice.customerName,
      what:
        invoice.status === 'OVERDUE'
          ? `${invoice.invoiceNumber} · overdue, not counted until it's paid`
          : `${invoice.invoiceNumber} · expected on its due date`,
      amountCents: invoice.amountCents,
      direction: 'in',
      counted: invoice.status === 'CURRENT',
    });
  }
  for (const bill of snapshot.bills.filter(isOpenBill)) {
    rows.push({
      key: bill.id,
      day: Math.max(1, dayOnRunway(asOf, bill.dueDate)),
      date: bill.dueDate,
      href: `/bills/${bill.id}`,
      who: bill.vendorName,
      what: `${bill.billNumber} · ${bill.status === 'IN_FLIGHT' ? 'in flight, reserved' : 'due'}`,
      amountCents: bill.amountCents,
      direction: 'out',
      counted: true,
    });
  }
  return rows.sort((a, b) => a.day - b.day || a.key.localeCompare(b.key));
}

function Verdict({ snapshot, forecast }: { snapshot: StateSnapshot; forecast: RunwayForecast }) {
  const deficit = forecast.firstBreachDeficitCents ?? forecast.breachDeficitCents ?? 0;
  const breachBill = snapshot.bills.find((b) => isOpenBill(b) && b.dueDate === forecast.breachDate);
  const overdue = snapshot.invoices.filter((i) => i.status === 'OVERDUE');
  const overdueTotal = overdue.reduce((sum, i) => sum + i.amountCents, 0);

  if (!forecast.hasReserveBreach) {
    return (
      <Section
        id="verdict"
        tone="safe"
        title="The reserve holds"
        description={`The lowest the balance gets in the next ${forecast.days.length} days is ${formatCentsToUSD(forecast.minBalanceCents)}, ${formatCentsToUSD(forecast.minBalanceCents - snapshot.account.minReserveCents)} above the reserve.`}
      >
        <Link href="/bills" className={btn.secondary}>
          See what you can pay
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Section>
    );
  }

  return (
    <section
      aria-labelledby="verdict-h"
      className="rounded-lg border border-blocked/40 bg-blocked-field/60 p-4 shadow-card sm:p-5"
    >
      <h2 id="verdict-h" className="text-sm font-medium text-ink-2">
        The reserve is crossed on Day {forecast.firstBreachDay}
      </h2>
      <p className="money mt-1 text-3xl font-semibold text-blocked">−{formatCentsToUSD(deficit)}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        {breachBill ? (
          <>
            <Link href={`/bills/${breachBill.id}`} className="font-medium text-ink underline">
              {breachBill.vendorName}
            </Link>{' '}
            ({formatCentsToUSD(breachBill.amountCents)}) lands on {formatDate(breachBill.dueDate)}{' '}
            and takes the balance under the {formatCentsToUSD(snapshot.account.minReserveCents)}{' '}
            reserve.
          </>
        ) : (
          <>
            The balance goes under the {formatCentsToUSD(snapshot.account.minReserveCents)} reserve.
          </>
        )}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {overdue[0] && (
          <Link href={`/invoices/${overdue[0].id}`} className={btn.primary}>
            Collect {formatCentsToUSD(overdueTotal)} overdue
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
        <Link href="/plans" className={btn.secondary}>
          Ask the AI for a plan
        </Link>
      </div>
      {overdue.length > 0 && (
        <p className="mt-3 text-xs text-ink-3">
          Overdue invoices aren&apos;t counted on the runway until they&apos;re paid, so the
          forecast never leans on money that is late.
        </p>
      )}
    </section>
  );
}

function DayTable({ forecast, floorCents }: { forecast: RunwayForecast; floorCents: number }) {
  const [open, setOpen] = useState(false);
  const moving = forecast.days.filter((d) => d.inflowCents || d.outflowCents);
  const rows = open ? forecast.days : moving;
  return (
    <Section
      id="days"
      title="Day by day"
      description={`Balance(d) = Balance(d−1) + in − out, in integer cents. ${open ? 'All days.' : 'Only the days cash moves.'}`}
      action={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={btn.small}
        >
          {open ? 'Only days that move' : `All ${forecast.days.length} days`}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      }
    >
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs text-ink-3">
              <th scope="col" className="py-2 pl-4 pr-3 font-normal sm:pl-0">
                Day
              </th>
              <th scope="col" className="py-2 pr-3 font-normal">
                What lands
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-normal">
                In
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-normal">
                Out
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-normal sm:pr-0">
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((day) => {
              const below = day.endingBalanceCents < floorCents;
              return (
                <tr
                  key={day.dayNumber}
                  className={`border-b border-rule last:border-0 ${below ? 'bg-blocked-field/40' : ''}`}
                >
                  <td className="whitespace-nowrap py-2 pl-4 pr-3 sm:pl-0">
                    <span className="font-medium">Day {day.dayNumber}</span>
                    <span className="block text-xs text-ink-3">
                      {formatDate(day.date, { year: false })}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-ink-2">{day.notes ?? '—'}</td>
                  <td className="money whitespace-nowrap py-2 pr-3 text-right text-safe">
                    {day.inflowCents ? `+${formatCentsToUSD(day.inflowCents)}` : ''}
                  </td>
                  <td className="money whitespace-nowrap py-2 pr-3 text-right text-ink">
                    {day.outflowCents ? `−${formatCentsToUSD(day.outflowCents)}` : ''}
                  </td>
                  <td
                    className={`money whitespace-nowrap py-2 pr-4 text-right font-semibold sm:pr-0 ${below ? 'text-blocked' : 'text-ink'}`}
                  >
                    {formatCentsToUSD(day.endingBalanceCents)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export default function RunwayPage() {
  return (
    <WithState label="Loading the runway">
      {({ snapshot, forecast }) => {
        const floor = snapshot.account.minReserveCents;
        const rows = landings(snapshot);
        return (
          <Page>
            <PageHeader
              title="Cash forecast"
              meta={
                <>
                  <StatusPill
                    label={
                      forecast.hasReserveBreach
                        ? `Reserve crossed · Day ${forecast.firstBreachDay}`
                        : 'Above the reserve'
                    }
                    tone={forecast.hasReserveBreach ? 'blocked' : 'safe'}
                  />
                  <span>
                    Next {forecast.days.length} days from {formatDate(snapshot.demoConfig.asOfDate)}
                  </span>
                </>
              }
              aside={
                <Figure
                  label="Ends the month at"
                  value={formatCentsToUSD(forecast.projectedEndingBalanceCents)}
                />
              }
            />

            <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0 space-y-5">
                <RunwayCard
                  forecast={forecast}
                  floorCents={floor}
                  clearedCents={snapshot.account.clearedBalanceCents}
                  asOf={snapshot.demoConfig.asOfDate}
                  size="hero"
                  caption="Deterministic forecast in integer cents. No model does any arithmetic."
                />
                <div className="lg:hidden">
                  <Verdict snapshot={snapshot} forecast={forecast} />
                </div>

                <Section
                  id="lands"
                  title="What lands on the runway"
                  description="Every open invoice and bill, on the day it moves cash. Open one to act on it."
                >
                  <ol className="-mx-4 sm:-mx-5">
                    {rows.map((row) => (
                      <li key={row.key} className="border-t border-rule first:border-t-0">
                        <Link
                          href={row.href}
                          className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 no-underline transition-colors hover:bg-paper sm:px-5"
                        >
                          <span className="text-xs text-ink-3">
                            <span className="block font-medium text-ink">Day {row.day}</span>
                            {formatDate(row.date, { year: false })}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink">
                              {row.who}
                            </span>
                            <span className="block truncate text-xs text-ink-3">{row.what}</span>
                          </span>
                          <span
                            className={`money text-right text-sm font-semibold ${
                              row.direction === 'in'
                                ? row.counted
                                  ? 'text-safe'
                                  : 'text-ink-3'
                                : 'text-ink'
                            }`}
                          >
                            {row.direction === 'in' ? '+' : '−'}
                            {formatCentsToUSD(row.amountCents)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </Section>

                <DayTable forecast={forecast} floorCents={floor} />
              </div>

              <aside className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:self-start">
                <div className="hidden lg:block">
                  <Verdict snapshot={snapshot} forecast={forecast} />
                </div>
                <dl className="rounded-lg border border-rule bg-panel px-4 py-2 text-sm">
                  {[
                    ['Cleared today', formatCentsToUSD(snapshot.account.clearedBalanceCents)],
                    ['Safety reserve', formatCentsToUSD(floor)],
                    [
                      'Expected in',
                      formatCentsToUSD(
                        rows
                          .filter((r) => r.direction === 'in' && r.counted)
                          .reduce((s, r) => s + r.amountCents, 0),
                      ),
                    ],
                    [
                      'Due out',
                      formatCentsToUSD(
                        rows
                          .filter((r) => r.direction === 'out')
                          .reduce((s, r) => s + r.amountCents, 0),
                      ),
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-baseline justify-between border-t border-rule py-2 first:border-t-0"
                    >
                      <dt className="text-ink-2">{label}</dt>
                      <dd className="money font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs leading-relaxed text-ink-3">
                  The reserve is a rule, not a target: the payout guard refuses any payment that would
                  leave less than {formatCentsToUSD(floor)}, PayPal&apos;s fee included.
                </p>
              </aside>
            </div>
          </Page>
        );
      }}
    </WithState>
  );
}
