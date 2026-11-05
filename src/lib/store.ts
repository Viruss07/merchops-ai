/**
 * MerchOps AI — In-Memory Demo State Repository
 *
 * NOTE ON ARCHITECTURE:
 * This in-memory repository holds state for the partner demo.
 * In-memory state resets when the development server restarts.
 * The interface is designed to be cleanly swappable with a PostgreSQL / Prisma / Drizzle
 * database layer without changing business logic or component interfaces.
 */

import {
  MerchantAccount,
  Invoice,
  Bill,
  AuditLogEntry,
  PayoutRailMode,
  StateSnapshot,
} from '@/types';
import {
  DEFAULT_FORECAST_DAYS,
  DEFAULT_MIN_RESERVE_CENTS,
  DEMO_AS_OF,
  PAYPAL_SANDBOX_ENABLED,
} from '@/lib/config';
import { isValidCents } from '@/lib/money';

export const INITIAL_ACCOUNT: MerchantAccount = {
  id: 'merchant-001',
  businessName: 'MerchOps Specialty Retail',
  currency: 'USD',
  clearedBalanceCents: 420000, // $4,200.00
  minReserveCents: DEFAULT_MIN_RESERVE_CENTS,
};

function calculateDaysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1 + 'T00:00:00Z');
  const d2 = new Date(date2 + 'T00:00:00Z');
  const diffTime = d2.getTime() - d1.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

export function createInitialInvoices(): Invoice[] {
  const apexDueDate = '2026-10-22';
  const beaconDueDate = '2026-11-15';
  const apexDaysOverdue = Math.max(0, calculateDaysBetween(apexDueDate, DEMO_AS_OF));
  const beaconDaysOverdue = Math.max(0, calculateDaysBetween(beaconDueDate, DEMO_AS_OF));

  return [
    {
      id: 'inv-apex-01',
      invoiceNumber: 'INV-2026-089',
      customerName: 'Apex Corp',
      customerEmail: 'billing@apexcorp.test',
      amountCents: 150000, // $1,500.00
      dueDate: apexDueDate,
      daysOverdue: apexDaysOverdue,
      status: 'OVERDUE',
      description: 'Q3 Custom Inventory & Packaging Supply',
      paymentUrl: 'https://sandbox.paypal.com/checkout/simulate/inv-apex-01',
    },
    {
      id: 'inv-beacon-02',
      invoiceNumber: 'INV-2026-092',
      customerName: 'Beacon Studios',
      customerEmail: 'accounts@beaconstudios.test',
      amountCents: 85000, // $850.00
      dueDate: beaconDueDate,
      daysOverdue: beaconDaysOverdue,
      status: 'CURRENT',
      description: 'Retail Merchandising Display Kit',
    },
  ];
}

export function createInitialBills(): Bill[] {
  const acmeDueDate = '2026-11-13';
  const nexusDueDate = '2026-11-20';
  const acmeDaysUntilDue = calculateDaysBetween(DEMO_AS_OF, acmeDueDate);
  const nexusDaysUntilDue = calculateDaysBetween(DEMO_AS_OF, nexusDueDate);

  return [
    {
      id: 'bill-acme-01',
      billNumber: 'BILL-SUP-401',
      vendorName: 'Acme Supplies',
      vendorEmail: 'receivables@acmesupplies.test',
      amountCents: 300000, // $3,000.00
      dueDate: acmeDueDate,
      daysUntilDue: acmeDaysUntilDue,
      status: 'PENDING',
      description: 'Bulk raw inventory shipment (Batch #849)',
      category: 'Supplier / Inventory',
    },
    {
      id: 'bill-cloud-02',
      billNumber: 'BILL-OPS-104',
      vendorName: 'Nexus Cloud Services',
      vendorEmail: 'billing@nexuscloud.test',
      amountCents: 40000, // $400.00
      dueDate: nexusDueDate,
      daysUntilDue: nexusDaysUntilDue,
      status: 'PENDING',
      description: 'Monthly ecommerce server infrastructure',
      category: 'Operations',
    },
  ];
}

export const INITIAL_INVOICES = createInitialInvoices();
export const INITIAL_BILLS = createInitialBills();

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'audit-001',
    timestamp: '2026-11-03T09:00:00Z',
    actor: 'SYSTEM',
    action: 'SYSTEM_INITIALIZED',
    details: 'MerchOps AI ledger initialized with opening balance $4,200.00 and reserve $2,000.00.',
    isSimulated: false,
  },
  {
    id: 'audit-003',
    timestamp: '2026-11-03T09:10:00Z',
    actor: 'AI_COPILOT',
    action: 'RUNWAY_MONITOR_ACTIVE',
    details: 'Deterministic cash-flow monitor detected impending Day-10 liquidity shortfall ($800.00 breach).',
    isSimulated: false,
  },
];

export type PayoutExecutionMode = 'SIMULATION' | 'PAYPAL_SANDBOX';

export interface PayoutRequestRecord {
  status: 'APPROVED' | 'IN_FLIGHT' | 'SUCCEEDED' | 'FAILED';
  billId: string;
  idempotencyKey: string;
  executionMode: PayoutExecutionMode;
  paypalBatchId?: string;
  paypalStatus?: string;
  response?: unknown;
  code?: string;
  message?: string;
}

export type IdempotencyOutcome = PayoutRequestRecord;

interface DemoStoreState {
  account: MerchantAccount;
  invoices: Invoice[];
  bills: Bill[];
  auditLogs: AuditLogEntry[];
  idempotencyMap: Map<string, IdempotencyOutcome>;
}

// Next.js route handlers can be bundled as separate entrypoints. Keeping the
// demo state on globalThis guarantees every route sees the same in-memory store
// within a single Node.js process (instead of one store per route bundle).
const globalForStore = globalThis as unknown as {
  __merchops_demo_store__?: DemoStoreState;
};

const storeState: DemoStoreState =
  globalForStore.__merchops_demo_store__ ?? {
    account: structuredClone(INITIAL_ACCOUNT),
    invoices: structuredClone(createInitialInvoices()),
    bills: structuredClone(createInitialBills()),
    auditLogs: structuredClone(INITIAL_AUDIT_LOGS),
    idempotencyMap: new Map<string, IdempotencyOutcome>(),
  };

globalForStore.__merchops_demo_store__ = storeState;

function getPayoutMode(): PayoutRailMode {
  if (!PAYPAL_SANDBOX_ENABLED) return 'SIMULATION';
  return storeState.account.payoutVerification ? 'SANDBOX_VERIFIED' : 'SANDBOX_UNVERIFIED';
}

export const demoStore = {
  getSnapshot(): StateSnapshot {
    return {
      account: structuredClone(storeState.account),
      invoices: structuredClone(storeState.invoices),
      bills: structuredClone(storeState.bills),
      auditLogs: structuredClone(storeState.auditLogs),
      capabilities: {
        paypalSandboxEnabled: PAYPAL_SANDBOX_ENABLED,
        payoutMode: getPayoutMode(),
        verifiedBatchId: storeState.account.payoutVerification?.batchId ?? null,
      },
      demoConfig: {
        asOfDate: DEMO_AS_OF,
        forecastDays: DEFAULT_FORECAST_DAYS,
      },
    };
  },

  getAccount(): MerchantAccount {
    return structuredClone(storeState.account);
  },

  getInvoices(): Invoice[] {
    return structuredClone(storeState.invoices);
  },

  getBills(): Bill[] {
    return structuredClone(storeState.bills);
  },

  getAuditLogs(): AuditLogEntry[] {
    return structuredClone(storeState.auditLogs);
  },

  getInvoice(id: string): Invoice | undefined {
    const inv = storeState.invoices.find((i) => i.id === id);
    return inv ? structuredClone(inv) : undefined;
  },

  payInvoice(id: string):
    | { ok: true; invoice: Invoice; snapshot: StateSnapshot }
    | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_PAID' } {
    const inv = storeState.invoices.find((i) => i.id === id);
    if (!inv) return { ok: false, reason: 'NOT_FOUND' };
    if (inv.status === 'PAID') return { ok: false, reason: 'ALREADY_PAID' };

    inv.status = 'PAID';
    inv.daysOverdue = 0;
    storeState.account.clearedBalanceCents += inv.amountCents;

    storeState.auditLogs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: 'MERCHANT',
      action: 'INVOICE_PAID_SIMULATED',
      details: `Invoice ${inv.invoiceNumber} for ${inv.customerName} marked paid (+$${(inv.amountCents / 100).toFixed(2)}).`,
      amountCents: inv.amountCents,
      isSimulated: true,
    });

    return {
      ok: true,
      invoice: structuredClone(inv),
      snapshot: this.getSnapshot(),
    };
  },

  recordReminderSent(id: string, subject: string, body: string):
    | { ok: true; invoice: Invoice; snapshot: StateSnapshot }
    | { ok: false; reason: 'NOT_FOUND' } {
    const inv = storeState.invoices.find((i) => i.id === id);
    if (!inv) return { ok: false, reason: 'NOT_FOUND' };

    inv.lastReminderSentAt = new Date().toISOString();

    storeState.auditLogs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: 'MERCHANT',
      action: 'REMINDER_DRAFT_APPROVED',
      details: `Merchant reviewed and approved reminder draft "${subject}" for ${inv.customerName} (${inv.invoiceNumber}), ${body.length} characters. Staged locally; no outbound email transport configured.`,
      amountCents: inv.amountCents,
      isSimulated: false,
    });

    return {
      ok: true,
      invoice: structuredClone(inv),
      snapshot: this.getSnapshot(),
    };
  },

  beginPayout(input: {
    billId: string;
    idempotencyKey: string;
    executionMode?: PayoutExecutionMode;
  }):
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
      } {
    const existingOutcome = storeState.idempotencyMap.get(input.idempotencyKey);
    if (existingOutcome) {
      return {
        ok: false,
        reason: 'DUPLICATE_REQUEST',
        outcome: existingOutcome,
      };
    }

    const bill = storeState.bills.find((b) => b.id === input.billId);
    if (!bill) return { ok: false, reason: 'NOT_FOUND' };
    if (bill.status === 'DISBURSED') return { ok: false, reason: 'ALREADY_DISBURSED' };
    if (bill.status === 'IN_FLIGHT') return { ok: false, reason: 'IN_FLIGHT' };
    if (bill.status === 'APPROVED') return { ok: false, reason: 'APPROVAL_PENDING' };
    if (bill.status === 'FAILED') return { ok: false, reason: 'PAYOUT_FAILED' };

    if (!isValidCents(bill.amountCents) || bill.amountCents <= 0) {
      return { ok: false, reason: 'INVALID_AMOUNT' };
    }

    // Reserve in-flight payouts too: otherwise two concurrent payouts can each
    // pass this check against the same cleared balance and jointly breach the
    // reserve when both complete.
    const inFlightCents = storeState.bills
      .filter((b) => b.status === 'IN_FLIGHT' || b.status === 'APPROVED')
      .reduce((sum, b) => sum + b.amountCents, 0);

    const postPayoutBalanceCents =
      storeState.account.clearedBalanceCents - inFlightCents - bill.amountCents;
    if (postPayoutBalanceCents < storeState.account.minReserveCents) {
      const deficitCents = storeState.account.minReserveCents - postPayoutBalanceCents;
      storeState.auditLogs.unshift({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        actor: 'MERCHANT',
        action: 'PAYOUT_BLOCKED_RESERVE_BREACH',
        details: `Payout to ${bill.vendorName} (${bill.billNumber}) blocked due to reserve breach. Deficit: $${(deficitCents / 100).toFixed(2)}.`,
        amountCents: bill.amountCents,
        isSimulated: true,
      });
      return {
        ok: false,
        reason: 'RESERVE_BREACH',
        deficitCents,
        postPayoutBalanceCents,
      };
    }

    // Approval is a distinct state. It reserves cash but does not move money.
    bill.status = 'APPROVED';
    storeState.idempotencyMap.set(input.idempotencyKey, {
      status: 'APPROVED',
      billId: bill.id,
      idempotencyKey: input.idempotencyKey,
      executionMode: input.executionMode ?? 'SIMULATION',
    });
    storeState.auditLogs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: 'MERCHANT',
      action: 'PAYOUT_APPROVED',
      details: `Merchant approved payout to ${bill.vendorName} (${bill.billNumber}); funds reserved, no money moved yet.`,
      amountCents: bill.amountCents,
      isSimulated: true,
    });

    return {
      ok: true,
      bill: structuredClone(bill),
      postPayoutBalanceCents,
      snapshot: this.getSnapshot(),
    };
  },

  markPayoutInFlight(input: { billId: string; idempotencyKey: string }): StateSnapshot {
    const bill = storeState.bills.find((b) => b.id === input.billId);
    const request = storeState.idempotencyMap.get(input.idempotencyKey);

    if (!bill || !request || request.billId !== bill.id) {
      throw new Error('Invalid payout state');
    }

    if (bill.status === 'IN_FLIGHT' && request.status === 'IN_FLIGHT') {
      return this.getSnapshot();
    }

    if (bill.status !== 'APPROVED' || request.status !== 'APPROVED') {
      throw new Error('Invalid payout state');
    }

    bill.status = 'IN_FLIGHT';
    request.status = 'IN_FLIGHT';

    storeState.auditLogs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: 'MERCHANT',
      action: 'PAYOUT_IN_FLIGHT',
      details: `Payout to ${bill.vendorName} (${bill.billNumber}) is in flight. Balance is reserved but not debited until settlement is confirmed.`,
      amountCents: bill.amountCents,
      isSimulated: true,
    });

    return this.getSnapshot();
  },

  markPayoutAccepted(input: {
    billId: string;
    idempotencyKey: string;
    batchId: string;
    paypalStatus: string;
    response: unknown;
  }): StateSnapshot {
    const bill = storeState.bills.find((b) => b.id === input.billId);
    const request = storeState.idempotencyMap.get(input.idempotencyKey);

    if (!bill || !request || request.billId !== bill.id) {
      throw new Error('Invalid payout state');
    }
    if (bill.status !== 'IN_FLIGHT' || request.status !== 'IN_FLIGHT') {
      throw new Error('Invalid payout state');
    }

    request.paypalBatchId = input.batchId;
    request.paypalStatus = input.paypalStatus;
    request.response = input.response;

    storeState.auditLogs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: 'SYSTEM',
      action: 'PAYOUT_ACCEPTED_PAYPAL',
      details: `PayPal Sandbox accepted payout batch ${input.batchId} for ${bill.vendorName} (${bill.billNumber}) with status ${input.paypalStatus}. Funds are not yet confirmed settled.`,
      amountCents: bill.amountCents,
      isSimulated: false,
    });

    return this.getSnapshot();
  },

  completePayout(input: {
    billId: string;
    idempotencyKey: string;
    isRealPayPal: boolean;
    externalRef?: string;
    response: unknown;
    actor?: AuditLogEntry['actor'];
  }): StateSnapshot {
    const bill = storeState.bills.find((b) => b.id === input.billId);
    const request = storeState.idempotencyMap.get(input.idempotencyKey);

    if (!bill || !request || request.billId !== bill.id) {
      throw new Error('Invalid payout state');
    }

    // Duplicate webhooks and retries must not debit twice.
    if (bill.status === 'DISBURSED' && request.status === 'SUCCEEDED') {
      return this.getSnapshot();
    }

    if (bill.status !== 'IN_FLIGHT' || request.status !== 'IN_FLIGHT') {
      throw new Error('Invalid payout state');
    }

    bill.status = 'DISBURSED';
    storeState.account.clearedBalanceCents -= bill.amountCents;

    request.status = 'SUCCEEDED';
    request.response = input.response;
    if (input.externalRef) {
      request.paypalBatchId = input.externalRef;
    }

    storeState.auditLogs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: input.actor ?? 'MERCHANT',
      action: input.isRealPayPal ? 'PAYOUT_DISBURSED_PAYPAL' : 'PAYOUT_DISBURSED_SIMULATED',
      details: input.isRealPayPal
        ? `PayPal Sandbox confirmed payout batch ${input.externalRef ?? 'unknown'} to ${bill.vendorName} (${bill.billNumber}); ledger debited -$${(bill.amountCents / 100).toFixed(2)}.`
        : `Payout to ${bill.vendorName} (${bill.billNumber}) authorized and disbursed (-$${(bill.amountCents / 100).toFixed(2)}).`,
      amountCents: bill.amountCents,
      isSimulated: !input.isRealPayPal,
    });

    if (input.isRealPayPal && input.externalRef) {
      storeState.account.payoutVerification = {
        batchId: input.externalRef,
        verifiedAt: new Date().toISOString(),
      };
    }

    return this.getSnapshot();
  },

  failPayout(input: {
    billId: string;
    idempotencyKey: string;
    code: string;
    message: string;
    isRealPayPal?: boolean;
    externalRef?: string;
    actor?: AuditLogEntry['actor'];
  }): StateSnapshot {
    const bill = storeState.bills.find((b) => b.id === input.billId);
    const request = storeState.idempotencyMap.get(input.idempotencyKey);

    if (!bill || !request || request.billId !== bill.id) {
      throw new Error('Invalid payout state');
    }

    // Never regress a settled payout from a stale failure event.
    if (bill.status === 'DISBURSED' && request.status === 'SUCCEEDED') {
      return this.getSnapshot();
    }

    if (bill.status !== 'IN_FLIGHT' && bill.status !== 'APPROVED') {
      throw new Error('Invalid payout state');
    }

    bill.status = 'FAILED';

    request.status = 'FAILED';
    request.code = input.code;
    request.message = input.message;
    if (input.externalRef) {
      request.paypalBatchId = input.externalRef;
    }

    storeState.auditLogs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: input.actor ?? 'MERCHANT',
      action: 'PAYOUT_FAILED',
      details: `Payout to ${bill.vendorName} (${bill.billNumber}) failed: ${input.message} No ledger debit was applied.`,
      amountCents: bill.amountCents,
      isSimulated: !input.isRealPayPal,
    });

    return this.getSnapshot();
  },

  markPayoutUnknown(input: {
    billId: string;
    idempotencyKey: string;
    code: string;
    message: string;
    paypalBatchId?: string;
    paypalStatus?: string;
  }): StateSnapshot {
    const bill = storeState.bills.find((b) => b.id === input.billId);
    const request = storeState.idempotencyMap.get(input.idempotencyKey);

    if (!bill || !request || request.billId !== bill.id) {
      throw new Error('Invalid payout state');
    }

    if (bill.status === 'DISBURSED' || bill.status === 'FAILED') {
      return this.getSnapshot();
    }

    // Unknown is not failure. Keep the bill reserved and in flight so it cannot
    // be retried with a fresh payout while PayPal may still settle it.
    request.code = input.code;
    request.message = input.message;
    if (input.paypalBatchId) request.paypalBatchId = input.paypalBatchId;
    if (input.paypalStatus) request.paypalStatus = input.paypalStatus;

    storeState.auditLogs.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: 'SYSTEM',
      action: 'PAYOUT_OUTCOME_UNKNOWN',
      details: `Payout to ${bill.vendorName} (${bill.billNumber}) has an unconfirmed outcome: ${input.message} The bill remains in flight and must be reconciled.`,
      amountCents: bill.amountCents,
      isSimulated: false,
    });

    return this.getSnapshot();
  },

  getPayoutRequestByBillId(billId: string): IdempotencyOutcome | undefined {
    for (const request of storeState.idempotencyMap.values()) {
      if (request.billId === billId) return request;
    }
    return undefined;
  },

  getPayoutRequestByBatchId(batchId: string): IdempotencyOutcome | undefined {
    for (const request of storeState.idempotencyMap.values()) {
      if (request.paypalBatchId === batchId) return request;
    }
    return undefined;
  },

  getIdempotencyOutcome(key: string): IdempotencyOutcome | undefined {
    return storeState.idempotencyMap.get(key);
  },

  addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const newEntry: AuditLogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    storeState.auditLogs.unshift(newEntry);
    return newEntry;
  },

  resetDemoData(): StateSnapshot {
    storeState.account = structuredClone(INITIAL_ACCOUNT);
    storeState.invoices = structuredClone(createInitialInvoices());
    storeState.bills = structuredClone(createInitialBills());
    storeState.auditLogs = structuredClone(INITIAL_AUDIT_LOGS);
    storeState.idempotencyMap.clear();
    return this.getSnapshot();
  },
};
