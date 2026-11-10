'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Minus, X } from 'lucide-react';

/**
 * The judge tour walks the real pages, not a copy of them. It is a non-modal panel in the corner:
 * the page under it stays fully usable, and closing it loses nothing.
 */
export const TOUR = [
  {
    href: '/runway',
    title: 'The cliff',
    body: 'Cleared cash is $4,200 against a $2,000 floor. Acme Supplies lands on Day 10 and takes the balance $800 under it.',
    look: 'The red bar crossing the floor line.',
  },
  {
    href: '/plans',
    title: 'The AI proposes',
    body: 'The model writes three plans. Each is replayed on the same runway and the fixed rules decide. The two are never merged.',
    look: 'Proposal on the left, Rules decided on the right.',
  },
  {
    href: '/bills/bill-acme-01',
    title: 'Try to break it',
    body: 'Try to pay Acme anyway. The page shows the floor check, but the button is not the guard: send it to the server and it refuses.',
    look: '“Send it to the server anyway”, then the 403 stamp.',
  },
  {
    href: '/invoices/inv-apex-01',
    title: 'Fix it',
    body: 'Apex Corp owes $1,500, twelve days late. Draft the reminder with AI and approve it, then simulate the payment.',
    look: 'The runway preview turns green before you act.',
  },
  {
    href: '/bills/bill-acme-01',
    title: 'Now it passes',
    body: 'With Apex collected, the same check leaves $699 to spare, PayPal’s $1.00 fee included. Confirm and approve the payout.',
    look: 'The tracker fills to “PayPal settles”.',
  },
  {
    href: '/ledger',
    title: 'The receipt',
    body: 'Every step is in the append-only ledger, including the payout the floor refused. Filter to “Refused by rules”.',
    look: 'The red row, and its link back to the bill.',
  },
  {
    href: '/bench',
    title: 'Twelve attacks, live',
    body: 'Injected instructions, a hidden fee, a double click, an unsettled batch: each runs against the real guard on page load.',
    look: '12 / 12 blocked, with the guard that ran.',
  },
] as const;

const KEY = 'merchops-tour';

function read(): number | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

function write(step: number | null) {
  try {
    if (step === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, String(step));
  } catch {
    // Private mode: the tour still works for this page view.
  }
  window.dispatchEvent(new Event('merchops-tour'));
}

/** Start (or restart) the tour from /demo. */
export function startTour(router: ReturnType<typeof useRouter>, step = 0) {
  write(step);
  router.push(TOUR[step].href);
}

export function JudgeTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState<number | null>(null);
  const [folded, setFolded] = useState(false);

  useEffect(() => {
    const sync = () => setStep(read());
    sync();
    // On a phone the panel would cover the page it explains: start folded.
    if (window.matchMedia('(max-width: 639px)').matches) setFolded(true);
    window.addEventListener('merchops-tour', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('merchops-tour', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const go = useCallback(
    (next: number) => {
      write(next);
      setFolded(false);
      router.push(TOUR[next].href);
    },
    [router],
  );

  if (step === null || Number.isNaN(step) || !TOUR[step] || pathname === '/demo') return null;
  const current = TOUR[step];
  const here = pathname === current.href;

  if (folded) {
    return (
      <button
        type="button"
        onClick={() => setFolded(false)}
        className="fixed bottom-4 right-4 z-40 rounded-full border border-rule-strong bg-panel px-3.5 py-2 text-sm font-medium text-ink shadow-card"
      >
        Judge tour · {step + 1}/{TOUR.length}
      </button>
    );
  }

  return (
    <aside
      aria-label="Judge tour"
      className="detail-in fixed inset-x-3 bottom-3 z-40 rounded-lg border border-rule-strong bg-panel p-4 shadow-card sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[22rem]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-ink-2">
          Judge tour · step {step + 1} of {TOUR.length}
        </p>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setFolded(true)}
            aria-label="Fold the tour"
            className="rounded p-1 text-ink-3 hover:text-ink"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => write(null)}
            aria-label="End the tour"
            className="rounded p-1 text-ink-3 hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {TOUR.map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i < step ? 'bg-safe' : i === step ? 'bg-ink' : 'bg-rule'}`}
          />
        ))}
      </div>
      <h2 className="mt-3 text-base font-semibold">{current.title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">{current.body}</p>
      <p className="mt-2 text-xs text-ink-3">Look for: {current.look}</p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => step > 0 && go(step - 1)}
          disabled={step === 0}
          className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>
        {!here ? (
          <Link
            href={current.href}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink no-underline"
          >
            Go to this step
          </Link>
        ) : step < TOUR.length - 1 ? (
          <button
            type="button"
            onClick={() => go(step + 1)}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink"
          >
            Next: {TOUR[step + 1].title}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => write(null)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink"
          >
            Finish
          </button>
        )}
      </div>
    </aside>
  );
}
