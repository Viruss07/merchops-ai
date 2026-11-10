'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Journey } from '@/components/journey/Journey';
import { useAppState } from '@/components/shell/AppState';
import { WithState } from '@/components/shell/WithState';
import { formatCentsToUSD } from '@/lib/money';
import { payoutCheck } from '@/lib/client/whatIf';
import { formatDate, isOpenBill } from '@/lib/client/states';
import { StatusPill } from '@/components/ui/kit';
import type { RunwayForecast, StateSnapshot } from '@/types';

/** What is waiting on the merchant right now, each row a link to the page that resolves it. */
function NeedsYou({ snapshot, forecast }: { snapshot: StateSnapshot; forecast: RunwayForecast }) {
  const rows: {
    href: string;
    title: string;
    detail: string;
    tone: 'risk' | 'blocked' | 'safe' | 'neutral';
    pill: string;
  }[] = [];

  for (const invoice of snapshot.invoices.filter((i) => i.status === 'OVERDUE')) {
    rows.push({
      href: `/invoices/${invoice.id}`,
      title: `Collect ${formatCentsToUSD(invoice.amountCents)} from ${invoice.customerName}`,
      detail: `${invoice.invoiceNumber} was due ${formatDate(invoice.dueDate)}. Collecting it lifts the whole runway.`,
      tone: 'risk',
      pill: `${invoice.daysOverdue} days overdue`,
    });
  }
  for (const bill of snapshot.bills.filter((b) => b.status === 'IN_FLIGHT')) {
    rows.push({
      href: `/bills/${bill.id}`,
      title: `Confirm the ${bill.vendorName} payout`,
      detail:
        'PayPal accepted the batch. Its balance stays reserved until settlement is confirmed.',
      tone: 'risk',
      pill: 'In flight',
    });
  }
  for (const bill of snapshot.bills.filter((b) => isOpenBill(b) && b.status !== 'IN_FLIGHT')) {
    const policy = payoutCheck(snapshot, bill.id);
    rows.push({
      href: `/bills/${bill.id}`,
      title: `Pay ${bill.vendorName} ${formatCentsToUSD(bill.amountCents)}`,
      detail: policy?.wouldBreach
        ? `Paying it today would leave ${formatCentsToUSD(policy.postPayoutBalanceCents)}, ${formatCentsToUSD(policy.deficitCents)} under the floor.`
        : `Due ${formatDate(bill.dueDate)}. The floor allows it with ${formatCentsToUSD(policy?.bufferCents ?? 0)} to spare.`,
      tone: policy?.wouldBreach ? 'blocked' : 'neutral',
      pill: policy?.wouldBreach ? 'Blocked by the floor' : 'Ready to approve',
    });
  }

  return (
    <section aria-labelledby="needs-h" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <div className="grid gap-8 border-t border-rule pt-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <h2 id="needs-h" className="text-lg font-semibold">
            Waiting on you
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {rows.length === 0
              ? 'Nothing. Every invoice is collected and every bill is settled.'
              : `${rows.length} ${rows.length === 1 ? 'thing' : 'things'}, in the order the runway needs them.`}
          </p>
          {rows.length > 0 && (
            <ul className="mt-4 overflow-hidden rounded-lg border border-rule bg-panel">
              {rows.map((row) => (
                <li key={row.href} className="border-t border-rule first:border-t-0">
                  <Link
                    href={row.href}
                    className="group flex items-center gap-4 px-4 py-3.5 no-underline transition-colors hover:bg-paper sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{row.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{row.detail}</p>
                    </div>
                    <span className="hidden sm:block">
                      <StatusPill label={row.pill} tone={row.tone} />
                    </span>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-ink-3 transition-colors group-hover:text-ink"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="space-y-3 text-sm">
          <h2 className="text-lg font-semibold">The numbers, today</h2>
          <dl className="rounded-lg border border-rule bg-panel px-4 py-2">
            {[
              ['Cleared cash', formatCentsToUSD(snapshot.account.clearedBalanceCents), '/runway'],
              ['Reserve floor', formatCentsToUSD(snapshot.account.minReserveCents), '/runway'],
              [
                forecast.firstBreachDay
                  ? `Lowest · Day ${forecast.firstBreachDay}`
                  : 'Lowest in 30 days',
                formatCentsToUSD(forecast.minBalanceCents),
                '/runway',
              ],
              [
                'Owed to you',
                formatCentsToUSD(
                  snapshot.invoices
                    .filter((i) => i.status !== 'PAID')
                    .reduce((s, i) => s + i.amountCents, 0),
                ),
                '/invoices',
              ],
              [
                'You owe',
                formatCentsToUSD(
                  snapshot.bills.filter(isOpenBill).reduce((s, b) => s + b.amountCents, 0),
                ),
                '/bills',
              ],
            ].map(([label, value, href], index) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-3 border-t border-rule py-2 first:border-t-0"
              >
                <dt className="text-ink-2">
                  <Link href={href} className="no-underline hover:text-ink">
                    {label}
                  </Link>
                </dt>
                <dd
                  className={`money font-semibold ${
                    index === 2
                      ? forecast.hasReserveBreach
                        ? 'text-blocked'
                        : 'text-safe'
                      : 'text-ink'
                  }`}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs leading-relaxed text-ink-3">
            Every figure comes from the same deterministic forecast in integer cents. The AI never
            does the arithmetic.
          </p>
        </aside>
      </div>
    </section>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { setSnapshot, resetCount } = useAppState();
  return (
    <WithState label="Loading the runway">
      {({ snapshot, forecast }) => (
        <>
          <Journey
            key={resetCount}
            snapshot={snapshot}
            forecast={forecast}
            onSnapshot={setSnapshot}
            onOpenAudit={() => router.push('/ledger')}
            onOpenPayouts={() => router.push('/bills/bill-acme-01')}
          />
          <NeedsYou snapshot={snapshot} forecast={forecast} />
        </>
      )}
    </WithState>
  );
}
