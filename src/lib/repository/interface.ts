import {
  AuditLogEntry,
  Bill,
  Invoice,
  StateSnapshot,
} from '@/types';
import {
  IdempotencyOutcome,
  PayoutExecutionMode,
} from '@/lib/store';

export interface IRepository {
  getSnapshot(): Promise<StateSnapshot>;
  getInvoices(): Promise<Invoice[]>;
  getBills(): Promise<Bill[]>;
  getAuditLogs(): Promise<AuditLogEntry[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  getInvoiceByPayPalId(paypalInvoiceId: string): Promise<Invoice | undefined>;
  getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined>;

  payInvoice(
    id: string,
    options?: {
      actor?: AuditLogEntry['actor'];
      isSimulated?: boolean;
      details?: string;
      action?: string;
    }
  ): Promise<
    | { ok: true; invoice: Invoice; snapshot: StateSnapshot }
    | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_PAID' }
  >;

  attachPayPalInvoice(
    id: string,
    details: {
      paypalInvoiceId: string;
      recipientViewUrl?: string | null;
      qrCodeUrl?: string | null;
    }
  ): Promise<
    | { ok: true; invoice: Invoice; snapshot: StateSnapshot }
    | { ok: false; reason: 'NOT_FOUND' }
  >;

  recordReminderSent(
    id: string,
    subject: string,
    body: string,
    options?: { deliveredViaPayPal?: boolean }
  ): Promise<
    | { ok: true; invoice: Invoice; snapshot: StateSnapshot }
    | { ok: false; reason: 'NOT_FOUND' }
  >;

  beginPayout(input: {
    billId: string;
    idempotencyKey: string;
    executionMode?: PayoutExecutionMode;
    feeCents?: number;
  }): Promise<
    | { ok: true; bill: Bill; postPayoutBalanceCents: number; snapshot: StateSnapshot }
    | {
        ok: false;
        reason:
          | 'NOT_FOUND'
          | 'ALREADY_DISBURSED'
          | 'IN_FLIGHT'
          | 'APPROVAL_PENDING'
          | 'PAYOUT_FAILED'
          | 'DUPLICATE_REQUEST'
          | 'RESERVE_BREACH'
          | 'INVALID_AMOUNT';
        outcome?: IdempotencyOutcome;
        deficitCents?: number;
        postPayoutBalanceCents?: number;
      }
  >;

  markPayoutInFlight(input: {
    billId: string;
    idempotencyKey: string;
  }): Promise<StateSnapshot>;

  markPayoutAccepted(input: {
    billId: string;
    idempotencyKey: string;
    batchId: string;
    paypalStatus: string;
    response: unknown;
  }): Promise<StateSnapshot>;

  completePayout(input: {
    billId: string;
    idempotencyKey: string;
    isRealPayPal: boolean;
    externalRef?: string;
    response: unknown;
    actor?: AuditLogEntry['actor'];
  }): Promise<StateSnapshot>;

  failPayout(input: {
    billId: string;
    idempotencyKey: string;
    code: string;
    message: string;
    isRealPayPal: boolean;
    externalRef?: string;
    actor?: AuditLogEntry['actor'];
  }): Promise<StateSnapshot>;

  getIdempotencyOutcome(idempotencyKey: string): Promise<IdempotencyOutcome | undefined>;
  getPayoutRequestByBatchId(batchId: string): Promise<IdempotencyOutcome | undefined>;
  resetDemoData(): Promise<StateSnapshot>;
}

