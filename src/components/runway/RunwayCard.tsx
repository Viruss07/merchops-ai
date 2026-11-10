'use client';

import React from 'react';
import { formatCentsToUSD } from '@/lib/money';
import { formatDate } from '@/lib/client/states';
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
        className={`rounded-lg border border-rule bg-panel p-4 sm:p-5 ${shadow ? 'shadow-card' : ''}`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <figcaption className="text-sm font-medium text-ink">{title}</figcaption>
          <span className="mono text-[11px] text-ink-3">as of {formatDate(asOf)}</span>
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
        <dl className="mt-4 grid grid-cols-3 divide-x divide-rule border-t border-rule pt-3">
          <Readout label="Cleared" value={formatCentsToUSD(clearedCents)} />
          <Readout label="Reserve" value={formatCentsToUSD(floorCents)} />
          <Readout
            label={
              forecast.firstBreachDay === 0
                ? 'Lowest · today'
                : forecast.firstBreachDay !== undefined
                  ? `Lowest · Day ${forecast.firstBreachDay}`
                  : 'Lowest'
            }
            value={formatCentsToUSD(forecast.minBalanceCents)}
            tone={forecast.hasReserveBreach ? 'blocked' : 'safe'}
          />
        </dl>
      </div>
      {caption && <p className="mt-2 text-xs text-ink-3">{caption}</p>}
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
    <div className="px-3 first:pl-0 last:pr-0">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd
        className={`money mt-0.5 text-sm font-semibold ${tone === 'blocked' ? 'text-blocked' : tone === 'safe' ? 'text-safe' : 'text-ink'}`}
      >
        {value}
      </dd>
    </div>
  );
}
