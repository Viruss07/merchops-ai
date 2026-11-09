'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { getState, resetDemo } from '@/lib/apiClient';
import { StateSnapshot } from '@/types';
import { calculateRunway } from '@/lib/runway';
import { RunwayView } from '@/components/views/RunwayView';
import { CollectionsView } from '@/components/views/CollectionsView';
import { PayoutsView } from '@/components/views/PayoutsView';
import { AuditView } from '@/components/views/AuditView';
import { Navigation, TabKey } from '@/components/Navigation';
import { Navbar } from '@/components/Navbar';
import { DemoTour } from '@/components/demo/DemoTour';
import { RunLiveModal } from '@/components/demo/RunLiveModal';

export default function JudgeDemoPage() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('runway');
  const [runLiveOpen, setRunLiveOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const loadCurrentState = useCallback(async () => {
    try {
      const state = await getState();
      setSnapshot(state);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCurrentState();
  }, [loadCurrentState]);

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetDemo();
      await loadCurrentState();
    } finally {
      setResetting(false);
    }
  };

  const forecast = snapshot
    ? calculateRunway({
        clearedBalanceCents: snapshot.account.clearedBalanceCents,
        minReserveCents: snapshot.account.minReserveCents,
        invoices: snapshot.invoices,
        bills: snapshot.bills,
        startDate: snapshot.demoConfig.asOfDate,
        horizonDays: snapshot.demoConfig.forecastDays,
      })
    : null;

  if (loading || !snapshot || !forecast) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="space-y-2 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-ink-3 border-t-transparent motion-reduce:animate-none" />
          <p className="text-xs font-medium text-ink-2">Loading judge mode…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper pb-20 text-ink">
      <h1 className="sr-only">MerchOps AI judge mode</h1>
      <Navbar
        account={snapshot.account}
        capabilities={snapshot.capabilities}
        onReset={handleReset}
        resetting={resetting}
      />

      <div className="border-b border-rule bg-panel">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <span className="rounded border border-rule bg-rule px-2 py-0.5 text-[10px] font-semibold text-ink-2">
              Judge mode
            </span>
            <span className="text-ink-3">PayPal AI Hackathon 2026 · guided tour</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setRunLiveOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-panel transition-colors duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
            >
              <Play className="h-3 w-3 fill-current" aria-hidden="true" />
              Run it live
            </button>
            <Link
              href="/bench"
              className="font-medium text-ink-2 underline underline-offset-2 transition-colors duration-200 hover:text-ink"
            >
              Guardrail bench
            </Link>
          </div>
        </div>
      </div>

      {/* Navigation Strip */}
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <Navigation
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          overdueCount={snapshot.invoices.filter((i) => i.status === 'OVERDUE').length}
          pendingBillsCount={
            snapshot.bills.filter((b) => b.status === 'PENDING' || b.status === 'IN_FLIGHT').length
          }
          hasBreach={forecast.hasReserveBreach}
          firstBreachDay={forecast.firstBreachDay}
        />
      </div>

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
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
            onSimulatePayment={async () => {
              await loadCurrentState();
            }}
            onReminderSent={async () => {
              await loadCurrentState();
            }}
          />
        )}

        {activeTab === 'payouts' && (
          <PayoutsView
            bills={snapshot.bills}
            account={snapshot.account}
            paypalSandboxEnabled={snapshot.capabilities.paypalSandboxEnabled}
            onDisburseBill={async () => {
              await loadCurrentState();
            }}
            onNavigateToCollections={() => setActiveTab('collections')}
          />
        )}

        {activeTab === 'audit' && <AuditView logs={snapshot.auditLogs} />}
      </main>

      {/* Interactive Guided Judge Tour Component */}
      <DemoTour
        onOpenRunLive={() => setRunLiveOpen(true)}
        onNavigateTab={(tab) => setActiveTab(tab)}
      />

      {/* 1-Click Interactive Run-It-Live Modal */}
      <RunLiveModal
        isOpen={runLiveOpen}
        onClose={() => setRunLiveOpen(false)}
        onRefreshState={loadCurrentState}
      />
    </div>
  );
}
