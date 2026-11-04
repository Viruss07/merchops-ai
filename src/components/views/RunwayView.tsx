'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
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
import { MerchantAccount, Invoice, Bill } from '@/types';

interface RunwayViewProps {
  account: MerchantAccount;
  invoices: Invoice[];
  bills: Bill[];
  onNavigateToCollections: () => void;
  onNavigateToPayouts: () => void;
}

export function RunwayView({
  account,
  invoices,
  bills,
  onNavigateToCollections,
  onNavigateToPayouts,
}: RunwayViewProps) {
  const [showFullTable, setShowFullTable] = useState(false);

  // Run deterministic calculation engine
  const forecast = calculateRunway({
    clearedBalanceCents: account.clearedBalanceCents,
    minReserveCents: account.minReserveCents,
    invoices,
    bills,
    horizonDays: 30,
  });

  const apexInvoice = invoices.find((i) => i.id === 'inv-apex-01');
  const apexIsPaid = apexInvoice?.status === 'PAID';
  const acmeBill = bills.find((b) => b.id === 'bill-acme-01');

  // Chart scaling helper: max balance in dataset to normalize bar heights
  const maxBalance = Math.max(
    ...forecast.days.map((d) => d.endingBalanceCents),
    account.minReserveCents * 1.5,
    600000 // $6,000 max anchor
  );

  const CHART_HEIGHT_PX = 160;
  const reserveBottomPx = Math.round((account.minReserveCents / maxBalance) * CHART_HEIGHT_PX);

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
                <div className="flex items-center space-x-2">
                  <span className="rounded-full bg-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-900 uppercase tracking-wide">
                    Reserve Breach Predicted
                  </span>
                  <span className="text-xs font-mono font-semibold text-rose-800">
                    Day {forecast.firstBreachDay} ({forecast.breachDate})
                  </span>
                </div>
                <h3 className="mt-1 text-lg font-bold text-slate-900">
                  Projected Cash Shortfall of {formatCentsToUSD(forecast.breachDeficitCents || 0)}
                </h3>
                <p className="mt-1 text-sm text-slate-700 max-w-2xl">
                  When vendor bill <span className="font-semibold text-slate-900">Acme Supplies</span> ({formatCentsToUSD(acmeBill?.amountCents || 0)}) is paid on Day 10, cash will drop to{' '}
                  <span className="font-bold text-rose-700">
                    {formatCentsToUSD(forecast.days[9]?.endingBalanceCents || 0)}
                  </span>
                  , breaching the {formatCentsToUSD(account.minReserveCents)} minimum reserve floor.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row md:flex-col items-end gap-2 shrink-0">
              <button
                onClick={onNavigateToCollections}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-700/20 hover:bg-rose-800 transition active:scale-95"
              >
                <span>Collect Overdue Invoice</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-500 text-right">
                Apex Corp ({formatCentsToUSD(apexInvoice?.amountCents || 0)}) overdue by {apexInvoice?.daysOverdue} days
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
                  30-Day Working Capital Trajectory Secured
                </h3>
                <p className="mt-0.5 text-sm text-slate-700">
                  Projected 30-day minimum balance ({formatCentsToUSD(forecast.projectedEndingBalanceCents)}) remains safely above the{' '}
                  {formatCentsToUSD(account.minReserveCents)} safety reserve buffer.
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-flex rounded-xl bg-white/80 border border-emerald-200 px-3 py-1.5 text-xs font-mono font-bold text-emerald-800">
              +{formatCentsToUSD(forecast.projectedEndingBalanceCents - account.minReserveCents)} Buffer
            </span>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current Cleared Cash</span>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {formatCentsToUSD(account.clearedBalanceCents)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Live bank & PayPal balance</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Safety Reserve Floor</span>
          <div className="mt-2 text-2xl font-bold font-mono text-indigo-700">
            {formatCentsToUSD(account.minReserveCents)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Protected working capital reserve</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Day 30 Projected Balance</span>
          <div className={`mt-2 text-2xl font-bold font-mono ${forecast.hasReserveBreach ? 'text-rose-700' : 'text-emerald-700'}`}>
            {formatCentsToUSD(forecast.projectedEndingBalanceCents)}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {forecast.hasReserveBreach ? 'Breaches reserve floor' : 'Safely above reserve buffer'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Upcoming Outflows (10d)</span>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {formatCentsToUSD(acmeBill?.status === 'PENDING' ? acmeBill.amountCents : 0)}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {acmeBill?.status === 'PENDING' ? 'Acme Supplies (Day 10)' : 'All 10-day bills settled'}
          </p>
        </div>
      </div>

      {/* Visual 30-Day Trajectory Bar Chart */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <span>30-Day Projected Cash Flow Trajectory</span>
            </h3>
            <p className="text-xs text-slate-500">
              Deterministic day-by-day projection. Red bars indicate cash dipping below the $2,000 reserve.
            </p>
          </div>
          <div className="flex items-center space-x-3 text-xs">
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
              <span className="font-semibold text-indigo-700">Reserve: $2,000</span>
            </div>
          </div>
        </div>

        {/* Visual Chart Bars */}
        <div className="mt-6 relative pt-6 pb-2">
          {/* Reserve Guideline overlay */}
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-indigo-400 z-10 pointer-events-none flex justify-end"
            style={{
              bottom: `${reserveBottomPx + 24}px`, // +24px for the day labels row height
            }}
          >
            <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded -translate-y-1/2 shadow-xs">
              Reserve Floor: $2,000.00
            </span>
          </div>

          {/* Bar Columns Container (160px plotting area) */}
          <div
            className="grid grid-cols-30 gap-1 sm:gap-1.5 items-end h-[160px] border-b border-slate-200 px-1"
            style={{ gridTemplateColumns: 'repeat(30, minmax(0, 1fr))' }}
          >
            {forecast.days.map((day) => {
              const barHeightPx = Math.max(8, Math.round((day.endingBalanceCents / maxBalance) * CHART_HEIGHT_PX));
              const isBreach = day.breachesReserve;
              const isDay10 = day.dayNumber === 10;

              return (
                <div
                  key={day.dayNumber}
                  className="group relative flex flex-col items-center justify-end h-full"
                >
                  {/* Tooltip */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-2 z-30 pointer-events-none whitespace-nowrap rounded-lg bg-slate-900 text-white text-[11px] p-2 shadow-xl">
                    <p className="font-bold">Day {day.dayNumber} ({day.date})</p>
                    <p>Ending: {formatCentsToUSD(day.endingBalanceCents)}</p>
                    {day.outflowCents > 0 && <p className="text-rose-300">Outflow: -{formatCentsToUSD(day.outflowCents)}</p>}
                    {day.inflowCents > 0 && <p className="text-emerald-300">Inflow: +{formatCentsToUSD(day.inflowCents)}</p>}
                    {isBreach && <p className="text-rose-400 font-bold">Breach: -{formatCentsToUSD(account.minReserveCents - day.endingBalanceCents)}</p>}
                    {day.notes && <p className="text-slate-300 text-[10px] mt-1">{day.notes}</p>}
                  </div>

                  {/* Day Indicator Dot for Events */}
                  {isDay10 && (
                    <span className="text-[10px] font-bold text-rose-700 mb-1 animate-pulse">▼ 10</span>
                  )}

                  {/* The Bar */}
                  <div
                    style={{ height: `${barHeightPx}px` }}
                    className={`w-full min-w-[2px] rounded-t-sm transition-all duration-300 ${isBreach
                        ? 'bg-rose-500 hover:bg-rose-600'
                        : 'bg-blue-500 hover:bg-blue-600'
                      }`}
                  ></div>
                </div>
              );
            })}
          </div>

          {/* Day Labels Row below baseline */}
          <div
            className="grid grid-cols-30 gap-1 sm:gap-1.5 px-1 pt-1.5 h-6"
            style={{ gridTemplateColumns: 'repeat(30, minmax(0, 1fr))' }}
          >
            {forecast.days.map((day) => (
              <div key={day.dayNumber} className="text-center">
                <span className="text-[9px] font-mono text-slate-400">
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
            Opening with <span className="font-semibold text-slate-800">{formatCentsToUSD(account.clearedBalanceCents)}</span>,
            cash remains stable until Day 10 when Acme Supplies ({formatCentsToUSD(acmeBill?.amountCents || 0)}) is due.{' '}
            {apexIsPaid ? (
              <span className="text-emerald-700 font-semibold">
                Apex Corp has been collected, maintaining a safe post-payout balance of {formatCentsToUSD(account.clearedBalanceCents - (acmeBill?.amountCents || 0))}.
              </span>
            ) : (
              <span className="text-rose-700 font-semibold">
                Without collecting the overdue $1,500 from Apex Corp, cash drops to $1,200.00, triggering an $800.00 reserve deficit.
              </span>
            )}
          </p>
        </div>

        {/* Expandable 30-Day Table Button */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
          <button
            onClick={() => setShowFullTable(!showFullTable)}
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>{showFullTable ? 'Hide Complete 30-Day Ledger Table' : 'Show Complete 30-Day Ledger Table'}</span>
            {showFullTable ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <span className="text-[11px] font-mono text-slate-400">Precision: Integer Cents</span>
        </div>

        {/* Expandable Full 30-Day Table */}
        {showFullTable && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
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
                {forecast.days.map((day) => (
                  <tr
                    key={day.dayNumber}
                    className={`hover:bg-slate-50/80 ${day.breachesReserve ? 'bg-rose-50/50' : ''}`}
                  >
                    <td className="px-3 py-2 font-bold text-slate-900">Day {day.dayNumber}</td>
                    <td className="px-3 py-2 text-slate-500">{day.date}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatCentsToUSD(day.startingBalanceCents)}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">
                      {day.inflowCents > 0 ? `+${formatCentsToUSD(day.inflowCents)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-rose-600">
                      {day.outflowCents > 0 ? `-${formatCentsToUSD(day.outflowCents)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-slate-900">
                      {formatCentsToUSD(day.endingBalanceCents)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {day.breachesReserve ? (
                        <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                          BREACH (-{formatCentsToUSD(account.minReserveCents - day.endingBalanceCents)})
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
