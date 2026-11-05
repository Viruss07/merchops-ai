'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Sparkles,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
} from 'lucide-react';
import type { Invoice } from '@/types';
import { formatCentsToUSD } from '@/lib/money';
import { draftReminder, getErrorMessage, type ReminderSource } from '@/lib/apiClient';
import { useFocusTrap } from '@/lib/useFocusTrap';

interface ReminderDrawerProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  onApproveAndSend: (invoiceId: string, subject: string, body: string) => Promise<void>;
}

export function ReminderDrawer({
  invoice,
  isOpen,
  onClose,
  onApproveAndSend,
}: ReminderDrawerProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [source, setSource] = useState<ReminderSource | null>(null);
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invoiceId = invoice?.id;

  const generateDraft = useCallback(async (targetInvoiceId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);
    setError(null);
    setSource(null);
    setSubject('');
    setBody('');
    setModel('');

    try {
      const data = await draftReminder(targetInvoiceId, controller.signal);
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      setSubject(data.subject);
      setBody(data.body);
      setSource(data.source);
      setModel(data.model);
    } catch (caught) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(getErrorMessage(caught));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen && invoiceId) {
      setApproved(false);
      setApproving(false);
      setApproveError(null);
      setError(null);
      void generateDraft(invoiceId);
      return;
    }

    abortRef.current?.abort();
    requestIdRef.current += 1;
    setLoading(false);
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  }, [isOpen, invoiceId, generateDraft]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (autoCloseRef.current) {
        clearTimeout(autoCloseRef.current);
        autoCloseRef.current = null;
      }
    };
  }, []);

  const blocked = loading || approving;

  const handleClose = useCallback(() => {
    if (blocked) return;
    abortRef.current?.abort();
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
    onClose();
  }, [blocked, onClose]);

  const dialogRef = useFocusTrap<HTMLDivElement>(
    isOpen && Boolean(invoice),
    blocked ? undefined : handleClose,
  );

  const handleApprove = async () => {
    if (!invoice || approving || loading) return;
    if (!subject.trim() || !body.trim()) {
      setApproveError('A subject line and message body are required before approval.');
      return;
    }

    setApproving(true);
    setApproveError(null);
    try {
      await onApproveAndSend(invoice.id, subject, body);
      setApproved(true);
      autoCloseRef.current = setTimeout(() => {
        autoCloseRef.current = null;
        onClose();
      }, 1200);
    } catch (caught) {
      setApproveError(getErrorMessage(caught));
    } finally {
      setApproving(false);
    }
  };

  if (!isOpen || !invoice) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-sm transition-opacity flex justify-end"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-drawer-title"
        className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full transform transition ease-in-out duration-300 motion-reduce:transition-none"
      >
        {/* Drawer Header */}
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="rounded-lg bg-indigo-600 p-2 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 id="reminder-drawer-title" className="text-base font-bold text-slate-900">
                AI Payment Reminder Staging Area
              </h2>
              <p className="text-xs text-slate-500">
                Review, edit, and approve before dispatching to customer
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={blocked}
            aria-label="Close reminder drawer"
            className="rounded-lg p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Financial Guardrail Alert */}
        <div className="bg-amber-50/90 border-b border-amber-200 px-6 py-2.5 flex items-center space-x-2 text-xs text-amber-900">
          <Lock className="h-4 w-4 text-amber-700 shrink-0" />
          <span>
            <strong className="font-semibold">Financial Safety Guardrail:</strong> AI proposes,
            merchant decides. Approval stages the draft locally; no outbound email is dispatched
            without an email provider.
          </span>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Invoice Summary Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-slate-500 font-mono uppercase tracking-wider block">
                Customer
              </span>
              <span className="font-bold text-slate-900 text-sm">{invoice.customerName}</span>
              <span className="text-slate-500 block">{invoice.customerEmail}</span>
            </div>

            <div>
              <span className="text-slate-500 font-mono uppercase tracking-wider block">
                Invoice
              </span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {invoice.invoiceNumber}
              </span>
              <span className="text-rose-700 font-semibold block">
                {invoice.daysOverdue} Days Overdue
              </span>
            </div>

            <div>
              <span className="text-slate-500 font-mono uppercase tracking-wider block">
                Amount Due
              </span>
              <span className="font-mono font-bold text-slate-900 text-base">
                {formatCentsToUSD(invoice.amountCents)}
              </span>
              <span className="text-slate-500 block">Due {invoice.dueDate}</span>
            </div>
          </div>

          {/* AI Generation Source Indicator */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-500">Draft Source:</span>
              {loading ? (
                <span className="inline-flex items-center space-x-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 font-semibold text-slate-600">
                  <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                  <span>Drafting…</span>
                </span>
              ) : source === 'OPENROUTER_AI' ? (
                <span className="inline-flex items-center space-x-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 font-semibold text-indigo-700">
                  <Sparkles className="h-3 w-3" />
                  <span>OpenRouter AI ({model})</span>
                </span>
              ) : source === 'FALLBACK_TEMPLATE' ? (
                <span className="inline-flex items-center space-x-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 font-semibold text-amber-800">
                  <span>AI fallback (template) — OpenRouter not verified</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 font-semibold text-slate-600">
                  <span>No draft generated</span>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => void generateDraft(invoice.id)}
              disabled={loading || approving}
              className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-semibold disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              <RotateCcw
                className={`h-3 w-3 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`}
              />
              <span>Regenerate Draft</span>
            </button>
          </div>

          {/* Loading State */}
          {loading ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 space-y-2"
            >
              <Sparkles className="h-8 w-8 text-indigo-600 animate-pulse motion-reduce:animate-none mx-auto" />
              <p className="font-semibold text-slate-700">
                AI is composing tailored reminder draft...
              </p>
              <p className="text-xs text-slate-500">
                Synthesizing customer terms and payment instructions
              </p>
            </div>
          ) : error ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
              <div className="flex items-center space-x-1.5 font-bold">
                <AlertCircle className="h-4 w-4 text-rose-600" />
                <span>Draft generation failed</span>
              </div>
              <p className="mt-1">{error}</p>
            </div>
          ) : (
            <>
              {/* Subject Input */}
              <div>
                <label
                  htmlFor="reminder-subject"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
                >
                  Email Subject Line (Editable)
                </label>
                <input
                  id="reminder-subject"
                  type="text"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Body Textarea */}
              <div>
                <label
                  htmlFor="reminder-body"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
                >
                  Message Body (Editable)
                </label>
                <textarea
                  id="reminder-body"
                  rows={10}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 font-sans focus:border-blue-500 focus:ring-1 focus:ring-blue-500 leading-relaxed"
                />
              </div>

              {/* PayPal Sandbox Payment Link Callout */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 text-amber-900">
                  <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Demo Simulated Checkout Link</strong> (Live PayPal Invoicing API
                    integration pending).
                  </span>
                </div>
                <span className="font-mono text-[11px] text-amber-800 font-semibold">
                  [Simulation Demo Link]
                </span>
              </div>
            </>
          )}

          {approveError && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800">
              <div className="flex items-center space-x-1.5 font-bold">
                <AlertCircle className="h-4 w-4 text-rose-600" />
                <span>Approval failed</span>
              </div>
              <p className="mt-1">{approveError}</p>
            </div>
          )}

          {approved && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 flex items-center space-x-2"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Draft approved and staged. Closing this drawer…</span>
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="border-t border-slate-200 p-4 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClose}
            disabled={blocked}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Cancel / Discard
          </button>

          <button
            type="button"
            onClick={() => void handleApprove()}
            disabled={loading || approving || approved || !subject.trim() || !body.trim()}
            className={`inline-flex items-center space-x-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              approved
                ? 'bg-emerald-600 shadow-emerald-600/20 focus:ring-emerald-500'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20 focus:ring-blue-500 disabled:opacity-50'
            }`}
          >
            {approving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                <span>Approving…</span>
              </>
            ) : approved ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Draft Approved & Staged</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Approve Reminder Draft</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
