'use client';

import React, { useState } from 'react';
import { formatCentsToUSD } from '@/lib/money';
import { formatDate } from '@/lib/client/states';
import type { RunwayDay } from '@/types';

interface RunwayInstrumentProps {
  days: RunwayDay[];
  floorCents: number;
  openingBalanceCents: number;
  minBalanceCents: number;
  firstBreachDay?: number;
  firstBreachDeficitCents?: number;
  size?: 'hero' | 'detail';
  stamp?: { label: string; value: string } | null;
  className?: string;
}

export function RunwayInstrument({
  days,
  floorCents,
  openingBalanceCents,
  minBalanceCents,
  firstBreachDay,
  firstBreachDeficitCents,
  size = 'hero',
  stamp,
  className = '',
}: RunwayInstrumentProps) {
  const [activeDayNum, setActiveDayNum] = useState<number | null>(null);
  const horizon = Math.max(days.length, 1);
  const balances = days.map((day) => day.endingBalanceCents);
  const maxValue = Math.max(openingBalanceCents, floorCents, ...balances, 1) * 1.1;
  const floorPct = Math.min(100, Math.max(0, (floorCents / maxValue) * 100));
  const height = size === 'hero' ? 'h-[196px] sm:h-[236px]' : 'h-[156px] sm:h-[192px]';

  const minDayIndex = days.reduce<number>(
    (lowestIdx, day, idx) =>
      lowestIdx === -1 || day.endingBalanceCents < days[lowestIdx].endingBalanceCents ? idx : lowestIdx,
    -1,
  );
  const minDay = minDayIndex >= 0 ? days[minDayIndex] : undefined;
  const minDayPct = minDay
    ? Math.min(100, Math.max(0, (minDay.endingBalanceCents / maxValue) * 100))
    : 0;
  const breachIndex = days.findIndex((day) => day.dayNumber === firstBreachDay);
  const activeDay = days.find((day) => day.dayNumber === activeDayNum) ?? null;

  const badgeIndex = minDayIndex >= 0 ? minDayIndex : Math.max(breachIndex, 0);
  const rawMinLeftPct = ((badgeIndex + 0.5) / horizon) * 100;
  const clampedMinLeftPct = Math.min(88, Math.max(12, rawMinLeftPct));

  const ariaLabel = [
    `30-day cash runway. Cleared cash ${formatCentsToUSD(openingBalanceCents)}.`,
    `Safety reserve ${formatCentsToUSD(floorCents)}.`,
    firstBreachDay !== undefined
      ? `Cash drops below the reserve on day ${firstBreachDay}, reaching a low of ${formatCentsToUSD(
          minBalanceCents,
        )}${firstBreachDeficitCents ? `, ${formatCentsToUSD(firstBreachDeficitCents)} below the reserve` : ''}.`
      : `The lowest projected balance is ${formatCentsToUSD(minBalanceCents)}, above the reserve.`,
  ].join(' ');

  return (
    <div className={className} onMouseLeave={() => setActiveDayNum(null)}>
      <div className={`relative ${height}`} role="img" aria-label={ariaLabel} data-instrument>
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {days.map((day, index) => {
            const pct = Math.min(100, Math.max(0, (day.endingBalanceCents / maxValue) * 100));
            const below = day.endingBalanceCents < floorCents;
            const near = !below && day.endingBalanceCents < floorCents * 1.15;
            const isFirstBreach = firstBreachDay === day.dayNumber;
            const isSelected = activeDayNum === day.dayNumber;
            const color = below
              ? `bg-blocked ${isFirstBreach || isSelected ? '' : 'opacity-45'}`
              : near
                ? 'bg-risk'
                : 'bg-safe';

            return (
              <div
                key={day.dayNumber}
                data-bar
                tabIndex={0}
                onMouseEnter={() => setActiveDayNum(day.dayNumber)}
                onFocus={() => setActiveDayNum(day.dayNumber)}
                onClick={() =>
                  setActiveDayNum((prev) => (prev === day.dayNumber ? null : day.dayNumber))
                }
                aria-label={`Day ${day.dayNumber} (${formatDate(day.date)}): ending ${formatCentsToUSD(day.endingBalanceCents)}`}
                className="group relative h-full min-w-0 flex-1 cursor-pointer focus:outline-none"
              >
                {isFirstBreach && (
                  <div className="absolute inset-y-0 left-1/2 z-20 w-px -translate-x-1/2 bg-blocked opacity-70" />
                )}
                {isSelected && (
                  <div className="pointer-events-none absolute inset-y-0 inset-x-0 z-10 rounded-t bg-ink/10 ring-1 ring-ink/30" />
                )}
                <div
                  className="bar-grow absolute inset-x-0 bottom-0"
                  style={
                    {
                      height: `${pct}%`,
                      minHeight: day.endingBalanceCents <= 0 ? '4px' : undefined,
                      '--i': index,
                    } as React.CSSProperties
                  }
                >
                  <div
                    className={`h-full w-full rounded-t-[3px] transition-opacity ${color} ${
                      isSelected ? 'ring-1 ring-ink' : 'group-hover:opacity-90'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="floor-line pointer-events-none absolute inset-x-0 z-10"
          data-floor
          style={{ bottom: `${floorPct}%` }}
        >
          <div className="relative border-t-2 border-dashed border-ink/45">
            <span className="absolute -top-3.5 left-0 rounded-full border border-rule-strong bg-panel px-2.5 py-0.5 text-xs font-semibold text-ink shadow-xs">
              Reserve Floor {formatCentsToUSD(floorCents)}
            </span>
          </div>
        </div>

        {minDay && minDay.endingBalanceCents < floorCents && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full pb-1"
            style={{
              bottom: `${minDayPct}%`,
              left: `${clampedMinLeftPct}%`,
            }}
          >
            <span className="money whitespace-nowrap rounded-md bg-blocked px-2 py-0.5 text-xs font-bold text-paper shadow-xs">
              {formatCentsToUSD(minDay.endingBalanceCents)}
            </span>
          </div>
        )}

        {stamp && (
          <div
            data-stamp
            className="stamp pointer-events-none absolute right-0 top-0 z-30 rounded-xl border-2 border-blocked bg-panel/95 px-3 py-1.5 text-blocked shadow-md backdrop-blur-xs"
          >
            <p className="text-xs font-bold uppercase tracking-wider">{stamp.label}</p>
            <p className="money mt-0.5 text-base font-bold leading-none">{stamp.value}</p>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex gap-[2px]" aria-hidden="true">
        {days.map((day, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === days.length - 1;
          const showLabel = day.dayNumber === 1 || day.dayNumber % 5 === 0 || isLast;
          return (
            <div
              key={day.dayNumber}
              className={`min-w-0 flex-1 ${isFirst ? 'text-left' : isLast ? 'text-right' : 'text-center'}`}
            >
              <span
                className={`mono block whitespace-nowrap text-[11px] sm:text-xs ${
                  day.dayNumber === firstBreachDay ? 'font-semibold text-blocked' : 'text-ink-3'
                }`}
              >
                {showLabel ? `D${day.dayNumber}` : ''}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-rule/70 pt-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px] bg-safe" aria-hidden="true" />
            Above reserve
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px] bg-risk" aria-hidden="true" />
            Near reserve
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px] bg-blocked" aria-hidden="true" />
            Below reserve
          </span>
        </div>

        <div className="text-xs text-ink-2" aria-live="polite">
          {activeDay ? (
            <span className="mono flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <strong className="font-semibold text-ink">
                Day {activeDay.dayNumber} ({formatDate(activeDay.date)})
              </strong>
              {activeDay.inflowCents > 0 && (
                <span className="text-safe">+{formatCentsToUSD(activeDay.inflowCents)}</span>
              )}
              {activeDay.outflowCents > 0 && (
                <span className="text-blocked">−{formatCentsToUSD(activeDay.outflowCents)}</span>
              )}
              <span
                className={
                  activeDay.endingBalanceCents < floorCents
                    ? 'font-semibold text-blocked'
                    : 'font-semibold text-ink'
                }
              >
                End {formatCentsToUSD(activeDay.endingBalanceCents)}
              </span>
            </span>
          ) : (
            <span className="text-ink-3">Hover or tap any day bar to inspect balances</span>
          )}
        </div>
      </div>
    </div>
  );
}
