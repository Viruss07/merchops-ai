import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft, CheckCircle2, Lock, Cpu, Scale } from 'lucide-react';
import { BENCH_SCENARIOS } from '@/lib/bench/scenarios';
import { runBench } from '@/lib/bench/run';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Guardrail Bench | MerchOps AI',
  description: '12 attacks on a payments copilot, each run live against the real MerchOps guard.',
};

export default async function BenchPage() {
  const results = await runBench();
  const resultById = new Map(results.map((r) => [r.id, r]));
  const blockedCount = results.filter((r) => r.blocked).length;
  const ranAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

  return (
    <div className="min-h-screen bg-paper pb-16 text-ink">
      {/* Top Navigation */}
      <header className="sticky top-0 z-10 border-b border-rule bg-panel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:flex-nowrap sm:px-6 lg:h-16">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-ink-2 transition-colors duration-200 hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to MerchOps</span>
            </Link>
            <span className="hidden text-rule-strong sm:inline">|</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-rule bg-rule px-2 py-0.5 text-[11px] font-medium text-ink-2">
                Proof Bench
              </span>
              <h1 className="text-sm font-semibold leading-snug text-ink sm:text-base">
                Guardrail Bench: 12 attacks, run live
              </h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs font-mono text-ink-3 sm:flex">
            <span>PayPal AI Hackathon 2026</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* Core Thesis Alert Banner */}
        <div className="flex flex-col justify-between gap-6 rounded-lg border border-rule bg-panel p-6 md:flex-row md:items-center">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center space-x-2 text-xs font-semibold text-ink-2">
              <Scale className="h-4 w-4 text-ink-3" />
              <span>Core Architectural Principle</span>
            </div>
            <h2 className="text-xl font-semibold text-ink">
              Why the model never gets the last word on money
            </h2>
            <p className="text-sm leading-relaxed text-ink-2">
              Each attack below targets a way an AI payments assistant can go wrong: injected
              instructions, a missed fee, a retried click, an unsettled batch counted as cash.
              This page just ran every one of them against the same guard code the API routes
              use. Nothing here is pre-computed.{' '}
              <strong>MerchOps AI separates intelligence from execution:</strong> AI proposes,
              deterministic rules decide.
            </p>
          </div>
          <div className="shrink-0 rounded-lg border border-rule bg-paper p-4 text-center">
            <span className="block text-[11px] font-mono text-ink-3">Blocked on this run</span>
            <span
              className={`font-mono text-2xl font-semibold ${blockedCount === results.length ? 'text-safe' : 'text-blocked'}`}
            >
              {blockedCount} / {results.length}
            </span>
            <span className="mt-1 block text-xs text-ink-3">ran {ranAt} UTC</span>
          </div>
        </div>

        {/* Scorecard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="space-y-2 rounded-lg border border-blocked bg-blocked-field p-5">
            <div className="flex items-center justify-between text-xs font-semibold text-blocked">
              <span className="flex items-center space-x-1.5">
                <Cpu className="h-4 w-4 text-blocked" />
                <span>Unguarded approver</span>
              </span>
              <span className="rounded border border-blocked bg-panel px-2 py-0.5 text-[10px] font-mono text-blocked">
                THREAT MODEL
              </span>
            </div>
            <div className="text-2xl font-semibold text-ink">What could go wrong</div>
            <p className="text-xs text-ink-2">
              The left card on each row describes the failure an assistant with direct payout
              access is exposed to. It is a threat model, not a measured model run.
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-safe bg-safe-field p-5">
            <div className="flex items-center justify-between text-xs font-semibold text-safe">
              <span className="flex items-center space-x-1.5">
                <Lock className="h-4 w-4 text-safe" />
                <span>MerchOps Guardrailed Engine</span>
              </span>
              <span className="rounded border border-safe bg-panel px-2 py-0.5 text-[10px] font-mono text-safe">
                LIVE
              </span>
            </div>
            <div className="text-2xl font-semibold text-ink">
              {blockedCount} / {results.length} blocked, live
            </div>
            <p className="text-xs text-ink-2">
              Each right card shows the guard that ran and what it returned on this page load.
              Store checks run on an isolated copy, so your demo state is untouched. Also covered
              by <code className="font-mono">npm test</code>.
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-rule bg-panel p-5">
            <div className="flex items-center justify-between text-xs font-semibold text-ink-2">
              <span>Verification Guarantee</span>
              <span className="rounded border border-rule bg-rule px-2 py-0.5 text-[10px] font-mono text-ink-2">
                DETERMINISTIC
              </span>
            </div>
            <div className="text-2xl font-semibold text-ink">Zero Hallucinated Numbers</div>
            <p className="text-xs text-ink-2">
              All balances, fees, dates, and payout IDs are code-derived. No model-generated figure
              touches the PayPal rail.
            </p>
          </div>
        </div>

        {/* Adversarial Scenario Table */}
        <div className="overflow-hidden rounded-lg border border-rule bg-panel">
          <div className="flex items-center justify-between border-b border-rule bg-paper px-5 py-4 sm:px-6">
            <div>
              <h3 className="text-base font-semibold text-ink">12 Adversarial Test Scenarios</h3>
              <p className="mt-0.5 text-xs text-ink-2">
                Executed on every page load. No model tokens are spent; no money moves.
              </p>
            </div>
            <span className="rounded-full border border-safe bg-safe-field px-3 py-1 text-xs font-semibold text-safe">
              Live run
            </span>
          </div>

          <div className="divide-y divide-rule">
            {BENCH_SCENARIOS.map((scenario) => (
              <div
                key={scenario.id}
                className="space-y-4 p-5 transition-colors duration-200 hover:bg-paper sm:p-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2.5">
                    <span className="rounded bg-rule px-2 py-0.5 font-mono text-xs font-semibold text-ink-2">
                      {scenario.id}
                    </span>
                    <h4 className="text-sm font-semibold text-ink">{scenario.title}</h4>
                    <span className="rounded border border-rule px-2 py-0.5 font-mono text-[11px] text-ink-3">
                      {scenario.category.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-ink-2 leading-relaxed">{scenario.description}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  {/* LLM Only Card */}
                  <div className="space-y-1.5 rounded-lg border border-blocked bg-blocked-field p-3.5">
                    <div className="flex items-center space-x-1.5 text-xs font-semibold text-blocked">
                      <ShieldAlert className="h-4 w-4 text-blocked shrink-0" />
                      <span>Without a guard</span>
                    </div>
                    <p className="text-xs leading-normal text-ink-2">
                      {scenario.llmOnlyResult.behavior}
                    </p>
                  </div>

                  {/* MerchOps Guardrails Card */}
                  <div className="space-y-1.5 rounded-lg border border-safe bg-safe-field p-3.5">
                    <div className="flex items-center space-x-1.5 text-xs font-semibold text-safe">
                      <CheckCircle2 className="h-4 w-4 text-safe shrink-0" />
                      <span>
                        MerchOps guard:{' '}
                        {resultById.get(scenario.id)?.blocked ? 'BLOCKED (live)' : 'NOT BLOCKED'}
                      </span>
                    </div>
                    <p className="text-xs leading-normal text-ink-2">
                      {resultById.get(scenario.id)?.evidence}
                    </p>
                    <div className="pt-1">
                      <span className="inline-block rounded border border-safe bg-panel px-2 py-0.5 font-mono text-[10px] font-semibold text-safe">
                        {resultById.get(scenario.id)?.guard}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
