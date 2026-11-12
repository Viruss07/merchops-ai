'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  FileText,
  LineChart,
  ListChecks,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import { Journey } from '@/components/journey/Journey';
import { LiveRun } from '@/components/journey/LiveRun';
import { useAppState } from '@/components/shell/AppState';
import { WithState } from '@/components/shell/WithState';

const EXPLORE = [
  {
    href: '/runway',
    icon: LineChart,
    color: 'border border-focus/30 bg-focus/10 text-focus',
    title: 'Cash Forecast',
    body: 'Interactive 30-day runway projection detailing daily inflows, outflows, and reserve checks.',
  },
  {
    href: '/plans',
    icon: Bot,
    color: 'border border-focus/30 bg-focus/10 text-focus',
    title: 'AI Recovery Plans',
    body: 'Compare AI-suggested cash strategies side-by-side against deterministic policy checks.',
  },
  {
    href: '/invoices',
    icon: FileText,
    color: 'border border-safe/30 bg-safe/10 text-safe',
    title: 'Invoices & Receivables',
    body: 'Overdue receivables with AI reminder drafts and PayPal Invoicing tracking.',
  },
  {
    href: '/bills',
    icon: Receipt,
    color: 'border border-risk/30 bg-risk/10 text-risk',
    title: 'Bills & Supplier Payouts',
    body: 'Vendor disbursements gated by fee-inclusive reserve guard checks.',
  },
  {
    href: '/ledger',
    icon: ListChecks,
    color: 'border border-rule-strong bg-paper text-ink-2',
    title: 'Immutable Audit Log',
    body: 'Append-only ledger recording timestamps, transaction IDs, decisions, and outcomes.',
  },
  {
    href: '/bench',
    icon: ShieldCheck,
    color: 'border border-blocked/30 bg-blocked/10 text-blocked',
    title: 'Safety Test Bench',
    body: '12 deterministic security checks tested live against payout and math policy guards.',
  },
];

export default function HomePage() {
  const { setSnapshot, resetCount } = useAppState();
  return (
    <WithState label="Loading financial cockpit">
      {({ snapshot, forecast }) => (
        <>
          <Journey
            key={resetCount}
            snapshot={snapshot}
            forecast={forecast}
            onSnapshot={setSnapshot}
          />

          {snapshot.capabilities.paypalSandboxEnabled && (
            <div className="mx-auto mt-6 w-full max-w-6xl px-4 pb-8 sm:px-6">
              <LiveRun key={resetCount} snapshot={snapshot} />
            </div>
          )}

          <section
            aria-labelledby="explore-h"
            className="mx-auto w-full max-w-6xl border-t border-rule px-4 pb-16 pt-8 sm:px-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 id="explore-h" className="text-xl font-bold tracking-tight text-ink">
                  Deep-Dive System Rooms
                </h2>
                <p className="mt-1 text-sm text-ink-2">
                  Inspect the underlying live state, policies, and ledger across dedicated views.
                </p>
              </div>
            </div>
            <ul className="mt-6 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {EXPLORE.map(({ href, icon: Icon, color, title, body }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="group flex h-full items-start gap-3.5 rounded-xl border border-rule bg-panel p-4 no-underline shadow-xs transition-all hover:border-rule-strong hover:shadow-sm"
                  >
                    <div className={`mt-0.5 rounded-lg p-2.5 ${color}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2 text-sm font-bold text-ink">
                        {title}
                        <ArrowRight
                          className="h-4 w-4 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                          aria-hidden="true"
                        />
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-ink-2">{body}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </WithState>
  );
}
