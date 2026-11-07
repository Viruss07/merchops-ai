'use client';

import React, { useState, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  GetQuickFilterTextParams,
  GetRowIdParams,
  ICellRendererParams,
  ValueGetterParams,
} from 'ag-grid-community';
import { formatCentsToUSD } from '@/lib/money';
import { merchOpsTheme, noRowsOverlayTemplate } from '@/lib/agGrid';
import type { Bill } from '@/types';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Send,
  Lock,
  Search,
  RefreshCw,
  XCircle,
} from 'lucide-react';

interface BillsGridProps {
  bills: Bill[];
  currentBalance: number;
  reserve: number;
  onOpenApproval: (bill: Bill) => void;
  onSyncPayout: (bill: Bill) => void;
  syncingBillId: string | null;
}

const ACTIVE_BILL_STATUSES: Bill['status'][] = ['PENDING', 'APPROVED', 'IN_FLIGHT'];

const STATUS_LABELS: Record<Bill['status'], string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  IN_FLIGHT: 'In Flight',
  DISBURSED: 'Disbursed',
  FAILED: 'Failed',
};

export function BillsGrid({
  bills,
  currentBalance,
  reserve,
  onOpenApproval,
  onSyncPayout,
  syncingBillId,
}: BillsGridProps) {
  const [quickFilterText, setQuickFilterText] = useState('');

  const columnDefs = useMemo<ColDef<Bill>[]>(
    () => [
      {
        headerName: 'Vendor',
        field: 'vendorName',
        minWidth: 130,
        flex: 1.1,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<Bill>) => {
          const bill = params.data;
          if (!bill) return null;
          return (
            <div className="flex flex-col justify-center h-full py-1">
              <span className="font-semibold text-ink text-xs leading-tight">
                {bill.vendorName}
              </span>
              <span className="font-mono text-[11px] text-ink-3 truncate leading-tight mt-0.5">
                {bill.vendorEmail}
              </span>
            </div>
          );
        },
      },
      {
        headerName: 'Bill ID',
        field: 'billNumber',
        minWidth: 120,
        flex: 1.0,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<Bill>) => {
          const bill = params.data;
          if (!bill) return null;
          return (
            <div className="flex flex-col justify-center h-full py-1">
              <span className="font-mono font-bold text-ink leading-tight">{bill.billNumber}</span>
              <span className="text-[10px] text-ink-3 font-sans truncate max-w-xs leading-tight mt-0.5">
                {bill.category} &bull; {bill.description}
              </span>
            </div>
          );
        },
      },
      {
        headerName: 'Amount',
        field: 'amountCents',
        minWidth: 90,
        maxWidth: 125,
        flex: 0.8,
        sortable: true,
        filter: 'agNumberColumnFilter',
        type: 'numericColumn',
        filterValueGetter: (params: ValueGetterParams<Bill>) =>
          params.data ? params.data.amountCents / 100 : null,
        getQuickFilterText: (params: GetQuickFilterTextParams<Bill>) =>
          params.data
            ? `${formatCentsToUSD(params.data.amountCents)} ${(params.data.amountCents / 100).toFixed(2)}`
            : '',
        cellRenderer: (params: ICellRendererParams<Bill, number>) => {
          if (params.value == null) return null;
          return (
            <div className="flex items-center justify-end h-full">
              <span className="font-mono font-bold text-sm text-ink">
                {formatCentsToUSD(params.value)}
              </span>
            </div>
          );
        },
      },
      {
        headerName: 'Due Date',
        field: 'dueDate',
        minWidth: 120,
        maxWidth: 160,
        flex: 0.9,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<Bill>) => {
          const bill = params.data;
          if (!bill) return null;
          return (
            <div className="flex items-center space-x-1.5 h-full text-xs text-ink-2">
              <Clock className="h-3.5 w-3.5 text-ink-3 shrink-0" />
              <span>
                Due in {bill.daysUntilDue}d ({bill.dueDate})
              </span>
            </div>
          );
        },
      },
      {
        headerName: 'Projected Balance',
        minWidth: 110,
        maxWidth: 140,
        flex: 0.9,
        sortable: true,
        filter: 'agNumberColumnFilter',
        filterValueGetter: (params: ValueGetterParams<Bill>) =>
          params.data ? (currentBalance - params.data.amountCents) / 100 : null,
        valueGetter: (params: ValueGetterParams<Bill>) => {
          const bill = params.data;
          if (!bill) return 0;
          return currentBalance - bill.amountCents;
        },
        cellRenderer: (params: ICellRendererParams<Bill>) => {
          const bill = params.data;
          if (!bill) return null;
          if (bill.status === 'DISBURSED') {
            return (
              <div className="flex items-center h-full text-xs font-mono text-ink-3">
                <span>Settled</span>
              </div>
            );
          }
          const postPayoutBalance = currentBalance - bill.amountCents;
          const wouldBreach = postPayoutBalance < reserve;
          return (
            <div className="flex items-center h-full">
              <span
                className={`font-mono font-bold text-xs ${
                  wouldBreach ? 'text-blocked underline' : 'text-safe'
                }`}
              >
                {formatCentsToUSD(postPayoutBalance)}
              </span>
            </div>
          );
        },
      },
      {
        headerName: 'Reserve Impact',
        minWidth: 165,
        flex: 1.2,
        sortable: true,
        filter: true,
        getQuickFilterText: (params: GetQuickFilterTextParams<Bill>) => {
          const bill = params.data;
          if (!bill) return '';
          if (bill.status === 'FAILED') return 'Failed No funds moved';
          if (!ACTIVE_BILL_STATUSES.includes(bill.status)) return 'Settled';
          const postPayoutBalance = currentBalance - bill.amountCents;
          return postPayoutBalance < reserve
            ? `Breaches Floor ${formatCentsToUSD(reserve - postPayoutBalance)}`
            : `Reserve Safe ${formatCentsToUSD(postPayoutBalance - reserve)}`;
        },
        valueGetter: (params: ValueGetterParams<Bill>) => {
          const bill = params.data;
          if (!bill) return '';
          if (bill.status === 'FAILED') return 'Failed No funds moved';
          if (!ACTIVE_BILL_STATUSES.includes(bill.status)) return 'Settled';
          const postPayoutBalance = currentBalance - bill.amountCents;
          return postPayoutBalance < reserve ? 'Breaches Floor' : 'Reserve Safe';
        },
        cellRenderer: (params: ICellRendererParams<Bill>) => {
          const bill = params.data;
          if (!bill) return null;
          const isActive = ACTIVE_BILL_STATUSES.includes(bill.status);
          const postPayoutBalance = currentBalance - bill.amountCents;
          const wouldBreach = isActive && postPayoutBalance < reserve;
          const deficit = wouldBreach ? reserve - postPayoutBalance : 0;
          const buffer = isActive && !wouldBreach ? postPayoutBalance - reserve : 0;

          if (bill.status === 'FAILED') {
            return (
              <div className="flex items-center h-full">
                <span className="inline-flex items-center space-x-1 rounded-full bg-blocked-field px-2.5 py-0.5 text-xs font-semibold text-blocked">
                  <XCircle className="h-3.5 w-3.5 text-blocked" />
                  <span>Failed — no funds moved</span>
                </span>
              </div>
            );
          }

          if (!isActive) {
            return (
              <div className="flex items-center h-full">
                <span className="inline-flex items-center space-x-1 rounded-full bg-rule px-2.5 py-0.5 text-xs font-medium text-ink-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-safe" />
                  <span>Settled / Disbursed</span>
                </span>
              </div>
            );
          }

          if (wouldBreach) {
            return (
              <div className="flex items-center h-full">
                <span className="inline-flex items-center space-x-1 rounded-full bg-blocked-field px-2.5 py-0.5 text-xs font-semibold text-blocked">
                  <ShieldAlert className="h-3.5 w-3.5 text-blocked shrink-0" />
                  <span>Breaches Floor (-{formatCentsToUSD(deficit)})</span>
                </span>
              </div>
            );
          }

          return (
            <div className="flex items-center h-full">
              <span className="inline-flex items-center space-x-1 rounded-full bg-safe-field px-2.5 py-0.5 text-xs font-semibold text-safe">
                <ShieldCheck className="h-3.5 w-3.5 text-safe shrink-0" />
                <span>Reserve Safe (+{formatCentsToUSD(buffer)})</span>
              </span>
            </div>
          );
        },
      },
      {
        headerName: 'Status',
        field: 'status',
        minWidth: 125,
        maxWidth: 160,
        flex: 1.0,
        sortable: true,
        filter: true,
        getQuickFilterText: (params: GetQuickFilterTextParams<Bill>) =>
          params.data ? STATUS_LABELS[params.data.status] : '',
        cellRenderer: (params: ICellRendererParams<Bill, Bill['status']>) => {
          const bill = params.data;
          if (!bill) return null;
          if (bill.status === 'DISBURSED') {
            return (
              <div className="flex items-center space-x-1 text-xs font-semibold text-safe h-full">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Paid & Settled</span>
              </div>
            );
          }
          if (bill.status === 'FAILED') {
            return (
              <div className="flex items-center space-x-1 text-xs font-semibold text-blocked h-full">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Failed</span>
              </div>
            );
          }
          if (bill.status === 'IN_FLIGHT') {
            return (
              <div className="flex items-center space-x-1 text-xs font-semibold text-risk h-full">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>In Flight</span>
              </div>
            );
          }
          if (bill.status === 'APPROVED') {
            return (
              <div className="flex items-center space-x-1 text-xs font-semibold text-ink-2 h-full">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>Approved</span>
              </div>
            );
          }
          const postPayoutBalance = currentBalance - bill.amountCents;
          const wouldBreach = postPayoutBalance < reserve;
          if (wouldBreach) {
            return (
              <div className="flex items-center space-x-1 text-xs font-semibold text-blocked h-full">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span>Blocked by Policy</span>
              </div>
            );
          }
          return (
            <div className="flex items-center space-x-1 text-xs font-semibold text-ink-2 h-full">
              <Send className="h-3.5 w-3.5 shrink-0" />
              <span>Ready to Authorize</span>
            </div>
          );
        },
      },
      {
        headerName: 'Action',
        field: 'id',
        minWidth: 160,
        flex: 1.1,
        sortable: false,
        filter: false,
        cellStyle: { paddingLeft: '8px', paddingRight: '8px' },
        cellRenderer: (params: ICellRendererParams<Bill>) => {
          const bill = params.data;
          if (!bill) return null;
          const isActive = ACTIVE_BILL_STATUSES.includes(bill.status);
          const postPayoutBalance = currentBalance - bill.amountCents;
          const wouldBreach = isActive && postPayoutBalance < reserve;

          if (bill.status === 'FAILED') {
            return (
              <div className="flex items-center h-full">
                <span className="inline-flex items-center space-x-1 text-xs font-semibold text-blocked">
                  <XCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>Failed</span>
                </span>
              </div>
            );
          }

          if (!isActive) {
            return (
              <div className="flex items-center h-full">
                <span className="inline-flex items-center space-x-1 text-xs font-semibold text-safe">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Paid</span>
                </span>
              </div>
            );
          }

          if (bill.status === 'IN_FLIGHT') {
            const syncing = syncingBillId === bill.id;
            return (
              <div className="flex items-center h-full">
                <button
                  type="button"
                  onClick={() => onSyncPayout(bill)}
                  disabled={syncing}
                  aria-label={`Sync PayPal status for ${bill.vendorName}`}
                  className="inline-flex items-center space-x-1 rounded-lg border border-risk bg-risk-field px-2.5 py-1 text-xs font-semibold text-risk hover:opacity-90 transition disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-risk"
                >
                  <RefreshCw
                    className={`h-3 w-3 shrink-0 ${syncing ? 'animate-spin motion-reduce:animate-none' : ''}`}
                  />
                  <span>{syncing ? 'Checking…' : 'Sync Status'}</span>
                </button>
              </div>
            );
          }

          if (wouldBreach) {
            return (
              <div className="flex items-center h-full">
                <button
                  type="button"
                  onClick={() => onOpenApproval(bill)}
                  aria-label={`Review blocked payout to ${bill.vendorName}`}
                  className="inline-flex items-center space-x-1 rounded-lg border border-blocked bg-blocked-field px-2.5 py-1 text-xs font-semibold text-blocked hover:opacity-90 transition shrink-0 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-blocked"
                >
                  <Lock className="h-3 w-3 shrink-0" />
                  <span>Review (Blocked)</span>
                </button>
              </div>
            );
          }

          return (
            <div className="flex items-center h-full">
              <button
                type="button"
                onClick={() => onOpenApproval(bill)}
                aria-label={`Authorize payout to ${bill.vendorName}`}
                className="inline-flex items-center space-x-1.5 rounded-lg bg-ink px-3 py-1 text-xs font-semibold text-panel hover:opacity-90 transition active:scale-95 shrink-0 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2"
              >
                <Send className="h-3 w-3 shrink-0" />
                <span>Authorize Payout</span>
              </button>
            </div>
          );
        },
      },
    ],
    [currentBalance, reserve, onOpenApproval, onSyncPayout, syncingBillId],
  );

  const defaultColDef = useMemo<ColDef<Bill>>(
    () => ({
      resizable: true,
      suppressMovable: false,
    }),
    [],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-panel">
      {/* Grid Toolbar: Search & Sponsor Header */}
      <div className="border-b border-rule bg-paper px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <h3 className="text-sm font-bold text-ink">Vendor Payables Ledger</h3>
          <span className="rounded-full bg-rule border border-rule-strong px-2 py-0.5 text-[10px] font-mono font-semibold text-ink-2">
            Powered by AG Grid Community
          </span>
        </div>

        {/* Quick Filter Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-3 pointer-events-none" />
          <input
            type="text"
            value={quickFilterText}
            onChange={(event) => setQuickFilterText(event.target.value)}
            aria-label="Search vendor bills by vendor, bill ID, category, status, or dollar amount"
            placeholder="Search vendor, bill ID, amount..."
            className="w-full rounded-lg border border-rule-strong bg-panel pl-8 pr-3 py-1.5 text-xs text-ink placeholder-ink-3 focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus"
          />
        </div>
      </div>

      {/* AG Grid React Component */}
      <div className="w-full h-[420px]">
        <AgGridReact<Bill>
          theme={merchOpsTheme}
          rowData={bills}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={quickFilterText}
          getRowId={(params: GetRowIdParams<Bill>) => params.data.id}
          overlayNoRowsTemplate={noRowsOverlayTemplate}
          rowHeight={64}
          headerHeight={44}
          animateRows={true}
        />
      </div>
    </div>
  );
}
