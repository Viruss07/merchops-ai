'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  Info,
  Building2,
  Key,
} from 'lucide-react';
import { Bill, MerchantAccount, AuditLogEntry } from '@/types';
import { formatCentsToUSD, evaluatePayoutPolicy } from '@/lib/money';

interface PayoutApprovalModalProps {
  bill: Bill | null;
  account: MerchantAccount;
  isOpen: boolean;
  onClose: () => void;
  onPayoutSuccess: (
    billId: string,
    isRealPayPal: boolean,
    updatedAccount?: MerchantAccount,
    updatedBills?: Bill[],
    updatedLogs?: AuditLogEntry[]
  ) => void;
  onNavigateToCollections?: () => void;
}

export function PayoutApprovalModal({
  bill,
  account,
  isOpen,
  onClose,
  onPayoutSuccess,
  onNavigateToCollections,
}: PayoutApprovalModalProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [executionMode, setExecutionMode] = useState<'SIMULATION' | 'PAYPAL_SANDBOX'>('SIMULATION');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Generate unique idempotency key when modal opens
  useEffect(() => {
    if (isOpen && bill) {
      setConfirmed(false);
      setError(null);
      setSuccessMessage(null);
      const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setIdempotencyKey(uuid);
    }
  }, [isOpen, bill]);

  if (!isOpen || !bill) return null;

  const currentBalance = account.clearedBalanceCents;
  const reserve = account.minReserveCents;
  const policy = evaluatePayoutPolicy({
    currentBalanceCents: currentBalance,
    minReserveCents: reserve,
    billAmountCents: bill.amountCents,
  });
  const postPayoutBalance = policy.postPayoutBalanceCents;
  const wouldBreach = policy.wouldBreach;
  const deficitCents = policy.deficitCents;
  const bufferCents = policy.bufferCents;

  const handleAuthorize = async () => {
    if (!confirmed) {
      setError('You must confirm the authorization checkbox to proceed.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/payouts/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billId: bill.id,
          confirmed: true,
          idempotencyKey,
          executionMode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || `HTTP ${res.status}`);
      }

      setSuccessMessage(data.message || 'Payout authorized successfully.');
      setTimeout(() => {
        onPayoutSuccess(
          bill.id,
          data.mode === 'PAYPAL_SANDBOX',
          data.account,
          data.bills,
          data.auditLogs
        );
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to authorize payout.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="rounded-xl bg-blue-600 p-2 text-white">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Two-Step Merchant Payout Authorization
              </h2>
              <p className="text-xs text-slate-500">
                Step 1: Review financial liquidity &bull; Step 2: Explicit authorization
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Financial Guardrail Alert */}
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-2.5 flex items-center space-x-2 text-xs text-blue-900">
          <Lock className="h-4 w-4 text-blue-700 shrink-0" />
          <span>
            <strong>Financial Security Rule:</strong> AI cannot independently move money. All vendor disbursements require your explicit interactive confirmation.
          </span>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Bill Overview Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Vendor & Bill</span>
                <span className="text-base font-bold text-slate-900">{bill.vendorName}</span>
                <span className="text-xs text-slate-500 font-mono block">{bill.billNumber} &bull; {bill.category}</span>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">Disbursement Amount</span>
                <span className="text-xl font-bold font-mono text-slate-900">
                  {formatCentsToUSD(bill.amountCents)}
                </span>
                <span className="text-xs text-slate-500 block">Due in {bill.daysUntilDue} days</span>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-2.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Recipient Account: </span>
              <span className="font-mono text-slate-800">{bill.vendorEmail}</span>
            </div>
          </div>

          {/* Reserve Impact Analysis Card */}
          <div className={`rounded-xl border p-4 space-y-2.5 ${
            wouldBreach ? 'border-rose-300 bg-rose-50/70' : 'border-emerald-300 bg-emerald-50/70'
          }`}>
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
              <span className={wouldBreach ? 'text-rose-900' : 'text-emerald-900'}>
                {wouldBreach ? 'Reserve Floor Breach Warning' : 'Working Capital Reserve Safe'}
              </span>
              <span className={`inline-flex items-center space-x-1 rounded-full px-2 py-0.5 text-[11px] ${
                wouldBreach ? 'bg-rose-200 text-rose-900' : 'bg-emerald-200 text-emerald-900'
              }`}>
                {wouldBreach ? <ShieldAlert className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                <span>{wouldBreach ? 'UNSAFE' : 'SAFE'}</span>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-1">
              <div>
                <span className="text-slate-500 block text-[10px] font-sans">Current Cleared Cash</span>
                <span className="font-bold text-slate-900">{formatCentsToUSD(currentBalance)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-sans">Payout Amount</span>
                <span className="font-bold text-rose-700">-{formatCentsToUSD(bill.amountCents)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-sans">Projected Balance</span>
                <span className={`font-bold ${wouldBreach ? 'text-rose-700 underline' : 'text-emerald-700'}`}>
                  {formatCentsToUSD(postPayoutBalance)}
                </span>
              </div>
            </div>

            {wouldBreach ? (
              <div className="pt-1 space-y-2">
                <p className="text-xs text-rose-800 leading-normal">
                  Disbursing {formatCentsToUSD(bill.amountCents)} now would drop cash to {formatCentsToUSD(postPayoutBalance)}, breaching your {formatCentsToUSD(reserve)} safety floor by{' '}
                  <strong className="underline">{formatCentsToUSD(deficitCents)}</strong>. This payout is blocked until working capital is restored (e.g. by collecting overdue invoices).
                </p>
                {onNavigateToCollections && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToCollections();
                    }}
                    className="inline-flex items-center space-x-1.5 text-xs font-bold text-rose-900 bg-rose-200/80 hover:bg-rose-200 px-3 py-1.5 rounded-lg transition"
                  >
                    <span>Resolve Shortfall in Collections</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-emerald-800 pt-1 leading-normal">
                Even after disbursing {formatCentsToUSD(bill.amountCents)}, the remaining {formatCentsToUSD(postPayoutBalance)} safely exceeds your {formatCentsToUSD(reserve)} reserve floor with a +{formatCentsToUSD(bufferCents)} buffer.
              </p>
            )}
          </div>

          {/* Idempotency Key & Execution Rail */}
          <div className="space-y-3 pt-1">
            {/* Idempotency Display */}
            <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <div className="flex items-center space-x-1.5 text-slate-600">
                <Key className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-semibold">Idempotency Key:</span>
              </div>
              <span className="font-mono text-[11px] text-slate-800 font-bold truncate max-w-[280px]">
                {idempotencyKey}
              </span>
            </div>

            {/* Execution Rail Selector */}
            <div className="text-xs space-y-1.5">
              <label className="font-bold text-slate-700 uppercase tracking-wider block">
                Disbursement Execution Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExecutionMode('SIMULATION')}
                  className={`p-3 rounded-xl border text-left transition ${
                    executionMode === 'SIMULATION'
                      ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-bold block text-xs">Simulated Payout (Demo)</span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Recommended: verified local ledger settlement with full audit logging.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setExecutionMode('PAYPAL_SANDBOX')}
                  className={`p-3 rounded-xl border text-left transition ${
                    executionMode === 'PAYPAL_SANDBOX'
                      ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-bold block text-xs">Live PayPal Sandbox API</span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Dispatches batch to POST /v1/payments/payouts in PayPal Sandbox.
                  </span>
                </button>
              </div>
            </div>

            {/* Step 2: Explicit Confirmation Checkbox */}
            <div className="pt-2">
              <label className={`flex items-start space-x-3 rounded-xl border p-3.5 transition cursor-pointer ${
                wouldBreach ? 'border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
              }`}>
                <input
                  type="checkbox"
                  disabled={wouldBreach || loading}
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-800 leading-normal">
                  <strong>Explicit Merchant Confirmation:</strong> I have reviewed the post-payout balance and authorize the disbursement of <strong>{formatCentsToUSD(bill.amountCents)}</strong> to <strong>{bill.vendorName}</strong>.
                </span>
              </label>
            </div>
          </div>

          {/* Error & Success Messages */}
          {error && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-800 space-y-1">
              <div className="flex items-center space-x-1.5 font-bold">
                <AlertCircle className="h-4 w-4 text-rose-600" />
                <span>Authorization Blocked</span>
              </div>
              <p>{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs text-emerald-800 space-y-1">
              <div className="flex items-center space-x-1.5 font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Disbursement Approved & Executed</span>
              </div>
              <p>{successMessage}</p>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="border-t border-slate-200 p-4 bg-slate-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            Cancel
          </button>

          <button
            onClick={handleAuthorize}
            disabled={loading || wouldBreach || !confirmed || !!successMessage}
            className={`inline-flex items-center space-x-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-md transition active:scale-95 ${
              successMessage
                ? 'bg-emerald-600'
                : wouldBreach
                ? 'bg-slate-400 cursor-not-allowed shadow-none'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20 disabled:opacity-50'
            }`}
          >
            {loading ? (
              <span>Authorizing Payout...</span>
            ) : successMessage ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Disbursed!</span>
              </>
            ) : wouldBreach ? (
              <>
                <ShieldAlert className="h-4 w-4" />
                <span>Blocked by Reserve Floor</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Authorize & Disburse {formatCentsToUSD(bill.amountCents)}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
