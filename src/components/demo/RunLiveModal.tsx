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
  const [payoutStatus, setPayoutStatus] = useState<'DISBURSED' | 'IN_FLIGHT' | null>(null);
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
      const res = await syncInvoices('inv-apex-01');
      await onRefreshState();
      const apex = res.snapshot.invoices.find((inv) => inv.id === 'inv-apex-01');
      if (apex?.status === 'PAID') {
        setStep('INVOICE_SETTLED');
      } else {
        setError(
          'PayPal does not report this invoice as paid yet. Pay it through the customer link with a sandbox personal account, then sync again.'
        );
      }
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
      setBatchId(res.batchId ?? null);
      setPayoutStatus(res.status);
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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-live-title"
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-rule bg-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rule bg-paper px-5 py-4 sm:px-6">
          <div className="flex items-center space-x-2.5">
            <div className="rounded-md bg-ink p-2 text-panel">
              <Play className="h-5 w-5 fill-current" />
            </div>
            <div>
              <h2 id="run-live-title" className="text-base font-semibold text-ink">
                Run It Live on PayPal Sandbox
              </h2>
              <p className="text-xs text-ink-2">
                1-Click end-to-end verified money flow for judges
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close run it live dialog"
            className="rounded-md p-1.5 text-ink-3 transition-colors duration-200 hover:bg-rule hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-6">
          {error && (
            <div className="space-y-2 rounded-lg border border-blocked bg-blocked-field p-3.5 text-xs text-blocked">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-blocked" />
                <span>{error}</span>
              </div>
              {error.includes('403') || error.includes('NOT_AUTHORIZED') ? (
                <div className="rounded-md border border-blocked p-2 text-[11px]">
                  <strong>How to enable:</strong> Log in to{' '}
                  <a
                    href="https://developer.paypal.com/dashboard/applications/sandbox"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-semibold"
                  >
                    developer.paypal.com
                  </a>{' '}
                  &gt; Apps &amp; Credentials &gt; select your Sandbox App &gt; under App Settings, check <strong>&quot;Invoicing&quot;</strong> and save.
                </div>
              ) : null}
            </div>
          )}

          {/* Flow Stepper */}
          <div className="space-y-4">
            {/* Step 1: Invoicing */}
            <div
              className={`rounded-lg border p-4 transition-colors duration-200 ${
                step === 'IDLE' ? 'border-focus bg-paper' : 'border-rule bg-panel'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">
                  Step 1: Create Real PayPal Sandbox Invoice
                </span>
                {invoiceId && (
                  <span className="inline-flex items-center space-x-1 text-xs font-semibold text-safe">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Created</span>
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-ink-2">
                Creates an active invoice on PayPal Invoicing v2 for Apex Corp ($1,500.00).
              </p>

              {invoiceId && (
                <div className="mt-3 space-y-1.5 rounded-md border border-rule bg-paper p-2.5 font-mono text-xs">
                  <div className="flex items-center justify-between text-ink-3">
                    <span>Invoice ID:</span>
                    <div className="flex items-center space-x-1">
                      <span className="font-semibold text-ink">{invoiceId}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(invoiceId, 'inv')}
                        className="p-1 text-ink-3 transition-colors duration-200 hover:text-ink"
                      >
                        {copiedKey === 'inv' ? (
                          <Check className="h-3 w-3 text-safe" />
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
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-panel transition-colors duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
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
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-ink px-3 py-2 text-xs font-semibold text-panel transition-colors duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
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
              className={`rounded-lg border p-4 transition-colors duration-200 ${
                step === 'INVOICE_CREATED' ? 'border-focus bg-paper' : 'border-rule bg-panel'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">
                  Step 2: Confirm Payment & Watch Runway Flip Green
                </span>
                {step === 'INVOICE_SETTLED' || step === 'PAYOUT_DISPATCHED' ? (
                  <span className="inline-flex items-center space-x-1 text-xs font-semibold text-safe">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Settled</span>
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-ink-2">
                Once paid via the customer link, sync reconciliation clears the cash and eliminates
                the Day-10 runway deficit.
              </p>

              {step === 'INVOICE_CREATED' && (
                <button
                  type="button"
                  onClick={handleConfirmSettlement}
                  disabled={loading}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-ink px-3 py-2 text-xs font-semibold text-panel transition-colors duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
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
              className={`rounded-lg border p-4 transition-colors duration-200 ${
                step === 'INVOICE_SETTLED' ? 'border-focus bg-paper' : 'border-rule bg-panel'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">
                  Step 3: Pay Nexus Cloud $400.00 via PayPal Payouts
                </span>
                {payoutStatus && (
                  <span
                    className={`inline-flex items-center space-x-1 text-xs font-semibold ${
                      payoutStatus === 'DISBURSED' ? 'text-safe' : 'text-ink-2'
                    }`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{payoutStatus === 'DISBURSED' ? 'Settled' : 'Accepted · awaiting settlement'}</span>
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-ink-2">
                POST /v1/payments/payouts with a deterministic PayPal-Request-Id. The reserve check
                includes the estimated $1.00 PayPal fee. Settlement is confirmed per item by
                webhook or sync, never assumed from the batch.
              </p>

              {batchId && (
                <div className="mt-3 flex items-center justify-between rounded-md border border-rule bg-paper p-2.5 font-mono text-xs">
                  <span className="text-ink-3">Batch ID:</span>
                  <div className="flex items-center space-x-1">
                    <span className="font-semibold text-ink">{batchId}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(batchId, 'batch')}
                      className="p-1 text-ink-3 transition-colors duration-200 hover:text-ink"
                    >
                      {copiedKey === 'batch' ? (
                        <Check className="h-3 w-3 text-safe" />
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
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-ink px-3 py-2 text-xs font-semibold text-panel transition-colors duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
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
        <div className="flex items-center justify-between border-t border-rule bg-paper px-5 py-3 sm:px-6">
          <span className="font-mono text-[11px] text-ink-3">Origin: api-m.sandbox.paypal.com</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-rule-strong bg-panel px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors duration-200 hover:bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
