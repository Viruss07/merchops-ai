'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { formatCentsToUSD } from '@/lib/money';
import { useAppState } from '@/components/shell/AppState';

/** The mark: a ring with the floor drawn through it. */
export function Mark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4.5 7.5v5M7.5 5.5v7M10.5 8.5v4M13.5 10v2.5"
        stroke="var(--safe)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M2 12.5h16" stroke="currentColor" strokeWidth="1.3" strokeDasharray="1.6 1.6" />
    </svg>
  );
}

const LINKS = [
  { href: '/runway', label: 'Runway' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/bills', label: 'Bills' },
  { href: '/plans', label: 'Plans' },
  { href: '/ledger', label: 'Ledger' },
  { href: '/bench', label: 'Bench' },
  { href: '/demo', label: 'Judge mode' },
];

/** Reset wipes the demo, so it asks first, in place: no browser dialog. */
function ResetButton() {
  const { reset, resetting } = useAppState();
  const [asking, setAsking] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (asking) keepRef.current?.focus();
  }, [asking]);

  if (asking) {
    return (
      <span
        className="flex shrink-0 items-center gap-1 text-xs"
        role="group"
        aria-label="Reset the demo"
      >
        <span className="hidden text-ink-2 lg:inline">Reset all demo data?</span>
        <button
          type="button"
          onClick={async () => {
            await reset();
            setAsking(false);
          }}
          disabled={resetting}
          className="rounded-md bg-blocked px-2.5 py-1.5 font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {resetting ? 'Resetting…' : 'Reset'}
        </button>
        <button
          ref={keepRef}
          type="button"
          onClick={() => setAsking(false)}
          className="rounded-md px-2 py-1.5 text-ink-2 hover:text-ink"
        >
          Keep
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setAsking(true)}
      title="Reset the demo data"
      aria-label="Reset the demo data"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-panel hover:text-ink"
    >
      <RotateCcw className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { snapshot } = useAppState();
  const cleared = snapshot?.account.clearedBalanceCents;
  const simulated = snapshot?.capabilities.payoutMode === 'SIMULATION';

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper/80 text-ink backdrop-blur-md supports-[backdrop-filter]:bg-paper/70">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-6xl items-center gap-4 overflow-x-auto px-4 text-sm [scrollbar-width:none] sm:gap-5 sm:px-6"
      >
        <Link
          href="/"
          aria-label="MerchOps home"
          className="flex min-h-11 shrink-0 items-center gap-2 font-semibold tracking-tight text-ink no-underline"
        >
          <Mark />
          <span className="hidden sm:inline">MerchOps</span>
        </Link>
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center no-underline transition-colors ${
                active ? 'font-medium text-ink' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {link.label}
            </Link>
          );
        })}

        <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          {typeof cleared === 'number' && (
            <Link
              href="/runway"
              className="hidden items-baseline gap-1.5 rounded-md px-2 py-1 no-underline transition-colors hover:bg-panel md:flex"
              title={simulated ? 'Cleared cash · simulation mode' : 'Cleared cash · PayPal sandbox'}
            >
              <span className="text-xs text-ink-3">Cleared</span>
              <span className="money text-sm font-semibold text-ink">
                {formatCentsToUSD(cleared)}
              </span>
            </Link>
          )}
          <ResetButton />
          <Link
            href="/plans"
            className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-md bg-accent px-3.5 text-sm font-medium text-accent-ink no-underline shadow-sm transition-opacity hover:opacity-90"
          >
            Get a plan
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const { snapshot } = useAppState();
  const mode = snapshot?.capabilities.payoutMode;
  const modeLabel =
    mode === 'SANDBOX_VERIFIED'
      ? 'PayPal sandbox, payouts verified'
      : mode === 'SANDBOX_UNVERIFIED'
        ? 'PayPal sandbox'
        : 'Simulation: no PayPal calls are made';
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>The AI proposes. Fixed rules decide. Nothing moves without you.</p>
        <p className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${mode && mode !== 'SIMULATION' ? 'bg-safe' : 'bg-ink-3'}`}
            aria-hidden="true"
          />
          {snapshot ? modeLabel : 'Connecting…'} · integer cents, no real money
        </p>
      </div>
    </footer>
  );
}
