import React from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
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

  return (
    <Page>
      <PageHeader
        title="Safety tests"
        meta={
          <>
            <StatusPill
              label={
                allBlocked ? 'Every attack blocked' : `${results.length - blockedCount} got through`
              }
              tone={allBlocked ? 'safe' : 'blocked'}
            />
            <span>
              Ran live on this page load ·{' '}
              <time dateTime={ranAt} className="mono text-xs">
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
        Twelve ways an AI payments assistant can go wrong: an injected instruction, a forgotten fee,
        a retried click, an unsettled batch counted as cash. Each one just ran against the same
        guard code the API uses, on an isolated copy of the ledger. Nothing here is precomputed, no
        model tokens are spent, and no money moves.
      </PageHeader>

      <dl className="mt-6 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-3">
        {[
          ['Money an unguarded approver would have moved', formatCentsToUSD(atRisk)],
          ['Guards that ran', String(new Set(results.map((r) => r.guard)).size)],
          ['Also covered by', 'npm test'],
        ].map(([label, value]) => (
          <div key={label} className="bg-panel px-4 py-3">
            <dt className="text-xs text-ink-2">{label}</dt>
            <dd className="money mt-1 text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <ol className="mt-8 space-y-5">
        {BENCH_SCENARIOS.map((scenario) => {
          const result = resultById.get(scenario.id);
          const blocked = Boolean(result?.blocked);
          return (
            <li
              key={scenario.id}
              id={scenario.id.toLowerCase()}
              className="scroll-mt-20 rounded-lg border border-rule bg-panel p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold">
                  <span className="mono mr-2 text-xs font-normal text-ink-3">{scenario.id}</span>
                  {scenario.title}
                </h2>
                <span className="text-xs text-ink-2">{CATEGORY[scenario.category]}</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{scenario.description}</p>
              <pre className="mono mt-3 whitespace-pre-wrap break-words rounded-md border border-rule bg-paper px-3 py-2 text-xs text-ink">
                {scenario.trapInput}
              </pre>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <section className={`rounded-md border p-3 ${TONE_SURFACE.neutral}`}>
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    <X className="h-3.5 w-3.5 text-blocked" aria-hidden="true" />
                    Without a guard
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">
                    {scenario.llmOnlyResult.behavior}
                  </p>
                  {scenario.llmOnlyResult.moneyAtRiskCents > 0 && (
                    <p className="mt-2 text-xs text-ink-3">
                      At risk:{' '}
                      <span className="money font-semibold text-blocked">
                        {formatCentsToUSD(scenario.llmOnlyResult.moneyAtRiskCents)}
                      </span>
                    </p>
                  )}
                  <p className="mt-2 text-xs text-ink-3">
                    A threat model, not a measured model run.
                  </p>
                </section>
                <section
                  className={`rounded-md border p-3 ${TONE_SURFACE[blocked ? 'safe' : 'blocked']}`}
                >
                  <p
                    className={`flex items-center gap-1.5 text-sm font-medium ${blocked ? 'text-safe' : 'text-blocked'}`}
                  >
                    {blocked ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {blocked ? 'MerchOps blocked it, live' : 'Not blocked on this run'}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">
                    {result?.evidence ?? scenario.merchOpsResult.actionTaken}
                  </p>
                  <p className="mono mt-2 break-words text-[11px] text-ink-3">
                    {result?.guard ?? scenario.merchOpsResult.ruleCited}
                  </p>
                </section>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-8 text-sm text-ink-2">
        See the same guard on a real bill:{' '}
        <Link href="/bills/bill-acme-01" className="font-medium text-ink underline">
          try to pay Acme Supplies
        </Link>
        .
      </p>
    </Page>
  );
}
