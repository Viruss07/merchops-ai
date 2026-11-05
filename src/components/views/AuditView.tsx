'use client';

import React, { useState } from 'react';
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
  Info,
  Filter,
  Table as TableIcon,
  List as ListIcon,
} from 'lucide-react';
import type { AuditLogEntry } from '@/types';
import { formatCentsToUSD } from '@/lib/money';
import { AuditGrid } from '@/components/audit/AuditGrid';

interface AuditViewProps {
  logs: AuditLogEntry[];
}

export function AuditView({ logs }: AuditViewProps) {
  const [filter, setFilter] = useState<'ALL' | 'PAYOUTS' | 'COLLECTIONS' | 'GUARDRAILS'>('ALL');
  const [viewMode, setViewMode] = useState<'GRID' | 'FEED'>('GRID');

  const filteredLogs = logs.filter((log) => {
    if (filter === 'ALL') return true;
    if (filter === 'PAYOUTS') {
      return log.action.includes('PAYOUT');
    }
    if (filter === 'COLLECTIONS') {
      return log.action.includes('INVOICE') || log.action.includes('REMINDER');
    }
    if (filter === 'GUARDRAILS') {
      return log.action.includes('BLOCKED') || log.action.includes('RESERVE') || log.action.includes('RUNWAY');
    }
    return true;
  });

  const getActorBadge = (actor: AuditLogEntry['actor']) => {
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
            <span>System Guardrail</span>
          </span>
        );
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'PAYOUT_DISBURSED_SIMULATED':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-900 border border-blue-200">
            <Send className="h-3 w-3 text-blue-700" />
            <span>Simulated Payout Disbursed</span>
          </span>
        );
      case 'PAYOUT_DISBURSED_PAYPAL':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900 border border-emerald-300">
            <CheckCircle2 className="h-3 w-3 text-emerald-700" />
            <span>PayPal Sandbox Payout Executed</span>
          </span>
        );
      case 'PAYOUT_BLOCKED_RESERVE_BREACH':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-900 border border-rose-300">
            <ShieldAlert className="h-3 w-3 text-rose-700" />
            <span>Payout Blocked: Reserve Policy</span>
          </span>
        );
      case 'INVOICE_PAID_SIMULATED':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900 border border-emerald-200">
            <CreditCard className="h-3 w-3 text-emerald-700" />
            <span>Simulated Invoice Settlement</span>
          </span>
        );
      case 'REMINDER_DRAFT_APPROVED':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 border border-amber-300">
            <Clock className="h-3 w-3 text-amber-700" />
            <span>Reminder Draft Staged</span>
          </span>
        );
      case 'RUNWAY_MONITOR_ACTIVE':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 border border-slate-200">
            <span>Runway Deficit Monitored</span>
          </span>
        );
      case 'SYSTEM_INITIALIZED':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 border border-slate-200">
            <span>Ledger Initialized</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-semibold text-slate-800">
            <span>{action}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Overview Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-slate-900">Financial Operations Audit Trail</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-slate-600 border border-slate-200">
              In-Memory Ledger (Demo)
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Complete chronological record of all cash movements, policy enforcement decisions, AI suggestions, and human authorizations.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-mono text-slate-700 border border-slate-200">
            {logs.length} Logged Events
          </span>
        </div>
      </div>

      {/* Persistence Notice Callout */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 flex items-start space-x-3">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p className="font-semibold text-slate-900">Demo Architecture Note on Audit Persistence</p>
          <p className="text-slate-600 leading-relaxed">
            This audit trail is maintained in an in-memory demo repository designed for rapid partner walkthroughs and resets when the server restarts. In a production deployment, this layer connects to an append-only PostgreSQL database with cryptographic hash chaining to guarantee permanent tamper-resistance.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-slate-500 font-semibold px-2 flex items-center space-x-1 shrink-0">
            <Filter className="h-3 w-3" />
            <span>Filter:</span>
          </span>
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            aria-pressed={filter === 'ALL'}
            className={`rounded-lg px-3 py-1.5 font-semibold transition focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 ${
              filter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Events ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('PAYOUTS')}
            aria-pressed={filter === 'PAYOUTS'}
            className={`rounded-lg px-3 py-1.5 font-semibold transition focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 ${
              filter === 'PAYOUTS'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Payouts &amp; Disbursements
          </button>
          <button
            type="button"
            onClick={() => setFilter('COLLECTIONS')}
            aria-pressed={filter === 'COLLECTIONS'}
            className={`rounded-lg px-3 py-1.5 font-semibold transition focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 ${
              filter === 'COLLECTIONS'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Invoices &amp; Reminders
          </button>
          <button
            type="button"
            onClick={() => setFilter('GUARDRAILS')}
            aria-pressed={filter === 'GUARDRAILS'}
            className={`rounded-lg px-3 py-1.5 font-semibold transition focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 ${
              filter === 'GUARDRAILS'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Reserve Guardrails
          </button>
        </div>

        {/* View Mode Toggle: AG Grid vs Feed */}
        <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 self-start lg:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('GRID')}
            aria-pressed={viewMode === 'GRID'}
            className={`inline-flex items-center space-x-1 rounded-md px-2.5 py-1 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              viewMode === 'GRID'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <TableIcon className="h-3.5 w-3.5 text-blue-600" />
            <span>AG Grid Table</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('FEED')}
            aria-pressed={viewMode === 'FEED'}
            className={`inline-flex items-center space-x-1 rounded-md px-2.5 py-1 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              viewMode === 'FEED'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <ListIcon className="h-3.5 w-3.5 text-slate-500" />
            <span>Feed View</span>
          </button>
        </div>
      </div>

      {/* Audit Log Content: AG Grid Table or Feed List */}
      {viewMode === 'GRID' ? (
        <AuditGrid logs={filteredLogs} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No audit events found for this filter.
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isInflow = log.action === 'INVOICE_PAID_SIMULATED';
                const isOutflow = log.action.includes('PAYOUT_DISBURSED');
                const isBlocked = log.action.includes('BLOCKED');

                return (
                  <div
                    key={log.id}
                    className="p-4 hover:bg-slate-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {getActorBadge(log.actor)}
                        {getActionBadge(log.action)}
                        {log.isSimulated && (
                          <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                            Local Simulation
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-700 leading-normal">
                        {log.details}
                      </p>
                    </div>

                    <div className="flex sm:flex-col items-end justify-between sm:justify-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                      {log.amountCents !== undefined && (
                        <span
                          className={`font-mono text-xs font-bold ${
                            isInflow
                              ? 'text-emerald-700'
                              : isOutflow
                              ? 'text-slate-900'
                              : isBlocked
                              ? 'text-rose-600'
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
                      )}
                      <span className="text-[11px] font-mono text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
