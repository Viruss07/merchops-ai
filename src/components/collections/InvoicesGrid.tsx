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
import type { Invoice } from '@/types';
import {
  Sparkles,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  Search,
} from 'lucide-react';

interface InvoicesGridProps {
  invoices: Invoice[];
  onOpenDraft: (invoice: Invoice) => void;
  onOpenPaymentModal: (invoice: Invoice) => void;
}

export function InvoicesGrid({
  invoices,
  onOpenDraft,
  onOpenPaymentModal,
}: InvoicesGridProps) {
  const [quickFilterText, setQuickFilterText] = useState('');

  const columnDefs = useMemo<ColDef<Invoice>[]>(
    () => [
      {
        headerName: 'Invoice ID',
        field: 'invoiceNumber',
        minWidth: 110,
        flex: 1,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<Invoice>) => {
          const inv = params.data;
          if (!inv) return null;
          return (
            <div className="flex flex-col justify-center h-full py-1">
              <span className="font-mono font-bold text-slate-900 leading-tight">
                {inv.invoiceNumber}
              </span>
              <span className="text-[11px] text-slate-500 truncate max-w-xs leading-tight mt-0.5">
                {inv.description}
              </span>
            </div>
          );
        },
      },
      {
        headerName: 'Customer',
        field: 'customerName',
        minWidth: 130,
        flex: 1.1,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<Invoice>) => {
          const inv = params.data;
          if (!inv) return null;
          return (
            <div className="flex flex-col justify-center h-full py-1">
              <span className="font-semibold text-slate-900 text-xs leading-tight truncate">
                {inv.customerName}
              </span>
              <span className="font-mono text-[11px] text-slate-500 truncate leading-tight mt-0.5">
                {inv.customerEmail}
              </span>
            </div>
          );
        },
      },
      {
        headerName: 'Amount',
        field: 'amountCents',
        minWidth: 95,
        maxWidth: 125,
        flex: 0.8,
        sortable: true,
        filter: 'agNumberColumnFilter',
        type: 'numericColumn',
        filterValueGetter: (params: ValueGetterParams<Invoice>) =>
          params.data ? params.data.amountCents / 100 : null,
        getQuickFilterText: (params: GetQuickFilterTextParams<Invoice>) =>
          params.data
            ? `${formatCentsToUSD(params.data.amountCents)} ${(params.data.amountCents / 100).toFixed(2)}`
            : '',
        cellRenderer: (params: ICellRendererParams<Invoice, number>) => {
          if (params.value == null) return null;
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
        minWidth: 105,
        maxWidth: 135,
        flex: 0.8,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<Invoice>) => {
          const inv = params.data;
          if (!inv) return null;
          return (
            <div className="flex items-center space-x-1.5 h-full text-xs text-slate-700">
              <Calendar className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <span className="font-mono">{inv.dueDate}</span>
            </div>
          );
        },
      },
      {
        headerName: 'Status',
        field: 'status',
        minWidth: 95,
        maxWidth: 130,
        flex: 0.8,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<Invoice, Invoice['status']>) => {
          const inv = params.data;
          if (!inv) return null;
          if (inv.status === 'PAID') {
            return (
              <div className="flex items-center h-full">
                <span className="inline-flex items-center space-x-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Paid</span>
                </span>
              </div>
            );
          }
          if (inv.status === 'OVERDUE') {
            return (
              <div className="flex items-center h-full">
                <span className="inline-flex items-center space-x-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>Overdue</span>
                </span>
              </div>
            );
          }
          return (
            <div className="flex items-center h-full">
              <span className="inline-flex items-center space-x-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                <Clock className="h-3.5 w-3.5" />
                <span>Current</span>
              </span>
            </div>
          );
        },
      },
      {
        headerName: 'Days Overdue',
        field: 'daysOverdue',
        minWidth: 125,
        flex: 1.0,
        sortable: true,
        filter: 'agNumberColumnFilter',
        cellRenderer: (params: ICellRendererParams<Invoice, number>) => {
          const inv = params.data;
          if (!inv) return null;
          if (inv.status === 'PAID') {
            return (
              <div className="flex items-center h-full text-xs text-slate-500">
                <span>Settled</span>
              </div>
            );
          }
          if (inv.daysOverdue > 0) {
            return (
              <div className="flex flex-col justify-center h-full">
                <span className="inline-flex items-center space-x-1 text-xs font-bold text-rose-700">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>{inv.daysOverdue} days past due</span>
                </span>
                {inv.lastReminderSentAt && (
                  <span className="text-[10px] text-indigo-700 font-medium truncate">
                    Reminder approved (
                    {new Date(inv.lastReminderSentAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    )
                  </span>
                )}
              </div>
            );
          }
          return (
            <div className="flex items-center h-full text-xs text-slate-500">
              <span>On time</span>
            </div>
          );
        },
      },
      {
        headerName: 'Action',
        field: 'id',
        minWidth: 240,
        flex: 1.4,
        sortable: false,
        filter: false,
        cellStyle: { paddingLeft: '8px', paddingRight: '8px' },
        cellRenderer: (params: ICellRendererParams<Invoice>) => {
          const inv = params.data;
          if (!inv) return null;

          if (inv.status === 'PAID') {
            return (
              <div className="flex items-center h-full">
                <span className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Settled to Cash Balance</span>
                </span>
              </div>
            );
          }

          return (
            <div className="flex items-center space-x-1.5 h-full whitespace-nowrap">
              <button
                type="button"
                onClick={() => onOpenDraft(inv)}
                aria-label={`Draft AI collection reminder for ${inv.customerName}`}
                className="inline-flex items-center space-x-1 rounded-lg border border-indigo-300 bg-indigo-50/90 px-2.5 py-1 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100 transition active:scale-95 shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <Sparkles className="h-3 w-3 text-indigo-600 shrink-0" />
                <span>Draft Reminder</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenPaymentModal(inv)}
                aria-label={`Simulate PayPal payment from ${inv.customerName}`}
                className="inline-flex items-center space-x-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition active:scale-95 shrink-0 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                <CreditCard className="h-3 w-3 shrink-0" />
                <span>Simulate Pay</span>
              </button>
            </div>
          );
        },
      },
    ],
    [onOpenDraft, onOpenPaymentModal],
  );

  const defaultColDef = useMemo<ColDef<Invoice>>(
    () => ({
      resizable: true,
      suppressMovable: false,
    }),
    [],
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Grid Toolbar: Search & Sponsor Header */}
      <div className="border-b border-slate-200 bg-slate-50/70 px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <h3 className="text-sm font-bold text-slate-800">Merchant Receivables Ledger</h3>
          <span className="rounded-full bg-blue-50 border border-blue-200/80 px-2 py-0.5 text-[10px] font-mono font-semibold text-blue-700">
            Powered by AG Grid Community
          </span>
        </div>

        {/* Quick Filter Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={quickFilterText}
            onChange={(e) => setQuickFilterText(e.target.value)}
            aria-label="Search invoices by number, customer, description, status, or dollar amount"
            placeholder="Search invoices, customers..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
          />
        </div>
      </div>

      {/* AG Grid React Component */}
      <div className="w-full h-[440px]">
        <AgGridReact<Invoice>
          theme={merchOpsTheme}
          rowData={invoices}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={quickFilterText}
          getRowId={(params: GetRowIdParams<Invoice>) => params.data.id}
          overlayNoRowsTemplate={noRowsOverlayTemplate}
          rowHeight={64}
          headerHeight={44}
          animateRows={true}
        />
      </div>
    </div>
  );
}
