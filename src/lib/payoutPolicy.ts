/**
 * Payout Policy Evaluation
 */

import { Bill } from '@/types';
import { evaluatePayoutPolicy, PayoutPolicyResult } from '@/lib/money';

export { evaluatePayoutPolicy };
export type { PayoutPolicyResult };

export function evaluatePayoutSchedule(input: {
  clearedBalanceCents: number;
  minReserveCents: number;
  bills: Bill[];
}): Record<string, PayoutPolicyResult> {
  // Consider bills with status PENDING/APPROVED/IN_FLIGHT, sorted by dueDate asc then id
  const eligibleBills = input.bills
    .filter(
      (bill) =>
        bill.status === 'PENDING' || bill.status === 'APPROVED' || bill.status === 'IN_FLIGHT',
    )
    .sort((a, b) => {
      if (a.dueDate === b.dueDate) {
        return a.id.localeCompare(b.id);
      }
      return a.dueDate.localeCompare(b.dueDate);
    });

  const result: Record<string, PayoutPolicyResult> = {};
  let runningBalance = input.clearedBalanceCents;

  for (const bill of eligibleBills) {
    const policy = evaluatePayoutPolicy({
      currentBalanceCents: runningBalance,
      minReserveCents: input.minReserveCents,
      billAmountCents: bill.amountCents,
    });
    result[bill.id] = policy;
    runningBalance = policy.postPayoutBalanceCents;
  }

  return result;
}
