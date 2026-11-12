/**
 * MerchOps AI — Core Domain Types
 *
 * Strict Financial Principle:
 * All currency values are strictly stored and computed as integer cents (number).
 * $1.00 = 100 cents. No floating point arithmetic.
 */

export type CurrencyCents = number;

export type InvoiceStatus = 'PAID' | 'CURRENT' | 'OVERDUE';

export type BillStatus = 'PENDING' | 'APPROVED' | 'DISBURSED' | 'IN_FLIGHT' | 'FAILED';

export type PayoutRailMode = 'SIMULATION' | 'SANDBOX_UNVERIFIED' | 'SANDBOX_VERIFIED';

export interface PayoutVerification {
  batchId: string;
  verifiedAt: string;
  actualFeeCents?: number | null;
}

export type PayPalBalanceStatus = 'SUFFICIENT' | 'LOW' | 'INSUFFICIENT' | 'UNAVAILABLE';

export type PayPalBalanceAvailability = 'AVAILABLE' | 'UNAVAILABLE';

export interface PayPalBalanceSnapshot {
  availability: PayPalBalanceAvailability;
  availableCents: number | null;
  currency: 'USD';
  checkedAt: string | null;
  source: 'PAYPAL_REPORTING_API' | 'UNVERIFIED';
  reason: string | null;
  lastInsufficientFundsAt: string | null;
  lastInsufficientFundsMessage: string | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  amountCents: CurrencyCents;
  dueDate: string; // ISO date string YYYY-MM-DD
  daysOverdue: number;
  status: InvoiceStatus;
  description: string;
  paymentUrl?: string;
  paypalInvoiceId?: string;
  recipientViewUrl?: string;
  qrCodeUrl?: string;
  lastReminderSentAt?: string;
}

export interface Bill {
  id: string;
  billNumber: string;
  vendorName: string;
  vendorEmail: string;
  amountCents: CurrencyCents;
  dueDate: string; // ISO date string YYYY-MM-DD
  daysUntilDue: number;
  status: BillStatus;
  description: string;
  category: string;
  paypalBatchId?: string;
  paypalBatchStatus?: string;
  actualFeeCents?: number | null;
}

export interface MerchantAccount {
  id: string;
  businessName: string;
  currency: 'USD';
  clearedBalanceCents: CurrencyCents;
  minReserveCents: CurrencyCents;
  payoutVerification?: PayoutVerification;
}

export interface RunwayDay {
  dayNumber: number;
  date: string; // YYYY-MM-DD
  startingBalanceCents: CurrencyCents;
  inflowCents: CurrencyCents;
  outflowCents: CurrencyCents;
  endingBalanceCents: CurrencyCents;
  breachesReserve: boolean;
  notes?: string;
}

export interface RunwayForecast {
  days: RunwayDay[];
  currentBalanceCents: CurrencyCents;
  minReserveCents: CurrencyCents;
  projectedEndingBalanceCents: CurrencyCents;
  hasReserveBreach: boolean;
  firstBreachDay?: number;
  breachDate?: string;
  breachDeficitCents?: CurrencyCents;
  minBalanceCents: CurrencyCents;
  firstBreachDeficitCents?: CurrencyCents;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: 'MERCHANT' | 'AI_COPILOT' | 'SYSTEM' | 'PAYPAL_WEBHOOK';
  action: string;
  details: string;
  amountCents?: CurrencyCents;
  isSimulated: boolean;
}

export interface StateSnapshot {
  account: MerchantAccount;
  invoices: Invoice[];
  bills: Bill[];
  auditLogs: AuditLogEntry[];
  paypalBalance: PayPalBalanceSnapshot;
  capabilities: {
    paypalSandboxEnabled: boolean;
    payoutMode: PayoutRailMode;
    verifiedBatchId: string | null;
  };
  demoConfig: {
    asOfDate: string;
    forecastDays: number;
    /** Changes on every reset and server start; part of each PayPal-Request-Id. */
    payoutEpoch: string;
    paypalPayoutFeeCents: number;
  };
}
