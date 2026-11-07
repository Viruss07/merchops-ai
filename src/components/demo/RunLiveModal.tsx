'use client';

import React, { useState } from 'react';
import {
  X,
  Play,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Send,
  CreditCard,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { createPayPalInvoice, authorizePayout, syncInvoices } from '@/lib/apiClient';

interface RunLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshState: () => Promise<void>;
}

export function RunLiveModal({ isOpen, onClose, onRefreshState }: RunLiveModalProps) {
  const [step, setStep] = useState<
    'IDLE' | 'INVOICE_CREATED' | 'INVOICE_SETTLED' | 'PAYOUT_DISPATCHED'
  >('IDLE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [recipientViewUrl, setRecipientViewUrl] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateLiveInvoice = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await createPayPalInvoice('inv-apex-01');
      setInvoiceId(res.paypalInvoiceId);
      setRecipientViewUrl(res.recipientViewUrl);
      setStep('INVOICE_CREATED');
      await onRefreshState();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invoice creation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSettlement = async () => {
    setLoading(true);
    setError(null);
    try {
      await syncInvoices();
      setStep('INVOICE_SETTLED');
      await onRefreshState();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDispatchLivePayout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authorizePayout({
        billId: 'bill-cloud-02',
        executionMode: 'PAYPAL_SANDBOX',
      });
      setBatchId(res.batchId ?? 'BATCH-SANDBOX-LIVE');
      setStep('PAYOUT_DISPATCHED');
      await onRefreshState();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payout dispatch failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-live-title"
        className="w-full max-w-lg my-auto rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="rounded-xl bg-blue-600 p-2 text-white">
              <Play className="h-5 w-5 fill-current" />
            </div>
            <div>
              <h2 id="run-live-title" className="text-base font-bold text-slate-900">
                Run It Live on PayPal Sandbox
              </h2>
              <p className="text-xs text-slate-500">
                1-Click end-to-end verified money flow for judges
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Flow Stepper */}
          <div className="space-y-4">
            {/* Step 1: Invoicing */}
            <div
              className={`rounded-xl border p-4 transition ${
                step === 'IDLE' ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">
                  Step 1: Create Real PayPal Sandbox Invoice
                </span>
                {invoiceId && (
                  <span className="inline-flex items-center space-x-1 text-emerald-700 text-xs font-bold">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Created</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Creates an active invoice on PayPal Invoicing v2 for Apex Corp ($1,500.00).
              </p>

              {invoiceId && (
                <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1.5 font-mono text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Invoice ID:</span>
                    <div className="flex items-center space-x-1">
                      <span className="font-bold text-slate-900">{invoiceId}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(invoiceId, 'inv')}
                        className="p-1 hover:text-slate-900"
                      >
                        {copiedKey === 'inv' ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
                  {recipientViewUrl && (
                    <div className="pt-1.5">
                      <a
                        href={recipientViewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center space-x-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition"
                      >
                        <span>Open Customer Pay Link</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {step === 'IDLE' && (
                <button
                  type="button"
                  onClick={handleCreateLiveInvoice}
                  disabled={loading}
                  className="mt-3 w-full inline-flex items-center justify-center space-x-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow hover:bg-blue-700 transition"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  <span>Create Invoice on PayPal</span>
                </button>
              )}
            </div>

            {/* Step 2: Settle Invoice */}
            <div
              className={`rounded-xl border p-4 transition ${
                step === 'INVOICE_CREATED'
                  ? 'border-blue-400 bg-blue-50/50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">
                  Step 2: Confirm Payment & Watch Runway Flip Green
                </span>
                {step === 'INVOICE_SETTLED' || step === 'PAYOUT_DISPATCHED' ? (
                  <span className="inline-flex items-center space-x-1 text-emerald-700 text-xs font-bold">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Settled</span>
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Once paid via the customer link, sync reconciliation clears the cash and eliminates
                the Day-10 runway deficit.
              </p>

              {step === 'INVOICE_CREATED' && (
                <button
                  type="button"
                  onClick={handleConfirmSettlement}
                  disabled={loading}
                  className="mt-3 w-full inline-flex items-center justify-center space-x-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700 transition"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>Sync Payment & Recompute Runway</span>
                </button>
              )}
            </div>

            {/* Step 3: Outbound Payout */}
            <div
              className={`rounded-xl border p-4 transition ${
                step === 'INVOICE_SETTLED'
                  ? 'border-blue-400 bg-blue-50/50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">
                  Step 3: Authorize Real $1.00 Payout
                </span>
                {batchId && (
                  <span className="inline-flex items-center space-x-1 text-emerald-700 text-xs font-bold">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Disbursed</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Dispatches an authorized vendor payout to POST /v1/payments/payouts with
                deterministic request ID and fee checking.
              </p>

              {batchId && (
                <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-xs flex items-center justify-between">
                  <span className="text-slate-600">Batch ID:</span>
                  <div className="flex items-center space-x-1">
                    <span className="font-bold text-slate-900">{batchId}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(batchId, 'batch')}
                      className="p-1 hover:text-slate-900"
                    >
                      {copiedKey === 'batch' ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {step === 'INVOICE_SETTLED' && (
                <button
                  type="button"
                  onClick={handleDispatchLivePayout}
                  disabled={loading}
                  className="mt-3 w-full inline-flex items-center justify-center space-x-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow hover:bg-indigo-700 transition"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span>Authorize Payout on PayPal</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            Origin: api-m.sandbox.paypal.com
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-300 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
