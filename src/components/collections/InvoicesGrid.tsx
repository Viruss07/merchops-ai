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
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

interface InvoicesGridProps {
  invoices: Invoice[];
  onOpenDraft: (invoice: Invoice) => void;
  onOpenPaymentModal: (invoice: Invoice) => void;
  onCreatePayPalInvoice?: (invoice: Invoice) => Promise<void>;
  onSyncInvoices?: () => Promise<void>;
}

export function InvoicesGrid({
  invoices,
  onOpenDraft,
  onOpenPaymentModal,
  onCreatePayPalInvoice,
  onSyncInvoices,
}: InvoicesGridProps) {
  const [quickFilterText, setQuickFilterText] = useState('');

  const visibleInvoices = useMemo(() => {
    const q = quickFilterText.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((inv) =>
      [
        inv.invoiceNumber,
        inv.customerName,
        inv.customerEmail,
        inv.description,
        inv.status,
        formatCentsToUSD(inv.amountCents),
        (inv.amountCents / 100).toFixed(2),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [invoices, quickFilterText]);

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
              <span className="font-mono font-bold text-ink leading-tight">
                {inv.invoiceNumber}
              </span>
              <span className="text-[11px] text-ink-3 truncate max-w-xs leading-tight mt-0.5">
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
              <span className="font-semibold text-ink text-xs leading-tight truncate">
                {inv.customerName}
              </span>
              <span className="font-mono text-[11px] text-ink-3 truncate leading-tight mt-0.5">
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
        minWidth: 105,
        maxWidth: 135,
        flex: 0.8,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<Invoice>) => {
          const inv = params.data;
          if (!inv) return null;
          return (
            <div className="flex items-center space-x-1.5 h-full text-xs text-ink-2">
              <Calendar className="h-3.5 w-3.5 text-ink-3 shrink-0" />
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
                <span className="inline-flex items-center space-x-1 rounded-full bg-safe-field px-2.5 py-0.5 text-xs font-bold text-safe">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Paid</span>
                </span>
              </div>
            );
          }
          if (inv.status === 'OVERDUE') {
            return (
              <div className="flex items-center h-full">
                <span className="inline-flex items-center space-x-1 rounded-full bg-blocked-field px-2.5 py-0.5 text-xs font-bold text-blocked">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>Overdue</span>
                </span>
              </div>
            );
          }
          return (
            <div className="flex items-center h-full">
              <span className="inline-flex items-center space-x-1 rounded-full bg-rule px-2.5 py-0.5 text-xs font-medium text-ink-2">
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
              <div className="flex items-center h-full text-xs text-ink-3">
                <span>Settled</span>
              </div>
            );
          }
          if (inv.daysOverdue > 0) {
            return (
              <div className="flex flex-col justify-center h-full">
                <span className="inline-flex items-center space-x-1 text-xs font-bold text-blocked">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>{inv.daysOverdue} days past due</span>
                </span>
                {inv.lastReminderSentAt && (
                  <span className="text-[10px] text-risk font-medium truncate">
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
            <div className="flex items-center h-full text-xs text-ink-3">
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
                <span className="inline-flex items-center space-x-1 text-xs font-semibold text-safe">
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
                className="inline-flex items-center space-x-1 rounded-lg border border-risk bg-risk-field px-2 py-1 text-xs font-semibold text-risk hover:opacity-90 transition active:scale-95 shrink-0 focus:outline-none focus:ring-2 focus:ring-risk"
              >
                <Sparkles className="h-3 w-3 text-risk shrink-0" />
                <span>Remind</span>
              </button>

              {inv.recipientViewUrl ? (
                <a
                  href={inv.recipientViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Pay invoice ${inv.invoiceNumber} on PayPal Sandbox`}
                  className="inline-flex items-center space-x-1 rounded-lg bg-ink px-2.5 py-1 text-xs font-bold text-panel hover:opacity-90 transition active:scale-95 shrink-0 focus:outline-none focus:ring-2 focus:ring-focus"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span>Pay on PayPal</span>
                </a>
              ) : onCreatePayPalInvoice ? (
                <button
                  type="button"
                  onClick={() => void onCreatePayPalInvoice(inv)}
                  aria-label={`Generate real PayPal Sandbox link for ${inv.invoiceNumber}`}
                  className="inline-flex items-center space-x-1 rounded-lg border border-rule-strong bg-rule px-2 py-1 text-xs font-semibold text-ink-2 hover:bg-rule transition active:scale-95 shrink-0 focus:outline-none focus:ring-2 focus:ring-focus"
                >
                  <ExternalLink className="h-3 w-3 text-ink shrink-0" />
                  <span>PayPal Link</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => onOpenPaymentModal(inv)}
                aria-label={`Simulate offline payment from ${inv.customerName}`}
                className="inline-flex items-center space-x-1 rounded-lg border border-rule-strong bg-panel px-2 py-1 text-xs font-medium text-ink-2 hover:bg-paper transition active:scale-95 shrink-0 focus:outline-none focus:ring-2 focus:ring-focus"
              >
                <CreditCard className="h-3 w-3 text-ink-3 shrink-0" />
                <span>Simulate</span>
              </button>
            </div>
          );
        },
      },
    ],
    [onOpenDraft, onOpenPaymentModal, onCreatePayPalInvoice],
  );

  const defaultColDef = useMemo<ColDef<Invoice>>(
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
          <h3 className="text-sm font-bold text-ink">Merchant Receivables Ledger</h3>
          <span className="rounded-full bg-rule border border-rule-strong px-2 py-0.5 text-[10px] font-mono font-semibold text-ink-2">
            Powered by AG Grid Community
          </span>
        </div>

        {/* Quick Filter Search Input & Sync */}
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          {onSyncInvoices && (
            <button
              type="button"
              onClick={() => void onSyncInvoices()}
              aria-label="Reconcile and sync invoice status with PayPal Sandbox"
              className="inline-flex items-center space-x-1.5 rounded-lg border border-rule-strong bg-panel px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-paper transition active:scale-95 shrink-0 focus:outline-none focus:ring-2 focus:ring-focus"
            >
              <RefreshCw className="h-3.5 w-3.5 text-ink-3" />
              <span>Sync with PayPal</span>
            </button>
          )}

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-3 pointer-events-none" />
            <input
              type="text"
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              aria-label="Search invoices by number, customer, description, status, or dollar amount"
              placeholder="Search invoices, customers..."
              className="w-full rounded-lg border border-rule-strong bg-panel pl-8 pr-3 py-1.5 text-xs text-ink placeholder-ink-3 focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus"
            />
          </div>
        </div>
      </div>

      {/* Phone: stacked list */}
      <div className="divide-y divide-rule sm:hidden">
        {visibleInvoices.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-ink-3">No invoices match.</p>
        ) : (
          visibleInvoices.map((inv) => (
            <div key={inv.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mono text-[10px] text-ink-3">{inv.invoiceNumber}</p>
                  <p className="truncate text-sm font-medium text-ink">{inv.customerName}</p>
                  <p className="truncate text-[11px] text-ink-3">{inv.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="money text-sm font-semibold text-ink">
                    {formatCentsToUSD(inv.amountCents)}
                  </p>
                  <InvoiceStatus invoice={inv} />
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
                <span>Due {inv.dueDate}</span>
                {inv.status !== 'PAID' &&
                  (inv.daysOverdue > 0 ? (
                    <span className="text-blocked">{inv.daysOverdue} days past due</span>
                  ) : (
                    <span>On time</span>
                  ))}
              </div>
              {inv.status !== 'PAID' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenDraft(inv)}
                    aria-label={`Draft AI collection reminder for ${inv.customerName}`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-risk bg-risk-field px-3 py-2 text-xs font-semibold text-risk transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-risk"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Remind
                  </button>
                  {inv.recipientViewUrl ? (
                    <a
                      href={inv.recipientViewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Pay invoice ${inv.invoiceNumber} on PayPal Sandbox`}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-panel transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Pay on PayPal
                    </a>
                  ) : onCreatePayPalInvoice ? (
                    <button
                      type="button"
                      onClick={() => void onCreatePayPalInvoice(inv)}
                      aria-label={`Generate real PayPal Sandbox link for ${inv.invoiceNumber}`}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rule-strong bg-rule px-3 py-2 text-xs font-semibold text-ink-2 transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-focus"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      PayPal Link
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onOpenPaymentModal(inv)}
                    aria-label={`Simulate offline payment from ${inv.customerName}`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rule-strong bg-panel px-3 py-2 text-xs font-medium text-ink-2 transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-focus"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Simulate
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* AG Grid React Component */}
      <div className="hidden w-full h-[440px] sm:block">
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

function InvoiceStatus({ invoice }: { invoice: Invoice }) {
  if (invoice.status === 'PAID') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-safe-field px-2 py-0.5 text-[10px] font-semibold text-safe">
        <CheckCircle2 className="h-3 w-3" />
        Paid
      </span>
    );
  }
  if (invoice.status === 'OVERDUE') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blocked-field px-2 py-0.5 text-[10px] font-semibold text-blocked">
        <AlertCircle className="h-3 w-3" />
        Overdue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rule px-2 py-0.5 text-[10px] font-medium text-ink-2">
      <Clock className="h-3 w-3" />
      Current
    </span>
  );
}
