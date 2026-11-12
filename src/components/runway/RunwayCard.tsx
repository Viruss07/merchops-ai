'use client';

import React from 'react';
import { formatCentsToUSD } from '@/lib/money';
import { formatDate } from '@/lib/client/states';
import { findLowestBalancePoint } from '@/lib/runway';
import type { RunwayForecast } from '@/types';
import { RunwayInstrument } from '@/components/runway/RunwayInstrument';

/** The instrument in its frame: title, as-of date, the bars and the floor, and three readouts. */
export function RunwayCard({
  forecast,
  floorCents,
  clearedCents,
  asOf,
  title = '30-day runway',
  size = 'detail',
  stamp,
  shadow = false,
  caption,
}: {
  forecast: RunwayForecast;
  floorCents: number;
  clearedCents: number;
  asOf: string;
  title?: string;
  size?: 'hero' | 'detail';
  stamp?: { label: string; value: string } | null;
  shadow?: boolean;
  caption?: React.ReactNode;
}) {
  const lowestPoint = findLowestBalancePoint(forecast);
  const lowestLabel = lowestPoint.isOpening ? 'Lowest · Today' : `Lowest · Day ${lowestPoint.dayNumber}`;
  const deficit = forecast.firstBreachDeficitCents ?? forecast.breachDeficitCents ?? 0;
  const autoStamp =
    stamp === undefined
      ? forecast.hasReserveBreach
        ? { label: 'Below the reserve', value: `−${formatCentsToUSD(deficit)}` }
        : null
      : stamp;

  return (
    <figure className="m-0">
      <div
        className={`rounded-xl border border-rule bg-panel p-4 sm:p-5 ${shadow ? 'shadow-card' : ''}`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <figcaption className="text-sm font-semibold text-ink">{title}</figcaption>
          <span
            className="mono text-xs text-ink-2"
            title="Deterministic forecast baseline date. Live PayPal transactions log real UTC timestamps."
          >
            Scenario baseline: {formatDate(asOf, { year: true })}
          </span>
        </div>
        <RunwayInstrument
          className="mt-4"
          days={forecast.days}
          floorCents={floorCents}
          openingBalanceCents={clearedCents}
          minBalanceCents={forecast.minBalanceCents}
          firstBreachDay={forecast.firstBreachDay}
          firstBreachDeficitCents={deficit}
          size={size}
          stamp={autoStamp}
        />
        <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-rule pt-3 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-rule">
          <Readout label="Cleared cash" value={formatCentsToUSD(clearedCents)} />
          <Readout label="Safety reserve" value={formatCentsToUSD(floorCents)} />
          <Readout
            label={lowestLabel}
            value={formatCentsToUSD(forecast.minBalanceCents)}
            tone={forecast.hasReserveBreach ? 'blocked' : 'safe'}
          />
        </dl>
      </div>
      {caption && <p className="mt-2 text-xs text-ink-2">{caption}</p>}
    </figure>
  );
}

function Readout({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'safe' | 'blocked';
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block sm:px-3 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd
        className={`money mt-0.5 text-sm font-semibold ${tone === 'blocked' ? 'text-blocked' : tone === 'safe' ? 'text-safe' : 'text-ink'}`}
      >
        {value}
      </dd>
    </div>
  );
}
