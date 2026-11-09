'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Sparkles, ChevronRight, ChevronLeft, Minus, Play, ExternalLink } from 'lucide-react';

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
          className="inline-flex items-center gap-2 rounded-full border border-rule-strong bg-panel px-4 py-2.5 text-xs font-semibold text-ink transition-colors duration-200 hover:bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          <Sparkles className="h-4 w-4 text-ink-3" aria-hidden="true" />
          <span>Judge tour · step {stepIndex + 1}/5</span>
        </button>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Judge Tour Guide"
      className="fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] space-y-3 rounded-lg border border-rule-strong bg-panel p-4 sm:w-96"
    >
      <div className="flex items-center justify-between border-b border-rule pb-2">
        <div className="flex items-center gap-1.5 text-ink-2">
          <Sparkles className="h-4 w-4 text-ink-3" aria-hidden="true" />
          <span className="text-xs font-semibold">
            Judge tour
            <span className="ml-1 font-normal text-ink-3">
              {stepIndex + 1}/{steps.length}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMinimized(true)}
          aria-label="Minimize judge tour"
          className="rounded p-1 text-ink-3 transition-colors duration-200 hover:bg-paper hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="space-y-1.5">
        <span className="inline-block rounded border border-rule bg-rule px-2 py-0.5 text-[10px] font-medium text-ink-2">
          {current.badge}
        </span>
        <h4 className="text-sm font-semibold leading-snug text-ink">{current.title}</h4>
        <p className="text-xs leading-relaxed text-ink-2">{current.description}</p>
      </div>

      <div className="pt-1">
        {current.isLink ? (
          <Link
            href={current.href || '/bench'}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-ink px-3 py-2 text-xs font-semibold text-panel transition-colors duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          >
            <span>{current.actionLabel}</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={current.onAction}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-ink px-3 py-2 text-xs font-semibold text-panel transition-colors duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          >
            <Play className="h-3 w-3 fill-current" aria-hidden="true" />
            <span>{current.actionLabel}</span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-rule pt-2 text-xs">
        <button
          type="button"
          disabled={stepIndex === 0}
          onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
          className="inline-flex items-center gap-1 text-ink-2 transition-colors duration-200 hover:text-ink disabled:pointer-events-none disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Previous</span>
        </button>

        <button
          type="button"
          onClick={onOpenRunLive}
          className="text-[11px] font-medium text-ink-2 underline underline-offset-2 transition-colors duration-200 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Run it live
        </button>

        <button
          type="button"
          disabled={stepIndex === steps.length - 1}
          onClick={() => setStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
          className="inline-flex items-center gap-1 font-semibold text-ink transition-colors duration-200 hover:text-ink-2 disabled:pointer-events-none disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span>Next</span>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
