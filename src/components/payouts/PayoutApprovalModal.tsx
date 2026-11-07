'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Send,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  Key,
  Loader2,
  Clock,
} from 'lucide-react';
import type { Bill, MerchantAccount, StateSnapshot } from '@/types';
import { formatCentsToUSD, calculatePayoutFeeCents } from '@/lib/money';
import {
  ApiError,
  authorizePayout,
  getErrorMessage,
  type PayoutExecutionMode,
  type PayoutSettlementStatus,
} from '@/lib/apiClient';
import { derivePayoutRequestId } from '@/lib/idempotency';
import { evaluatePayoutPolicy } from '@/lib/payoutPolicy';
import { useFocusTrap } from '@/lib/useFocusTrap';

interface PayoutApprovalModalProps {
  bill: Bill | null;
  account: MerchantAccount;
  isOpen: boolean;
  paypalSandboxEnabled: boolean;
  onClose: () => void;
  onPayoutSuccess: (billId: string, isRealPayPal: boolean, snapshot: StateSnapshot) => void;
  onNavigateToCollections?: () => void;
}

export function PayoutApprovalModal({
  bill,
  account,
  isOpen,
  paypalSandboxEnabled,
  onClose,
  onPayoutSuccess,
  onNavigateToCollections,
}: PayoutApprovalModalProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [executionMode, setExecutionMode] = useState<PayoutExecutionMode>('SIMULATION');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [outcomeStatus, setOutcomeStatus] = useState<PayoutSettlementStatus | null>(null);

  const idempotencyKeyRef = useRef('');
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const billId = bill?.id;

  useEffect(() => {
    if (isOpen && billId) {
      setConfirmed(false);
      setExecutionMode('SIMULATION');
      setError(null);
      setSuccessMessage(null);
      setOutcomeStatus(null);
      setLoading(false);
      const nextKey = derivePayoutRequestId(billId);
      idempotencyKeyRef.current = nextKey;
      setIdempotencyKey(nextKey);
    } else if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  }, [isOpen, billId]);

  useEffect(() => {
    return () => {
      if (autoCloseRef.current) {
        clearTimeout(autoCloseRef.current);
        autoCloseRef.current = null;
      }
    };
  }, []);

  const locked = loading;

  const handleClose = useCallback(() => {
    if (locked) return;
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
    onClose();
  }, [locked, onClose]);

  const dialogRef = useFocusTrap<HTMLDivElement>(
    isOpen && Boolean(bill),
    locked ? undefined : handleClose,
  );

  if (!isOpen || !bill) return null;

  const currentBalance = account.clearedBalanceCents;
  const reserve = account.minReserveCents;
  const estimatedFeeCents = calculatePayoutFeeCents(bill.amountCents);
  const feeCents = executionMode === 'PAYPAL_SANDBOX' ? estimatedFeeCents : 0;
  const settled = Boolean(successMessage) || bill.status === 'DISBURSED';
  const policy = settled
    ? {
        allowed: true,
        postPayoutBalanceCents: currentBalance,
        wouldBreach: false,
        deficitCents: 0,
        bufferCents: currentBalance - reserve,
      }
    : evaluatePayoutPolicy({
        currentBalanceCents: currentBalance,
        minReserveCents: reserve,
        billAmountCents: bill.amountCents,
        feeCents,
      });
  const postPayoutBalance = policy.postPayoutBalanceCents;
  const wouldBreach = policy.wouldBreach;
  const deficitCents = policy.deficitCents;
  const inFlight = bill.status === 'IN_FLIGHT';
  const authorizationBlocked = wouldBreach || inFlight;

  const handleAuthorize = async () => {
    if (!confirmed) {
      setError('You must confirm the authorization checkbox to proceed.');
      return;
    }
    if (authorizationBlocked || locked) return;
    if (!idempotencyKeyRef.current) {
      setError('The deterministic PayPal request id is unavailable.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await authorizePayout({
        billId: bill.id,
        executionMode,
      });

      setOutcomeStatus(response.status);
      setSuccessMessage(response.message);
      onPayoutSuccess(response.billId, response.mode === 'PAYPAL_SANDBOX', response.snapshot);

      // Only close automatically once the payout is definitively settled.
      if (response.status === 'DISBURSED') {
        autoCloseRef.current = setTimeout(() => {
          autoCloseRef.current = null;
          onClose();
        }, 1500);
      }
    } catch (caught) {
      setError(getErrorMessage(caught));

      if (caught instanceof ApiError) {
        if (caught.snapshot) {
          onPayoutSuccess(bill.id, executionMode === 'PAYPAL_SANDBOX', caught.snapshot);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const paypalDisabled = !paypalSandboxEnabled;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payout-modal-title"
        className="w-full max-w-xl my-auto max-h-[calc(100dvh-3rem)] rounded-lg bg-panel border border-rule overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="border-b border-rule px-6 py-4 flex items-center justify-between bg-paper shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="rounded-lg bg-ink p-2 text-panel">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h2 id="payout-modal-title" className="text-base font-bold text-ink">
                Two-Step Merchant Payout Authorization
              </h2>
              <p className="text-xs text-ink-3">
                Step 1: Review financial liquidity &bull; Step 2: Explicit authorization
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={locked}
            aria-label="Close payout authorization dialog"
            className="rounded-lg p-1.5 text-ink-3 hover:text-ink-2 hover:bg-rule transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-focus"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Financial Guardrail Alert */}
        <div className="bg-rule border-b border-rule-strong px-6 py-2.5 flex items-center space-x-2 text-xs text-ink shrink-0">
          <Lock className="h-4 w-4 text-ink-2 shrink-0" />
          <span>
            <strong>Financial Security Rule:</strong> AI cannot independently move money. All vendor
            disbursements require your explicit interactive confirmation.
          </span>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Bill Overview Card */}
          <div className="rounded-lg border border-rule bg-paper p-4 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[11px] font-mono text-ink-3 uppercase tracking-wider block">
                  Vendor & Bill
                </span>
                <span className="text-base font-bold text-ink">{bill.vendorName}</span>
                <span className="text-xs text-ink-3 font-mono block">
                  {bill.billNumber} &bull; {bill.category}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-mono text-ink-3 uppercase tracking-wider block">
                  Disbursement Amount
                </span>
                <span className="text-xl font-bold font-mono text-ink">
                  {formatCentsToUSD(bill.amountCents)}
                </span>
                <span className="text-xs text-ink-3 block">Due in {bill.daysUntilDue} days</span>
              </div>
            </div>

            <div className="border-t border-rule pt-2.5 text-xs text-ink-2">
              <span className="font-semibold text-ink-2">Recipient Account: </span>
              <span className="font-mono text-ink">{bill.vendorEmail}</span>
            </div>
          </div>

          {/* Reserve Impact Analysis Card */}
          <div
            className={`rounded-lg border p-4 space-y-2.5 ${
              wouldBreach ? 'border-blocked bg-blocked-field' : 'border-safe bg-safe-field'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
              <span className={wouldBreach ? 'text-blocked' : 'text-safe'}>
                {wouldBreach ? 'Reserve Floor Breach Warning' : 'Working Capital Reserve Safe'}
              </span>
              <span
                className={`inline-flex items-center space-x-1 rounded-full px-2 py-0.5 text-[11px] ${
                  wouldBreach ? 'bg-blocked-field text-blocked' : 'bg-safe-field text-safe'
                }`}
              >
                {wouldBreach ? (
                  <ShieldAlert className="h-3 w-3" />
                ) : (
                  <ShieldCheck className="h-3 w-3" />
                )}
                <span>{wouldBreach ? 'UNSAFE' : 'SAFE'}</span>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs font-mono pt-1">
              <div>
                <span className="text-ink-3 block text-[10px] font-sans">Current Cleared Cash</span>
                <span className="font-bold text-ink">{formatCentsToUSD(currentBalance)}</span>
              </div>
              <div>
                <span className="text-ink-3 block text-[10px] font-sans">Payout Amount</span>
                <span className="font-bold text-blocked">
                  -{formatCentsToUSD(bill.amountCents)}
                </span>
              </div>
              <div>
                <span className="text-ink-3 block text-[10px] font-sans">Projected Balance</span>
                <span
                  className={`font-bold ${wouldBreach ? 'text-blocked underline' : 'text-safe'}`}
                >
                  {formatCentsToUSD(postPayoutBalance)}
                </span>
              </div>
            </div>

            {executionMode === 'PAYPAL_SANDBOX' && (
              <div className="flex items-center justify-between text-[11px] bg-rule rounded px-2.5 py-1 text-ink">
                <span>PayPal Payout Fee (2%, max $1.00 USD):</span>
                <span className="font-mono font-bold">
                  -{formatCentsToUSD(estimatedFeeCents)} (included in reserve check)
                </span>
              </div>
            )}

            {wouldBreach ? (
              <div className="pt-1 space-y-2">
                <p className="text-xs text-blocked leading-normal">
                  Disbursing {formatCentsToUSD(bill.amountCents)} now would drop cash to{' '}
                  {formatCentsToUSD(postPayoutBalance)}, breaching your {formatCentsToUSD(reserve)}{' '}
                  safety floor by{' '}
                  <strong className="underline">{formatCentsToUSD(deficitCents)}</strong>. This
                  payout is blocked until working capital is restored (e.g. by collecting overdue
                  invoices).
                </p>
                {onNavigateToCollections && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToCollections();
                    }}
                    className="inline-flex items-center space-x-1.5 text-xs font-bold text-panel bg-blocked hover:opacity-90 px-3 py-1.5 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blocked"
                  >
                    <span>Resolve Shortfall in Collections</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-safe pt-1 leading-normal">
                Even after disbursing {formatCentsToUSD(bill.amountCents)}, the remaining{' '}
                {formatCentsToUSD(postPayoutBalance)} safely exceeds your{' '}
                {formatCentsToUSD(reserve)} reserve floor with a +
                {formatCentsToUSD(postPayoutBalance - reserve)} buffer.
              </p>
            )}
          </div>

          {/* Idempotency Key & Execution Rail */}
          <div className="space-y-3 pt-1">
            {/* Idempotency Display */}
            <div className="flex items-center justify-between text-xs bg-paper border border-rule rounded-lg px-3 py-2">
              <div className="flex items-center space-x-1.5 text-ink-2">
                <Key className="h-3.5 w-3.5 text-ink-3" />
                <span className="font-semibold">PayPal-Request-Id:</span>
              </div>
              <span className="font-mono text-[11px] text-ink font-bold truncate max-w-[280px]">
                {idempotencyKey || 'Unavailable'}
              </span>
            </div>

            {/* Execution Rail Selector */}
            <div className="text-xs space-y-1.5">
              <span
                id="execution-mode-label"
                className="font-bold text-ink-2 uppercase tracking-wider block"
              >
                Disbursement Execution Mode
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={executionMode === 'SIMULATION'}
                  onClick={() => setExecutionMode('SIMULATION')}
                  disabled={locked}
                  className={`p-3 rounded-lg border text-left transition disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-focus ${
                    executionMode === 'SIMULATION'
                      ? 'border-ink bg-rule text-ink ring-2 ring-focus'
                      : 'border-rule bg-panel text-ink-2 hover:bg-paper'
                  }`}
                >
                  <span className="font-bold block text-xs">Simulated Payout (Demo)</span>
                  <span className="text-[11px] text-ink-3 block mt-0.5">
                    Local simulation: deterministic in-memory settlement with full audit logging.
                  </span>
                </button>

                <button
                  type="button"
                  aria-pressed={executionMode === 'PAYPAL_SANDBOX'}
                  aria-disabled={paypalDisabled}
                  onClick={() => setExecutionMode('PAYPAL_SANDBOX')}
                  disabled={locked || paypalDisabled}
                  className={`p-3 rounded-lg border text-left transition disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-focus ${
                    executionMode === 'PAYPAL_SANDBOX'
                      ? 'border-ink bg-rule text-ink ring-2 ring-focus'
                      : 'border-rule bg-panel text-ink-2 hover:bg-paper'
                  }`}
                >
                  <span className="font-bold block text-xs">PayPal Sandbox API</span>
                  <span className="text-[11px] text-ink-3 block mt-0.5">
                    Dispatches a batch to POST /v1/payments/payouts in PayPal Sandbox. Settlement
                    requires confirmation.
                  </span>
                </button>
              </div>
              {paypalDisabled && (
                <p className="text-[11px] text-risk">
                  PayPal Sandbox payouts are disabled in this environment. Simulated payout is the
                  only available execution mode.
                </p>
              )}
            </div>

            {inFlight && (
              <div
                role="status"
                className="rounded-lg border border-risk bg-risk-field p-3.5 text-xs text-risk flex items-start space-x-2"
              >
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-risk" />
                <span>
                  A payout for this bill is already in flight. Duplicate disbursement is locked
                  until the in-flight payout settles or is reconciled.
                </span>
              </div>
            )}

            {/* Step 2: Explicit Confirmation Checkbox */}
            <div className="pt-2">
              <label
                htmlFor="payout-confirm"
                className={`flex items-start space-x-3 rounded-lg border p-3.5 transition ${
                  authorizationBlocked || locked
                    ? 'border-rule bg-rule opacity-70 cursor-not-allowed'
                    : 'border-rule-strong bg-paper hover:bg-rule cursor-pointer'
                }`}
              >
                <input
                  id="payout-confirm"
                  type="checkbox"
                  disabled={authorizationBlocked || locked}
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-rule-strong text-ink focus:ring-focus"
                />
                <span className="text-xs text-ink leading-normal">
                  <strong>Explicit Merchant Confirmation:</strong> I have reviewed the post-payout
                  balance and authorize the disbursement of{' '}
                  <strong>{formatCentsToUSD(bill.amountCents)}</strong> to{' '}
                  <strong>{bill.vendorName}</strong>.
                </span>
              </label>
            </div>
          </div>

          {/* Error & Success Messages */}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-blocked bg-blocked-field p-3.5 text-xs text-blocked space-y-1"
            >
              <div className="flex items-center space-x-1.5 font-bold">
                <AlertCircle className="h-4 w-4 text-blocked" />
                <span>Authorization Blocked</span>
              </div>
              <p>{error}</p>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              aria-live="polite"
              className={`rounded-lg border p-3.5 text-xs space-y-1 ${
                outcomeStatus === 'IN_FLIGHT'
                  ? 'border-risk bg-risk-field text-risk'
                  : 'border-safe bg-safe-field text-safe'
              }`}
            >
              <div className="flex items-center space-x-1.5 font-bold">
                {outcomeStatus === 'IN_FLIGHT' ? (
                  <Clock className="h-4 w-4 text-risk" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-safe" />
                )}
                <span>
                  {outcomeStatus === 'IN_FLIGHT'
                    ? 'Payout Submitted — Awaiting Settlement'
                    : 'Disbursement Confirmed & Recorded'}
                </span>
              </div>
              <p>{successMessage}</p>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="border-t border-rule p-4 bg-paper flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={locked}
            className="rounded-lg border border-rule-strong bg-panel px-4 py-2 text-xs font-semibold text-ink-2 hover:bg-rule transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => void handleAuthorize()}
            disabled={
              loading ||
              authorizationBlocked ||
              !confirmed ||
              !idempotencyKey ||
              Boolean(successMessage)
            }
            className={`inline-flex items-center space-x-2 rounded-lg px-5 py-2.5 text-sm font-bold text-panel transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              successMessage
                ? 'bg-safe focus:ring-safe'
                : authorizationBlocked
                  ? 'bg-ink-3 cursor-not-allowed shadow-none focus:ring-focus'
                  : 'bg-ink hover:opacity-90 focus:ring-focus disabled:opacity-50'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                <span>Authorizing Payout…</span>
              </>
            ) : outcomeStatus === 'IN_FLIGHT' ? (
              <>
                <Clock className="h-4 w-4" />
                <span>Awaiting Settlement</span>
              </>
            ) : successMessage ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Settled</span>
              </>
            ) : inFlight ? (
              <>
                <Lock className="h-4 w-4" />
                <span>Payout In Flight</span>
              </>
            ) : wouldBreach ? (
              <>
                <ShieldAlert className="h-4 w-4" />
                <span>Blocked by Reserve Floor</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Authorize Payout {formatCentsToUSD(bill.amountCents)}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
