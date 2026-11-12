'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getErrorMessage, getState, resetDemo } from '@/lib/apiClient';
import { calculateRunway } from '@/lib/runway';
import type { RunwayForecast, StateSnapshot } from '@/types';

/**
 * One copy of the merchant's state for every page. Pages read the snapshot and the forecast from
 * here and hand back the snapshot each API call returns, so the header's cleared cash, the runway
 * and every list always show the same numbers.
 */
interface AppStateValue {
  snapshot: StateSnapshot | null;
  forecast: RunwayForecast | null;
  loading: boolean;
  error: string | null;
  resetError: string | null;
  clearResetError: () => void;
  /** Bumped on reset, so pages can drop local step state (journey acts, open drafts). */
  resetCount: number;
  setSnapshot: (next: StateSnapshot) => void;
  reload: () => Promise<void>;
  reset: () => Promise<void>;
  resetting: boolean;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function forecastFor(snapshot: StateSnapshot): RunwayForecast {
  return calculateRunway({
    clearedBalanceCents: snapshot.account.clearedBalanceCents,
    minReserveCents: snapshot.account.minReserveCents,
    invoices: snapshot.invoices,
    bills: snapshot.bills,
    startDate: snapshot.demoConfig.asOfDate,
    horizonDays: snapshot.demoConfig.forecastDays,
  });
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetCount, setResetCount] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const next = await getState(signal);
      if (signal?.aborted) return;
      setSnapshot(next);
    } catch (caught) {
      if (signal?.aborted) return;
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(getErrorMessage(caught));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    let lastCheck = Date.now();
    const revalidate = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastCheck < 4000) return;
      lastCheck = now;
      void getState()
        .then((next) => {
          setSnapshot(next);
        })
        .catch(() => {
          // Silent background revalidation: keep existing snapshot on transient error.
        });
    };

    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      controller.abort();
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, [load]);

  const clearResetError = useCallback(() => setResetError(null), []);

  const reset = useCallback(async () => {
    if (resetting) return;
    setResetting(true);
    setResetError(null);
    try {
      const response = await resetDemo();
      setSnapshot(response.snapshot);
      setResetCount((n) => n + 1);
    } catch (caught) {
      setResetError(getErrorMessage(caught));
    } finally {
      setResetting(false);
    }
  }, [resetting]);

  const forecast = useMemo(() => (snapshot ? forecastFor(snapshot) : null), [snapshot]);

  const value = useMemo<AppStateValue>(
    () => ({
      snapshot,
      forecast,
      loading,
      error,
      resetError,
      clearResetError,
      resetCount,
      setSnapshot,
      reload: () => load(),
      reset,
      resetting,
    }),
    [
      snapshot,
      forecast,
      loading,
      error,
      resetError,
      clearResetError,
      resetCount,
      load,
      reset,
      resetting,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside <AppStateProvider>.');
  return value;
}
