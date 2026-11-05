const MAX_BILL_ID_LENGTH = 80;

/**
 * Deterministic PayPal-Request-Id for a bill payout.
 *
 * The same bill/action always produces the same key, so a network retry,
 * double-click, or server re-entry reuses PayPal's idempotency window instead
 * of creating a second payout. The value is not a secret.
 */
export function derivePayoutRequestId(billId: string): string {
  const sanitized = billId
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .slice(0, MAX_BILL_ID_LENGTH);
  return `merchops-payout-${sanitized}-v1`;
}
