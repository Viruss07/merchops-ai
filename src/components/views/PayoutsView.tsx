'use client';

import React, { useCallback, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Send,
  Lock,
  ArrowRight,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { formatCentsToUSD } from '@/lib/money';
import { ApiError, getErrorMessage, syncPayout } from '@/lib/apiClient';
import { evaluatePayoutPolicy } from '@/lib/payoutPolicy';
import type { Bill, MerchantAccount, StateSnapshot } from '@/types';
import { PayoutApprovalModal } from '@/components/payouts/PayoutApprovalModal';
import { BillsGrid } from '@/components/payouts/BillsGrid';

interface PayoutsViewProps {
  bills: Bill[];
  account: MerchantAccount;
  paypalSandboxEnabled: boolean;
  onDisburseBill: (
    billId: string,
    isRealPayPal: boolean,
    snapshot: StateSnapshot,
  ) => void;
  onNavigateToCollections?: () => void;
}

const ACTIVE_BILL_STATUSES: Bill['status'][] = ['PENDING', 'APPROVED', 'IN_FLIGHT'];

export function PayoutsView({
  bills,
  account,
  paypalSandboxEnabled,
  onDisburseBill,
  onNavigateToCollections,
}: PayoutsViewProps) {
  const [selectedBillForApproval, setSelectedBillForApproval] = useState<Bill | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [syncingBillId, setSyncingBillId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const currentBalance = account.clearedBalanceCents;
  const reserve = account.minReserveCents;

  const handleOpenApproval = useCallback((bill: Bill) => {
    setSelectedBillForApproval(bill);
    setModalOpen(true);
  }, []);

  const handleCloseApproval = useCallback(() => {
    setModalOpen(false);
    setSelectedBillForApproval(null);
  }, []);

  const handlePayoutSuccess = useCallback(
    (billId: string, isRealPayPal: boolean, snapshot: StateSnapshot) => {
      onDisburseBill(billId, isRealPayPal, snapshot);
    },
    [onDisburseBill],
  );

  const handleSyncPayout = useCallback(
    async (bill: Bill) => {
      if (syncingBillId) return;
      setSyncingBillId(bill.id);
      setSyncError(null);
      try {
        const response = await syncPayout(bill.id);
        onDisburseBill(bill.id, false, response.snapshot);
      } catch (error) {
        if (error instanceof ApiError && error.snapshot) {
          onDisburseBill(bill.id, false, error.snapshot);
        }
        setSyncError(getErrorMessage(error));
      } finally {
        setSyncingBillId(null);
      }
    },
    [onDisburseBill, syncingBillId],
  );

  const activeBills = bills
    .filter((bill) => ACTIVE_BILL_STATUSES.includes(bill.status))
    .sort((a, b) => {
      if (a.dueDate === b.dueDate) return a.id.localeCompare(b.id);
      return a.dueDate.localeCompare(b.dueDate);
    });

  const authorizableBills = activeBills.filter((bill) => bill.status !== 'IN_FLIGHT');
  const inFlightCount = activeBills.length - authorizableBills.length;
  const focusBill =
    authorizableBills.find(
      (bill) =>
        evaluatePayoutPolicy({
          currentBalanceCents: currentBalance,
          minReserveCents: reserve,
          billAmountCents: bill.amountCents,
        }).wouldBreach,
    ) ??
    authorizableBills[0] ??
    activeBills[0];
  const focusPolicy = focusBill
    ? evaluatePayoutPolicy({
        currentBalanceCents: currentBalance,
        minReserveCents: reserve,
        billAmountCents: focusBill.amountCents,
      })
    : null;

  return (
    <div className="space-y-6">
      {/* Dynamic Reserve Liquidity Banner */}
      {focusBill &&
        focusBill.status !== 'IN_FLIGHT' &&
        focusPolicy &&
        focusPolicy.wouldBreach && (
        <div className="rounded-2xl border-2 border-rose-300 bg-rose-50/90 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="rounded-xl bg-rose-600 p-2.5 text-white shadow-md shadow-rose-600/20 shrink-0">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-900 uppercase">
                  Payout Policy Guardrail Active
                </span>
                <span className="text-xs font-semibold text-rose-800">
                  Shortfall: -{formatCentsToUSD(focusPolicy.deficitCents)}
                </span>
              </div>
              <h3 className="mt-0.5 text-base font-bold text-slate-900">
                {focusBill.vendorName} disbursement ({formatCentsToUSD(focusBill.amountCents)})
                blocked by Cash Reserve Policy
              </h3>
              <p className="mt-0.5 text-xs text-slate-700 max-w-2xl leading-relaxed">
                Paying this bill now would reduce cleared cash from{' '}
                <strong>{formatCentsToUSD(currentBalance)}</strong> to{' '}
                <strong>{formatCentsToUSD(focusPolicy.postPayoutBalanceCents)}</strong>, breaching
                your <strong>{formatCentsToUSD(reserve)}</strong> safety floor by{' '}
                <strong className="text-rose-700 underline">
                  {formatCentsToUSD(focusPolicy.deficitCents)}
                </strong>
                . Disbursing is locked until you collect outstanding receivables.
              </p>
            </div>
          </div>

          {onNavigateToCollections && (
            <button
              type="button"
              onClick={onNavigateToCollections}
              className="inline-flex items-center space-x-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-rose-600/20 hover:bg-rose-700 transition active:scale-95 shrink-0 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
            >
              <span>Resolve in Collections</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {focusBill && focusBill.status === 'IN_FLIGHT' && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start space-x-3">
            <div className="rounded-xl bg-indigo-600 p-2.5 text-white shadow-md shadow-indigo-600/20 shrink-0">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Payout in flight</h3>
              <p className="mt-0.5 text-xs text-slate-600">
                {inFlightCount === 1
                  ? 'One vendor payout is currently being processed.'
                  : `${inFlightCount} vendor payouts are currently being processed.`}{' '}
                The ledger is not debited until PayPal confirms settlement. Duplicate
                disbursement is locked.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleSyncPayout(focusBill)}
            disabled={syncingBillId === focusBill.id}
            className="inline-flex items-center space-x-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700 transition disabled:opacity-60 shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${syncingBillId === focusBill.id ? 'animate-spin motion-reduce:animate-none' : ''}`}
            />
            <span>{syncingBillId === focusBill.id ? 'Checking PayPal…' : 'Sync PayPal Status'}</span>
          </button>
        </div>
      )}

      {syncError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800"
        >
          {syncError}
        </div>
      )}

      {focusBill &&
        focusBill.status !== 'IN_FLIGHT' &&
        focusPolicy &&
        !focusPolicy.wouldBreach && (
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/90 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="rounded-xl bg-emerald-600 p-2.5 text-white shadow-md shadow-emerald-600/20 shrink-0">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-900 uppercase">
                  Liquidity Restored &bull; Reserve Safe
                </span>
                <span className="text-xs font-semibold text-emerald-800">
                  Buffer: +
                  {formatCentsToUSD(focusPolicy.postPayoutBalanceCents - reserve)}
                </span>
              </div>
              <h3 className="mt-0.5 text-base font-bold text-slate-900">
                Working capital restored — {focusBill.vendorName} (
                {formatCentsToUSD(focusBill.amountCents)}) ready for authorization
              </h3>
              <p className="mt-0.5 text-xs text-slate-700 max-w-2xl leading-relaxed">
                Post-payout balance of{' '}
                <strong>{formatCentsToUSD(focusPolicy.postPayoutBalanceCents)}</strong> safely
                exceeds your <strong>{formatCentsToUSD(reserve)}</strong> minimum reserve. You can
                now execute this payout via simulated settlement
                {paypalSandboxEnabled ? ' or PayPal Sandbox API' : ''}.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleOpenApproval(focusBill)}
            className="inline-flex items-center space-x-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 transition active:scale-95 shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <Send className="h-4 w-4" />
            <span>Review & Authorize Payout</span>
          </button>
        </div>
      )}

      {!focusBill && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center space-x-3">
          <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">No open vendor bills</h3>
            <p className="text-xs text-slate-500">
              All payables are settled. New bills will appear here when they are scheduled.
            </p>
          </div>
        </div>
      )}

      {/* Module Overview Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-slate-900">
              Payouts (Accounts Payable & Vendor Bills)
            </h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-semibold text-slate-700">
              Cleared Cash: {formatCentsToUSD(currentBalance)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Enforces a strict {formatCentsToUSD(reserve)} safety reserve floor. Two-step human
            authorization required for all disbursements.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            Safety Floor: {formatCentsToUSD(reserve)}
          </span>
          {inFlightCount > 0 && (
            <span className="inline-flex items-center space-x-1.5 rounded-lg bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200">
              <Clock className="h-3 w-3" />
              <span>
                {inFlightCount} In Flight
              </span>
            </span>
          )}
          <span className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
            <Lock className="h-3 w-3" />
            <span>Rule: AI Proposes, Rules Decide</span>
          </span>
        </div>
      </div>

      {/* AG Grid Powered Vendor Payables Ledger */}
      <BillsGrid
        bills={bills}
        currentBalance={currentBalance}
        reserve={reserve}
        onOpenApproval={handleOpenApproval}
        onSyncPayout={handleSyncPayout}
        syncingBillId={syncingBillId}
      />

      {/* Two-Step Payout Approval Modal */}
      <PayoutApprovalModal
        bill={selectedBillForApproval}
        account={account}
        isOpen={modalOpen}
        paypalSandboxEnabled={paypalSandboxEnabled}
        onClose={handleCloseApproval}
        onPayoutSuccess={handlePayoutSuccess}
        onNavigateToCollections={onNavigateToCollections}
      />
    </div>
  );
}
