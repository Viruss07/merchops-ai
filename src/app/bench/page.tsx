import React from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Cpu,
  Scale,
} from 'lucide-react';
import { BENCH_SCENARIOS } from '@/lib/bench/scenarios';
import { formatCentsToUSD } from '@/lib/money';

export const metadata = {
  title: 'Guardrail Bench | MerchOps AI',
  description: 'Adversarial Bench: LLM-Only Approver vs. MerchOps Guardrailed Engine',
};

export default function BenchPage() {
  const totalMoneyAtRisk = BENCH_SCENARIOS.reduce(
    (sum, s) => sum + s.llmOnlyResult.moneyAtRiskCents,
    0
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/"
              className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to MerchOps</span>
            </Link>
            <span className="text-slate-300">|</span>
            <div className="flex items-center space-x-2">
              <span className="rounded bg-indigo-100 text-indigo-800 text-[11px] font-mono font-bold px-2 py-0.5 uppercase">
                Proof Bench
              </span>
              <h1 className="text-base font-bold text-slate-900">
                Guardrail Bench: LLM-Only vs. MerchOps Guardrails
              </h1>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-xs font-mono text-slate-500">
            <span>PayPal AI Hackathon 2026</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* Core Thesis Alert Banner */}
        <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/80 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center space-x-2 text-indigo-900 text-xs font-bold uppercase tracking-wider">
              <Scale className="h-4 w-4 text-indigo-700" />
              <span>Core Architectural Principle</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Why Autonomous LLMs Cannot Be Trusted to Move Money
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              When given direct tool-use capabilities to approve vendor payouts or schedule cashflows,
              state-of-the-art LLMs consistently fall for prompt injection, miss fee calculations, and execute
              race conditions. <strong>MerchOps AI separates intelligence from execution:</strong> AI proposes, deterministic rules decide.
            </p>
          </div>
          <div className="rounded-xl bg-white border border-indigo-200 p-4 shadow-sm text-center shrink-0">
            <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider block">
              Capital Protected
            </span>
            <span className="text-2xl font-bold font-mono text-emerald-600">
              {formatCentsToUSD(totalMoneyAtRisk)}
            </span>
            <span className="text-xs text-slate-500 block mt-1">across 12 adversarial test cases</span>
          </div>
        </div>

        {/* Scorecard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-rose-800 text-xs font-bold uppercase">
              <span className="flex items-center space-x-1.5">
                <Cpu className="h-4 w-4 text-rose-600" />
                <span>Autonomous LLM-Only</span>
              </span>
              <span className="rounded bg-rose-200 px-2 py-0.5 text-[10px] font-mono">0% SAFE</span>
            </div>
            <div className="text-2xl font-bold text-rose-950">12 / 12 Vulnerable</div>
            <p className="text-xs text-rose-800">
              Failed every trap: approved reserve breaches, followed injected memo directives, and allowed concurrent double-spend.
            </p>
          </div>

          <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-emerald-800 text-xs font-bold uppercase">
              <span className="flex items-center space-x-1.5">
                <Lock className="h-4 w-4 text-emerald-600" />
                <span>MerchOps Guardrailed Engine</span>
              </span>
              <span className="rounded bg-emerald-200 px-2 py-0.5 text-[10px] font-mono">100% PROTECTED</span>
            </div>
            <div className="text-2xl font-bold text-emerald-950">12 / 12 Blocked</div>
            <p className="text-xs text-emerald-800">
              All 12 traps caught deterministically by PostgreSQL triggers, advisory locks, fee calculations, and schema checks.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-slate-600 text-xs font-bold uppercase">
              <span>Verification Guarantee</span>
              <span className="rounded bg-blue-100 text-blue-800 px-2 py-0.5 text-[10px] font-mono">DETERMINISTIC</span>
            </div>
            <div className="text-2xl font-bold text-slate-900">Zero Hallucinated Numbers</div>
            <p className="text-xs text-slate-600">
              All balances, fees, dates, and payout IDs are code-derived. No model-generated figure touches the PayPal rail.
            </p>
          </div>
        </div>

        {/* Adversarial Scenario Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">12 Adversarial Test Scenarios</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pre-computed benchmark matrix proving guardrail enforcement without consuming live inference tokens.
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold px-3 py-1">
              Static Benchmark Verified
            </span>
          </div>

          <div className="divide-y divide-slate-200">
            {BENCH_SCENARIOS.map((scenario) => (
              <div key={scenario.id} className="p-6 hover:bg-slate-50/50 transition space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2.5">
                    <span className="rounded bg-slate-100 text-slate-700 font-mono text-xs font-bold px-2 py-0.5">
                      {scenario.id}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">{scenario.title}</h4>
                    <span className="text-[11px] font-mono uppercase text-slate-500 px-2 py-0.5 rounded border border-slate-200">
                      {scenario.category.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-600">
                    Protected: {formatCentsToUSD(scenario.merchOpsResult.moneyProtectedCents)}
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{scenario.description}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  {/* LLM Only Card */}
                  <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 space-y-1.5">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-rose-800">
                      <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
                      <span>Autonomous LLM-Only Approver: FAILED</span>
                    </div>
                    <p className="text-xs text-rose-900 leading-normal">
                      {scenario.llmOnlyResult.behavior}
                    </p>
                  </div>

                  {/* MerchOps Guardrails Card */}
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-1.5">
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>MerchOps Guardrail Engine: PROTECTED</span>
                    </div>
                    <p className="text-xs text-emerald-950 leading-normal">
                      {scenario.merchOpsResult.actionTaken}
                    </p>
                    <div className="pt-1">
                      <span className="inline-block rounded bg-emerald-100 text-emerald-900 font-mono text-[10px] font-bold px-2 py-0.5">
                        {scenario.merchOpsResult.ruleCited}
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

