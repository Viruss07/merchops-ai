import { IRepository } from './interface';
import { PgRepository } from './postgres';
import { demoStore } from '@/lib/store';

export * from './interface';
export * from './postgres';

let repoInstance: IRepository | null = null;

export function getRepository(): IRepository {
  if (!repoInstance) {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl && dbUrl.trim().length > 0 && !dbUrl.startsWith('postgresql://user:password')) {
      repoInstance = new PgRepository();
    } else {
      repoInstance = {
        getSnapshot: async () => demoStore.getSnapshot(),
        getInvoices: async () => demoStore.getInvoices(),
        getBills: async () => demoStore.getBills(),
        getAuditLogs: async () => demoStore.getAuditLogs(),
        getInvoice: async (id) => demoStore.getInvoice(id),
        getInvoiceByPayPalId: async (id) => demoStore.getInvoiceByPayPalId(id),
        getInvoiceByNumber: async (num) => demoStore.getInvoiceByNumber(num),
        payInvoice: async (id, opts) => demoStore.payInvoice(id, opts),
        attachPayPalInvoice: async (id, details) => demoStore.attachPayPalInvoice(id, details),
        recordReminderSent: async (id, sub, body, opts) => demoStore.recordReminderSent(id, sub, body, opts),
        beginPayout: async (input) => demoStore.beginPayout(input),
        markPayoutInFlight: async (input) => demoStore.markPayoutInFlight(input),
        markPayoutAccepted: async (input) => demoStore.markPayoutAccepted(input),
        completePayout: async (input) => demoStore.completePayout(input),
        failPayout: async (input) => demoStore.failPayout(input),
        getIdempotencyOutcome: async (key) => demoStore.getIdempotencyOutcome(key),
        getPayoutRequestByBatchId: async (id) => demoStore.getPayoutRequestByBatchId(id),
        resetDemoData: async () => demoStore.resetDemoData(),
      };
    }
  }
  return repoInstance;
}

