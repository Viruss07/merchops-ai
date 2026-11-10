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
    title: 'Cash forecast',
    body: 'Day-by-day balance for the next 30 days, and what changes it.',
  },
  {
    href: '/plans',
    icon: Bot,
    title: 'AI plans',
    body: 'What the AI suggested and every rule each plan was checked against.',
  },
  {
    href: '/invoices',
    icon: FileText,
    title: 'Invoices',
    body: 'Money customers owe. Draft a reminder with AI or send a real PayPal invoice.',
  },
  {
    href: '/bills',
    icon: Receipt,
    title: 'Bills',
    body: 'Money the business owes. Each payout shows the safety check before you approve.',
  },
  {
    href: '/ledger',
    icon: ListChecks,
    title: 'Audit log',
    body: 'Every action, who did it, and what the rules said. Nothing can be edited.',
  },
  {
    href: '/bench',
    icon: ShieldCheck,
    title: 'Safety tests',
    body: '12 attacks run live against the real guard code: 12 of 12 should be blocked.',
  },
];

export default function HomePage() {
  const { setSnapshot, resetCount } = useAppState();
  return (
    <WithState label="Loading the demo">
      {({ snapshot, forecast }) => (
        <>
          <Journey
            key={resetCount}
            snapshot={snapshot}
            forecast={forecast}
            onSnapshot={setSnapshot}
          />

          {snapshot.capabilities.paypalSandboxEnabled && (
            <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6">
              <LiveRun key={resetCount} snapshot={snapshot} />
            </div>
          )}

          <section
            aria-labelledby="explore-h"
            className="mx-auto w-full max-w-6xl border-t border-rule px-4 pb-16 pt-10 sm:px-6"
          >
            <h2 id="explore-h" className="text-xl font-semibold">
              Explore on your own
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              Each page shows the same live data as the steps above.
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {EXPLORE.map(({ href, icon: Icon, title, body }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="group flex h-full items-start gap-3 rounded-lg border border-rule bg-panel p-4 no-underline transition-colors hover:border-rule-strong hover:bg-paper"
                  >
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
                        {title}
                        <ArrowRight
                          className="h-4 w-4 text-ink-3 transition-colors group-hover:text-ink"
                          aria-hidden="true"
                        />
                      </span>
                      <span className="mt-1 block text-sm leading-relaxed text-ink-2">{body}</span>
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
