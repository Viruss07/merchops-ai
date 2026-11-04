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

export interface RunwayOptions {
  clearedBalanceCents: CurrencyCents;
  minReserveCents: CurrencyCents;
  invoices: Invoice[];
  bills: Bill[];
  horizonDays?: number; // Defaults to 30
  startDate?: string;    // Defaults to today YYYY-MM-DD
}

/**
 * Calculates day-by-day cash trajectory over a 30-day forecast horizon.
 */
export function calculateRunway(options: RunwayOptions): RunwayForecast {
  const {
    clearedBalanceCents,
    minReserveCents,
    invoices,
    bills,
    horizonDays = 30,
    startDate = new Date().toISOString().split('T')[0],
  } = options;

  const days: RunwayDay[] = [];
  let runningBalance = clearedBalanceCents;
  let hasReserveBreach = false;
  let firstBreachDay: number | undefined = undefined;
  let breachDate: string | undefined = undefined;
  let maxDeficitCents: CurrencyCents = 0;

  const baseDate = new Date(startDate);

  for (let dayIndex = 1; dayIndex <= horizonDays; dayIndex++) {
    const currentDayDate = new Date(baseDate);
    currentDayDate.setDate(baseDate.getDate() + dayIndex);
    const dateStr = currentDayDate.toISOString().split('T')[0];

    const startingBalance = runningBalance;

    // Inflows for dayIndex: confirmed current invoices maturing on this specific forecast day
    // (Note: Overdue invoices remain uncollected until paid by the customer)
    let inflowForDay: CurrencyCents = 0;
    const notesList: string[] = [];

    invoices.forEach((inv) => {
      // Inflow matches if not yet paid and scheduled for this exact forecast offset
      if (inv.status === 'CURRENT' && inv.dueDate === dateStr) {
        inflowForDay = addCents(inflowForDay, inv.amountCents);
        notesList.push(`Expected: ${inv.customerName} (${inv.invoiceNumber})`);
      }
    });

    // Outflows for dayIndex: scheduled vendor bills due on this specific forecast day
    let outflowForDay: CurrencyCents = 0;
    bills.forEach((bill) => {
      if (bill.status === 'PENDING') {
        // Match either by daysUntilDue or exact date
        if (bill.daysUntilDue === dayIndex || bill.dueDate === dateStr) {
          outflowForDay = addCents(outflowForDay, bill.amountCents);
          notesList.push(`Bill: ${bill.vendorName} (${bill.billNumber})`);
        }
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

  return {
    days,
    currentBalanceCents: clearedBalanceCents,
    minReserveCents,
    projectedEndingBalanceCents: runningBalance,
    hasReserveBreach,
    firstBreachDay,
    breachDate,
    breachDeficitCents: maxDeficitCents,
  };
}

