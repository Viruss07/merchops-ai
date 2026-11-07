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
import { Journey } from '@/components/journey/Journey';
import { RunwayView } from '@/components/views/RunwayView';

function ViewSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <span className="sr-only">{label}</span>
      <div className="h-24 rounded-lg border border-rule bg-panel" />
      <div className="h-14 rounded-md border border-rule bg-panel" />
      <div className="h-80 rounded-lg border border-rule bg-panel" />
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
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="border-b border-rule">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 rounded-full border border-rule-strong" />
            <div className="h-4 w-32 rounded bg-rule" />
          </div>
          <div className="h-4 w-20 rounded bg-rule" />
        </div>
      </header>
      <main
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">Loading financial state</span>
        <div className="space-y-6">
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="h-8 flex-1 rounded bg-rule" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-3 lg:col-span-5">
              <div className="h-10 w-full rounded bg-rule" />
              <div className="h-10 w-4/5 rounded bg-rule" />
              <div className="h-4 w-full rounded bg-rule" />
              <div className="h-4 w-3/4 rounded bg-rule" />
              <div className="h-10 w-40 rounded bg-rule" />
            </div>
            <div className="h-64 rounded-lg border border-rule bg-panel lg:col-span-7" />
          </div>
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
  const [resetSignal, setResetSignal] = useState(0);
  const [actionError, setActionError] = useState<{
    title: string;
    message: string;
    hint?: string;
  } | null>(null);

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
      setResetSignal((value) => value + 1);
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
    (_billId: string, _isRealPayPal: boolean, next: StateSnapshot) => {
      setSnapshot(next);
    },
    [],
  );

  const handleCreatePayPalInvoice = useCallback(async (invoice: Invoice) => {
    setActionError(null);
    try {
      const response = await createPayPalInvoice(invoice.id);
      setSnapshot(response.snapshot);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.snapshot) {
          setSnapshot(error.snapshot);
        }
        setActionError({
          title: 'PayPal Invoicing Notice',
          message: error.message,
          hint:
            error.status === 403
              ? 'Your PayPal Sandbox REST App lacks Invoicing permissions. To activate real Invoicing v2: open developer.paypal.com -> Apps & Credentials -> select your App -> check "Invoicing" under App Settings and save. In the meantime, use "Simulate Pay" to test collections.'
              : undefined,
        });
        return;
      }
      setActionError({
        title: 'Invoice Creation Failed',
        message: getErrorMessage(error),
      });
    }
  }, []);

  const handleSyncInvoices = useCallback(async () => {
    setActionError(null);
    try {
      const response = await syncInvoices();
      setSnapshot(response.snapshot);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.snapshot) {
          setSnapshot(error.snapshot);
        }
        setActionError({
          title: 'Invoice Sync Notice',
          message: error.message,
        });
        return;
      }
      setActionError({
        title: 'Sync Failed',
        message: getErrorMessage(error),
      });
    }
  }, []);

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
    () =>
      snapshot ? snapshot.invoices.filter((invoice) => invoice.status === 'OVERDUE').length : 0,
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

  const openTab = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    requestAnimationFrame(() => {
      document.getElementById('cockpit')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  if (loading && !snapshot) {
    return <PageSkeleton />;
  }

  if (loadError && !snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <div role="alert" className="w-full max-w-md rounded-lg border border-blocked bg-panel p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-blocked" aria-hidden="true" />
            <div className="flex-1">
              <h1 className="text-base font-semibold">Unable to load financial state</h1>
              <p className="mt-1 text-sm text-ink-2">{loadError}</p>
              <button
                type="button"
                onClick={() => void loadState()}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
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
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <Navbar
        account={snapshot.account}
        capabilities={snapshot.capabilities}
        onReset={handleResetDemo}
        resetting={resetting}
      />

      <main className="flex-1">
        <Journey
          key={resetSignal}
          snapshot={snapshot}
          forecast={forecast}
          onSnapshot={setSnapshot}
          onOpenAudit={() => openTab('audit')}
          onOpenPayouts={() => openTab('payouts')}
        />

        <section id="cockpit" className="scroll-mt-14 border-t border-rule">
          <div className="mx-auto max-w-6xl px-4 pb-2 pt-8 sm:px-6">
            <h2 className="text-lg font-semibold tracking-tight">The cockpit</h2>
            <p className="mt-1 text-sm text-ink-2">
              The operational views behind the instrument. Same numbers, same rules.
            </p>
          </div>

          <Navigation
            activeTab={activeTab}
            onChangeTab={setActiveTab}
            overdueCount={overdueCount}
            pendingBillsCount={openBillsCount}
            hasBreach={forecast.hasReserveBreach}
            firstBreachDay={forecast.firstBreachDay}
          />

          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
            {resetError && (
              <div
                role="alert"
                className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-blocked bg-blocked-field p-4 text-sm"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-blocked"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold text-blocked">Reset failed</p>
                    <p className="text-ink-2">{resetError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setResetError(null)}
                  aria-label="Dismiss reset error"
                  className="rounded-sm p-1 text-blocked transition-colors hover:bg-blocked-field focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            {actionError && (
              <div
                role="alert"
                className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold text-ink">{actionError.title}</p>
                    <p className="mt-0.5 text-ink-2">{actionError.message}</p>
                    {actionError.hint && (
                      <p className="mt-2 rounded bg-amber-500/15 p-2 text-xs text-ink-2 border border-amber-500/20">
                        <strong>💡 How to resolve:</strong> {actionError.hint}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  aria-label="Dismiss notice"
                  className="rounded-sm p-1 text-ink-3 transition-colors hover:bg-rule focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
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
          </div>
        </section>
      </main>

      <footer className="border-t border-rule py-4 text-center text-[11px] text-ink-3">
        MerchOps AI · PayPal AI Hackathon 2026 · AI proposes, rules decide. AI never moves money.
      </footer>
    </div>
  );
}
