/**
 * What the runway looks like after one decision, computed with the same deterministic engine as
 * the real forecast. Nothing here calls the server; it only shows the merchant the consequence
 * before they act.
 */
import { calculatePayoutFeeCents } from '@/lib/money';
import { calculateRunway } from '@/lib/runway';
import type { RunwayForecast, StateSnapshot } from '@/types';

function forecast(
  snapshot: StateSnapshot,
  cleared: number,
  patch: Partial<StateSnapshot>,
): RunwayForecast {
  return calculateRunway({
    clearedBalanceCents: cleared,
    minReserveCents: snapshot.account.minReserveCents,
    invoices: patch.invoices ?? snapshot.invoices,
    bills: patch.bills ?? snapshot.bills,
    startDate: snapshot.demoConfig.asOfDate,
    horizonDays: snapshot.demoConfig.forecastDays,
  });
}

/** The invoice is collected today: its cash clears now and it leaves the forecast. */
export function ifCollected(snapshot: StateSnapshot, invoiceId: string) {
  const invoice = snapshot.invoices.find((i) => i.id === invoiceId);
  if (!invoice || invoice.status === 'PAID') return null;
  const cleared = snapshot.account.clearedBalanceCents + invoice.amountCents;
  return {
    clearedCents: cleared,
    forecast: forecast(snapshot, cleared, {
      invoices: snapshot.invoices.map((i) =>
        i.id === invoiceId ? { ...i, status: 'PAID' as const } : i,
      ),
    }),
  };
}

/** The bill is paid today, PayPal's payout fee included when the rail is PayPal. */
export function ifPaidToday(snapshot: StateSnapshot, billId: string, viaPayPal: boolean) {
  const bill = snapshot.bills.find((b) => b.id === billId);
  if (!bill || bill.status === 'DISBURSED') return null;
  const fee = viaPayPal ? calculatePayoutFeeCents(bill.amountCents) : 0;
  const cleared = snapshot.account.clearedBalanceCents - bill.amountCents - fee;
  return {
    clearedCents: cleared,
    feeCents: fee,
    forecast: forecast(snapshot, cleared, {
      bills: snapshot.bills.map((b) =>
        b.id === billId ? { ...b, status: 'DISBURSED' as const } : b,
      ),
    }),
  };
}

/**
 * The payout floor check exactly as the server runs it (store.beginPayout): cleared cash, minus
 * payouts already approved or in flight (each with its fee), minus this bill and its fee. The fee is
 * counted on both rails, so a fee can never be what breaks the floor.
 */
export function payoutCheck(snapshot: StateSnapshot, billId: string) {
  const bill = snapshot.bills.find((b) => b.id === billId);
  const reservedCents = snapshot.bills
    .filter((b) => b.id !== billId && (b.status === 'IN_FLIGHT' || b.status === 'APPROVED'))
    .reduce((sum, b) => sum + b.amountCents + calculatePayoutFeeCents(b.amountCents), 0);
  const amount = bill?.amountCents ?? 0;
  const feeCents = bill ? calculatePayoutFeeCents(amount) : 0;
  const postPayoutBalanceCents =
    snapshot.account.clearedBalanceCents - reservedCents - amount - feeCents;
  const bufferCents = postPayoutBalanceCents - snapshot.account.minReserveCents;
  return {
    reservedCents,
    feeCents,
    postPayoutBalanceCents,
    bufferCents,
    wouldBreach: bufferCents < 0,
    deficitCents: bufferCents < 0 ? -bufferCents : 0,
  };
}
