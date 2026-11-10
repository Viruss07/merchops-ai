'use client';

import React from 'react';
import { WithState } from '@/components/shell/WithState';
import { Figure, ListRow, Page, PageHeader, StatusPill } from '@/components/ui/kit';
import { formatCentsToUSD } from '@/lib/money';
import { payoutCheck } from '@/lib/client/whatIf';
import { billStatus, isOpenBill } from '@/lib/client/states';
import type { Bill } from '@/types';

const ORDER: Record<Bill['status'], number> = {
  IN_FLIGHT: 0,
  FAILED: 1,
  PENDING: 2,
  APPROVED: 2,
  DISBURSED: 3,
};

export default function BillsPage() {
  return (
    <WithState label="Loading bills">
      {({ snapshot }) => {
        const bills = [...snapshot.bills].sort(
          (a, b) => ORDER[a.status] - ORDER[b.status] || a.dueDate.localeCompare(b.dueDate),
        );
        const open = bills.filter(isOpenBill);
        const blocked = open.filter(
          (b) => b.status !== 'IN_FLIGHT' && payoutCheck(snapshot, b.id)?.wouldBreach,
        );
        return (
          <Page>
            <PageHeader
              title="Bills"
              meta={
                <>
                  {blocked.length > 0 && (
                    <StatusPill label={`${blocked.length} blocked by the reserve`} tone="blocked" />
                  )}
                  <span>
                    {open.length} open · {bills.length - open.length} paid
                  </span>
                </>
              }
              aside={
                <Figure
                  label="You owe"
                  value={formatCentsToUSD(open.reduce((s, b) => s + b.amountCents, 0))}
                />
              }
            >
              Suppliers you pay through PayPal Payouts. Each payout goes through the reserve check,
              PayPal&apos;s fee included, and only your approval sends it.
            </PageHeader>

            <p className="mt-6 text-sm text-ink-2">
              Each checked as if paid today, against{' '}
              {formatCentsToUSD(snapshot.account.clearedBalanceCents)} cleared and the{' '}
              {formatCentsToUSD(snapshot.account.minReserveCents)} reserve.
            </p>
            <ul className="mt-4 overflow-hidden rounded-lg border border-rule bg-panel">
              {bills.map((bill) => {
                const status = billStatus(bill);
                const policy = payoutCheck(snapshot, bill.id);
                const floorBlocked =
                  isOpenBill(bill) && bill.status !== 'IN_FLIGHT' && policy?.wouldBreach;
                return (
                  <ListRow
                    key={bill.id}
                    href={`/bills/${bill.id}`}
                    title={bill.vendorName}
                    sub={`${bill.billNumber} · ${bill.category}`}
                    status={
                      floorBlocked ? (
                        <StatusPill
                          label={`Reserve · ${formatCentsToUSD(policy.deficitCents)} short`}
                          tone="blocked"
                        />
                      ) : (
                        <StatusPill label={status.label} tone={status.tone} />
                      )
                    }
                    amount={formatCentsToUSD(bill.amountCents)}
                    amountTone={bill.status === 'DISBURSED' ? 'safe' : 'neutral'}
                  />
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-ink-3">
              Payouts already approved or in flight are reserved first, so two payouts can&apos;t
              each pass on their own and break the reserve together. PayPal&apos;s fee is always
              counted.
            </p>
          </Page>
        );
      }}
    </WithState>
  );
}
