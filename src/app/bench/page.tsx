import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { BENCH_SCENARIOS, type BenchScenario } from '@/lib/bench/scenarios';
import { runBench } from '@/lib/bench/run';
import { formatCentsToUSD } from '@/lib/money';
import { Figure, Page, PageHeader, StatusPill, TONE_SURFACE } from '@/components/ui/kit';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Safety tests',
  description: '12 attacks on a payments copilot, each run live against the real MerchOps guard.',
};

const CATEGORY: Record<BenchScenario['category'], string> = {
  RESERVE_SAFETY: 'Safety reserve',
  PROMPT_INJECTION: 'Prompt injection',
  IDEMPOTENCY: 'Double payment',
  DATA_INTEGRITY: 'Data integrity',
  SECURITY_INJECTION: 'Input injection',
};

export default async function BenchPage() {
  const results = await runBench();
  const resultById = new Map(results.map((r) => [r.id, r]));
  const blockedCount = results.filter((r) => r.blocked).length;
  const atRisk = BENCH_SCENARIOS.reduce((sum, s) => sum + s.llmOnlyResult.moneyAtRiskCents, 0);
  const ranAt = new Date().toISOString();
  const allBlocked = blockedCount === results.length;

  const categories = Object.entries(CATEGORY).map(([key, label]) => {
    const scenarios = BENCH_SCENARIOS.filter((s) => s.category === key);
    const blocked = scenarios.filter((s) => resultById.get(s.id)?.blocked).length;
    return { key, label, total: scenarios.length, blocked };
  });

  return (
    <Page>
      <PageHeader
        title="Safety Test Bench"
        meta={
          <>
            <StatusPill
              label={
                allBlocked ? 'All 12 attacks blocked' : `${results.length - blockedCount} got through`
              }
              tone={allBlocked ? 'safe' : 'blocked'}
            />
            <span>
              Evaluated live against policy guards ·{' '}
              <time dateTime={ranAt} className="mono text-xs text-ink-2">
                {ranAt.slice(0, 19).replace('T', ' ')} UTC
              </time>
            </span>
          </>
        }
        aside={
          <Figure
            label="Blocked on this run"
            value={`${blockedCount} / ${results.length}`}
            tone={allBlocked ? 'safe' : 'blocked'}
          />
        }
      >
        Twelve real failure modes tested live against MerchOps&apos;s deterministic guard code on an
        isolated state copy: injected prompts, forgotten fees, duplicate retries, and unsettled
        batches. Zero real money or AI tokens are spent.
      </PageHeader>

      <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-blocked/35 bg-blocked-field/35 p-4">
          <dt className="text-xs text-ink-2">Money an unguarded approver would lose</dt>
          <dd className="money mt-1 text-xl font-bold text-blocked">{formatCentsToUSD(atRisk)}</dd>
        </div>
        <div className="rounded-xl border border-rule bg-panel p-4">
          <dt className="text-xs text-ink-2">Distinct policy guards verified</dt>
          <dd className="money mt-1 text-xl font-bold text-ink">
            {String(new Set(results.map((r) => r.guard)).size)}
          </dd>
        </div>
        <div className="rounded-xl border border-safe/35 bg-safe-field/35 p-4">
          <dt className="text-xs text-ink-2">Automated suite verification</dt>
          <dd className="mono mt-1 text-lg font-bold text-safe">npm test</dd>
        </div>
      </dl>

      {/* Category Defense Strip */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {categories.map((cat) => (
          <div
            key={cat.key}
            className="flex items-center justify-between gap-2 rounded-lg border border-rule bg-panel px-3 py-2 text-xs"
          >
            <span className="font-medium text-ink-2">{cat.label}</span>
            <span
              className={`mono font-semibold ${
                cat.blocked === cat.total ? 'text-safe' : 'text-blocked'
              }`}
            >
              {cat.blocked}/{cat.total}
            </span>
          </div>
        ))}
      </div>

      <ol className="mt-6 space-y-5">
        {BENCH_SCENARIOS.map((scenario) => {
          const result = resultById.get(scenario.id);
          const blocked = Boolean(result?.blocked);
          return (
            <li
              key={scenario.id}
              id={scenario.id.toLowerCase()}
              className="scroll-mt-20 rounded-xl border border-rule bg-panel p-4 shadow-xs sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono rounded border border-rule-strong bg-paper px-2 py-0.5 text-xs font-semibold text-ink-2">
                    {scenario.id}
                  </span>
                  <h2 className="text-base font-bold text-ink">{scenario.title}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-rule bg-paper px-2.5 py-0.5 text-xs text-ink-2">
                    {CATEGORY[scenario.category]}
                  </span>
                  <StatusPill
                    label={blocked ? 'Blocked' : 'Failed'}
                    tone={blocked ? 'safe' : 'blocked'}
                  />
                </div>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-ink-2">{scenario.description}</p>

              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-2">
                  Adversarial / Edge Input
                </p>
                <pre className="mono mt-1.5 whitespace-pre-wrap break-words rounded-lg border border-rule-strong bg-paper px-3.5 py-2.5 text-xs text-ink">
                  {scenario.trapInput}
                </pre>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <section className={`rounded-lg border p-3.5 ${TONE_SURFACE.neutral}`}>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <ShieldAlert className="h-4 w-4 text-blocked" aria-hidden="true" />
                    Without Deterministic Guard
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                    {scenario.llmOnlyResult.behavior}
                  </p>
                  {scenario.llmOnlyResult.moneyAtRiskCents > 0 && (
                    <p className="mt-2.5 text-xs text-ink-2">
                      Exposure:{' '}
                      <span className="money font-bold text-blocked">
                        {formatCentsToUSD(scenario.llmOnlyResult.moneyAtRiskCents)}
                      </span>
                    </p>
                  )}
                  <p className="mt-2 text-xs text-ink-3">
                    Threat-model baseline for unguarded LLM tool execution.
                  </p>
                </section>

                <section
                  className={`rounded-lg border p-3.5 ${TONE_SURFACE[blocked ? 'safe' : 'blocked']}`}
                >
                  <p
                    className={`flex items-center gap-1.5 text-sm font-semibold ${
                      blocked ? 'text-safe' : 'text-blocked'
                    }`}
                  >
                    {blocked ? (
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <X className="h-4 w-4" aria-hidden="true" />
                    )}
                    {blocked ? 'MerchOps Blocked It (Live)' : 'Not Blocked on This Run'}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                    {result?.evidence ?? scenario.merchOpsResult.actionTaken}
                  </p>
                  <p className="mono mt-2.5 inline-block break-words rounded border border-rule bg-panel/80 px-2 py-0.5 text-xs text-ink-2">
                    Guard: {result?.guard ?? scenario.merchOpsResult.ruleCited}
                  </p>
                </section>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-8 text-sm text-ink-2">
        See the live reserve guard on an open vendor bill:{' '}
        <Link href="/bills/bill-acme-01" className="font-medium text-ink underline">
          inspect Acme Supplies ($3,000.00)
        </Link>
        .
      </p>
    </Page>
  );
}
