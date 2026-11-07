export type PlanActionType =
  | 'CHASE_INVOICE'
  | 'SEND_INVOICE_REMINDER'
  | 'OFFER_EARLY_PAY_DISCOUNT'
  | 'SCHEDULE_BILL'
  | 'DEFER_BILL'
  | 'HOLD_PAYOUT';

export interface BasePlanAction {
  type: PlanActionType;
  rationale: string;
}

export interface ChaseInvoiceAction extends BasePlanAction {
  type: 'CHASE_INVOICE';
  invoiceId: string;
  tone: 'FRIENDLY' | 'FIRM' | 'URGENT';
}

export interface SendReminderAction extends BasePlanAction {
  type: 'SEND_INVOICE_REMINDER';
  invoiceId: string;
}

export interface EarlyPayDiscountAction extends BasePlanAction {
  type: 'OFFER_EARLY_PAY_DISCOUNT';
  invoiceId: string;
  discountBps: number; // e.g. 200 = 2%, max 300 bps (3%)
}

export interface ScheduleBillAction extends BasePlanAction {
  type: 'SCHEDULE_BILL';
  billId: string;
  payOnDay: number; // Day 1 to 30
}

export interface DeferBillAction extends BasePlanAction {
  type: 'DEFER_BILL';
  billId: string;
  deferDays: number; // Grace period (max 7 days)
}

export interface HoldPayoutAction extends BasePlanAction {
  type: 'HOLD_PAYOUT';
  billId: string;
}

export type PlanAction =
  | ChaseInvoiceAction
  | SendReminderAction
  | EarlyPayDiscountAction
  | ScheduleBillAction
  | DeferBillAction
  | HoldPayoutAction;

export interface CashPlan {
  id: 'safest' | 'fastest_cash' | 'lowest_cost';
  title: string;
  subtitle: string;
  actions: PlanAction[];
  verdict: 'ACCEPTED' | 'REJECTED';
  rejectionReason?: string;
  rulesPassed: string[];
  rulesFailed: string[];
  minProjectedBalanceCents: number;
  projectedEndingCashCents: number;
  reserveBreached: boolean;
  breachDay?: number;
  narrative: string;
}

export interface CashPlanProposal {
  source: 'OPENROUTER_AI' | 'DETERMINISTIC_RULES';
  model: string;
  plans: CashPlan[];
  generatedAt: string;
  groundingVerified: boolean;
}

