/**
 * Strict Integer Cents Utility Functions
 *
 * Rules:
 * - All math operates exclusively on integers (cents).
 * - Division by 100 is permitted only when producing human-readable display strings.
 */

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format integer cents into a localized USD currency string.
 * Example: 420000 -> "$4,200.00"
 */
export function formatCentsToUSD(cents: number): string {
  if (!Number.isFinite(cents)) return '$0.00';
  const dollars = cents / 100;
  return usdFormatter.format(dollars);
}

/**
 * Parse a dollar string into integer cents.
 * Example: "$1,500.00" -> 150000, "1500" -> 150000
 */
export function parseUSDToCents(input: string): number | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;

  // Allow optional leading '-', optional '$', commas
  // After stripping $/, allow optional spaces
  const stripped = trimmed.replace(/\$/g, '').replace(/,/g, '').replace(/\s/g, '');

  // Must match pattern for integer or up to 2 decimal places
  if (!/^-?\d+(\.\d{1,2})?$/.test(stripped)) {
    return null;
  }

  const isNegative = stripped.startsWith('-');
  const absStripped = isNegative ? stripped.slice(1) : stripped;

  const parts = absStripped.split('.');
  const dollarsPart = parts[0] === '' ? '0' : parts[0];
  const centsPart = parts[1] || '';

  // Pad or truncate cents to 2 digits for calculation
  const centsPadded = (centsPart + '00').slice(0, 2);

  // Use string math to compute integer cents
  const dollarsNum = BigInt(dollarsPart === '' ? '0' : dollarsPart);
  const centsNum = BigInt(centsPadded);

  let totalCents: bigint;
  if (centsPart.length === 0) {
    // No decimal point
    totalCents = dollarsNum * 100n;
  } else if (centsPart.length === 1) {
    // One decimal place
    totalCents = dollarsNum * 100n + centsNum;
  } else {
    // Two decimal places
    totalCents = dollarsNum * 100n + centsNum;
  }

  if (isNegative) {
    totalCents = -totalCents;
  }

  // Check if it's within safe integer range for JavaScript numbers
  if (
    totalCents > BigInt(Number.MAX_SAFE_INTEGER) ||
    totalCents < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    return null;
  }

  return Number(totalCents);
}

export function isValidCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function assertValidCents(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Invalid ${name}: must be a safe integer`);
  }
  if (value < 0) {
    throw new RangeError(`Invalid ${name}: must be non-negative`);
  }
}

export function centsToPayPalAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError('Invalid cents amount');
  }
  const dollars = Math.trunc(cents / 100);
  const remainder = cents % 100;
  const absRemainder = ((remainder % 100) + 100) % 100;
  return `${dollars}.${String(absRemainder).padStart(2, '0')}`;
}

/**
 * Safe addition of integer cents.
 */
export function addCents(a: number, b: number): number {
  assertValidCents(a, 'addCents(a)');
  assertValidCents(b, 'addCents(b)');
  return a + b;
}

/**
 * Safe subtraction of integer cents.
 */
export function subtractCents(a: number, b: number): number {
  assertValidCents(a, 'subtractCents(a)');
  assertValidCents(b, 'subtractCents(b)');
  const result = a - b;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('Result out of safe integer range');
  }
  return result;
}

export interface PayoutPolicyResult {
  allowed: boolean;
  postPayoutBalanceCents: number;
  wouldBreach: boolean;
  deficitCents: number;
  bufferCents: number;
}

/**
 * Deterministic cash reserve policy. A payout is allowed when the projected
 * balance stays at or above the configured reserve floor.
 */
export function evaluatePayoutPolicy(input: {
  currentBalanceCents: number;
  minReserveCents: number;
  billAmountCents: number;
}): PayoutPolicyResult {
  assertValidCents(input.currentBalanceCents, 'currentBalanceCents');
  assertValidCents(input.minReserveCents, 'minReserveCents');
  assertValidCents(input.billAmountCents, 'billAmountCents');
  if (input.billAmountCents <= 0) {
    throw new RangeError('billAmountCents must be positive');
  }

  const postPayoutBalanceCents = subtractCents(input.currentBalanceCents, input.billAmountCents);
  const bufferCents = subtractCents(postPayoutBalanceCents, input.minReserveCents);
  const wouldBreach = bufferCents < 0;

  return {
    allowed: !wouldBreach,
    postPayoutBalanceCents,
    wouldBreach,
    deficitCents: wouldBreach ? -bufferCents : 0,
    bufferCents,
  };
}
