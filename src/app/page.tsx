'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { calculateRunway } from '@/lib/runway';
import {
  ApiError,
  getState,
  getErrorMessage,
  resetDemo,
  simulatePayment,
  approveReminder,
  createPayPalInvoice,
  syncInvoices,
} from '@/lib/apiClient';
import type { StateSnapshot, Invoice } from '@/types';
import { Navbar } from '@/components/Navbar';
import { Navigation } from '@/components/Navigation';
import type { TabKey } from '@/components/Navigation';
import { RunwayView } from '@/components/views/RunwayView';

function ViewSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-pulse motion-reduce:animate-none space-y-5"
    >
      <span className="sr-only">{label}</span>
      <div className="h-24 rounded-2xl border border-slate-200 bg-white" />
      <div className="h-14 rounded-xl border border-slate-200 bg-white" />
      <div className="h-80 rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}

const CollectionsView = dynamic(
  () => import('@/components/views/CollectionsView').then((mod) => mod.CollectionsView),
  { ssr: false, loading: () => <ViewSkeleton label="Loading collections" /> },
);

const PayoutsView = dynamic(
  () => import('@/components/views/PayoutsView').then((mod) => mod.PayoutsView),
  { ssr: false, loading: () => <ViewSkeleton label="Loading payouts" /> },
);

const AuditView = dynamic(
  () => import('@/components/views/AuditView').then((mod) => mod.AuditView),
  { ssr: false, loading: () => <ViewSkeleton label="Loading audit trail" /> },
);

function PageSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-3 animate-pulse motion-reduce:animate-none">
            <div className="h-10 w-10 rounded-xl bg-slate-200" />
            <div className="space-y-1.5">
              <div className="h-4 w-40 rounded bg-slate-200" />
              <div className="h-3 w-64 rounded bg-slate-100" />
            </div>
          </div>
          <div className="h-8 w-28 rounded-lg bg-slate-100 animate-pulse motion-reduce:animate-none" />
        </div>
      </header>
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 py-4">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-4 w-24 rounded bg-slate-100 animate-pulse motion-reduce:animate-none"
              />
            ))}
          </div>
        </div>
      </div>
      <main
        className="flex-1 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 w-full"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">Loading financial state</span>
        <div className="space-y-6 animate-pulse motion-reduce:animate-none">
          <div className="h-32 rounded-2xl border border-slate-200 bg-white" />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-28 rounded-2xl border border-slate-200 bg-white"
              />
            ))}
          </div>
          <div className="h-72 rounded-2xl border border-slate-200 bg-white" />
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('runway');
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const loadState = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const next = await getState(signal);
      if (signal?.aborted) return;
      setSnapshot(next);
    } catch (error) {
      if (signal?.aborted) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoadError(getErrorMessage(error));
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadState(controller.signal);
    return () => controller.abort();
  }, [loadState]);

  const handleResetDemo = useCallback(async () => {
    if (resetting) return;
    const confirmed = window.confirm(
      'Reset all demo data to its initial state? This clears payments, reminders, payouts, and audit history.',
    );
    if (!confirmed) return;

    setResetting(true);
    setResetError(null);
    try {
      const response = await resetDemo();
      setSnapshot(response.snapshot);
    } catch (error) {
      setResetError(getErrorMessage(error));
    } finally {
      setResetting(false);
    }
  }, [resetting]);

  const handleSimulatePayment = useCallback(async (invoiceId: string) => {
    try {
      const response = await simulatePayment(invoiceId);
      setSnapshot(response.snapshot);
    } catch (error) {
      if (error instanceof ApiError && error.snapshot) {
        setSnapshot(error.snapshot);
      }
      throw error;
    }
  }, []);

  const handleReminderSent = useCallback(
    async (invoiceId: string, subject: string, body: string) => {
      try {
        const response = await approveReminder({ invoiceId, subject, body });
        setSnapshot(response.snapshot);
      } catch (error) {
        if (error instanceof ApiError && error.snapshot) {
          setSnapshot(error.snapshot);
        }
        throw error;
      }
    },
    [],
  );

  const handlePayoutSuccess = useCallback(
    (billId: string, isRealPayPal: boolean, next: StateSnapshot) => {
      setSnapshot(next);
    },
    [],
  );

  const handleCreatePayPalInvoice = useCallback(
    async (invoice: Invoice) => {
      try {
        const response = await createPayPalInvoice(invoice.id);
        setSnapshot(response.snapshot);
      } catch (error) {
        if (error instanceof ApiError && error.snapshot) {
          setSnapshot(error.snapshot);
        }
        throw error;
      }
    },
    [],
  );

  const handleSyncInvoices = useCallback(
    async () => {
      try {
        const response = await syncInvoices();
        setSnapshot(response.snapshot);
      } catch (error) {
        if (error instanceof ApiError && error.snapshot) {
          setSnapshot(error.snapshot);
        }
        throw error;
      }
    },
    [],
  );

  const forecast = useMemo(() => {
    if (!snapshot) return null;
    return calculateRunway({
      clearedBalanceCents: snapshot.account.clearedBalanceCents,
      minReserveCents: snapshot.account.minReserveCents,
      invoices: snapshot.invoices,
      bills: snapshot.bills,
      startDate: snapshot.demoConfig.asOfDate,
      horizonDays: snapshot.demoConfig.forecastDays,
    });
  }, [snapshot]);

  const overdueCount = useMemo(
    () => (snapshot ? snapshot.invoices.filter((invoice) => invoice.status === 'OVERDUE').length : 0),
    [snapshot],
  );

  const openBillsCount = useMemo(
    () =>
      snapshot
        ? snapshot.bills.filter(
            (bill) =>
              bill.status === 'PENDING' ||
              bill.status === 'APPROVED' ||
              bill.status === 'IN_FLIGHT',
          ).length
        : 0,
    [snapshot],
  );

  if (loading && !snapshot) {
    return <PageSkeleton />;
  }

  if (loadError && !snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div
          role="alert"
          className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-start space-x-3">
            <div className="rounded-xl bg-rose-100 p-2.5 text-rose-700">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h1 className="text-base font-bold text-slate-900">
                Unable to load financial state
              </h1>
              <p className="mt-1 text-sm text-slate-600">{loadError}</p>
              <button
                type="button"
                onClick={() => void loadState()}
                className="mt-4 inline-flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!snapshot || !forecast) {
    return <PageSkeleton />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Navbar
        account={snapshot.account}
        capabilities={snapshot.capabilities}
        onReset={handleResetDemo}
        resetting={resetting}
      />

      <Navigation
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        overdueCount={overdueCount}
        pendingBillsCount={openBillsCount}
        hasBreach={forecast.hasReserveBreach}
        firstBreachDay={forecast.firstBreachDay}
      />

      <main className="flex-1 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 w-full">
        {resetError && (
          <div
            role="alert"
            className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            <div className="flex items-start space-x-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div>
                <p className="font-semibold">Reset failed</p>
                <p className="text-rose-700">{resetError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setResetError(null)}
              aria-label="Dismiss reset error"
              className="rounded-md p-1 text-rose-600 transition hover:bg-rose-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          aria-busy={resetting}
        >
          {activeTab === 'runway' && (
            <RunwayView
              account={snapshot.account}
              invoices={snapshot.invoices}
              bills={snapshot.bills}
              asOfDate={snapshot.demoConfig.asOfDate}
              forecastDays={snapshot.demoConfig.forecastDays}
              onNavigateToCollections={() => setActiveTab('collections')}
              onNavigateToPayouts={() => setActiveTab('payouts')}
            />
          )}

          {activeTab === 'collections' && (
            <CollectionsView
              invoices={snapshot.invoices}
              onSimulatePayment={handleSimulatePayment}
              onReminderSent={handleReminderSent}
              onCreatePayPalInvoice={handleCreatePayPalInvoice}
              onSyncInvoices={handleSyncInvoices}
            />
          )}

          {activeTab === 'payouts' && (
            <PayoutsView
              bills={snapshot.bills}
              account={snapshot.account}
              paypalSandboxEnabled={snapshot.capabilities.paypalSandboxEnabled}
              onDisburseBill={handlePayoutSuccess}
              onNavigateToCollections={() => setActiveTab('collections')}
            />
          )}

          {activeTab === 'audit' && <AuditView logs={snapshot.auditLogs} />}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <p>
          MerchOps AI &bull; Built for PayPal AI Hackathon 2026 &bull; Strict Financial Rule: AI
          proposes, rules decide. AI never moves money.
        </p>
      </footer>
    </div>
  );
}
