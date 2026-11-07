'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  Play,
  ExternalLink,
} from 'lucide-react';

interface DemoTourProps {
  onOpenRunLive: () => void;
  onNavigateTab: (tab: 'runway' | 'collections' | 'payouts' | 'audit') => void;
}

export function DemoTour({ onOpenRunLive, onNavigateTab }: DemoTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [minimized, setMinimized] = useState(false);

  const steps = [
    {
      title: 'Step 1: The Cash Runway & Day-10 Deficit',
      description:
        'MerchOps monitors cleared cash ($4,200) against an enforced $2,000 reserve floor. Notice the Day-10 breach where inventory bills mature before receivables land.',
      actionLabel: 'Inspect Runway Chart',
      onAction: () => onNavigateTab('runway'),
      badge: 'Runway Forecast',
    },
    {
      title: 'Step 2: AI CFO Proposes, Rules Decide',
      description:
        'The AI Copilot proposes 3 plans: "Safest", "Fastest Cash", and "Lowest Cost". The deterministic validator proves each plan safe or rejects it before any human confirmation.',
      actionLabel: 'View Collections',
      onAction: () => onNavigateTab('collections'),
      badge: 'Cash Plan Copilot',
    },
    {
      title: 'Step 3: Run it Live on PayPal Sandbox',
      description:
        'Experience the live money flow: create a real PayPal invoice, open the pay link to settle as the buyer, watch the webhook flip the runway green, and disburse a real $1.00 payout.',
      actionLabel: 'Launch "Run it Live"',
      onAction: () => onOpenRunLive(),
      badge: '1-Click Interactive Test',
    },
    {
      title: 'Step 4: Two-Step Payout Authorization',
      description:
        'All disbursements require explicit merchant approval. Outbound calls include deterministic PayPal-Request-Id and fee-inclusive reserve checks.',
      actionLabel: 'Inspect Vendor Payouts',
      onAction: () => onNavigateTab('payouts'),
      badge: 'Settlement Safety',
    },
    {
      title: 'Step 5: The Guardrail Proof Bench',
      description:
        'See the 12 adversarial traps comparing autonomous LLMs (12/12 vulnerable) against MerchOps Guardrails (100% protected).',
      actionLabel: 'Open /bench',
      isLink: true,
      href: '/bench',
      badge: 'Empirical Evidence',
    },
  ];

  const current = steps[stepIndex];

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="inline-flex items-center space-x-2 rounded-full bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-xl hover:bg-indigo-700 transition active:scale-95 border border-indigo-400"
        >
          <Sparkles className="h-4 w-4" />
          <span>Judge Tour Guide (Step {stepIndex + 1}/5)</span>
        </button>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Judge Tour Guide"
      className="fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] sm:w-96 rounded-2xl border-2 border-indigo-300 bg-white p-4 shadow-2xl space-y-3"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center space-x-1.5 text-indigo-700">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-wider">
            Judge Guided Tour ({stepIndex + 1}/{steps.length})
          </span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setMinimized(true)}
            aria-label="Minimize tour guide"
            className="rounded p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="inline-block rounded bg-indigo-50 border border-indigo-200 text-indigo-800 text-[10px] font-mono font-bold px-2 py-0.5">
          {current.badge}
        </span>
        <h4 className="text-sm font-bold text-slate-900 leading-snug">{current.title}</h4>
        <p className="text-xs text-slate-600 leading-relaxed">{current.description}</p>
      </div>

      <div className="pt-1">
        {current.isLink ? (
          <Link
            href={current.href || '/bench'}
            className="w-full inline-flex items-center justify-center space-x-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-md hover:bg-indigo-700 transition active:scale-95"
          >
            <span>{current.actionLabel}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={current.onAction}
            className="w-full inline-flex items-center justify-center space-x-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-md hover:bg-indigo-700 transition active:scale-95"
          >
            <Play className="h-3 w-3 fill-current" />
            <span>{current.actionLabel}</span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
        <button
          type="button"
          disabled={stepIndex === 0}
          onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
          className="inline-flex items-center space-x-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 disabled:pointer-events-none transition"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Previous</span>
        </button>

        <button
          type="button"
          onClick={onOpenRunLive}
          className="text-indigo-600 font-bold hover:underline text-[11px]"
        >
          Run it Live
        </button>

        <button
          type="button"
          disabled={stepIndex === steps.length - 1}
          onClick={() => setStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
          className="inline-flex items-center space-x-1 text-slate-900 font-bold hover:text-indigo-600 disabled:opacity-30 disabled:pointer-events-none transition"
        >
          <span>Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
