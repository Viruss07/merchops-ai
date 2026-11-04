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

