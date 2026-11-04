'use client';

import React, { useState, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import { formatCentsToUSD } from '@/lib/money';
import { merchOpsTheme } from '@/lib/agGrid';
import { Bill } from '@/types';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Send,
  Lock,
  Search,
} from 'lucide-react';

interface BillsGridProps {
  bills: Bill[];
  currentBalance: number;
  reserve: number;
  onOpenApproval: (bill: Bill) => void;
}

export function BillsGrid({
  bills,
  currentBalance,
  reserve,
  onOpenApproval,
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
        cellRenderer: (params: any) => {
          const bill: Bill = params.data;
          if (!bill) return null;
          return (
            <div className="flex flex-col justify-center h-full py-1">
              <span className="font-semibold text-slate-900 text-xs leading-tight">
                {bill.vendorName}
              </span>
              <span className="font-mono text-[11px] text-slate-400 truncate leading-tight mt-0.5">
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
        cellRenderer: (params: any) => {
          const bill: Bill = params.data;
          if (!bill) return null;
          return (
            <div className="flex flex-col justify-center h-full py-1">
              <span className="font-mono font-bold text-slate-800 leading-tight">
                {bill.billNumber}
              </span>
              <span className="text-[10px] text-slate-400 font-sans truncate max-w-xs leading-tight mt-0.5">
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
        cellRenderer: (params: any) => {
          if (params.value === undefined) return null;
          return (
            <div className="flex items-center justify-end h-full">
              <span className="font-mono font-bold text-sm text-slate-900">
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
        cellRenderer: (params: any) => {
          const bill: Bill = params.data;
          if (!bill) return null;
          return (
            <div className="flex items-center space-x-1.5 h-full text-xs text-slate-700">
              <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>Due in {bill.daysUntilDue}d ({bill.dueDate})</span>
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
        valueGetter: (params: any) => {
          const bill: Bill = params.data;
          if (!bill) return 0;
          return currentBalance - bill.amountCents;
        },
        cellRenderer: (params: any) => {
          const bill: Bill = params.data;
          if (!bill) return null;
          if (bill.status === 'DISBURSED') {
            return (
              <div className="flex items-center h-full text-xs font-mono text-slate-400">
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
                  wouldBreach ? 'text-rose-700 underline' : 'text-emerald-700'
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
        valueGetter: (params: any) => {
          const bill: Bill = params.data;
          if (!bill) return '';
          if (bill.status === 'DISBURSED') return 'Settled';
          const postPayoutBalance = currentBalance - bill.amountCents;
          return postPayoutBalance < reserve ? 'Breaches Floor' : 'Reserve Safe';
        },
        cellRenderer: (params: any) => {
          const bill: Bill = params.data;
          if (!bill) return null;
          const isDisbursed = bill.status === 'DISBURSED';
          const postPayoutBalance = currentBalance - bill.amountCents;
          const wouldBreach = !isDisbursed && postPayoutBalance < reserve;
          const deficit = wouldBreach ? reserve - postPayoutBalance : 0;
          const buffer = !isDisbursed && !wouldBreach ? postPayoutBalance - reserve : 0;

          if (isDisbursed) {
            return (
              <div className="flex items-center h-full">
                <span className="inline-flex items-center space-x-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Settled / Disbursed</span>
                </span>
              </div>
            );
          }

          if (wouldBreach) {
            return (
              <div className="flex items-center h-full">
                <span className="inline-flex items-center space-x-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                  <ShieldAlert className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                  <span>Breaches Floor (-{formatCentsToUSD(deficit)})</span>
                </span>
              </div>
            );
          }

          return (
            <div className="flex items-center h-full">
              <span className="inline-flex items-center space-x-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
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
        cellRenderer: (params: any) => {
          const bill: Bill = params.data;
          if (!bill) return null;
          if (bill.status === 'DISBURSED') {
            return (
              <div className="flex items-center space-x-1 text-xs font-semibold text-emerald-700 h-full">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Paid & Settled</span>
              </div>
            );
          }
          const postPayoutBalance = currentBalance - bill.amountCents;
          const wouldBreach = postPayoutBalance < reserve;
          if (wouldBreach) {
            return (
              <div className="flex items-center space-x-1 text-xs font-semibold text-rose-700 h-full">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span>Blocked by Policy</span>
              </div>
            );
          }
          return (
            <div className="flex items-center space-x-1 text-xs font-semibold text-blue-700 h-full">
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
        cellRenderer: (params: any) => {
          const bill: Bill = params.data;
          if (!bill) return null;
          const isDisbursed = bill.status === 'DISBURSED';
          const postPayoutBalance = currentBalance - bill.amountCents;
          const wouldBreach = !isDisbursed && postPayoutBalance < reserve;

          if (isDisbursed) {
            return (
              <div className="flex items-center h-full">
                <span className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Paid</span>
                </span>
              </div>
            );
          }

          if (wouldBreach) {
            return (
              <div className="flex items-center h-full">
                <button
                  type="button"
                  onClick={() => onOpenApproval(bill)}
                  className="inline-flex items-center space-x-1 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-xs shrink-0 whitespace-nowrap"
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
                className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition active:scale-95 shrink-0 whitespace-nowrap"
              >
                <Send className="h-3 w-3 shrink-0" />
                <span>Authorize Payout</span>
              </button>
            </div>
          );
        },
      },
    ],
    [currentBalance, reserve, onOpenApproval]
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      resizable: true,
      suppressMovable: false,
    }),
    []
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Grid Toolbar: Search & Sponsor Header */}
      <div className="border-b border-slate-200 bg-slate-50/70 px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <h3 className="text-sm font-bold text-slate-800">Pending Vendor Payables</h3>
          <span className="rounded-full bg-blue-50 border border-blue-200/80 px-2 py-0.5 text-[10px] font-mono font-semibold text-blue-700">
            Powered by AG Grid Community
          </span>
        </div>

        {/* Quick Filter Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={quickFilterText}
            onChange={(e) => setQuickFilterText(e.target.value)}
            placeholder="Search vendor, bill ID, category..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-xs"
          />
        </div>
      </div>

      {/* AG Grid React Component */}
      <div className="w-full overflow-x-auto">
        <AgGridReact<Bill>
          theme={merchOpsTheme}
          rowData={bills}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={quickFilterText}
          domLayout="autoHeight"
          rowHeight={64}
          headerHeight={44}
          animateRows={true}
        />
      </div>
    </div>
  );
}

