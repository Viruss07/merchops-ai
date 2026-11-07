'use client';

import React, { useCallback, useState } from 'react';
import { AlertCircle, Sparkles, CreditCard, Lock, Loader2 } from 'lucide-react';
import { formatCentsToUSD } from '@/lib/money';
import { getErrorMessage } from '@/lib/apiClient';
import { useFocusTrap } from '@/lib/useFocusTrap';
import type { Invoice } from '@/types';
import { ReminderDrawer } from '@/components/collections/ReminderDrawer';
import { InvoicesGrid } from '@/components/collections/InvoicesGrid';

interface CollectionsViewProps {
  invoices: Invoice[];
  onSimulatePayment: (invoiceId: string) => Promise<void>;
  onReminderSent: (invoiceId: string, subject: string, body: string) => Promise<void>;
  onCreatePayPalInvoice?: (invoice: Invoice) => Promise<void>;
  onSyncInvoices?: () => Promise<void>;
}

export function CollectionsView({
  invoices,
  onSimulatePayment,
  onReminderSent,
  onCreatePayPalInvoice,
  onSyncInvoices,
}: CollectionsViewProps) {
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<Invoice | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const handleOpenDraft = useCallback((invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setDrawerOpen(true);
  }, []);

  const handleCloseDraft = useCallback(() => {
    setDrawerOpen(false);
    setSelectedInvoice(null);
  }, []);

  const handleOpenPaymentModal = useCallback((invoice: Invoice) => {
    setPaymentError(null);
    setPaymentLoading(false);
    setPaymentModalInvoice(invoice);
  }, []);

  const handleClosePaymentModal = useCallback(() => {
    if (paymentLoading) return;
    setPaymentModalInvoice(null);
    setPaymentError(null);
  }, [paymentLoading]);

  const handleConfirmSimulation = useCallback(async () => {
    if (!paymentModalInvoice || paymentLoading) return;
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      await onSimulatePayment(paymentModalInvoice.id);
      setPaymentModalInvoice(null);
    } catch (error) {
      setPaymentError(getErrorMessage(error));
    } finally {
      setPaymentLoading(false);
    }
  }, [paymentModalInvoice, paymentLoading, onSimulatePayment]);

  const paymentModalRef = useFocusTrap<HTMLDivElement>(
    Boolean(paymentModalInvoice),
    paymentLoading ? undefined : handleClosePaymentModal,
  );

  const overdueInvoices = invoices.filter((invoice) => invoice.status === 'OVERDUE');
  const totalOverdueCents = overdueInvoices.reduce(
    (total, invoice) => total + invoice.amountCents,
    0,
  );

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
                Accelerating payment from{' '}
                <strong className="text-slate-800">{overdueInvoices[0].customerName}</strong> will
                immediately replenish cash reserves before supplier bills mature.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleOpenDraft(overdueInvoices[0])}
            className="inline-flex items-center space-x-1.5 rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white shadow-md shadow-amber-700/20 hover:bg-amber-800 transition active:scale-95 shrink-0 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
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
            Intelligent invoice tracking, OpenRouter-assisted reminders, and one-click PayPal
            Sandbox payment settlement.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        onOpenPaymentModal={handleOpenPaymentModal}
        onCreatePayPalInvoice={onCreatePayPalInvoice}
        onSyncInvoices={onSyncInvoices}
      />

      {/* AI Reminder Drawer */}
      <ReminderDrawer
        invoice={selectedInvoice}
        isOpen={drawerOpen}
        onClose={handleCloseDraft}
        onApproveAndSend={onReminderSent}
      />

      {/* Clearly Labelled Payment Simulation Modal */}
      {paymentModalInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleClosePaymentModal();
            }
          }}
        >
          <div
            ref={paymentModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-simulation-title"
            className="w-full max-w-md my-auto max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-slate-200"
          >
            <div className="flex items-center space-x-3 text-emerald-600 mb-3">
              <div className="rounded-xl bg-emerald-100 p-2.5">
                <CreditCard className="h-6 w-6" />
              </div>
              <div>
                <h3 id="payment-simulation-title" className="text-base font-bold text-slate-900">
                  Simulate PayPal Customer Settlement
                </h3>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase">
                  Sandbox Simulation Mode
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-3">
              This action simulates customer{' '}
              <strong className="text-slate-800">{paymentModalInvoice.customerName}</strong>{' '}
              completing payment of{' '}
              <strong className="text-slate-800">
                {formatCentsToUSD(paymentModalInvoice.amountCents)}
              </strong>{' '}
              via the PayPal Sandbox checkout link.
            </p>

            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 mb-4 text-[11px] text-amber-900 leading-normal">
              <strong>Notice:</strong> This is a local ledger demonstration simulating customer
              settlement. No actual money movement or PayPal live transactions have occurred.
            </div>

            <div className="rounded-xl bg-slate-50 p-3.5 mb-5 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-slate-500">
                <span>Invoice:</span>
                <span className="font-bold text-slate-800">
                  {paymentModalInvoice.invoiceNumber}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Amount:</span>
                <span className="font-bold text-emerald-700">
                  +{formatCentsToUSD(paymentModalInvoice.amountCents)}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Settlement Target:</span>
                <span className="font-bold text-slate-800">Merchant Cleared Cash</span>
              </div>
            </div>

            {paymentError && (
              <div
                role="alert"
                className="mb-4 flex items-start space-x-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <div>
                  <p className="font-bold">Settlement failed</p>
                  <p>{paymentError}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={handleClosePaymentModal}
                disabled={paymentLoading}
                className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmSimulation()}
                disabled={paymentLoading}
                className="inline-flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                {paymentLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                    <span>Processing…</span>
                  </>
                ) : (
                  <span>Confirm Settlement</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
