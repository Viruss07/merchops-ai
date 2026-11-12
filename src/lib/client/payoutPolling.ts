'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getErrorMessage, syncPayout, type SyncPayoutResponse } from '@/lib/apiClient';
import type { StateSnapshot } from '@/types';

export const DEFAULT_POLL_INITIAL_DELAY_MS = 1800;
export const DEFAULT_POLL_INTERVAL_MS = 2500;
export const DEFAULT_POLL_MAX_DURATION_MS = 45_000;

export type PayoutPollingPhase =
  | 'idle'
  | 'polling'
  | 'settled'
  | 'failed'
  | 'timed_out'
  | 'stopped';

export interface PayoutPollProgress {
  phase: PayoutPollingPhase;
  isSyncing: boolean;
  batchId: string | null;
  paypalStatus: string | null;
  statusMessage: string | null;
  networkWarning: string | null;
  terminalError: string | null;
  attempts: number;
}

export interface RunPayoutPollOptions {
  billId: string;
  initialBatchId?: string | null;
  initialDelayMs?: number;
  intervalMs?: number;
  maxDurationMs?: number;
  signal?: AbortSignal;
  syncFn?: (billId: string) => Promise<SyncPayoutResponse>;
  waitFn?: (ms: number, signal?: AbortSignal) => Promise<void>;
  nowFn?: () => number;
  onSnapshot?: (snapshot: StateSnapshot) => void;
  onProgress?: (progress: PayoutPollProgress) => void;
}

function defaultWait(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isTerminalPayoutError(caught: unknown): boolean {
  if (!(caught instanceof ApiError)) return false;
  return (
    caught.code === 'PAYOUT_FAILED' ||
    caught.code === 'PAYPAL_INSUFFICIENT_FUNDS' ||
    caught.code === 'PAYPAL_BATCH_FAILED' ||
    caught.code === 'NOT_FOUND' ||
    caught.code === 'PAYOUT_STATE_MISSING'
  );
}

/**
 * Pure deterministic settlement poller. Queries `/api/payouts/sync` (which only reads PayPal
 * batch status via GET) until PayPal reports SUCCESS (DISBURSED), a terminal FAILED state,
 * non-pollable response, or maxDurationMs elapses. Retains `batchId` across transient errors.
 */
export async function runPayoutSettlementPolling(
  options: RunPayoutPollOptions
): Promise<PayoutPollProgress> {
  const {
    billId,
    initialDelayMs = DEFAULT_POLL_INITIAL_DELAY_MS,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxDurationMs = DEFAULT_POLL_MAX_DURATION_MS,
    signal,
    syncFn = syncPayout,
    waitFn = defaultWait,
    nowFn = () => Date.now(),
    onSnapshot,
    onProgress,
  } = options;

  const startedAt = nowFn();
  let state: PayoutPollProgress = {
    phase: 'polling',
    isSyncing: false,
    batchId: options.initialBatchId ?? null,
    paypalStatus: 'PENDING',
    statusMessage: 'Payout processing · Checking PayPal settlement status automatically…',
    networkWarning: null,
    terminalError: null,
    attempts: 0,
  };

  const emit = (patch: Partial<PayoutPollProgress>) => {
    state = { ...state, ...patch };
    onProgress?.(state);
  };

  emit({});

  if (initialDelayMs > 0) {
    await waitFn(initialDelayMs, signal);
  }

  while (!signal?.aborted) {
    emit({ isSyncing: true, attempts: state.attempts + 1 });

    try {
      const res = await syncFn(billId);
      if (signal?.aborted) break;

      const preservedBatchId = res.batchId ?? state.batchId;
      onSnapshot?.(res.snapshot);

      if (res.status === 'DISBURSED') {
        emit({
          phase: 'settled',
          isSyncing: false,
          batchId: preservedBatchId,
          paypalStatus: res.paypalStatus ?? 'SUCCESS',
          statusMessage: res.message,
          networkWarning: null,
          terminalError: null,
        });
        return state;
      }

      if (res.pollable === false) {
        emit({
          phase: 'stopped',
          isSyncing: false,
          batchId: preservedBatchId,
          paypalStatus: res.paypalStatus ?? state.paypalStatus,
          statusMessage: res.message,
          networkWarning: null,
        });
        return state;
      }

      const elapsed = nowFn() - startedAt;
      if (elapsed >= maxDurationMs) {
        emit({
          phase: 'timed_out',
          isSyncing: false,
          batchId: preservedBatchId,
          paypalStatus: res.paypalStatus ?? state.paypalStatus,
          statusMessage:
            res.transientError
              ? `Could not confirm settlement for batch ${preservedBatchId ?? 'pending'} within the automatic check window.`
              : `PayPal is still processing batch ${preservedBatchId ?? 'pending'}. Use Refresh PayPal status to check again.`,
          networkWarning: res.transientError ? res.message : null,
        });
        return state;
      }

      emit({
        phase: 'polling',
        isSyncing: false,
        batchId: preservedBatchId,
        paypalStatus: res.paypalStatus ?? 'PENDING',
        statusMessage: res.transientError
          ? `Temporary network check issue for batch ${preservedBatchId ?? 'pending'}. Retrying safely…`
          : 'Payout processing · PayPal reported PENDING; checking again shortly.',
        networkWarning: res.transientError ? res.message : null,
      });
    } catch (caught) {
      if (signal?.aborted) break;

      const nextSnapshot = caught instanceof ApiError ? caught.snapshot : undefined;
      if (nextSnapshot) {
        onSnapshot?.(nextSnapshot);
      }

      const snapshotBatchId =
        nextSnapshot?.bills.find((b) => b.id === billId)?.paypalBatchId ?? state.batchId;

      if (
        isTerminalPayoutError(caught) ||
        nextSnapshot?.bills.find((b) => b.id === billId)?.status === 'FAILED'
      ) {
        emit({
          phase: 'failed',
          isSyncing: false,
          batchId: snapshotBatchId,
          paypalStatus: 'FAILED',
          statusMessage: null,
          networkWarning: null,
          terminalError: getErrorMessage(caught),
        });
        return state;
      }

      // Transient client/network error: keep batchId intact and allow safe retry / continuation.
      const elapsed = nowFn() - startedAt;
      if (elapsed >= maxDurationMs) {
        emit({
          phase: 'timed_out',
          isSyncing: false,
          batchId: snapshotBatchId,
          statusMessage: 'Payout remains in flight at PayPal.',
          networkWarning: `${getErrorMessage(caught)} Batch ${snapshotBatchId ?? ''} remains safely in flight; click Refresh PayPal status to retry.`.trim(),
        });
        return state;
      }

      emit({
        phase: 'polling',
        isSyncing: false,
        batchId: snapshotBatchId,
        networkWarning: `${getErrorMessage(caught)} Retaining batch ${snapshotBatchId ?? ''} — no duplicate payout will be created.`.trim(),
      });
    }

    await waitFn(intervalMs, signal);
  }

  return state;
}

/**
 * React hook orchestrating automatic PayPal settlement polling for an IN_FLIGHT bill,
 * plus single-flight manual "Refresh PayPal status" fallback with duplicate-click protection.
 */
export function usePayoutSettlement(options: {
  billId: string;
  active: boolean;
  initialBatchId?: string | null;
  intervalMs?: number;
  maxDurationMs?: number;
  onSnapshot: (snapshot: StateSnapshot) => void;
}) {
  const {
    billId,
    active,
    initialBatchId = null,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxDurationMs = DEFAULT_POLL_MAX_DURATION_MS,
    onSnapshot,
  } = options;

  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;

  const [progress, setProgress] = useState<PayoutPollProgress>({
    phase: active ? 'polling' : 'idle',
    isSyncing: false,
    batchId: initialBatchId,
    paypalStatus: active ? 'PENDING' : null,
    statusMessage: null,
    networkWarning: null,
    terminalError: null,
    attempts: 0,
  });

  const [pollEpoch, setPollEpoch] = useState(0);
  const manualRefreshRef = useRef<Promise<void> | null>(null);
  const inFlightSyncRef = useRef<Promise<SyncPayoutResponse> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const deduplicatedSync = useCallback((targetBillId: string) => {
    if (inFlightSyncRef.current) {
      return inFlightSyncRef.current;
    }
    const req = syncPayout(targetBillId).finally(() => {
      if (inFlightSyncRef.current === req) {
        inFlightSyncRef.current = null;
      }
    });
    inFlightSyncRef.current = req;
    return req;
  }, []);

  useEffect(() => {
    if (!active) {
      abortRef.current?.abort();
      abortRef.current = null;
      setProgress({
        phase: 'idle',
        isSyncing: false,
        batchId: initialBatchId,
        paypalStatus: null,
        statusMessage: null,
        networkWarning: null,
        terminalError: null,
        attempts: 0,
      });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    void runPayoutSettlementPolling({
      billId,
      initialBatchId,
      initialDelayMs: pollEpoch === 0 ? DEFAULT_POLL_INITIAL_DELAY_MS : intervalMs,
      intervalMs,
      maxDurationMs,
      signal: controller.signal,
      syncFn: deduplicatedSync,
      onSnapshot: (snap) => onSnapshotRef.current(snap),
      onProgress: (next) => {
        if (!controller.signal.aborted) {
          setProgress((prev) => ({
            ...next,
            batchId: next.batchId ?? prev.batchId ?? initialBatchId,
          }));
        }
      },
    });

    return () => {
      controller.abort();
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    };
  }, [billId, active, initialBatchId, intervalMs, maxDurationMs, pollEpoch, deduplicatedSync]);

  const refreshNow = useCallback(async () => {
    if (manualRefreshRef.current) {
      return manualRefreshRef.current;
    }

    const task = (async () => {
      setProgress((prev) => ({
        ...prev,
        isSyncing: true,
        networkWarning: null,
        terminalError: null,
      }));

      try {
        const res = await deduplicatedSync(billId);
        onSnapshotRef.current(res.snapshot);
        const retainedBatchId = res.batchId ?? progress.batchId ?? initialBatchId;

        if (res.status === 'DISBURSED') {
          abortRef.current?.abort();
          setProgress((prev) => ({
            ...prev,
            phase: 'settled',
            isSyncing: false,
            batchId: retainedBatchId,
            paypalStatus: res.paypalStatus ?? 'SUCCESS',
            statusMessage: res.message,
            networkWarning: null,
            terminalError: null,
          }));
          return;
        }

        setProgress((prev) => ({
          ...prev,
          phase: res.pollable === false ? 'stopped' : 'polling',
          isSyncing: false,
          batchId: retainedBatchId,
          paypalStatus: res.paypalStatus ?? prev.paypalStatus ?? 'PENDING',
          statusMessage: res.message,
          networkWarning: res.transientError ? res.message : null,
        }));

        if (res.pollable !== false) {
          setPollEpoch((n) => n + 1);
        }
      } catch (caught) {
        const nextSnapshot = caught instanceof ApiError ? caught.snapshot : undefined;
        if (nextSnapshot) {
          onSnapshotRef.current(nextSnapshot);
        }
        const retainedBatchId =
          nextSnapshot?.bills.find((b) => b.id === billId)?.paypalBatchId ??
          progress.batchId ??
          initialBatchId;

        if (
          isTerminalPayoutError(caught) ||
          nextSnapshot?.bills.find((b) => b.id === billId)?.status === 'FAILED'
        ) {
          abortRef.current?.abort();
          setProgress((prev) => ({
            ...prev,
            phase: 'failed',
            isSyncing: false,
            batchId: retainedBatchId,
            paypalStatus: 'FAILED',
            terminalError: getErrorMessage(caught),
            networkWarning: null,
          }));
        } else {
          setProgress((prev) => ({
            ...prev,
            isSyncing: false,
            batchId: retainedBatchId,
            networkWarning: `${getErrorMessage(caught)} Batch ${retainedBatchId ?? ''} remains safely in flight.`,
          }));
        }
      } finally {
        manualRefreshRef.current = null;
      }
    })();

    manualRefreshRef.current = task;
    return task;
  }, [billId, initialBatchId, progress.batchId, deduplicatedSync]);

  return {
    ...progress,
    batchId: progress.batchId ?? initialBatchId,
    refreshNow,
  };
}
