'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import {
  ApiError,
  approveReminder,
  draftReminder,
  getErrorMessage,
  type ReminderSource,
} from '@/lib/apiClient';
import { useAppState } from '@/components/shell/AppState';
import { btn } from '@/components/ui/kit';
import type { Invoice } from '@/types';

/**
 * The AI writes the reminder; the merchant reads, edits and approves it. Nothing is sent until they
 * press Approve, and the draft is shown as a proposal, never as something already done.
 */
export function ReminderComposer({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const { setSnapshot } = useAppState();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [source, setSource] = useState<ReminderSource | null>(null);
  const [model, setModel] = useState('');
  const [notice, setNotice] = useState<string | undefined>();
  const [drafting, setDrafting] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const draft = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setDrafting(true);
    setError(null);
    try {
      const data = await draftReminder(invoice.id, controller.signal);
      if (controller.signal.aborted) return;
      setSubject(data.subject);
      setBody(data.body);
      setSource(data.source);
      setModel(data.model);
      setNotice(data.notice);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(getErrorMessage(caught));
    } finally {
      if (!controller.signal.aborted) setDrafting(false);
    }
  }, [invoice.id]);

  useEffect(() => {
    void draft();
    return () => abortRef.current?.abort();
  }, [draft]);

  if (sent) {
    return (
      <div className="detail-in rounded-md border border-safe/40 bg-safe-field/60 p-3 text-sm">
        <p className="flex items-center gap-2 font-medium text-safe">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Reminder approved
        </p>
        <p className="mt-1 text-ink-2">
          It&apos;s in the ledger with your approval.{' '}
          {invoice.paypalInvoiceId
            ? 'PayPal sends it with the invoice.'
            : 'No email transport is configured in the demo, so it was staged, not emailed.'}
        </p>
        <button type="button" onClick={onDone} className={`${btn.small} mt-3`}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="detail-in space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {drafting
            ? 'The AI is drafting…'
            : source === 'OPENROUTER_AI'
              ? `Drafted by AI · ${model}`
              : 'Drafted from the template · AI offline'}
        </span>
        <button
          type="button"
          onClick={() => void draft()}
          disabled={drafting || sending}
          className="inline-flex items-center gap-1 text-ink-2 hover:text-ink disabled:opacity-50"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          Redraft
        </button>
      </div>

      {notice && !drafting && <p className="text-xs text-ink-3">{notice}</p>}

      {drafting ? (
        <div className="space-y-2" aria-busy="true">
          <div className="h-10 rounded-md bg-paper" />
          <div className="h-36 rounded-md bg-paper" />
        </div>
      ) : (
        <>
          <label className="block">
            <span className="text-xs text-ink-2">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-md border border-rule-strong bg-paper px-3 py-2 text-sm text-ink focus:border-focus focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-2">Message to {invoice.customerEmail}</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="mt-1 w-full resize-y rounded-md border border-rule-strong bg-paper px-3 py-2 text-sm leading-relaxed text-ink focus:border-focus focus:outline-none"
            />
          </label>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-blocked">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={drafting || sending || !subject.trim() || !body.trim()}
          onClick={async () => {
            setSending(true);
            setError(null);
            try {
              const res = await approveReminder({ invoiceId: invoice.id, subject, body });
              setSnapshot(res.snapshot);
              setSent(true);
            } catch (caught) {
              if (caught instanceof ApiError && caught.snapshot) setSnapshot(caught.snapshot);
              setError(getErrorMessage(caught));
            } finally {
              setSending(false);
            }
          }}
          className={btn.primary}
        >
          {sending && (
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          {sending ? 'Approving…' : 'Approve and send'}
        </button>
        <button type="button" onClick={onDone} disabled={sending} className={btn.secondary}>
          Not now
        </button>
      </div>
      <p className="text-xs text-ink-3">The AI can&apos;t send this. Only your approval does.</p>
    </div>
  );
}
