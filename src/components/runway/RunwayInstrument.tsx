'use client';

import React from 'react';
import { formatCentsToUSD } from '@/lib/money';
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
  const horizon = Math.max(days.length, 1);
  const balances = days.map((day) => day.endingBalanceCents);
  const maxValue = Math.max(openingBalanceCents, floorCents, ...balances, 1) * 1.1;
  const floorPct = Math.min(100, Math.max(0, (floorCents / maxValue) * 100));
  const minPct = Math.min(100, Math.max(0, (minBalanceCents / maxValue) * 100));
  const height = size === 'hero' ? 'h-[188px] sm:h-[232px]' : 'h-[148px] sm:h-[188px]';

  const breachIndex = days.findIndex((day) => day.dayNumber === firstBreachDay);
  const minDay = days.reduce<RunwayDay | undefined>(
    (lowest, day) => (!lowest || day.endingBalanceCents < lowest.endingBalanceCents ? day : lowest),
    undefined,
  );

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
    <div className={className}>
      <div className={`relative ${height}`} role="img" aria-label={ariaLabel} data-instrument>
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {days.map((day, index) => {
            const pct = Math.min(100, Math.max(0, (day.endingBalanceCents / maxValue) * 100));
            const below = day.endingBalanceCents < floorCents;
            const near = !below && day.endingBalanceCents < floorCents * 1.15;
            const isFirstBreach = firstBreachDay === day.dayNumber;
            const color = below
              ? `bg-blocked ${isFirstBreach ? '' : 'opacity-40'}`
              : near
                ? 'bg-risk'
                : 'bg-safe';

            return (
              <div key={day.dayNumber} data-bar className="relative h-full min-w-0 flex-1">
                {isFirstBreach && (
                  <div className="absolute inset-y-0 left-1/2 z-20 w-px -translate-x-1/2 bg-blocked opacity-60" />
                )}
                <div
                  className="bar-grow absolute inset-x-0 bottom-0"
                  style={{ height: `${pct}%`, '--i': index } as React.CSSProperties}
                >
                  <div className={`h-full w-full rounded-t-[2px] ${color}`} />
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
          <div className="relative border-t-2 border-dashed border-ink-2">
            <span className="absolute -top-2.5 left-0 bg-panel px-1.5 text-[10px] font-medium text-ink-2">
              Safety reserve {formatCentsToUSD(floorCents)}
            </span>
          </div>
        </div>

        {minDay && minPct < floorPct && (
          <div
            className="pointer-events-none absolute z-10 -translate-y-full"
            style={{
              bottom: `${minPct}%`,
              left: `${((Math.max(breachIndex, 0) + 0.5) / horizon) * 100}%`,
            }}
          >
            <span className="money whitespace-nowrap rounded-sm bg-blocked px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {formatCentsToUSD(minBalanceCents)}
            </span>
          </div>
        )}

        {stamp && (
          <div
            data-stamp
            className="stamp absolute right-0 top-0 z-30 rounded-md border-2 border-blocked bg-panel px-2.5 py-1.5 text-blocked shadow-sm"
          >
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em]">{stamp.label}</p>
            <p className="money mt-0.5 text-base font-semibold leading-none">{stamp.value}</p>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex gap-[2px]" aria-hidden="true">
        {days.map((day) => (
          <div key={day.dayNumber} className="min-w-0 flex-1 text-center">
            <span
              className={`mono text-[9px] ${
                day.dayNumber === firstBreachDay ? 'font-semibold text-blocked' : 'text-ink-3'
              }`}
            >
              {day.dayNumber === 1 || day.dayNumber % 5 === 0 ? `D${day.dayNumber}` : ''}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[1px] bg-safe" aria-hidden="true" />
          Above the reserve
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[1px] bg-risk" aria-hidden="true" />
          Close to it
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[1px] bg-blocked" aria-hidden="true" />
          Below the reserve
        </span>
      </div>
    </div>
  );
}
