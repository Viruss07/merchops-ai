'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Play } from 'lucide-react';
import { WithState } from '@/components/shell/WithState';
import { TOUR, startTour } from '@/components/shell/JudgeTour';
import { Page, PageHeader, btn } from '@/components/ui/kit';
import { LiveRun } from './LiveRun';

export default function JudgeModePage() {
  const router = useRouter();
  return (
    <WithState label="Loading judge mode">
      {({ snapshot }) => (
        <Page>
          <PageHeader
            title="Judge mode"
            aside={
              <button type="button" onClick={() => startTour(router)} className={btn.primary}>
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                Start the tour
              </button>
            }
          >
            Seven steps across the real app, about three minutes. A small panel in the corner says
            what to look at on each page; the pages work normally under it. Reset (top right) puts
            the demo back to Day 0.
          </PageHeader>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <ol className="overflow-hidden rounded-lg border border-rule bg-panel">
              {TOUR.map((step, i) => (
                <li key={`${step.href}-${i}`} className="border-t border-rule first:border-t-0">
                  <button
                    type="button"
                    onClick={() => startTour(router, i)}
                    className="group grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-paper sm:px-5"
                  >
                    <span className="mono pt-0.5 text-xs text-ink-3">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{step.title}</span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-ink-2">
                        {step.body}
                      </span>
                      <span className="mono mt-1 block text-xs text-ink-3">{step.href}</span>
                    </span>
                    <ArrowRight
                      className="mt-1 h-4 w-4 text-ink-3 transition-colors group-hover:text-ink"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ol>

            <aside className="space-y-5">
              <LiveRun snapshot={snapshot} />
              <p className="text-xs leading-relaxed text-ink-3">
                Prefer the short version? The{' '}
                <Link href="/" className="underline">
                  home page
                </Link>{' '}
                tells the same story in five acts on one screen.
              </p>
            </aside>
          </div>
        </Page>
      )}
    </WithState>
  );
}
