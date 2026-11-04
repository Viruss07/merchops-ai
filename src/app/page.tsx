'use client';

import React, { useState } from 'react';
import { demoStore } from '@/lib/store';
import { calculateRunway } from '@/lib/runway';
import { Navbar } from '@/components/Navbar';
import { Navigation, TabKey } from '@/components/Navigation';
import { RunwayView } from '@/components/views/RunwayView';
import { CollectionsView } from '@/components/views/CollectionsView';
import { PayoutsView } from '@/components/views/PayoutsView';
import { AuditView } from '@/components/views/AuditView';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('runway');
  const [account, setAccount] = useState(demoStore.getAccount());
  const [invoices, setInvoices] = useState(demoStore.getInvoices());
  const [bills, setBills] = useState(demoStore.getBills());
  const [logs, setLogs] = useState(demoStore.getAuditLogs());
  const [resetting, setResetting] = useState(false);

  // Sync state helper
  const syncFromStore = () => {
    setAccount(demoStore.getAccount());
    setInvoices(demoStore.getInvoices());
    setBills(demoStore.getBills());
    setLogs(demoStore.getAuditLogs());
  };

  // Reset demo data
  const handleResetDemo = async () => {
    setResetting(true);
    demoStore.resetDemoData();
    syncFromStore();
    try {
      await fetch('/api/reset', { method: 'POST' });
    } catch {}
    setTimeout(() => setResetting(false), 300);
  };

  // Simulate Customer Invoice Payment (Apex Corp)
  const handleSimulatePayment = async (invoiceId: string) => {
    demoStore.markInvoicePaid(invoiceId);
    syncFromStore();
    try {
      await fetch('/api/invoices/simulate-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      });
    } catch {}
  };

  // Record approved AI reminder
  const handleReminderSent = (invoiceId: string, subject: string, body: string) => {
    demoStore.recordReminderSent(invoiceId, subject, body);
    syncFromStore();
  };

  // Disburse Vendor Bill (Acme Supplies)
  const handleDisburseBill = (billId: string, isRealPayPal: boolean = false) => {
    demoStore.markBillDisbursed(billId, isRealPayPal);
    syncFromStore();
  };

  // Calculations for badges using deterministic engine
  const overdueCount = invoices.filter((i) => i.status === 'OVERDUE').length;
  const pendingBillsCount = bills.filter((b) => b.status === 'PENDING').length;
  
  const forecast = calculateRunway({
    clearedBalanceCents: account.clearedBalanceCents,
    minReserveCents: account.minReserveCents,
    invoices,
    bills,
    horizonDays: 30,
  });
  const hasBreach = forecast.hasReserveBreach;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Navbar */}
      <Navbar account={account} onReset={handleResetDemo} resetting={resetting} />

      {/* Tabs Navigation */}
      <Navigation
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        overdueCount={overdueCount}
        pendingBillsCount={pendingBillsCount}
        hasBreach={hasBreach}
      />

      {/* Main Content Area */}
      <main className="flex-1 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 w-full">
        {activeTab === 'runway' && (
          <RunwayView
            account={account}
            invoices={invoices}
            bills={bills}
            onNavigateToCollections={() => setActiveTab('collections')}
            onNavigateToPayouts={() => setActiveTab('payouts')}
          />
        )}

        {activeTab === 'collections' && (
          <CollectionsView
            invoices={invoices}
            onSimulatePayment={handleSimulatePayment}
            onReminderSent={handleReminderSent}
          />
        )}

        {activeTab === 'payouts' && (
          <PayoutsView
            bills={bills}
            account={account}
            onDisburseBill={handleDisburseBill}
            onNavigateToCollections={() => setActiveTab('collections')}
          />
        )}

        {activeTab === 'audit' && <AuditView logs={logs} />}
      </main>

      {/* Footer / Guardrail Notice */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        <p>
          MerchOps AI &bull; Built for PayPal AI Hackathon 2026 &bull; Strict Financial Rule: AI proposes, rules decide. AI never moves money.
        </p>
      </footer>
    </div>
  );
}

