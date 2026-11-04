/**
 * MerchOps AI — In-Memory Demo State Repository
 * 
 * NOTE ON ARCHITECTURE:
 * This in-memory repository holds state for the partner demo.
 * In-memory state resets when the development server restarts.
 * The interface is designed to be cleanly swappable with a PostgreSQL / Prisma / Drizzle
 * database layer without changing business logic or component interfaces.
 */

import { MerchantAccount, Invoice, Bill, AuditLogEntry } from '@/types';

export const INITIAL_ACCOUNT: MerchantAccount = {
  id: 'merchant-001',
  businessName: 'MerchOps Specialty Retail',
  currency: 'USD',
  clearedBalanceCents: 420000, // $4,200.00
  minReserveCents: 200000,    // $2,000.00
  sandboxConnected: true,
  payoutsScopeVerified: true,
};

export const INITIAL_INVOICES: Invoice[] = [
  {
    id: 'inv-apex-01',
    invoiceNumber: 'INV-2026-089',
    customerName: 'Apex Corp',
    customerEmail: 'billing@apexcorp.test',
    amountCents: 150000, // $1,500.00
    dueDate: '2026-10-22',
    daysOverdue: 12,
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
    dueDate: '2026-11-15',
    daysOverdue: 0,
    status: 'CURRENT',
    description: 'Retail Merchandising Display Kit',
  },
];

export const INITIAL_BILLS: Bill[] = [
  {
    id: 'bill-acme-01',
    billNumber: 'BILL-SUP-401',
    vendorName: 'Acme Supplies',
    vendorEmail: 'receivables@acmesupplies.test',
    amountCents: 300000, // $3,000.00
    dueDate: '2026-11-13',
    daysUntilDue: 10,
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
    dueDate: '2026-11-20',
    daysUntilDue: 17,
    status: 'PENDING',
    description: 'Monthly ecommerce server infrastructure',
    category: 'Operations',
  },
];

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
    id: 'audit-002',
    timestamp: '2026-11-03T09:05:00Z',
    actor: 'SYSTEM',
    action: 'SANDBOX_OAUTH_VERIFIED',
    details: 'PayPal Sandbox OAuth token verified (HTTP 200). Payouts scope present in token.',
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

interface GlobalStoreState {
  currentAccount: MerchantAccount;
  currentInvoices: Invoice[];
  currentBills: Bill[];
  currentAuditLogs: AuditLogEntry[];
  usedIdempotencyKeys: Set<string>;
}

// Ensure singleton persistence across Next.js API route bundles in Node.js process
const globalForStore = globalThis as unknown as {
  __merchops_store__?: GlobalStoreState;
};

if (!globalForStore.__merchops_store__) {
  globalForStore.__merchops_store__ = {
    currentAccount: { ...INITIAL_ACCOUNT },
    currentInvoices: JSON.parse(JSON.stringify(INITIAL_INVOICES)),
    currentBills: JSON.parse(JSON.stringify(INITIAL_BILLS)),
    currentAuditLogs: JSON.parse(JSON.stringify(INITIAL_AUDIT_LOGS)),
    usedIdempotencyKeys: new Set<string>(),
  };
}

const state = globalForStore.__merchops_store__;

export const demoStore = {
  getAccount: () => ({ ...state.currentAccount }),
  getInvoices: () => [...state.currentInvoices],
  getBills: () => [...state.currentBills],
  getAuditLogs: () => [...state.currentAuditLogs],

  hasIdempotencyKey: (key: string) => state.usedIdempotencyKeys.has(key),
  recordIdempotencyKey: (key: string) => state.usedIdempotencyKeys.add(key),

  updateBalance: (deltaCents: number) => {
    state.currentAccount.clearedBalanceCents += deltaCents;
    return state.currentAccount.clearedBalanceCents;
  },

  markInvoicePaid: (invoiceId: string) => {
    const inv = state.currentInvoices.find((i) => i.id === invoiceId);
    if (!inv || inv.status === 'PAID') return null;

    inv.status = 'PAID';
    inv.daysOverdue = 0;
    state.currentAccount.clearedBalanceCents += inv.amountCents;

    state.currentAuditLogs.unshift({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'PAYPAL_WEBHOOK',
      action: 'INVOICE_PAID_SIMULATED',
      details: `Invoice ${inv.invoiceNumber} for ${inv.customerName} marked paid (+$${(inv.amountCents / 100).toFixed(2)}).`,
      amountCents: inv.amountCents,
      isSimulated: true,
    });

    return inv;
  },

  recordReminderSent: (invoiceId: string, subject: string, body: string) => {
    const inv = state.currentInvoices.find((i) => i.id === invoiceId);
    if (!inv) return null;

    inv.lastReminderSentAt = new Date().toISOString();

    state.currentAuditLogs.unshift({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'MERCHANT',
      action: 'REMINDER_DRAFT_APPROVED',
      details: `Merchant reviewed and approved reminder draft for ${inv.customerName} (${inv.invoiceNumber}). Staged locally; no outbound email transport configured.`,
      amountCents: inv.amountCents,
      isSimulated: false,
    });

    return inv;
  },

  markBillDisbursed: (billId: string, isRealPayPal: boolean = false) => {
    const bill = state.currentBills.find((b) => b.id === billId);
    if (!bill || bill.status === 'DISBURSED') return null;

    bill.status = 'DISBURSED';
    state.currentAccount.clearedBalanceCents -= bill.amountCents;

    state.currentAuditLogs.unshift({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'MERCHANT',
      action: isRealPayPal ? 'PAYOUT_DISBURSED_PAYPAL' : 'PAYOUT_DISBURSED_SIMULATED',
      details: `Payout to ${bill.vendorName} (${bill.billNumber}) authorized and disbursed (-$${(bill.amountCents / 100).toFixed(2)}).`,
      amountCents: bill.amountCents,
      isSimulated: !isRealPayPal,
    });

    return bill;
  },

  addAuditLog: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => {
    const newEntry: AuditLogEntry = {
      ...entry,
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    state.currentAuditLogs.unshift(newEntry);
    return newEntry;
  },

  resetDemoData: () => {
    state.currentAccount = { ...INITIAL_ACCOUNT };
    state.currentInvoices = JSON.parse(JSON.stringify(INITIAL_INVOICES));
    state.currentBills = JSON.parse(JSON.stringify(INITIAL_BILLS));
    state.currentAuditLogs = JSON.parse(JSON.stringify(INITIAL_AUDIT_LOGS));
    state.usedIdempotencyKeys.clear();
    return {
      account: state.currentAccount,
      invoices: state.currentInvoices,
      bills: state.currentBills,
      auditLogs: state.currentAuditLogs,
    };
  },
};

