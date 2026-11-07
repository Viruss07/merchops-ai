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
import { CashPlan } from './types';
import { calculateRunway } from '@/lib/runway';

export interface PlanValidationContext {
  clearedBalanceCents: number;
  minReserveCents: number;
  invoices: Invoice[];
  bills: Bill[];
  asOfDate: string;
  forecastDays?: number;
}

export function validateCashPlan(
  plan: Omit<CashPlan, 'verdict' | 'rulesPassed' | 'rulesFailed' | 'minProjectedBalanceCents' | 'projectedEndingCashCents' | 'reserveBreached'>,
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

  for (const action of plan.actions) {
    if (action.type === 'CHASE_INVOICE' || action.type === 'SEND_INVOICE_REMINDER') {
      const targetInv = simulatedInvoices.find((i) => i.id === action.invoiceId);
      if (targetInv && targetInv.status === 'OVERDUE') {
        // Assume successful chase brings inflow forward to Day 3
        targetInv.status = 'PAID';
      }
    } else if (action.type === 'OFFER_EARLY_PAY_DISCOUNT') {
      const targetInv = simulatedInvoices.find((i) => i.id === action.invoiceId);
      if (targetInv) {
        // Apply discount deterministically: amount = amount * (1 - discountBps / 10000)
        const discountCents = Math.round((targetInv.amountCents * action.discountBps) / 10000);
        targetInv.amountCents -= discountCents;
        targetInv.status = 'PAID';
      }
    } else if (action.type === 'SCHEDULE_BILL') {
      const targetBill = simulatedBills.find((b) => b.id === action.billId);
      if (targetBill) {
        targetBill.daysUntilDue = Math.max(1, Math.min(30, action.payOnDay));
      }
    } else if (action.type === 'DEFER_BILL') {
      const targetBill = simulatedBills.find((b) => b.id === action.billId);
      if (targetBill) {
        targetBill.daysUntilDue += action.deferDays;
      }
    } else if (action.type === 'HOLD_PAYOUT') {
      const targetBill = simulatedBills.find((b) => b.id === action.billId);
      if (targetBill) {
        targetBill.daysUntilDue = 31; // Pushed beyond horizon
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
      `RULE_RESERVE_FLOOR_BREACH: Projected balance drops to $${(simulatedForecast.minBalanceCents / 100).toFixed(2)}, breaching the $${(ctx.minReserveCents / 100).toFixed(2)} safety floor on Day ${simulatedForecast.firstBreachDay}.`
    );
  } else {
    rulesPassed.push(
      `RULE_RESERVE_PRESERVED: Maintains minimum liquid reserve buffer ($${(simulatedForecast.minBalanceCents / 100).toFixed(2)} >= $${(ctx.minReserveCents / 100).toFixed(2)}).`
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
  };
}

