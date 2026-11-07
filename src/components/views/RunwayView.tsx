'use client';

import React, { useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp, Layers, ShieldAlert, ShieldCheck } from 'lucide-react';
import { formatCentsToUSD } from '@/lib/money';
import { calculateRunway } from '@/lib/runway';
import type { Bill, Invoice, MerchantAccount } from '@/types';
import { RunwayInstrument } from '@/components/runway/RunwayInstrument';

interface RunwayViewProps {
  account: MerchantAccount;
  invoices: Invoice[];
  bills: Bill[];
  asOfDate: string;
  forecastDays: number;
  onNavigateToCollections: () => void;
  onNavigateToPayouts: () => void;
}

const ACTIVE_BILL_STATUSES: Bill['status'][] = ['PENDING', 'APPROVED', 'IN_FLIGHT'];

export function RunwayView({
  account,
  invoices,
  bills,
  asOfDate,
  forecastDays,
  onNavigateToCollections,
  onNavigateToPayouts,
}: RunwayViewProps) {
  const [showFullTable, setShowFullTable] = useState(false);

  const forecast = calculateRunway({
    clearedBalanceCents: account.clearedBalanceCents,
    minReserveCents: account.minReserveCents,
    invoices,
    bills,
    startDate: asOfDate,
    horizonDays: forecastDays,
  });

  const days = forecast.days;
  const firstBreachDay = forecast.firstBreachDay;
  const firstBreachDeficit = forecast.firstBreachDeficitCents ?? forecast.breachDeficitCents ?? 0;
  const minBalance = forecast.minBalanceCents;
  const projectedEnding = forecast.projectedEndingBalanceCents;

  const breachBill = forecast.breachDate
    ? bills.find(
        (bill) =>
          ACTIVE_BILL_STATUSES.includes(bill.status) && bill.dueDate === forecast.breachDate,
      )
    : undefined;

  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'OVERDUE');
  const overdueTotalCents = overdueInvoices.reduce(
    (total, invoice) => total + invoice.amountCents,
    0,
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="rounded-lg border border-rule bg-panel p-4 shadow-sm sm:p-5 lg:col-span-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">30-day runway</h2>
            <span className="mono text-[11px] text-ink-3">as of {asOfDate}</span>
          </div>

          <RunwayInstrument
            className="mt-4"
            days={days}
            floorCents={account.minReserveCents}
            openingBalanceCents={account.clearedBalanceCents}
            minBalanceCents={minBalance}
            firstBreachDay={firstBreachDay}
            firstBreachDeficitCents={firstBreachDeficit}
            size="detail"
            stamp={
              forecast.hasReserveBreach
                ? {
                    label: 'Below the floor',
                    value: `−${formatCentsToUSD(firstBreachDeficit)}`,
                  }
                : null
            }
          />

          <div className="mt-4 grid grid-cols-3 divide-x divide-rule border-t border-rule pt-3">
            <div className="px-3 first:pl-0">
              <p className="text-[10px] text-ink-3">Cleared</p>
              <p className="money mt-0.5 text-sm font-semibold">
                {formatCentsToUSD(account.clearedBalanceCents)}
              </p>
            </div>
            <div className="px-3">
              <p className="text-[10px] text-ink-3">Floor</p>
              <p className="money mt-0.5 text-sm font-semibold">
                {formatCentsToUSD(account.minReserveCents)}
              </p>
            </div>
            <div className="px-3 last:pr-0">
              <p className="text-[10px] text-ink-3">
                {firstBreachDay !== undefined ? `Lowest · Day ${firstBreachDay}` : 'Lowest'}
              </p>
              <p
                className={`money mt-0.5 text-sm font-semibold ${
                  forecast.hasReserveBreach ? 'text-blocked' : 'text-safe'
                }`}
              >
                {formatCentsToUSD(minBalance)}
              </p>
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-rule bg-panel p-4 shadow-sm sm:p-5 lg:col-span-4">
          <div className="flex items-center gap-2">
            {forecast.hasReserveBreach ? (
              <ShieldAlert className="h-4 w-4 text-blocked" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-safe" aria-hidden="true" />
            )}
            <p className="text-xs font-semibold">
              {forecast.hasReserveBreach ? 'The floor is crossed' : 'The floor holds'}
            </p>
          </div>

          {forecast.hasReserveBreach ? (
            <>
              <p className="money mt-3 text-3xl font-semibold tracking-tight text-blocked">
                −{formatCentsToUSD(firstBreachDeficit)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">
                {breachBill ? (
                  <>
                    <strong className="font-medium text-ink">{breachBill.vendorName}</strong> (
                    {formatCentsToUSD(breachBill.amountCents)}) lands on {breachBill.dueDate} and
                    crosses the {formatCentsToUSD(account.minReserveCents)} floor on Day{' '}
                    {firstBreachDay}.
                  </>
                ) : (
                  <>
                    Projected cash reaches {formatCentsToUSD(minBalance)}, below the{' '}
                    {formatCentsToUSD(account.minReserveCents)} floor, on Day {firstBreachDay}.
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <p className="money mt-3 text-3xl font-semibold tracking-tight text-safe">
                +{formatCentsToUSD(minBalance - account.minReserveCents)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">
                The lowest projected balance is {formatCentsToUSD(minBalance)}, above the{' '}
                {formatCentsToUSD(account.minReserveCents)} floor. Projected ending cash is{' '}
                {formatCentsToUSD(projectedEnding)}.
              </p>
            </>
          )}

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={onNavigateToCollections}
              className="inline-flex w-full items-center justify-between gap-2 rounded-md bg-ink px-3.5 py-2.5 text-sm font-medium text-paper transition-colors duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
            >
              <span>
                {overdueInvoices.length > 0
                  ? `Collect ${formatCentsToUSD(overdueTotalCents)} overdue`
                  : 'Open collections'}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onNavigateToPayouts}
              className="w-full rounded-md border border-rule-strong px-3.5 py-2.5 text-sm font-medium text-ink-2 transition-colors duration-200 hover:bg-paper hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
            >
              Review the payout guardrail
            </button>
          </div>

          {overdueInvoices.length > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
              Overdue: {overdueInvoices.map((invoice) => invoice.customerName).join(', ')} ·{' '}
              {formatCentsToUSD(overdueTotalCents)}
            </p>
          )}
        </aside>
      </div>

      <div className="rounded-lg border border-rule bg-panel p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium">Day-by-day ledger</h3>
            <p className="mt-0.5 text-xs text-ink-3">
              Deterministic projection. Integer cents. No LLM arithmetic.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowFullTable(!showFullTable)}
            aria-expanded={showFullTable}
            aria-controls="runway-ledger-table"
            className="inline-flex items-center gap-1.5 self-start rounded-sm text-xs font-medium text-ink-2 transition-colors duration-200 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-panel sm:self-auto"
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            {showFullTable ? 'Hide ledger' : 'Show ledger'}
            {showFullTable ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {showFullTable && (
          <div
            id="runway-ledger-table"
            className="mt-4 overflow-x-auto rounded-md border border-rule"
          >
            <table className="mono min-w-full divide-y divide-rule text-[11px]">
              <thead className="bg-paper text-ink-3">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Day</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Start</th>
                  <th className="px-3 py-2 text-right font-medium">In</th>
                  <th className="px-3 py-2 text-right font-medium">Out</th>
                  <th className="px-3 py-2 text-right font-medium">End</th>
                  <th className="px-3 py-2 text-center font-medium">Floor</th>
                  <th className="px-3 py-2 text-left font-medium">Event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule bg-panel">
                {days.map((day) => (
                  <tr key={day.dayNumber} className={day.breachesReserve ? 'bg-blocked-field' : ''}>
                    <td className="px-3 py-2 font-medium">D{day.dayNumber}</td>
                    <td className="px-3 py-2 text-ink-3">{day.date}</td>
                    <td className="px-3 py-2 text-right text-ink-2">
                      {formatCentsToUSD(day.startingBalanceCents)}
                    </td>
                    <td className="px-3 py-2 text-right text-safe">
                      {day.inflowCents > 0 ? `+${formatCentsToUSD(day.inflowCents)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-blocked">
                      {day.outflowCents > 0 ? `−${formatCentsToUSD(day.outflowCents)}` : '—'}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-semibold ${
                        day.breachesReserve ? 'text-blocked' : 'text-ink'
                      }`}
                    >
                      {formatCentsToUSD(day.endingBalanceCents)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {day.breachesReserve ? (
                        <span className="text-blocked">
                          −{formatCentsToUSD(account.minReserveCents - day.endingBalanceCents)}
                        </span>
                      ) : (
                        <span className="text-safe">OK</span>
                      )}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-ink-2">{day.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
