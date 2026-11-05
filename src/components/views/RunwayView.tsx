'use client';

import React, { useState } from 'react';
import {
  TrendingDown,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { formatCentsToUSD } from '@/lib/money';
import { calculateRunway } from '@/lib/runway';
import type { Bill, Invoice, MerchantAccount } from '@/types';

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
  const horizon = days.length;
  const firstBreachDay = forecast.firstBreachDay;
  const firstBreachDeficit =
    forecast.firstBreachDeficitCents ?? forecast.breachDeficitCents ?? 0;
  const minBalance = forecast.minBalanceCents;
  const projectedEnding = forecast.projectedEndingBalanceCents;

  const minDay =
    days.length > 0
      ? days.reduce(
          (lowest, day) =>
            day.endingBalanceCents < lowest.endingBalanceCents ? day : lowest,
          days[0],
        )
      : undefined;

  const breachBill =
    forecast.breachDate !== undefined
      ? bills.find(
          (bill) =>
            ACTIVE_BILL_STATUSES.includes(bill.status) &&
            bill.dueDate === forecast.breachDate,
        )
      : undefined;

  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'OVERDUE');
  const overdueTotalCents = overdueInvoices.reduce(
    (total, invoice) => total + invoice.amountCents,
    0,
  );
  const overdueNames = overdueInvoices.map((invoice) => invoice.customerName).join(', ');

  const balances = days.map((day) => day.endingBalanceCents);
  const maxBalance = Math.max(
    account.clearedBalanceCents,
    account.minReserveCents * 1.5,
    ...balances,
    1,
  );

  const CHART_HEIGHT_PX = 160;
  const reserveBottomPx = Math.round(
    Math.min(1, account.minReserveCents / maxBalance) * CHART_HEIGHT_PX,
  );

  const breachDayLabel =
    firstBreachDay === undefined
      ? ''
      : firstBreachDay === 0
        ? 'Opening balance below reserve'
        : `Day ${firstBreachDay}${forecast.breachDate ? ` (${forecast.breachDate})` : ''}`;

  const minDayLabel = minDay
    ? `Day ${minDay.dayNumber} (${minDay.date})`
    : `the next ${horizon} days`;

  return (
    <div className="space-y-6">
      {/* Dynamic Reserve Breach Alert */}
      {forecast.hasReserveBreach ? (
        <div className="rounded-2xl border-2 border-rose-300 bg-gradient-to-r from-rose-50 via-red-50 to-amber-50 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start space-x-4">
              <div className="rounded-xl bg-rose-600 p-3 text-white shadow-md shadow-rose-600/30">
                <ShieldAlert className="h-7 w-7" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-900 uppercase tracking-wide">
                    Reserve Breach Predicted
                  </span>
                  <span className="text-xs font-mono font-semibold text-rose-800">
                    {breachDayLabel}
                  </span>
                </div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  Projected Cash Shortfall of {formatCentsToUSD(firstBreachDeficit)}
                </h3>
                <p className="mt-1 text-sm text-slate-700 max-w-2xl">
                  {breachBill ? (
                    <>
                      Scheduled vendor bill{' '}
                      <span className="font-semibold text-slate-900">{breachBill.vendorName}</span>{' '}
                      ({formatCentsToUSD(breachBill.amountCents)}) lands on the breach date.{' '}
                    </>
                  ) : (
                    <>Scheduled outflows drive cash below the floor.{' '}</>
                  )}
                  Cash is projected to reach a minimum of{' '}
                  <span className="font-bold text-rose-700">{formatCentsToUSD(minBalance)}</span>,
                  breaching the {formatCentsToUSD(account.minReserveCents)} minimum reserve floor by{' '}
                  <span className="font-bold text-rose-700">
                    {formatCentsToUSD(firstBreachDeficit)}
                  </span>
                  .
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row md:flex-col items-end gap-2 shrink-0">
              <button
                type="button"
                onClick={onNavigateToCollections}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-700/20 hover:bg-rose-800 transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
              >
                <span>Collect Overdue Invoice</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onNavigateToPayouts}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-50 transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
              >
                <span>Review Payout Guardrails</span>
              </button>
              <span className="text-xs text-slate-600 text-right">
                {overdueInvoices.length > 0
                  ? `${overdueNames} — ${formatCentsToUSD(overdueTotalCents)} overdue`
                  : 'No overdue invoices remain'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="rounded-xl bg-emerald-600 p-3 text-white shadow-md shadow-emerald-600/20">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div>
                <span className="rounded-full bg-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-900 uppercase tracking-wide">
                  Reserves Guarded & Healthy
                </span>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  {horizon}-Day Working Capital Trajectory Secured
                </h3>
                <p className="mt-0.5 text-sm text-slate-700">
                  Projected ending balance of{' '}
                  <span className="font-semibold text-slate-900">
                    {formatCentsToUSD(projectedEnding)}
                  </span>
                  ; the projected minimum balance of{' '}
                  <span className="font-semibold text-slate-900">
                    {formatCentsToUSD(minBalance)}
                  </span>{' '}
                  stays above the {formatCentsToUSD(account.minReserveCents)} safety reserve buffer.
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-flex rounded-xl bg-white/80 border border-emerald-200 px-3 py-1.5 text-xs font-mono font-bold text-emerald-800">
              +{formatCentsToUSD(minBalance - account.minReserveCents)} Min Buffer
            </span>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Current Cleared Cash
          </span>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {formatCentsToUSD(account.clearedBalanceCents)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Demo ledger balance (in-memory)</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Safety Reserve Floor
          </span>
          <div className="mt-2 text-2xl font-bold font-mono text-indigo-700">
            {formatCentsToUSD(account.minReserveCents)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Protected working capital reserve</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Projected Ending Balance
          </span>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {formatCentsToUSD(projectedEnding)}
          </div>
          <p className="mt-1 text-xs text-slate-500">End of the {horizon}-day horizon</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Projected Minimum Balance
          </span>
          <div
            className={`mt-2 flex items-center space-x-2 text-2xl font-bold font-mono ${
              minBalance < account.minReserveCents ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            <TrendingDown className="h-5 w-5 shrink-0" />
            <span>{formatCentsToUSD(minBalance)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {minBalance < account.minReserveCents
              ? `Below reserve by ${formatCentsToUSD(account.minReserveCents - minBalance)}`
              : `On ${minDayLabel}, above reserve`}
          </p>
        </div>
      </div>

      {/* Visual 30-Day Trajectory Bar Chart */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <span>{horizon}-Day Projected Cash Flow Trajectory</span>
            </h3>
            <p className="text-xs text-slate-500">
              Deterministic day-by-day projection. Red bars indicate cash dipping below the{' '}
              {formatCentsToUSD(account.minReserveCents)} reserve. Negative balances are shown
              as deficit markers.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center space-x-1.5">
              <span className="h-3 w-3 rounded bg-blue-500"></span>
              <span className="text-slate-600">Safe Balance</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="h-3 w-3 rounded bg-rose-500"></span>
              <span className="text-slate-600">Reserve Breach</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="h-0.5 w-4 bg-indigo-500 border-t border-dashed"></span>
              <span className="font-semibold text-indigo-700">
                Reserve: {formatCentsToUSD(account.minReserveCents)}
              </span>
            </div>
          </div>
        </div>

        {/* Visual Chart Bars */}
        <div className="mt-6 relative pt-6 pb-2">
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-indigo-400 z-10 pointer-events-none flex justify-end"
            style={{ bottom: `${reserveBottomPx + 24}px` }}
          >
            <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded -translate-y-1/2 shadow-sm">
              Reserve Floor: {formatCentsToUSD(account.minReserveCents)}
            </span>
          </div>

          <div
            role="img"
            aria-label={`Cash balance chart across ${horizon} days. Projected minimum ${formatCentsToUSD(
              minBalance,
            )}${minDay ? ` on ${minDayLabel}` : ''}. Reserve floor ${formatCentsToUSD(
              account.minReserveCents,
            )}.`}
            className="grid grid-cols-30 gap-1 sm:gap-1.5 items-end h-[160px] border-b border-slate-200 px-1"
            style={{ gridTemplateColumns: `repeat(${Math.max(horizon, 1)}, minmax(0, 1fr))` }}
          >
            {days.map((day) => {
              const isNegative = day.endingBalanceCents < 0;
              const barHeightPx = isNegative
                ? 0
                : Math.max(2, Math.round((day.endingBalanceCents / maxBalance) * CHART_HEIGHT_PX));
              const isBreach = day.breachesReserve;
              const isBreachDay = firstBreachDay !== undefined && day.dayNumber === firstBreachDay;

              return (
                <div
                  key={day.dayNumber}
                  className="group relative flex flex-col items-center justify-end h-full"
                >
                  <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity absolute bottom-full mb-2 z-30 pointer-events-none whitespace-nowrap rounded-lg bg-slate-900 text-white text-[11px] p-2 shadow-xl">
                    <p className="font-bold">
                      Day {day.dayNumber} ({day.date})
                    </p>
                    <p>Ending: {formatCentsToUSD(day.endingBalanceCents)}</p>
                    {day.outflowCents > 0 && (
                      <p className="text-rose-300">Outflow: -{formatCentsToUSD(day.outflowCents)}</p>
                    )}
                    {day.inflowCents > 0 && (
                      <p className="text-emerald-300">Inflow: +{formatCentsToUSD(day.inflowCents)}</p>
                    )}
                    {isBreach && (
                      <p className="text-rose-400 font-bold">
                        Deficit: -{formatCentsToUSD(account.minReserveCents - day.endingBalanceCents)}
                      </p>
                    )}
                    {day.notes && <p className="text-slate-300 text-[10px] mt-1">{day.notes}</p>}
                  </div>

                  {isBreachDay && (
                    <span className="text-[10px] font-bold text-rose-700 mb-1 animate-pulse motion-reduce:animate-none">
                      ▼ {day.dayNumber}
                    </span>
                  )}

                  <div
                    style={{ height: `${barHeightPx}px` }}
                    className={`w-full min-w-[2px] rounded-t-sm transition-all duration-300 motion-reduce:transition-none ${
                      isBreach ? 'bg-rose-500 hover:bg-rose-600' : 'bg-blue-500 hover:bg-blue-600'
                    }`}
                  ></div>

                  {isNegative && (
                    <span
                      title={`Deficit: ${formatCentsToUSD(day.endingBalanceCents)} on Day ${day.dayNumber}`}
                      className="absolute bottom-0 z-20 text-[9px] font-bold text-rose-700 leading-none"
                    >
                      ▼
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div
            className="grid grid-cols-30 gap-1 sm:gap-1.5 px-1 pt-1.5 h-6"
            style={{ gridTemplateColumns: `repeat(${Math.max(horizon, 1)}, minmax(0, 1fr))` }}
          >
            {days.map((day) => (
              <div key={day.dayNumber} className="text-center">
                <span className="text-[9px] font-mono text-slate-500">
                  {day.dayNumber === 1 || day.dayNumber % 5 === 0 ? `D${day.dayNumber}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Narrative Walkthrough */}
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600 flex items-start space-x-3">
          <Sparkles className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <p>
            <span className="font-bold text-slate-900">Deterministic Engine Insight: </span>
            Opening with{' '}
            <span className="font-semibold text-slate-800">
              {formatCentsToUSD(account.clearedBalanceCents)}
            </span>
            , the forecast reaches a minimum of{' '}
            <span className="font-semibold text-slate-800">{formatCentsToUSD(minBalance)}</span> on{' '}
            {minDayLabel} and ends at{' '}
            <span className="font-semibold text-slate-800">{formatCentsToUSD(projectedEnding)}</span>.
            {forecast.hasReserveBreach ? (
              <span className="text-rose-700 font-semibold">
                {' '}
                This breaches the {formatCentsToUSD(account.minReserveCents)} reserve floor by a
                maximum of {formatCentsToUSD(firstBreachDeficit)}
                {firstBreachDay !== undefined
                  ? firstBreachDay === 0
                    ? ' at opening balances'
                    : ` starting on Day ${firstBreachDay}`
                  : ''}
                .
              </span>
            ) : (
              <span className="text-emerald-700 font-semibold">
                {' '}
                The minimum stays {formatCentsToUSD(minBalance - account.minReserveCents)} above the
                reserve floor.
              </span>
            )}
            {overdueInvoices.length > 0 && (
              <>
                {' '}
                Collecting {formatCentsToUSD(overdueTotalCents)} overdue from {overdueNames} would
                improve the outlook.
              </>
            )}
          </p>
        </div>

        {/* Expandable 30-Day Table Button */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowFullTable(!showFullTable)}
            aria-expanded={showFullTable}
            aria-controls="runway-ledger-table"
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>
              {showFullTable ? 'Hide Complete Ledger Table' : 'Show Complete Ledger Table'}
            </span>
            {showFullTable ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          <span className="text-[11px] font-mono text-slate-500">Precision: Integer Cents</span>
        </div>

        {/* Expandable Full Ledger Table */}
        {showFullTable && (
          <div
            id="runway-ledger-table"
            className="mt-4 overflow-x-auto rounded-xl border border-slate-200"
          >
            <table className="min-w-full divide-y divide-slate-200 text-xs font-mono">
              <thead className="bg-slate-50 text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Day</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right">Start</th>
                  <th className="px-3 py-2 text-right">Inflow</th>
                  <th className="px-3 py-2 text-right">Outflow</th>
                  <th className="px-3 py-2 text-right">End Balance</th>
                  <th className="px-3 py-2 text-center">Reserve Status</th>
                  <th className="px-3 py-2 text-left font-sans">Scheduled Events</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {days.map((day) => {
                  const isNegative = day.endingBalanceCents < 0;
                  return (
                    <tr
                      key={day.dayNumber}
                      className={`hover:bg-slate-50/80 ${day.breachesReserve ? 'bg-rose-50/50' : ''}`}
                    >
                      <td className="px-3 py-2 font-bold text-slate-900">Day {day.dayNumber}</td>
                      <td className="px-3 py-2 text-slate-500">{day.date}</td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {formatCentsToUSD(day.startingBalanceCents)}
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-600">
                        {day.inflowCents > 0 ? `+${formatCentsToUSD(day.inflowCents)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-rose-600">
                        {day.outflowCents > 0 ? `-${formatCentsToUSD(day.outflowCents)}` : '—'}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-bold ${
                          isNegative ? 'text-rose-700' : 'text-slate-900'
                        }`}
                      >
                        {formatCentsToUSD(day.endingBalanceCents)}
                        {isNegative && <span className="ml-1 text-[10px]">DEFICIT</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {day.breachesReserve ? (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                            BREACH (-
                            {formatCentsToUSD(account.minReserveCents - day.endingBalanceCents)})
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                            OK
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-sans text-slate-600 text-[11px] truncate max-w-xs">
                        {day.notes || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
