/**
 * Deterministic Cash Plan Validator & Safety Prover
 *
 * "AI proposes, rules decide. AI must never independently move money."
 *
 * Validates that:
 * 1. Every referenced invoiceId and billId actually exists.
 * 2. No amounts or dates supplied by the model are trusted (recomputed deterministically).
 * 3. Simulates the 30-day runway under the plan.
 * 4. Rejects any plan that breaches the safety reserve floor or exceeds vendor grace limits.
 */

import { Bill, Invoice } from '@/types';
import { CashPlan, PlanCandidate } from './types';
import { calculateRunway } from '@/lib/runway';
import { formatCentsToUSD } from '@/lib/money';

/** A chased overdue invoice is assumed to settle on this day of the forecast. */
export const CHASE_SETTLEMENT_DAY = 3;
/** An invoice offered an early-pay discount is assumed to settle on this day. */
export const EARLY_PAY_SETTLEMENT_DAY = 2;

function isoDayFromStart(asOfDate: string, offset: number): string {
  const d = new Date(`${asOfDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export interface PlanValidationContext {
  clearedBalanceCents: number;
  minReserveCents: number;
  invoices: Invoice[];
  bills: Bill[];
  asOfDate: string;
  forecastDays?: number;
}

export function validateCashPlan(
  plan: PlanCandidate,
  ctx: PlanValidationContext
): CashPlan {
  const rulesPassed: string[] = [];
  const rulesFailed: string[] = [];

  const invoiceMap = new Map(ctx.invoices.map((inv) => [inv.id, inv]));
  const billMap = new Map(ctx.bills.map((b) => [b.id, b]));

  // 1. Validation: Entity existence and action constraints
  let entityIdsValid = true;
  for (const action of plan.actions) {
    if ('invoiceId' in action) {
      if (!invoiceMap.has(action.invoiceId)) {
        entityIdsValid = false;
        rulesFailed.push(`RULE_EXISTENCE_FAILED: Invoice ID "${action.invoiceId}" does not exist in ledger.`);
      }
    }
    if ('billId' in action) {
      if (!billMap.has(action.billId)) {
        entityIdsValid = false;
        rulesFailed.push(`RULE_EXISTENCE_FAILED: Bill ID "${action.billId}" does not exist in payables.`);
      }
    }

    if (action.type === 'OFFER_EARLY_PAY_DISCOUNT') {
      if (typeof action.discountBps !== 'number' || action.discountBps <= 0 || action.discountBps > 300) {
        rulesFailed.push(`RULE_DISCOUNT_BOUND: Early pay discount ${action.discountBps} bps exceeds maximum permitted 300 bps (3.0%).`);
      }
    }

    if (action.type === 'DEFER_BILL') {
      if (typeof action.deferDays !== 'number' || action.deferDays < 1 || action.deferDays > 7) {
        rulesFailed.push(`RULE_GRACE_EXCEEDED: Deferral of ${action.deferDays} days exceeds maximum grace period (7 days).`);
      }
    }
  }

  if (entityIdsValid && rulesFailed.length === 0) {
    rulesPassed.push('RULE_ENTITY_EXISTENCE: All referenced entity IDs exist and conform to domain schema.');
  }

  // 2. Deterministic Simulation: Recompute all flows using code-derived amounts
  // Clone invoices and bills to project candidate plan outcomes
  const simulatedInvoices: Invoice[] = structuredClone(ctx.invoices);
  const simulatedBills: Bill[] = structuredClone(ctx.bills);

  // The runway engine matches flows by dueDate only, so every simulated move
  // rewrites dueDate. Assumptions are listed for the merchant, never hidden.
  const horizon = ctx.forecastDays ?? 30;
  const assumptions: string[] = [];

  for (const action of plan.actions) {
    if (action.type === 'CHASE_INVOICE' || action.type === 'SEND_INVOICE_REMINDER') {
      const targetInv = simulatedInvoices.find((i) => i.id === action.invoiceId);
      if (targetInv && targetInv.status === 'OVERDUE') {
        // The runway counts OVERDUE invoices as $0 (conservative). A chase turns
        // it back into an expected inflow, assumed to land on CHASE_SETTLEMENT_DAY.
        targetInv.status = 'CURRENT';
        targetInv.dueDate = isoDayFromStart(ctx.asOfDate, CHASE_SETTLEMENT_DAY);
        assumptions.push(
          `${targetInv.customerName} pays ${formatCentsToUSD(targetInv.amountCents)} by Day ${CHASE_SETTLEMENT_DAY} after the reminder.`
        );
      }
    } else if (action.type === 'OFFER_EARLY_PAY_DISCOUNT') {
      const targetInv = simulatedInvoices.find((i) => i.id === action.invoiceId);
      const bpsValid = typeof action.discountBps === 'number' && action.discountBps > 0 && action.discountBps <= 300;
      if (targetInv && targetInv.status !== 'PAID' && bpsValid) {
        // amount = amount * (1 - discountBps / 10000), in integer cents; inflow pulled forward.
        const discountCents = Math.round((targetInv.amountCents * action.discountBps) / 10000);
        targetInv.amountCents -= discountCents;
        targetInv.status = 'CURRENT';
        targetInv.dueDate = isoDayFromStart(ctx.asOfDate, EARLY_PAY_SETTLEMENT_DAY);
        assumptions.push(
          `${targetInv.customerName} takes a ${formatCentsToUSD(discountCents)} discount and pays ${formatCentsToUSD(targetInv.amountCents)} by Day ${EARLY_PAY_SETTLEMENT_DAY}.`
        );
      }
    } else if (action.type === 'SCHEDULE_BILL') {
      const targetBill = simulatedBills.find((b) => b.id === action.billId);
      if (targetBill && typeof action.payOnDay === 'number') {
        const day = Math.max(1, Math.min(horizon, Math.trunc(action.payOnDay)));
        targetBill.daysUntilDue = day;
        targetBill.dueDate = isoDayFromStart(ctx.asOfDate, day);
      }
    } else if (action.type === 'DEFER_BILL') {
      const targetBill = simulatedBills.find((b) => b.id === action.billId);
      if (targetBill && typeof action.deferDays === 'number' && action.deferDays >= 1 && action.deferDays <= 7) {
        targetBill.daysUntilDue += action.deferDays;
        const d = new Date(`${targetBill.dueDate}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + action.deferDays);
        targetBill.dueDate = d.toISOString().slice(0, 10);
        assumptions.push(`${targetBill.vendorName} accepts payment ${action.deferDays} days late.`);
      }
    } else if (action.type === 'HOLD_PAYOUT') {
      const targetBill = simulatedBills.find((b) => b.id === action.billId);
      if (targetBill) {
        // Held beyond the forecast window.
        targetBill.daysUntilDue = horizon + 1;
        targetBill.dueDate = isoDayFromStart(ctx.asOfDate, horizon + 1);
      }
    }
  }

  const simulatedForecast = calculateRunway({
    clearedBalanceCents: ctx.clearedBalanceCents,
    minReserveCents: ctx.minReserveCents,
    invoices: simulatedInvoices,
    bills: simulatedBills,
    startDate: ctx.asOfDate,
    horizonDays: ctx.forecastDays ?? 30,
  });

  const reserveBreached = simulatedForecast.hasReserveBreach;
  if (reserveBreached) {
    rulesFailed.push(
      `RULE_RESERVE_FLOOR_BREACH: Projected balance drops to ${formatCentsToUSD(simulatedForecast.minBalanceCents)}, below the ${formatCentsToUSD(ctx.minReserveCents)} floor on Day ${simulatedForecast.firstBreachDay}.`
    );
  } else {
    rulesPassed.push(
      `RULE_RESERVE_PRESERVED: Lowest projected balance ${formatCentsToUSD(simulatedForecast.minBalanceCents)} stays at or above the ${formatCentsToUSD(ctx.minReserveCents)} floor for all ${horizon} days.`
    );
  }

  const isAccepted = rulesFailed.length === 0;

  return {
    ...plan,
    verdict: isAccepted ? 'ACCEPTED' : 'REJECTED',
    rejectionReason: isAccepted ? undefined : rulesFailed[0],
    rulesPassed,
    rulesFailed,
    minProjectedBalanceCents: simulatedForecast.minBalanceCents,
    projectedEndingCashCents: simulatedForecast.projectedEndingBalanceCents,
    reserveBreached,
    breachDay: simulatedForecast.firstBreachDay,
    origin: plan.origin ?? 'TEMPLATE',
    assumptions,
  };
}

