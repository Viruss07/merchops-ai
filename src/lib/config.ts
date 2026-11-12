/**
 * Demo Configuration
 * Deterministic values for the partner demo scenario.
 */

function getDemoAsOf(): string {
  const envValue = process.env.DEMO_AS_OF;
  if (envValue && /^\d{4}-\d{2}-\d{2}$/.test(envValue)) {
    return envValue;
  }
  return '2026-11-03';
}

function getDefaultMinReserveCents(): number {
  const envValue = process.env.DEFAULT_MIN_RESERVE_CENTS;
  if (envValue) {
    const parsed = Number(envValue);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 200000;
}

function getDefaultForecastDays(): number {
  const envValue = process.env.DEFAULT_FORECAST_DAYS;
  if (envValue) {
    const parsed = Number(envValue);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 365) {
      return parsed;
    }
  }
  return 30;
}

function getPayPalPayoutFeeCents(): number {
  const envValue = process.env.PAYPAL_PAYOUT_FEE_CENTS;
  if (envValue) {
    const parsed = Number(envValue);
    if (Number.isSafeInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 25;
}

export const DEMO_AS_OF = getDemoAsOf();
export const DEFAULT_MIN_RESERVE_CENTS = getDefaultMinReserveCents();
export const DEFAULT_FORECAST_DAYS = getDefaultForecastDays();
export const PAYPAL_SANDBOX_ENABLED = process.env.PAYPAL_PAYOUTS_ENABLED === 'true';
export const PAYPAL_PAYOUT_FEE_CENTS = getPayPalPayoutFeeCents();

/**
 * Optional sandbox Personal account that receives every live sandbox payout. The seeded vendors
 * use `.test` addresses, which PayPal leaves UNCLAIMED forever; pointing payouts at a real sandbox
 * account lets a batch settle to SUCCESS. Must end in a sandbox domain (`@personal.example.com` or
 * any address the sandbox owns); it is never used outside the sandbox base URL.
 */
export function payoutReceiverFor(vendorEmail: string): string {
  const override = process.env.PAYPAL_PAYOUT_RECEIVER_EMAIL?.trim();
  return override && override.includes('@') ? override : vendorEmail;
}
