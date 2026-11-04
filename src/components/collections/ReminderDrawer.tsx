'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Send,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Lock,
  Mail,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { Invoice } from '@/types';
import { formatCentsToUSD } from '@/lib/money';

interface ReminderDrawerProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  onApproveAndSend: (invoiceId: string, subject: string, body: string) => void;
}

export function ReminderDrawer({
  invoice,
  isOpen,
  onClose,
  onApproveAndSend,
}: ReminderDrawerProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [source, setSource] = useState<'OPENROUTER_AI' | 'FALLBACK_TEMPLATE' | null>(null);
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  // Fetch or generate draft when drawer opens with an invoice
  useEffect(() => {
    if (isOpen && invoice) {
      setApproved(false);
      setError(null);
      generateDraft(invoice.id);
    }
  }, [isOpen, invoice]);

  const generateDraft = async (invoiceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/draft-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      setSubject(data.subject || '');
      setBody(data.body || '');
      setSource(data.source);
      setModel(data.model || '');
    } catch (err: any) {
      setError(`Failed to draft reminder: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !invoice) return null;

  const handleApprove = () => {
    onApproveAndSend(invoice.id, subject, body);
    setApproved(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-sm transition-opacity flex justify-end">
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full transform transition ease-in-out duration-300">
        {/* Drawer Header */}
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="rounded-lg bg-indigo-600 p-2 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                AI Payment Reminder Staging Area
              </h2>
              <p className="text-xs text-slate-500">
                Review, edit, and approve before dispatching to customer
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Financial Guardrail Alert */}
        <div className="bg-amber-50/90 border-b border-amber-200 px-6 py-2.5 flex items-center space-x-2 text-xs text-amber-900">
          <Lock className="h-4 w-4 text-amber-700 shrink-0" />
          <span>
            <strong className="font-semibold">Financial Safety Guardrail:</strong> AI proposes, merchant decides. Approval stages the draft locally; no outbound email is dispatched without an email provider.
          </span>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Invoice Summary Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-slate-400 font-mono uppercase tracking-wider block">Customer</span>
              <span className="font-bold text-slate-900 text-sm">{invoice.customerName}</span>
              <span className="text-slate-500 block">{invoice.customerEmail}</span>
            </div>

            <div>
              <span className="text-slate-400 font-mono uppercase tracking-wider block">Invoice</span>
              <span className="font-mono font-bold text-slate-900 text-sm">{invoice.invoiceNumber}</span>
              <span className="text-rose-700 font-semibold block">{invoice.daysOverdue} Days Overdue</span>
            </div>

            <div>
              <span className="text-slate-400 font-mono uppercase tracking-wider block">Amount Due</span>
              <span className="font-mono font-bold text-slate-900 text-base">
                {formatCentsToUSD(invoice.amountCents)}
              </span>
              <span className="text-slate-500 block">Due {invoice.dueDate}</span>
            </div>
          </div>

          {/* AI Generation Source Indicator */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-500">Draft Source:</span>
              {source === 'OPENROUTER_AI' ? (
                <span className="inline-flex items-center space-x-1 rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 font-semibold text-indigo-700">
                  <Sparkles className="h-3 w-3" />
                  <span>OpenRouter AI ({model})</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 font-semibold text-amber-800">
                  <span>Fallback Template (Live OpenRouter AI unverified)</span>
                </span>
              )}
            </div>

            <button
              onClick={() => generateDraft(invoice.id)}
              disabled={loading}
              className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-semibold disabled:opacity-50"
            >
              <RotateCcw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Regenerate Draft</span>
            </button>
          </div>

          {/* Loading State */}
          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 space-y-2">
              <Sparkles className="h-8 w-8 text-indigo-600 animate-pulse mx-auto" />
              <p className="font-semibold text-slate-700">AI is composing tailored reminder draft...</p>
              <p className="text-xs text-slate-400">Synthesizing customer terms and payment instructions</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
              <p className="font-bold">Error:</p>
              <p>{error}</p>
            </div>
          ) : (
            <>
              {/* Subject Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Email Subject Line (Editable)
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Body Textarea */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Message Body (Editable)
                </label>
                <textarea
                  rows={10}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 font-sans focus:border-blue-500 focus:ring-1 focus:ring-blue-500 leading-relaxed"
                />
              </div>

              {/* PayPal Sandbox Payment Link Callout */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 text-amber-900">
                  <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Demo Simulated Checkout Link</strong> (Live PayPal Invoicing API integration pending).
                  </span>
                </div>
                <span className="font-mono text-[11px] text-amber-800 font-semibold">
                  [Simulation Demo Link]
                </span>
              </div>
            </>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="border-t border-slate-200 p-4 bg-slate-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            Cancel / Discard
          </button>

          <button
            onClick={handleApprove}
            disabled={loading || approved || !subject || !body}
            className={`inline-flex items-center space-x-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md transition active:scale-95 ${
              approved
                ? 'bg-emerald-600 shadow-emerald-600/20'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20 disabled:opacity-50'
            }`}
          >
            {approved ? (
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

