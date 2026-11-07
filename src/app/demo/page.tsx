'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { getState } from '@/lib/apiClient';
import { StateSnapshot } from '@/types';
import { calculateRunway } from '@/lib/runway';
import { RunwayView } from '@/components/views/RunwayView';
import { CollectionsView } from '@/components/views/CollectionsView';
import { PayoutsView } from '@/components/views/PayoutsView';
import { AuditView } from '@/components/views/AuditView';
import { Navigation, TabKey } from '@/components/Navigation';
import { DemoTour } from '@/components/demo/DemoTour';
import { RunLiveModal } from '@/components/demo/RunLiveModal';

export default function JudgeDemoPage() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('runway');
  const [runLiveOpen, setRunLiveOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-600">Loading Judge Mode...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Top Banner: Judge Mode Strip */}
      <div className="bg-indigo-900 text-white px-4 py-2.5 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="rounded bg-indigo-700 text-indigo-100 font-mono font-bold px-2 py-0.5 uppercase text-[10px]">
              Judge Evaluation Mode
            </span>
            <span className="font-medium text-indigo-100">
              PayPal AI Hackathon 2026 &bull; Guided Tour Active
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <button
              type="button"
              onClick={() => setRunLiveOpen(true)}
              className="inline-flex items-center space-x-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow transition active:scale-95"
            >
              <Play className="h-3 w-3 fill-current" />
              <span>Run it Live (1-Click)</span>
            </button>
            <Link href="/bench" className="text-indigo-200 hover:text-white underline font-semibold">
              View Guardrail Bench
            </Link>
          </div>
        </div>
      </div>

      {/* Navigation Strip */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
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
