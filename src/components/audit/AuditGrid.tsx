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
import type { AuditLogEntry } from '@/types';
import {
  Shield,
  Bot,
  User,
  Webhook,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Send,
  CreditCard,
  Search,
} from 'lucide-react';

interface AuditGridProps {
  logs: AuditLogEntry[];
}

const ACTOR_LABELS: Record<AuditLogEntry['actor'], string> = {
  AI_COPILOT: 'AI Copilot',
  MERCHANT: 'Merchant',
  PAYPAL_WEBHOOK: 'PayPal Webhook',
  SYSTEM: 'System',
};

const ACTION_LABELS: Record<string, string> = {
  PAYOUT_APPROVED: 'Payout Approved',
  PAYOUT_IN_FLIGHT: 'Payout In Flight',
  PAYOUT_ACCEPTED_PAYPAL: 'PayPal Accepted',
  PAYOUT_OUTCOME_UNKNOWN: 'Outcome Unknown',
  PAYOUT_FAILED: 'Payout Failed',
  PAYOUT_DISBURSED_SIMULATED: 'Simulated Payout',
  PAYOUT_DISBURSED_PAYPAL: 'PayPal Payout',
  PAYOUT_BLOCKED_RESERVE_BREACH: 'Blocked (Reserve)',
  INVOICE_PAID_SIMULATED: 'Invoice Settled',
  REMINDER_DRAFT_APPROVED: 'Draft Approved',
  RUNWAY_MONITOR_ACTIVE: 'Runway Monitored',
  SYSTEM_INITIALIZED: 'Initialized',
};

function renderActorBadge(actor: AuditLogEntry['actor']) {
  switch (actor) {
    case 'AI_COPILOT':
      return (
        <span className="inline-flex items-center space-x-1 rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200">
          <Bot className="h-3 w-3" />
          <span>AI Copilot</span>
        </span>
      );
    case 'MERCHANT':
      return (
        <span className="inline-flex items-center space-x-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
          <User className="h-3 w-3" />
          <span>Merchant</span>
        </span>
      );
    case 'PAYPAL_WEBHOOK':
      return (
        <span className="inline-flex items-center space-x-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
          <Webhook className="h-3 w-3" />
          <span>PayPal Webhook</span>
        </span>
      );
    case 'SYSTEM':
    default:
      return (
        <span className="inline-flex items-center space-x-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200">
          <Shield className="h-3 w-3" />
          <span>System</span>
        </span>
      );
  }
}

function renderActionBadge(action: string) {
  switch (action) {
    case 'PAYOUT_DISBURSED_SIMULATED':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-900 border border-blue-200">
          <Send className="h-3 w-3 text-blue-700" />
          <span>Simulated Payout</span>
        </span>
      );
    case 'PAYOUT_APPROVED':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-900 border border-blue-200">
          <CheckCircle2 className="h-3 w-3 text-blue-700" />
          <span>Payout Approved</span>
        </span>
      );
    case 'PAYOUT_IN_FLIGHT':
    case 'PAYOUT_ACCEPTED_PAYPAL':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-900 border border-indigo-300">
          <Clock className="h-3 w-3 text-indigo-700" />
          <span>{action === 'PAYOUT_IN_FLIGHT' ? 'Payout In Flight' : 'PayPal Accepted'}</span>
        </span>
      );
    case 'PAYOUT_DISBURSED_PAYPAL':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900 border border-emerald-300">
          <CheckCircle2 className="h-3 w-3 text-emerald-700" />
          <span>PayPal Payout Settled</span>
        </span>
      );
    case 'PAYOUT_FAILED':
    case 'PAYOUT_OUTCOME_UNKNOWN':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-900 border border-rose-300">
          <ShieldAlert className="h-3 w-3 text-rose-700" />
          <span>{action === 'PAYOUT_FAILED' ? 'Payout Failed' : 'Outcome Unknown'}</span>
        </span>
      );
    case 'PAYOUT_BLOCKED_RESERVE_BREACH':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-900 border border-rose-300">
          <ShieldAlert className="h-3 w-3 text-rose-700" />
          <span>Blocked (Reserve)</span>
        </span>
      );
    case 'INVOICE_PAID_SIMULATED':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900 border border-emerald-200">
          <CreditCard className="h-3 w-3 text-emerald-700" />
          <span>Invoice Settled</span>
        </span>
      );
    case 'REMINDER_DRAFT_APPROVED':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 border border-amber-300">
          <Clock className="h-3 w-3 text-amber-700" />
          <span>Draft Approved</span>
        </span>
      );
    case 'RUNWAY_MONITOR_ACTIVE':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 border border-slate-200">
          <span>Runway Monitored</span>
        </span>
      );
    case 'SYSTEM_INITIALIZED':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 border border-slate-200">
          <span>Initialized</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-semibold text-slate-800">
          <span>{action}</span>
        </span>
      );
  }
}

export function AuditGrid({ logs }: AuditGridProps) {
  const [quickFilterText, setQuickFilterText] = useState('');

  const columnDefs = useMemo<ColDef<AuditLogEntry>[]>(
    () => [
      {
        headerName: 'Timestamp',
        field: 'timestamp',
        minWidth: 100,
        maxWidth: 130,
        flex: 0.8,
        sortable: true,
        filter: true,
        sort: 'desc',
        cellRenderer: (params: ICellRendererParams<AuditLogEntry, string>) => {
          if (!params.value) return null;
          return (
            <div className="flex items-center h-full">
              <span className="font-mono text-xs text-slate-500">
                {new Date(params.value).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>
          );
        },
      },
      {
        headerName: 'Actor',
        field: 'actor',
        minWidth: 120,
        maxWidth: 155,
        flex: 0.9,
        sortable: true,
        filter: true,
        getQuickFilterText: (params: GetQuickFilterTextParams<AuditLogEntry>) =>
          params.data ? ACTOR_LABELS[params.data.actor] : '',
        cellRenderer: (params: ICellRendererParams<AuditLogEntry, AuditLogEntry['actor']>) => {
          if (!params.value) return null;
          return <div className="flex items-center h-full">{renderActorBadge(params.value)}</div>;
        },
      },
      {
        headerName: 'Action',
        field: 'action',
        minWidth: 150,
        maxWidth: 185,
        flex: 1.1,
        sortable: true,
        filter: true,
        getQuickFilterText: (params: GetQuickFilterTextParams<AuditLogEntry>) => {
          if (!params.data) return '';
          return ACTION_LABELS[params.data.action] ?? params.data.action;
        },
        cellRenderer: (params: ICellRendererParams<AuditLogEntry, string>) => {
          if (!params.value) return null;
          return <div className="flex items-center h-full">{renderActionBadge(params.value)}</div>;
        },
      },
      {
        headerName: 'Amount',
        field: 'amountCents',
        minWidth: 110,
        maxWidth: 155,
        flex: 0.9,
        sortable: true,
        filter: 'agNumberColumnFilter',
        type: 'numericColumn',
        filterValueGetter: (params: ValueGetterParams<AuditLogEntry>) => {
          const log = params.data;
          return log && log.amountCents !== undefined ? log.amountCents / 100 : null;
        },
        getQuickFilterText: (params: GetQuickFilterTextParams<AuditLogEntry>) => {
          const log = params.data;
          if (!log || log.amountCents === undefined) return '';
          return `${formatCentsToUSD(log.amountCents)} ${log.amountCents / 100}`;
        },
        cellRenderer: (params: ICellRendererParams<AuditLogEntry>) => {
          const log = params.data;
          if (!log || log.amountCents === undefined) {
            return (
              <div className="flex items-center justify-end h-full text-xs text-slate-500">
                <span>—</span>
              </div>
            );
          }
          const isInflow = log.action === 'INVOICE_PAID_SIMULATED';
          const isOutflow = log.action.includes('PAYOUT_DISBURSED');
          const isBlocked = log.action.includes('BLOCKED');

          return (
            <div className="flex items-center justify-end h-full">
              <span
                className={`font-mono font-bold text-xs ${
                  isInflow
                    ? 'text-emerald-700'
                    : isOutflow
                      ? 'text-slate-900'
                      : isBlocked
                        ? 'text-rose-700'
                        : 'text-slate-700'
                }`}
              >
                {isInflow
                  ? `+${formatCentsToUSD(log.amountCents)}`
                  : isOutflow
                    ? `-${formatCentsToUSD(log.amountCents)}`
                    : isBlocked
                      ? `Blocked: ${formatCentsToUSD(log.amountCents)}`
                      : formatCentsToUSD(log.amountCents)}
              </span>
            </div>
          );
        },
      },
      {
        headerName: 'Mode',
        field: 'isSimulated',
        minWidth: 115,
        maxWidth: 150,
        flex: 0.9,
        sortable: true,
        filter: true,
        getQuickFilterText: (params: GetQuickFilterTextParams<AuditLogEntry>) =>
          params.data?.isSimulated ? 'Local Simulation' : 'System / Sandbox',
        cellRenderer: (params: ICellRendererParams<AuditLogEntry, boolean>) => {
          const log = params.data;
          if (!log) return null;
          if (log.isSimulated) {
            return (
              <div className="flex items-center h-full">
                <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                  Local Simulation
                </span>
              </div>
            );
          }
          return (
            <div className="flex items-center h-full">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
                System / Sandbox
              </span>
            </div>
          );
        },
      },
      {
        headerName: 'Details & Explanation',
        field: 'details',
        minWidth: 240,
        flex: 2.2,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<AuditLogEntry, string>) => {
          if (!params.value) return null;
          return (
            <div className="flex items-center h-full" title={params.value}>
              <span className="text-xs text-slate-700 truncate">{params.value}</span>
            </div>
          );
        },
      },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef<AuditLogEntry>>(
    () => ({
      resizable: true,
      suppressMovable: false,
    }),
    [],
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Grid Toolbar */}
      <div className="border-b border-slate-200 bg-slate-50/70 px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <h3 className="text-sm font-bold text-slate-800">Audit Trail Table</h3>
          <span className="rounded-full bg-blue-50 border border-blue-200/80 px-2 py-0.5 text-[10px] font-mono font-semibold text-blue-700">
            Powered by AG Grid Community
          </span>
        </div>

        {/* Quick Filter Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={quickFilterText}
            onChange={(e) => setQuickFilterText(e.target.value)}
            aria-label="Search audit trail by actor, action, amount, mode, or details"
            placeholder="Search audit actions, amounts..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
          />
        </div>
      </div>

      {/* AG Grid React Component */}
      <div className="w-full h-[460px]">
        <AgGridReact<AuditLogEntry>
          theme={merchOpsTheme}
          rowData={logs}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={quickFilterText}
          getRowId={(params: GetRowIdParams<AuditLogEntry>) => params.data.id}
          overlayNoRowsTemplate={noRowsOverlayTemplate}
          rowHeight={52}
          headerHeight={44}
          animateRows={true}
        />
      </div>
    </div>
  );
}
