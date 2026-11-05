/**
 * MerchOps AI — Deterministic Runway Forecasting Engine
 *
 * Strict Financial Principle:
 * - 100% deterministic arithmetic in integer cents.
 * - Zero LLM dependency for financial projections.
 * - Precision guaranteed: Balance(d) = Balance(d-1) + Inflow(d) - Outflow(d).
 */

import { CurrencyCents, Invoice, Bill, RunwayDay, RunwayForecast } from '@/types';
import { addCents, subtractCents } from '@/lib/money';
import { DEFAULT_FORECAST_DAYS, DEMO_AS_OF } from '@/lib/config';

export interface RunwayOptions {
  clearedBalanceCents: CurrencyCents;
  minReserveCents: CurrencyCents;
  invoices: Invoice[];
  bills: Bill[];
  horizonDays?: number; // Defaults to DEFAULT_FORECAST_DAYS
  startDate?: string;    // Defaults to DEMO_AS_OF
}

/**
 * Parse YYYY-MM-DD date string using UTC
 */
function parseUTCDate(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new RangeError('Invalid date format');
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // months are 0-indexed
  const day = parseInt(match[3], 10);
  return new Date(Date.UTC(year, month, day));
}

/**
 * Format Date to YYYY-MM-DD using UTC
 */
function formatUTCDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Add days to a UTC date
 */
function addUTCDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Calculates day-by-day cash trajectory over forecast horizon.
 */
export function calculateRunway(options: RunwayOptions): RunwayForecast {
  const {
    clearedBalanceCents,
    minReserveCents,
    invoices,
    bills,
    horizonDays = DEFAULT_FORECAST_DAYS,
    startDate = DEMO_AS_OF,
  } = options;

  // Validate horizonDays
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 365) {
    throw new RangeError('horizonDays must be an integer between 1 and 365');
  }

  // Validate balances and amounts are safe integers
  if (!Number.isSafeInteger(clearedBalanceCents)) {
    throw new RangeError('clearedBalanceCents must be a safe integer');
  }
  if (!Number.isSafeInteger(minReserveCents)) {
    throw new RangeError('minReserveCents must be a safe integer');
  }

  // Validate all invoice and bill amounts
  for (const inv of invoices) {
    if (!Number.isSafeInteger(inv.amountCents)) {
      throw new RangeError('invoice amount must be a safe integer');
    }
  }
  for (const bill of bills) {
    if (!Number.isSafeInteger(bill.amountCents)) {
      throw new RangeError('bill amount must be a safe integer');
    }
  }

  const days: RunwayDay[] = [];
  let runningBalance = clearedBalanceCents;
  let hasReserveBreach = false;
  let firstBreachDay: number | undefined = undefined;
  let breachDate: string | undefined = undefined;
  let maxDeficitCents: CurrencyCents = 0;

  const baseDate = parseUTCDate(startDate);

  // Check opening balance
  if (clearedBalanceCents < minReserveCents) {
    hasReserveBreach = true;
    firstBreachDay = 0;
    breachDate = startDate;
    const deficit = minReserveCents - clearedBalanceCents;
    if (deficit > maxDeficitCents) {
      maxDeficitCents = deficit;
    }
  }

  for (let dayIndex = 1; dayIndex <= horizonDays; dayIndex++) {
    const currentDayDate = addUTCDays(baseDate, dayIndex);
    const dateStr = formatUTCDate(currentDayDate);

    const startingBalance = runningBalance;

    // Inflows for dayIndex: invoices with status 'CURRENT' only.
    // Match ONLY by dueDate (never daysUntilDue / daysOverdue). Each invoice
    // is counted at most once: on its due day, or clamped to day 1 if the due
    // date is on/before the forecast start.
    let inflowForDay: CurrencyCents = 0;
    const notesList: string[] = [];

    invoices.forEach((inv) => {
      if (inv.status !== 'CURRENT') return;

      const invDueDate = parseUTCDate(inv.dueDate);
      const diffTime = invDueDate.getTime() - baseDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      const dueToday = diffDays === dayIndex;
      const clampedToDayOne = diffDays < 1 && dayIndex === 1;

      if (dueToday || clampedToDayOne) {
        inflowForDay = addCents(inflowForDay, inv.amountCents);
        notesList.push(`Expected: ${inv.customerName} (${inv.invoiceNumber})`);
      }
    });

    // Outflows for dayIndex: bills with status 'PENDING', 'APPROVED' or
    // 'IN_FLIGHT'. Match ONLY by dueDate (never daysUntilDue). Each bill is
    // counted at most once: on its due day, or clamped to day 1 if the due
    // date is on/before the forecast start.
    let outflowForDay: CurrencyCents = 0;
    bills.forEach((bill) => {
      if (
        bill.status !== 'PENDING' &&
        bill.status !== 'APPROVED' &&
        bill.status !== 'IN_FLIGHT'
      ) {
        return;
      }

      const billDueDate = parseUTCDate(bill.dueDate);
      const diffTime = billDueDate.getTime() - baseDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      const dueToday = diffDays === dayIndex;
      const clampedToDayOne = diffDays < 1 && dayIndex === 1;

      if (dueToday || clampedToDayOne) {
        outflowForDay = addCents(outflowForDay, bill.amountCents);
        notesList.push(
          `Bill: ${bill.vendorName} (${bill.billNumber})${diffDays < 1 ? ' - overdue' : ''}`
        );
      }
    });

    // Balance(d) = Balance(d-1) + Inflows(d) - Outflows(d)
    const endingBalance = subtractCents(addCents(startingBalance, inflowForDay), outflowForDay);
    runningBalance = endingBalance;

    const breachesReserve = endingBalance < minReserveCents;
    if (breachesReserve) {
      hasReserveBreach = true;
      if (firstBreachDay === undefined) {
        firstBreachDay = dayIndex;
        breachDate = dateStr;
      }
      const deficit = subtractCents(minReserveCents, endingBalance);
      if (deficit > maxDeficitCents) {
        maxDeficitCents = deficit;
      }
    }

    days.push({
      dayNumber: dayIndex,
      date: dateStr,
      startingBalanceCents: startingBalance,
      inflowCents: inflowForDay,
      outflowCents: outflowForDay,
      endingBalanceCents: endingBalance,
      breachesReserve,
      notes: notesList.join(', ') || undefined,
    });
  }

  // Calculate minBalanceCents
  let minBalanceCents = clearedBalanceCents;
  for (const day of days) {
    if (day.endingBalanceCents < minBalanceCents) {
      minBalanceCents = day.endingBalanceCents;
    }
  }

  // Calculate firstBreachDeficitCents
  let firstBreachDeficitCents: CurrencyCents | undefined = undefined;
  if (hasReserveBreach) {
    if (firstBreachDay === 0) {
      firstBreachDeficitCents = clearedBalanceCents < minReserveCents ? minReserveCents - clearedBalanceCents : 0;
    } else if (firstBreachDay !== undefined) {
      const breachDay = days.find((d) => d.dayNumber === firstBreachDay);
      if (breachDay) {
        firstBreachDeficitCents = minReserveCents - breachDay.endingBalanceCents;
      }
    }
  }

  return {
    days,
    currentBalanceCents: clearedBalanceCents,
    minReserveCents,
    projectedEndingBalanceCents: runningBalance,
    hasReserveBreach,
    firstBreachDay,
    breachDate,
    breachDeficitCents: maxDeficitCents,
    minBalanceCents,
    firstBreachDeficitCents,
  };
}
