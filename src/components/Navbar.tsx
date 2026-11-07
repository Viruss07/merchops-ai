'use client';

import React from 'react';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { formatCentsToUSD } from '@/lib/money';
import type { MerchantAccount, StateSnapshot } from '@/types';

interface NavbarProps {
  account: MerchantAccount;
  capabilities: StateSnapshot['capabilities'];
  onReset: () => void;
  resetting?: boolean;
}

function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.5 15.5h19"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2.5 2.5"
      />
    </svg>
  );
}

export function Navbar({ account, capabilities, onReset, resetting }: NavbarProps) {
  const mode =
    capabilities.payoutMode === 'SANDBOX_VERIFIED'
      ? 'Sandbox verified'
      : capabilities.payoutMode === 'SANDBOX_UNVERIFIED'
        ? 'Sandbox unverified'
        : 'Simulation';

  return (
    <header className="sticky top-0 z-50 border-b border-rule bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            <Mark />
            <span className="whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em]">
              MerchOps <span className="font-normal text-ink-3">AI</span>
            </span>
          </Link>
          <span className="hidden items-center gap-1.5 text-[11px] text-ink-3 sm:flex">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                capabilities.payoutMode === 'SIMULATION' ? 'bg-ink-3' : 'bg-safe'
              }`}
              aria-hidden="true"
            />
            {mode}
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-5">
          <Link
            href="/demo"
            className="hidden text-xs text-ink-2 transition-colors duration-200 hover:text-ink md:inline"
          >
            Judge mode
          </Link>
          <Link
            href="/bench"
            className="hidden text-xs text-ink-2 transition-colors duration-200 hover:text-ink md:inline"
          >
            Bench
          </Link>

          <div className="flex items-baseline gap-2">
            <span className="hidden text-[10px] text-ink-3 sm:inline">Cleared</span>
            <span className="money text-sm font-semibold">
              {formatCentsToUSD(account.clearedBalanceCents)}
            </span>
          </div>

          <button
            type="button"
            onClick={onReset}
            disabled={resetting}
            aria-label="Reset demo data to initial state"
            className="inline-flex items-center gap-1.5 rounded-md border border-rule-strong px-2.5 py-1.5 text-[11px] font-medium text-ink-2 transition-colors duration-200 hover:bg-panel hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            <RotateCcw
              className={`h-3.5 w-3.5 ${
                resetting ? 'animate-spin motion-reduce:animate-none' : ''
              }`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">{resetting ? 'Resetting…' : 'Reset'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
