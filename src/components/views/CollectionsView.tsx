'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  CreditCard,
  Send,
  Calendar,
  Lock,
  ArrowUpRight,
  Info,
} from 'lucide-react';
import { formatCentsToUSD } from '@/lib/money';
import { Invoice } from '@/types';
import { ReminderDrawer } from '@/components/collections/ReminderDrawer';
import { InvoicesGrid } from '@/components/collections/InvoicesGrid';

interface CollectionsViewProps {
  invoices: Invoice[];
  onSimulatePayment: (invoiceId: string) => void;
  onReminderSent?: (invoiceId: string, subject: string, body: string) => void;
}

export function CollectionsView({
  invoices,
  onSimulatePayment,
  onReminderSent,
}: CollectionsViewProps) {
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<Invoice | null>(null);

  const handleOpenDraft = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setDrawerOpen(true);
  };

  const handleCloseDraft = () => {
    setDrawerOpen(false);
    setSelectedInvoice(null);
  };

  const handleApproveAndSend = (invoiceId: string, subject: string, body: string) => {
    if (onReminderSent) {
      onReminderSent(invoiceId, subject, body);
    }
  };

  const handleConfirmSimulation = () => {
    if (paymentModalInvoice) {
      onSimulatePayment(paymentModalInvoice.id);
      setPaymentModalInvoice(null);
    }
  };

  const overdueInvoices = invoices.filter((i) => i.status === 'OVERDUE');
  const totalOverdueCents = overdueInvoices.reduce((acc, curr) => acc + curr.amountCents, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner Alert for Overdue Receivables */}
      {overdueInvoices.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/80 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="rounded-xl bg-amber-600 p-2.5 text-white shadow-md shadow-amber-600/20">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900 uppercase">
                  Action Recommended
                </span>
                <span className="text-xs font-semibold text-amber-800">
                  {overdueInvoices.length} Overdue Account
                </span>
              </div>
              <h3 className="mt-0.5 text-base font-bold text-slate-900">
                {formatCentsToUSD(totalOverdueCents)} in overdue receivables awaiting collection
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">
                Accelerating payment from <strong className="text-slate-800">{overdueInvoices[0]?.customerName}</strong> will immediately replenish cash reserves before supplier bills mature.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleOpenDraft(overdueInvoices[0])}
            className="inline-flex items-center space-x-1.5 rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white shadow-md shadow-amber-700/20 hover:bg-amber-800 transition active:scale-95 shrink-0"
          >
            <Sparkles className="h-4 w-4" />
            <span>Draft AI Reminder</span>
          </button>
        </div>
      )}

      {/* Module Overview Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Collections (Accounts Receivable)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Intelligent invoice tracking, OpenRouter-assisted reminders, and one-click PayPal Sandbox payment settlement.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
            <Lock className="h-3 w-3" />
            <span>Human-in-the-Loop Approval Required</span>
          </span>
        </div>
      </div>

      {/* AG Grid Powered Invoices Ledger */}
      <InvoicesGrid
        invoices={invoices}
        onOpenDraft={handleOpenDraft}
        onOpenPaymentModal={(inv) => setPaymentModalInvoice(inv)}
      />

      {/* AI Reminder Drawer */}
      <ReminderDrawer
        invoice={selectedInvoice}
        isOpen={drawerOpen}
        onClose={handleCloseDraft}
        onApproveAndSend={handleApproveAndSend}
      />

      {/* Clearly Labelled Payment Simulation Modal */}
      {paymentModalInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center space-x-3 text-emerald-600 mb-3">
              <div className="rounded-xl bg-emerald-100 p-2.5">
                <CreditCard className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Simulate PayPal Customer Settlement
                </h3>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase">
                  Sandbox Simulation Mode
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-3">
              This action simulates customer <strong className="text-slate-800">{paymentModalInvoice.customerName}</strong> completing payment of{' '}
              <strong className="text-slate-800">{formatCentsToUSD(paymentModalInvoice.amountCents)}</strong> via the PayPal Sandbox checkout link.
            </p>

            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 mb-4 text-[11px] text-amber-900 leading-normal">
              <strong>Notice:</strong> This is a local ledger demonstration simulating customer settlement. No actual money movement or PayPal live transactions have occurred.
            </div>

            <div className="rounded-xl bg-slate-50 p-3.5 mb-5 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-slate-500">
                <span>Invoice:</span>
                <span className="font-bold text-slate-800">{paymentModalInvoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Amount:</span>
                <span className="font-bold text-emerald-700">+{formatCentsToUSD(paymentModalInvoice.amountCents)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Settlement Target:</span>
                <span className="font-bold text-slate-800">Merchant Cleared Cash</span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setPaymentModalInvoice(null)}
                className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSimulation}
                className="inline-flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition"
              >
                <span>Confirm Settlement</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
