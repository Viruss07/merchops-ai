/**
 * Strict Integer Cents Utility Functions
 * 
 * Rules:
 * - All math operates exclusively on integers (cents).
 * - Division by 100 is permitted only when producing human-readable display strings.
 */

/**
 * Format integer cents into a localized USD currency string.
 * Example: 420000 -> "$4,200.00"
 */
export function formatCentsToUSD(cents: number): string {
  if (!Number.isFinite(cents)) return "$0.00";
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Parse a dollar string into integer cents.
 * Example: "$1,500.00" -> 150000, "1500" -> 150000
 */
export function parseUSDToCents(usdString: string): number {
  const clean = usdString.replace(/[^0-9.-]/g, "");
  const floatVal = parseFloat(clean);
  if (isNaN(floatVal)) return 0;
  return Math.round(floatVal * 100);
}

/**
 * Safe addition of integer cents.
 */
export function addCents(a: number, b: number): number {
  return Math.round(a) + Math.round(b);
}

/**
 * Safe subtraction of integer cents.
 */
export function subtractCents(a: number, b: number): number {
  return Math.round(a) - Math.round(b);
}

export interface PayoutPolicyEvaluation {
  allowed: boolean;
  postPayoutBalanceCents: number;
  wouldBreach: boolean;
  deficitCents: number;
  bufferCents: number;
}

/**
 * Deterministic Cash Reserve Policy Evaluation
 *
 * Business Rules:
 * - projectedBalance = currentClearedCash - payoutAmount
 * - reserveBuffer = projectedBalance - safetyReserve
 * - A payout is allowed if: projectedBalance >= safetyReserve
 */
export function evaluatePayoutPolicy({
  currentBalanceCents,
  minReserveCents,
  billAmountCents,
}: {
  currentBalanceCents: number;
  minReserveCents: number;
  billAmountCents: number;
}): PayoutPolicyEvaluation {
  const postPayoutBalanceCents = Math.round(currentBalanceCents) - Math.round(billAmountCents);
  const wouldBreach = postPayoutBalanceCents < Math.round(minReserveCents);
  const deficitCents = wouldBreach ? Math.round(minReserveCents) - postPayoutBalanceCents : 0;
  const bufferCents = !wouldBreach ? postPayoutBalanceCents - Math.round(minReserveCents) : 0;

  return {
    allowed: !wouldBreach,
    postPayoutBalanceCents,
    wouldBreach,
    deficitCents,
    bufferCents,
  };
}

