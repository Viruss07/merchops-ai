'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Send,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { formatCentsToUSD, evaluatePayoutPolicy } from '@/lib/money';
import { Bill, MerchantAccount, AuditLogEntry } from '@/types';
import { PayoutApprovalModal } from '@/components/payouts/PayoutApprovalModal';
import { BillsGrid } from '@/components/payouts/BillsGrid';

interface PayoutsViewProps {
  bills: Bill[];
  account: MerchantAccount;
  onDisburseBill: (
    billId: string,
    isRealPayPal?: boolean,
    updatedAccount?: MerchantAccount,
    updatedBills?: Bill[],
    updatedLogs?: AuditLogEntry[]
  ) => void;
  onNavigateToCollections?: () => void;
}

export function PayoutsView({
  bills,
  account,
  onDisburseBill,
  onNavigateToCollections,
}: PayoutsViewProps) {
  const [selectedBillForApproval, setSelectedBillForApproval] = useState<Bill | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const currentBalance = account.clearedBalanceCents;
  const reserve = account.minReserveCents;

  const handleOpenApproval = (bill: Bill) => {
    setSelectedBillForApproval(bill);
    setModalOpen(true);
  };

  const handleCloseApproval = () => {
    setModalOpen(false);
    setSelectedBillForApproval(null);
  };

  const handlePayoutSuccess = (
    billId: string,
    isRealPayPal: boolean,
    updatedAccount?: MerchantAccount,
    updatedBills?: Bill[],
    updatedLogs?: AuditLogEntry[]
  ) => {
    onDisburseBill(billId, isRealPayPal, updatedAccount, updatedBills, updatedLogs);
  };

  // Inspect the highest priority bill (Acme Supplies)
  const acmeBill = bills.find((b) => b.id === 'bill-acme-01');
  const acmePending = acmeBill && acmeBill.status === 'PENDING';
  const acmePolicy = acmeBill
    ? evaluatePayoutPolicy({
        currentBalanceCents: currentBalance,
        minReserveCents: reserve,
        billAmountCents: acmeBill.amountCents,
      })
    : null;
  const acmeWouldBreach = acmePending && acmePolicy ? acmePolicy.wouldBreach : false;
  const acmeDeficit = acmePolicy ? acmePolicy.deficitCents : 0;
  const acmePostBalance = acmePolicy ? acmePolicy.postPayoutBalanceCents : currentBalance;

  return (
    <div className="space-y-6">
      {/* Dynamic Reserve Liquidity Banner */}
      {acmePending && acmeWouldBreach && (
        <div className="rounded-2xl border-2 border-rose-300 bg-rose-50/90 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="rounded-xl bg-rose-600 p-2.5 text-white shadow-md shadow-rose-600/20 shrink-0">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="rounded-full bg-rose-200 px-2.5 py-0.5 text-xs font-bold text-rose-900 uppercase">
                  Payout Policy Guardrail Active
                </span>
                <span className="text-xs font-semibold text-rose-800">
                  Shortfall: -{formatCentsToUSD(acmeDeficit)}
                </span>
              </div>
              <h3 className="mt-0.5 text-base font-bold text-slate-900">
                Acme Supplies disbursement ({formatCentsToUSD(acmeBill.amountCents)}) blocked by Cash Reserve Policy
              </h3>
              <p className="mt-0.5 text-xs text-slate-700 max-w-2xl leading-relaxed">
                Paying this bill now would reduce cleared cash from <strong>{formatCentsToUSD(currentBalance)}</strong> to <strong>{formatCentsToUSD(acmePostBalance)}</strong>, breaching your <strong>{formatCentsToUSD(reserve)}</strong> safety floor by <strong className="text-rose-700 underline">{formatCentsToUSD(acmeDeficit)}</strong>. Disbursing is locked until you collect outstanding receivables.
              </p>
            </div>
          </div>

          {onNavigateToCollections && (
            <button
              onClick={onNavigateToCollections}
              className="inline-flex items-center space-x-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-rose-600/20 hover:bg-rose-700 transition active:scale-95 shrink-0"
            >
              <span>Resolve in Collections</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {acmePending && !acmeWouldBreach && (
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/90 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="rounded-xl bg-emerald-600 p-2.5 text-white shadow-md shadow-emerald-600/20 shrink-0">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="rounded-full bg-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-900 uppercase">
                  Liquidity Restored &bull; Reserve Safe
                </span>
                <span className="text-xs font-semibold text-emerald-800">
                  Buffer: +{formatCentsToUSD(acmePostBalance - reserve)}
                </span>
              </div>
              <h3 className="mt-0.5 text-base font-bold text-slate-900">
                Working capital restored — Acme Supplies ({formatCentsToUSD(acmeBill.amountCents)}) ready for authorization
              </h3>
              <p className="mt-0.5 text-xs text-slate-700 max-w-2xl leading-relaxed">
                Post-payout balance of <strong>{formatCentsToUSD(acmePostBalance)}</strong> safely exceeds your <strong>{formatCentsToUSD(reserve)}</strong> minimum reserve. You can now execute this payout via simulated settlement or PayPal Sandbox API.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleOpenApproval(acmeBill)}
            className="inline-flex items-center space-x-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 transition active:scale-95 shrink-0"
          >
            <Send className="h-4 w-4" />
            <span>Review & Authorize Payout</span>
          </button>
        </div>
      )}

      {/* Module Overview Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-slate-900">Payouts (Accounts Payable & Vendor Bills)</h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-semibold text-slate-700">
              Cleared Cash: {formatCentsToUSD(currentBalance)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Enforces a strict {formatCentsToUSD(reserve)} safety reserve floor. Two-step human authorization required for all disbursements.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            Safety Floor: {formatCentsToUSD(reserve)}
          </span>
          <span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
            Rule: AI Proposes, Rules Decide
          </span>
        </div>
      </div>

      {/* AG Grid Powered Vendor Payables Ledger */}
      <BillsGrid
        bills={bills}
        currentBalance={currentBalance}
        reserve={reserve}
        onOpenApproval={handleOpenApproval}
      />

      {/* Two-Step Payout Approval Modal */}
      <PayoutApprovalModal
        bill={selectedBillForApproval}
        account={account}
        isOpen={modalOpen}
        onClose={handleCloseApproval}
        onPayoutSuccess={handlePayoutSuccess}
        onNavigateToCollections={onNavigateToCollections}
      />
    </div>
  );
}
