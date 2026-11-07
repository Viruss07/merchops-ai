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
      return (
        log.action.includes('BLOCKED') ||
        log.action.includes('RESERVE') ||
        log.action.includes('RUNWAY')
      );
    }
    return true;
  });

  const getActorBadge = (actor: AuditLogEntry['actor']) => {
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
            <span>System Guardrail</span>
          </span>
        );
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'PAYOUT_DISBURSED_SIMULATED':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-rule px-2 py-0.5 text-xs font-semibold text-ink border border-rule-strong">
            <Send className="h-3 w-3 text-ink-2" />
            <span>Simulated Payout Disbursed</span>
          </span>
        );
      case 'PAYOUT_APPROVED':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-rule px-2 py-0.5 text-xs font-semibold text-ink border border-rule-strong">
            <CheckCircle2 className="h-3 w-3 text-ink-2" />
            <span>Payout Approved (No Money Moved)</span>
          </span>
        );
      case 'PAYOUT_IN_FLIGHT':
      case 'PAYOUT_ACCEPTED_PAYPAL':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-risk-field px-2 py-0.5 text-xs font-semibold text-risk border border-risk">
            <Clock className="h-3 w-3 text-risk" />
            <span>
              {action === 'PAYOUT_IN_FLIGHT' ? 'Payout In Flight' : 'PayPal Batch Accepted'}
            </span>
          </span>
        );
      case 'PAYOUT_DISBURSED_PAYPAL':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-safe-field px-2 py-0.5 text-xs font-semibold text-safe border border-safe">
            <CheckCircle2 className="h-3 w-3 text-safe" />
            <span>PayPal Sandbox Payout Settled</span>
          </span>
        );
      case 'PAYOUT_FAILED':
      case 'PAYOUT_OUTCOME_UNKNOWN':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-blocked-field px-2 py-0.5 text-xs font-semibold text-blocked border border-blocked">
            <ShieldAlert className="h-3 w-3 text-blocked" />
            <span>{action === 'PAYOUT_FAILED' ? 'Payout Failed' : 'Outcome Unknown'}</span>
          </span>
        );
      case 'PAYOUT_BLOCKED_RESERVE_BREACH':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-blocked-field px-2 py-0.5 text-xs font-semibold text-blocked border border-blocked">
            <ShieldAlert className="h-3 w-3 text-blocked" />
            <span>Payout Blocked: Reserve Policy</span>
          </span>
        );
      case 'INVOICE_PAID_SIMULATED':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-safe-field px-2 py-0.5 text-xs font-semibold text-safe border border-safe">
            <CreditCard className="h-3 w-3 text-safe" />
            <span>Simulated Invoice Settlement</span>
          </span>
        );
      case 'REMINDER_DRAFT_APPROVED':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-risk-field px-2 py-0.5 text-xs font-semibold text-risk border border-risk">
            <Clock className="h-3 w-3 text-risk" />
            <span>Reminder Draft Staged</span>
          </span>
        );
      case 'RUNWAY_MONITOR_ACTIVE':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-rule px-2 py-0.5 text-xs font-semibold text-ink border border-rule">
            <span>Runway Deficit Monitored</span>
          </span>
        );
      case 'SYSTEM_INITIALIZED':
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-rule px-2 py-0.5 text-xs font-semibold text-ink border border-rule">
            <span>Ledger Initialized</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 rounded-md bg-rule px-2 py-0.5 text-xs font-mono font-semibold text-ink">
            <span>{action}</span>
          </span>
        );
    }
  };

  const renderFeed = () => (
    <div className="overflow-hidden rounded-lg border border-rule bg-panel">
      <div className="divide-y divide-rule">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-3">
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
                className="p-4 hover:bg-paper transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {getActorBadge(log.actor)}
                    {getActionBadge(log.action)}
                    {log.isSimulated && (
                      <span className="rounded bg-risk-field px-2 py-0.5 text-[10px] font-semibold text-risk border border-risk">
                        Local Simulation
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-ink-2 leading-normal">{log.details}</p>
                </div>

                <div className="flex sm:flex-col items-end justify-between sm:justify-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-rule">
                  {log.amountCents !== undefined && (
                    <span
                      className={`font-mono text-xs font-semibold ${
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
                  )}
                  <span className="text-[11px] font-mono text-ink-3">
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
  );

  return (
    <div className="space-y-6">
      {/* Module Overview Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border border-rule bg-panel p-5 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-semibold text-ink">Audit trail</h2>
            <span className="rounded-full bg-rule px-2.5 py-0.5 text-[11px] font-mono font-semibold text-ink-2 border border-rule">
              In-Memory Ledger (Demo)
            </span>
          </div>
          <p className="mt-0.5 text-xs text-ink-3">
            Complete chronological record of all cash movements, policy enforcement decisions, AI
            suggestions, and human authorizations.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="rounded-lg bg-rule px-3 py-1 text-xs font-mono text-ink-2 border border-rule">
            {logs.length} Logged Events
          </span>
        </div>
      </div>

      {/* Persistence Notice Callout */}
      <div className="rounded-lg border border-rule-strong bg-rule p-4 text-xs text-ink flex items-start space-x-3">
        <Info className="h-4 w-4 text-ink mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p className="font-semibold text-ink">Demo Architecture Note on Audit Persistence</p>
          <p className="text-ink-2 leading-relaxed">
            This audit trail is maintained in an in-memory demo repository designed for rapid
            partner walkthroughs and resets when the server restarts. In a production deployment,
            this layer connects to an append-only PostgreSQL database with cryptographic hash
            chaining to guarantee permanent tamper-resistance.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-rule pb-2">
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-ink-3 font-semibold px-2 flex items-center space-x-1 shrink-0">
            <Filter className="h-3 w-3" />
            <span>Filter:</span>
          </span>
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            aria-pressed={filter === 'ALL'}
            className={`rounded-lg px-3 py-1.5 font-semibold transition focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 ${
              filter === 'ALL' ? 'bg-ink text-panel' : 'text-ink-2 hover:bg-rule'
            }`}
          >
            All Events ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('PAYOUTS')}
            aria-pressed={filter === 'PAYOUTS'}
            className={`rounded-lg px-3 py-1.5 font-semibold transition focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 ${
              filter === 'PAYOUTS' ? 'bg-ink text-panel' : 'text-ink-2 hover:bg-rule'
            }`}
          >
            Payouts &amp; Disbursements
          </button>
          <button
            type="button"
            onClick={() => setFilter('COLLECTIONS')}
            aria-pressed={filter === 'COLLECTIONS'}
            className={`rounded-lg px-3 py-1.5 font-semibold transition focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 ${
              filter === 'COLLECTIONS' ? 'bg-ink text-panel' : 'text-ink-2 hover:bg-rule'
            }`}
          >
            Invoices &amp; Reminders
          </button>
          <button
            type="button"
            onClick={() => setFilter('GUARDRAILS')}
            aria-pressed={filter === 'GUARDRAILS'}
            className={`rounded-lg px-3 py-1.5 font-semibold transition focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 ${
              filter === 'GUARDRAILS' ? 'bg-ink text-panel' : 'text-ink-2 hover:bg-rule'
            }`}
          >
            Reserve Guardrails
          </button>
        </div>

        {/* View Mode Toggle: AG Grid vs Feed */}
        <div className="hidden items-center space-x-1 bg-rule p-0.5 rounded-lg border border-rule self-start sm:flex lg:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('GRID')}
            aria-pressed={viewMode === 'GRID'}
            className={`inline-flex items-center space-x-1 rounded-md px-2.5 py-1 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-focus ${
              viewMode === 'GRID' ? 'bg-panel text-ink' : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            <TableIcon className="h-3.5 w-3.5 text-ink" />
            <span>AG Grid Table</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('FEED')}
            aria-pressed={viewMode === 'FEED'}
            className={`inline-flex items-center space-x-1 rounded-md px-2.5 py-1 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-focus ${
              viewMode === 'FEED' ? 'bg-panel text-ink' : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            <ListIcon className="h-3.5 w-3.5 text-ink-3" />
            <span>Feed View</span>
          </button>
        </div>
      </div>

      {/* Phone: stacked feed */}
      <div className="sm:hidden">{renderFeed()}</div>

      {/* Desktop: selected view */}
      <div className="hidden sm:block">
        {viewMode === 'GRID' ? <AuditGrid logs={filteredLogs} /> : renderFeed()}
      </div>
    </div>
  );
}
