'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, ShieldAlert, RotateCcw, FlaskConical, PlayCircle, Shield } from 'lucide-react';
import { formatCentsToUSD } from '@/lib/money';
import type { MerchantAccount, StateSnapshot } from '@/types';

interface NavbarProps {
  account: MerchantAccount;
  capabilities: StateSnapshot['capabilities'];
  onReset: () => void;
  resetting?: boolean;
}

export function Navbar({ account, capabilities, onReset, resetting }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <h1 className="sr-only">MerchOps AI Financial Operations Dashboard</h1>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Brand & Identity */}
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 shadow-md shadow-blue-500/20 text-white font-bold text-lg">
            M
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-bold tracking-tight text-slate-900">MerchOps AI</span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200/60">
                PayPal AI Hackathon 2026
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Autonomous Financial Operations & Cash Flow Copilot
            </p>
          </div>
        </div>

        {/* Verified-by-evidence payout rail status & quick links */}
        <div className="hidden lg:flex items-center space-x-3 text-xs">
          <Link
            href="/demo"
            className="flex items-center space-x-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-blue-700 border border-blue-200 font-semibold hover:bg-blue-100 transition shadow-xs"
            title="Open Judge Mode with Interactive Demo Tour & Live Test Modal"
          >
            <PlayCircle className="h-3.5 w-3.5 text-blue-600" />
            <span>Judge Mode (/demo)</span>
          </Link>
          <Link
            href="/bench"
            className="flex items-center space-x-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 border border-slate-200 font-semibold hover:bg-slate-200 transition"
            title="Inspect Guardrail Bench with 12 Adversarial Traps"
          >
            <Shield className="h-3.5 w-3.5 text-slate-600" />
            <span>Bench (12 Traps)</span>
          </Link>

          {capabilities.payoutMode === 'SANDBOX_VERIFIED' && capabilities.verifiedBatchId ? (
            <div
              className="flex items-center space-x-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700 border border-emerald-200 font-medium"
              title={`Last verified PayPal batch: ${capabilities.verifiedBatchId}`}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-mono">
                Sandbox, verified {capabilities.verifiedBatchId}
              </span>
            </div>
          ) : capabilities.payoutMode === 'SANDBOX_UNVERIFIED' ? (
            <div className="flex items-center space-x-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-amber-800 border border-amber-200 font-medium">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Sandbox, unverified</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 border border-slate-200 font-medium">
              <FlaskConical className="h-3.5 w-3.5 text-slate-500" />
              <span>Simulation mode</span>
            </div>
          )}
        </div>

        {/* Balance & Demo Reset */}
        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Cleared Cash
            </span>
            <span className="text-lg font-bold text-slate-900 font-mono">
              {formatCentsToUSD(account.clearedBalanceCents)}
            </span>
          </div>

          <button
            type="button"
            onClick={onReset}
            disabled={resetting}
            aria-label="Reset demo data to initial state"
            className="flex items-center space-x-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 disabled:opacity-50"
          >
            <RotateCcw
              className={`h-3.5 w-3.5 text-slate-500 ${
                resetting ? 'animate-spin motion-reduce:animate-none' : ''
              }`}
            />
            <span>{resetting ? 'Resetting…' : 'Reset Demo'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
