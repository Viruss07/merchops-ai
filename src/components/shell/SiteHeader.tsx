'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, RotateCcw, X } from 'lucide-react';
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
  { href: '/', label: 'Guided demo' },
  { href: '/runway', label: 'Forecast' },
  { href: '/plans', label: 'AI plans' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/bills', label: 'Bills' },
  { href: '/ledger', label: 'Audit log' },
  { href: '/bench', label: 'Safety tests' },
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
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-rule bg-panel px-2 py-1 text-xs shadow-xs"
        role="group"
        aria-label="Reset the demo"
      >
        <span className="hidden text-ink-2 xl:inline">Reset demo?</span>
        <button
          type="button"
          onClick={async () => {
            await reset();
            setAsking(false);
          }}
          disabled={resetting}
          className="rounded-md bg-blocked px-2.5 py-1 font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {resetting ? 'Resetting…' : 'Confirm'}
        </button>
        <button
          ref={keepRef}
          type="button"
          onClick={() => setAsking(false)}
          className="rounded-md px-2 py-1 font-medium text-ink-2 hover:text-ink"
        >
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setAsking(true)}
      title="Reset demo data to initial scenario"
      aria-label="Reset demo data"
      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-rule bg-panel px-2.5 py-1.5 text-xs font-medium text-ink-2 shadow-xs transition-colors hover:border-rule-strong hover:bg-paper hover:text-ink"
    >
      <RotateCcw className="h-3.5 w-3.5 text-ink-3" aria-hidden="true" />
      <span className="hidden sm:inline">Reset demo</span>
    </button>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { snapshot, resetError, clearResetError } = useAppState();
  const [menuOpen, setMenuOpen] = useState(false);
  const cleared = snapshot?.account.clearedBalanceCents;
  const floor = snapshot?.account.minReserveCents ?? 200000;
  const simulated = snapshot?.capabilities.payoutMode === 'SIMULATION';
  const isSafe = typeof cleared === 'number' ? cleared >= floor : true;

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper/90 text-ink backdrop-blur-md supports-[backdrop-filter]:bg-paper/80">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 text-sm sm:gap-3 sm:px-6"
      >
        <div className="flex min-w-0 items-center gap-3 lg:gap-4">
          <Link
            href="/"
            aria-label="MerchOps home"
            className="group flex min-h-10 shrink-0 items-center gap-2 font-bold tracking-tight text-ink no-underline"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-rule bg-panel shadow-xs transition-colors group-hover:border-rule-strong">
              <Mark className="h-4.5 w-4.5" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tracking-tight">MerchOps</span>
              <span className="rounded-full bg-focus/15 px-1.5 py-0.5 text-[11px] font-bold leading-none text-focus ring-1 ring-inset ring-focus/30">
                AI
              </span>
            </div>
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {LINKS.map((link) => {
              const active =
                link.href === '/'
                  ? pathname === '/'
                  : pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex shrink-0 items-center rounded-lg px-2.5 py-1.5 text-xs font-medium no-underline transition-all ${
                    active
                      ? 'bg-accent font-semibold text-accent-ink shadow-xs'
                      : 'text-ink-2 hover:bg-panel hover:text-ink'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {typeof cleared === 'number' && (
            <Link
              href="/runway"
              className="flex min-h-9 items-center gap-2 rounded-lg border border-rule bg-panel px-2.5 py-1.5 no-underline shadow-xs transition-colors hover:border-rule-strong sm:px-3"
              title={simulated ? 'Cleared cash · simulation mode' : 'Cleared cash · PayPal sandbox active'}
            >
              <span
                className={`h-2 w-2 rounded-full ${isSafe ? 'bg-safe' : 'bg-blocked animate-pulse'}`}
                aria-hidden="true"
              />
              <span className="hidden text-xs text-ink-3 sm:inline">Cash</span>
              <span className="money text-xs font-bold text-ink">
                {formatCentsToUSD(cleared)}
              </span>
            </Link>
          )}

          <ResetButton />

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-menu"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rule bg-panel text-ink-2 shadow-xs transition-colors hover:border-rule-strong hover:text-ink lg:hidden"
          >
            {menuOpen ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Menu className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div
          id="mobile-nav-menu"
          className="border-t border-rule bg-paper/95 px-4 py-3 sm:px-6 lg:hidden"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-1.5 sm:grid-cols-4">
            {LINKS.map((link) => {
              const active =
                link.href === '/'
                  ? pathname === '/'
                  : pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-10 items-center rounded-lg px-3 py-2 text-xs font-medium no-underline transition-colors ${
                    active
                      ? 'bg-accent font-semibold text-accent-ink'
                      : 'border border-rule bg-panel text-ink-2 hover:text-ink'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
      {resetError && (
        <div
          role="alert"
          className="border-t border-blocked/35 bg-blocked-field/85 px-4 py-2 text-xs text-ink sm:px-6"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <span>
              <strong className="font-semibold text-blocked">Demo reset failed:</strong> {resetError}
            </span>
            <button
              type="button"
              onClick={clearResetError}
              aria-label="Dismiss reset error"
              className="rounded p-0.5 text-ink-2 hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  const { snapshot } = useAppState();
  const mode = snapshot?.capabilities.payoutMode;
  const modeLabel =
    mode === 'SANDBOX_VERIFIED'
      ? 'PayPal sandbox · payouts verified'
      : mode === 'SANDBOX_UNVERIFIED'
        ? 'Connected to PayPal sandbox'
        : 'Simulation mode · no PayPal calls';
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>The AI proposes. Fixed rules decide. Nothing moves without merchant approval.</p>
        <p className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${mode && mode !== 'SIMULATION' ? 'bg-safe' : 'bg-ink-3'}`}
            aria-hidden="true"
          />
          {snapshot ? modeLabel : 'Connecting…'} · sandbox/test funds only
        </p>
      </div>
    </footer>
  );
}
