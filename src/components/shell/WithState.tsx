'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { RunwayForecast, StateSnapshot } from '@/types';
import { useAppState } from '@/components/shell/AppState';
import { Page, Skeleton, btn } from '@/components/ui/kit';

/** Renders its page once the merchant's state has loaded; a skeleton before, a retry if it failed. */
export function WithState({
  label,
  children,
}: {
  label: string;
  children: (state: { snapshot: StateSnapshot; forecast: RunwayForecast }) => React.ReactNode;
}) {
  const { snapshot, forecast, error, reload, loading } = useAppState();

  if (snapshot && forecast) return <>{children({ snapshot, forecast })}</>;

  if (error && !loading) {
    return (
      <Page narrow>
        <div role="alert" className="py-10">
          <h1 className="text-xl font-semibold">The ledger didn&apos;t load</h1>
          <p className="mt-2 text-sm text-ink-2">{error}</p>
          <p className="mt-1 text-sm text-ink-3">
            A hosted demo can take up to a minute to wake up. Nothing was changed.
          </p>
          <button type="button" onClick={() => void reload()} className={`${btn.primary} mt-5`}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      </Page>
    );
  }

  return <Skeleton label={label} />;
}
