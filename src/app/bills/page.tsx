'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { WithState } from '@/components/shell/WithState';
import { PayPalBalanceCard } from '@/components/bills/PayPalBalanceCard';
import { Figure, Page, PageHeader, StatusPill, btn } from '@/components/ui/kit';
import { formatCentsToUSD } from '@/lib/money';
import { payoutCheck } from '@/lib/client/whatIf';
import { evaluateBillPayPalBalance } from '@/lib/paypalBalance';
import { formatDate, isOpenBill, billStatus } from '@/lib/client/states';
import type { Bill, StateSnapshot } from '@/types';

const ORDER: Record<Bill['status'], number> = {
  IN_FLIGHT: 0,
  FAILED: 1,
  PENDING: 2,
  APPROVED: 2,
  DISBURSED: 3,
};

function describeBillRow(snapshot: StateSnapshot, bill: Bill) {
  const status = billStatus(bill);
  const policy = payoutCheck(snapshot, bill.id);
  const open = isOpenBill(bill);
  const floorBlocked = open && bill.status !== 'IN_FLIGHT' && !!policy?.wouldBreach;
  const walletCheck = evaluateBillPayPalBalance({
    paypalBalance: snapshot.paypalBalance,
    billAmountCents: bill.amountCents,
    feeCents: snapshot.demoConfig.paypalPayoutFeeCents,
  });
  const walletBlocked =
    open && bill.status !== 'IN_FLIGHT' && !floorBlocked && walletCheck.status === 'INSUFFICIENT';

  const pill = floorBlocked
    ? { label: `Blocked · ${formatCentsToUSD(policy.deficitCents)} short`, tone: 'blocked' as const }
    : walletBlocked
      ? { label: `PayPal short · ${formatCentsToUSD(walletCheck.shortfallCents)}`, tone: 'blocked' as const }
      : status;

  const actionLabel =
    bill.status === 'DISBURSED'
      ? 'View receipt'
      : bill.status === 'FAILED'
        ? 'Inspect failure'
        : floorBlocked || walletBlocked
          ? 'Inspect block'
          : 'Review & Pay';

  return { policy, floorBlocked, walletCheck, walletBlocked, pill, actionLabel };
}

export default function BillsPage() {
  return (
    <WithState label="Loading bills">
      {({ snapshot }) => {
        const bills = [...snapshot.bills].sort(
          (a, b) => ORDER[a.status] - ORDER[b.status] || a.dueDate.localeCompare(b.dueDate),
        );
        const open = bills.filter(isOpenBill);
        const paid = bills.filter((b) => b.status === 'DISBURSED');
        const openTotal = open.reduce((s, b) => s + b.amountCents, 0);
        const paidTotal = paid.reduce((s, b) => s + b.amountCents, 0);
        const blocked = open.filter(
          (b) => b.status !== 'IN_FLIGHT' && payoutCheck(snapshot, b.id)?.wouldBreach,
        );

        return (
          <Page>
            <PageHeader
              title="Bills & Supplier Payouts"
              meta={
                <>
                  {blocked.length > 0 && (
                    <StatusPill label={`${blocked.length} blocked by reserve`} tone="blocked" />
                  )}
                  <span>
                    {open.length} open · {paid.length} disbursed
                  </span>
                </>
              }
              aside={<Figure label="Total open payables" value={formatCentsToUSD(openTotal)} />}
            >
              Suppliers paid through PayPal Payouts. Every disbursement runs through the deterministic
              reserve check (PayPal fee included) and waits for your explicit approval.
            </PageHeader>

            {/* Summary KPI Strip */}
            <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-rule bg-panel p-3.5">
                <dt className="text-xs text-ink-2">Cleared vs Reserve Floor</dt>
                <dd className="money mt-1 text-lg font-semibold text-ink">
                  {formatCentsToUSD(snapshot.account.clearedBalanceCents)}{' '}
                  <span className="text-xs font-normal text-ink-2">
                    / {formatCentsToUSD(snapshot.account.minReserveCents)} min
                  </span>
                </dd>
                <p className="mt-0.5 text-xs text-ink-2">Current ledger snapshot</p>
              </div>
              <div
                className={`rounded-xl border p-3.5 ${
                  blocked.length > 0
                    ? 'border-blocked/40 bg-blocked-field/40'
                    : 'border-rule bg-panel'
                }`}
              >
                <dt className="text-xs text-ink-2">Guardrail Status</dt>
                <dd
                  className={`mt-1 text-lg font-semibold ${
                    blocked.length > 0 ? 'text-blocked' : 'text-safe'
                  }`}
                >
                  {blocked.length > 0
                    ? `${blocked.length} Blocked Today`
                    : 'Open Bills Eligible'}
                </dd>
                <p className="mt-0.5 text-xs text-ink-2">
                  Checked fee-inclusive against cleared balance
                </p>
              </div>
              <div className="rounded-xl border border-safe/35 bg-safe-field/35 p-3.5">
                <dt className="text-xs text-ink-2">Disbursed</dt>
                <dd className="money mt-1 text-lg font-semibold text-safe">
                  {formatCentsToUSD(paidTotal)}
                </dd>
                <p className="mt-0.5 text-xs text-ink-2">{paid.length} vendor payouts settled</p>
              </div>
            </dl>

            <div className="mt-4">
              <PayPalBalanceCard snapshot={snapshot} />
            </div>

            {snapshot.account.payoutVerification && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-focus/35 bg-focus/10 px-4 py-2.5 text-xs text-ink">
                <span className="inline-flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-focus" aria-hidden="true" />
                  Latest verified PayPal batch:{' '}
                  <span className="mono font-semibold text-ink">
                    {snapshot.account.payoutVerification.batchId}
                  </span>
                </span>
                <Link href="/ledger" className="font-medium text-focus underline">
                  Inspect in Audit Log
                </Link>
              </div>
            )}

            {/* Desktop/Tablet Table */}
            <div className="mt-5 hidden overflow-x-auto rounded-xl border border-rule bg-panel md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rule bg-paper/70 text-left text-xs font-medium text-ink-2">
                    <th scope="col" className="px-4 py-3">
                      Vendor &amp; Category
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Bill # &amp; Due
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Reserve Guardrail Check
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Amount
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {bills.map((bill) => {
                    const { policy, floorBlocked, walletCheck, walletBlocked, pill, actionLabel } =
                      describeBillRow(snapshot, bill);

                    return (
                      <tr key={bill.id} className="transition-colors hover:bg-paper/60">
                        <td className="px-4 py-3.5">
                          <Link
                            href={`/bills/${bill.id}`}
                            className="font-semibold text-ink no-underline hover:underline"
                          >
                            {bill.vendorName}
                          </Link>
                          <p className="mt-0.5 text-xs text-ink-2">{bill.category}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs text-ink-2">
                          <span className="mono font-medium text-ink">{bill.billNumber}</span>
                          <span className="block">{formatDate(bill.dueDate, { year: true })}</span>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          {bill.status === 'DISBURSED' ? (
                            <span className="text-safe">Settled &amp; deducted</span>
                          ) : bill.status === 'IN_FLIGHT' ? (
                            <span className="text-risk">Reserved while settling</span>
                          ) : bill.status === 'FAILED' ? (
                            <span className="font-medium text-blocked">Payout failed · 0 moved</span>
                          ) : policy ? (
                            floorBlocked ? (
                              <span className="font-medium text-blocked">
                                Leaves {formatCentsToUSD(policy.postPayoutBalanceCents)} (−
                                {formatCentsToUSD(policy.deficitCents)} under floor)
                              </span>
                            ) : walletBlocked ? (
                              <span className="font-medium text-blocked">
                                PayPal Sandbox short {formatCentsToUSD(walletCheck.shortfallCents)}
                              </span>
                            ) : (
                              <span className="font-medium text-safe">
                                Passes (+{formatCentsToUSD(policy.bufferCents)} buffer)
                              </span>
                            )
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <StatusPill label={pill.label} tone={pill.tone} />
                        </td>
                        <td
                          className={`money whitespace-nowrap px-4 py-3.5 text-right font-semibold ${
                            bill.status === 'DISBURSED' ? 'text-safe' : 'text-ink'
                          }`}
                        >
                          {formatCentsToUSD(bill.amountCents)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-right">
                          <Link
                            href={`/bills/${bill.id}`}
                            className={
                              isOpenBill(bill) && !floorBlocked && !walletBlocked
                                ? btn.small
                                : btn.quiet
                            }
                          >
                            {actionLabel}
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards (<md) */}
            <ul className="mt-4 space-y-2.5 md:hidden">
              {bills.map((bill) => {
                const { policy, floorBlocked, walletCheck, walletBlocked, pill, actionLabel } =
                  describeBillRow(snapshot, bill);
                return (
                  <li key={bill.id}>
                    <Link
                      href={`/bills/${bill.id}`}
                      className="block rounded-xl border border-rule bg-panel p-4 no-underline transition-colors hover:border-rule-strong"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {bill.vendorName}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-ink-2">
                            {bill.billNumber} · {bill.category} · Due{' '}
                            {formatDate(bill.dueDate, { year: false })}
                          </p>
                        </div>
                        <p
                          className={`money shrink-0 text-sm font-bold ${
                            bill.status === 'DISBURSED' ? 'text-safe' : 'text-ink'
                          }`}
                        >
                          {formatCentsToUSD(bill.amountCents)}
                        </p>
                      </div>
                      {policy && isOpenBill(bill) && bill.status !== 'IN_FLIGHT' && (
                        <p
                          className={`mt-1.5 text-xs ${
                            floorBlocked || walletBlocked ? 'text-blocked' : 'text-safe'
                          }`}
                        >
                          {floorBlocked
                            ? `Leaves ${formatCentsToUSD(policy.postPayoutBalanceCents)} (${formatCentsToUSD(policy.deficitCents)} under floor)`
                            : walletBlocked
                              ? `PayPal Sandbox short ${formatCentsToUSD(walletCheck.shortfallCents)}`
                              : `Passes reserve (+${formatCentsToUSD(policy.bufferCents)} buffer)`}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-2.5">
                        <StatusPill label={pill.label} tone={pill.tone} />
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-ink">
                          {actionLabel}
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 text-xs text-ink-2">
              In-flight payouts stay reserved against available headroom so sequential payments can
              never breach the safety floor together. PayPal fees are always included.
            </p>
          </Page>
        );
      }}
    </WithState>
  );
}
