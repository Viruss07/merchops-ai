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
        <span className="inline-flex items-center space-x-1 rounded bg-risk-field px-2 py-0.5 text-xs font-semibold text-risk border border-risk">
          <Bot className="h-3 w-3" />
          <span>AI Copilot</span>
        </span>
      );
    case 'MERCHANT':
      return (
        <span className="inline-flex items-center space-x-1 rounded bg-rule px-2 py-0.5 text-xs font-semibold text-ink-2 border border-rule-strong">
          <User className="h-3 w-3" />
          <span>Merchant</span>
        </span>
      );
    case 'PAYPAL_WEBHOOK':
      return (
        <span className="inline-flex items-center space-x-1 rounded bg-safe-field px-2 py-0.5 text-xs font-semibold text-safe border border-safe">
          <Webhook className="h-3 w-3" />
          <span>PayPal Webhook</span>
        </span>
      );
    case 'SYSTEM':
    default:
      return (
        <span className="inline-flex items-center space-x-1 rounded bg-rule px-2 py-0.5 text-xs font-semibold text-ink-2 border border-rule">
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
        <span className="inline-flex items-center space-x-1 rounded-md bg-rule px-2 py-0.5 text-xs font-bold text-ink border border-rule-strong">
          <Send className="h-3 w-3 text-ink-2" />
          <span>Simulated Payout</span>
        </span>
      );
    case 'PAYOUT_APPROVED':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-rule px-2 py-0.5 text-xs font-bold text-ink border border-rule-strong">
          <CheckCircle2 className="h-3 w-3 text-ink-2" />
          <span>Payout Approved</span>
        </span>
      );
    case 'PAYOUT_IN_FLIGHT':
    case 'PAYOUT_ACCEPTED_PAYPAL':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-risk-field px-2 py-0.5 text-xs font-bold text-risk border border-risk">
          <Clock className="h-3 w-3 text-risk" />
          <span>{action === 'PAYOUT_IN_FLIGHT' ? 'Payout In Flight' : 'PayPal Accepted'}</span>
        </span>
      );
    case 'PAYOUT_DISBURSED_PAYPAL':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-safe-field px-2 py-0.5 text-xs font-bold text-safe border border-safe">
          <CheckCircle2 className="h-3 w-3 text-safe" />
          <span>PayPal Payout Settled</span>
        </span>
      );
    case 'PAYOUT_FAILED':
    case 'PAYOUT_OUTCOME_UNKNOWN':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-blocked-field px-2 py-0.5 text-xs font-bold text-blocked border border-blocked">
          <ShieldAlert className="h-3 w-3 text-blocked" />
          <span>{action === 'PAYOUT_FAILED' ? 'Payout Failed' : 'Outcome Unknown'}</span>
        </span>
      );
    case 'PAYOUT_BLOCKED_RESERVE_BREACH':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-blocked-field px-2 py-0.5 text-xs font-bold text-blocked border border-blocked">
          <ShieldAlert className="h-3 w-3 text-blocked" />
          <span>Blocked (Reserve)</span>
        </span>
      );
    case 'INVOICE_PAID_SIMULATED':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-safe-field px-2 py-0.5 text-xs font-bold text-safe border border-safe">
          <CreditCard className="h-3 w-3 text-safe" />
          <span>Invoice Settled</span>
        </span>
      );
    case 'REMINDER_DRAFT_APPROVED':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-risk-field px-2 py-0.5 text-xs font-bold text-risk border border-risk">
          <Clock className="h-3 w-3 text-risk" />
          <span>Draft Approved</span>
        </span>
      );
    case 'RUNWAY_MONITOR_ACTIVE':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-rule px-2 py-0.5 text-xs font-semibold text-ink border border-rule">
          <span>Runway Monitored</span>
        </span>
      );
    case 'SYSTEM_INITIALIZED':
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-rule px-2 py-0.5 text-xs font-semibold text-ink border border-rule">
          <span>Initialized</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center space-x-1 rounded-md bg-rule px-2 py-0.5 text-xs font-mono font-semibold text-ink">
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
              <span className="font-mono text-xs text-ink-3">
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
              <div className="flex items-center justify-end h-full text-xs text-ink-3">
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
                    ? 'text-safe'
                    : isOutflow
                      ? 'text-ink'
                      : isBlocked
                        ? 'text-blocked'
                        : 'text-ink-2'
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
                <span className="rounded bg-risk-field px-2 py-0.5 text-[10px] font-bold text-risk border border-risk">
                  Local Simulation
                </span>
              </div>
            );
          }
          return (
            <div className="flex items-center h-full">
              <span className="rounded bg-rule px-2 py-0.5 text-[10px] font-semibold text-ink-2 border border-rule">
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
              <span className="text-xs text-ink-2 truncate">{params.value}</span>
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
    <div className="overflow-hidden rounded-lg border border-rule bg-panel">
      {/* Grid Toolbar */}
      <div className="border-b border-rule bg-paper px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <h3 className="text-sm font-bold text-ink">Audit Trail Table</h3>
          <span className="rounded-full bg-rule border border-rule-strong px-2 py-0.5 text-[10px] font-mono font-semibold text-ink-2">
            Powered by AG Grid Community
          </span>
        </div>

        {/* Quick Filter Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-3 pointer-events-none" />
          <input
            type="text"
            value={quickFilterText}
            onChange={(e) => setQuickFilterText(e.target.value)}
            aria-label="Search audit trail by actor, action, amount, mode, or details"
            placeholder="Search audit actions, amounts..."
            className="w-full rounded-lg border border-rule-strong bg-panel pl-8 pr-3 py-1.5 text-xs text-ink placeholder-ink-3 focus:border-focus focus:outline-none focus:ring-1 focus:ring-focus"
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
