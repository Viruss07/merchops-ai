import pg from 'pg';
import crypto from 'node:crypto';
import {
  AuditLogEntry,
  Bill,
  Invoice,
  MerchantAccount,
  StateSnapshot,
} from '@/types';
import {
  IdempotencyOutcome,
  PayoutExecutionMode,
} from '@/lib/store';
import { IRepository } from './interface';
import {
  DEFAULT_FORECAST_DAYS,
  DEFAULT_MIN_RESERVE_CENTS,
  DEMO_AS_OF,
  PAYPAL_PAYOUT_FEE_CENTS,
  PAYPAL_SANDBOX_ENABLED,
} from '@/lib/config';
import { createUnavailablePayPalBalance } from '@/lib/paypalBalance';
import { calculatePayoutFeeCents } from '@/lib/money';

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;

export function getPgPool(): pg.Pool {
  if (!poolInstance) {
    const connectionString = process.env.DATABASE_URL || '';
    poolInstance = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
    });
  }
  return poolInstance;
}

export class PgRepository implements IRepository {
  private merchantId = 'merchant-001';

  async getAccount(): Promise<MerchantAccount> {
    const pool = getPgPool();
    const res = await pool.query(
      `SELECT m.id, m.business_name, m.currency, m.min_reserve_cents,
              COALESCE(SUM(l.amount_cents), 0) as cleared_balance_cents
       FROM merchants m
       LEFT JOIN ledger_entries l ON m.id = l.merchant_id
       WHERE m.id = $1
       GROUP BY m.id, m.business_name, m.currency, m.min_reserve_cents`,
      [this.merchantId]
    );

    if (res.rows.length === 0) {
      return {
        id: this.merchantId,
        businessName: 'MerchOps Specialty Retail',
        currency: 'USD',
        clearedBalanceCents: 420000,
        minReserveCents: DEFAULT_MIN_RESERVE_CENTS,
      };
    }

    const row = res.rows[0];
    return {
      id: row.id,
      businessName: row.business_name,
      currency: 'USD',
      clearedBalanceCents: parseInt(row.cleared_balance_cents, 10),
      minReserveCents: parseInt(row.min_reserve_cents, 10),
    };
  }

  async getInvoices(): Promise<Invoice[]> {
    const pool = getPgPool();
    const res = await pool.query(
      `SELECT id, invoice_number, customer_name, customer_email, amount_cents,
              due_date, days_overdue, status, description, payment_url,
              paypal_invoice_id, recipient_view_url, qr_code_url, last_reminder_sent_at
       FROM invoices
       WHERE merchant_id = $1
       ORDER BY due_date ASC`,
      [this.merchantId]
    );

    return res.rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoice_number,
      customerName: r.customer_name,
      customerEmail: r.customer_email,
      amountCents: parseInt(r.amount_cents, 10),
      dueDate: r.due_date instanceof Date ? r.due_date.toISOString().slice(0, 10) : String(r.due_date),
      daysOverdue: r.days_overdue,
      status: r.status,
      description: r.description,
      paymentUrl: r.payment_url ?? undefined,
      paypalInvoiceId: r.paypal_invoice_id ?? undefined,
      recipientViewUrl: r.recipient_view_url ?? undefined,
      qrCodeUrl: r.qr_code_url ?? undefined,
      lastReminderSentAt: r.last_reminder_sent_at ? new Date(r.last_reminder_sent_at).toISOString() : undefined,
    }));
  }

  async getBills(): Promise<Bill[]> {
    const pool = getPgPool();
    const res = await pool.query(
      `SELECT id, bill_number, vendor_name, vendor_email, amount_cents,
              due_date, days_until_due, status, description, category
       FROM bills
       WHERE merchant_id = $1
       ORDER BY due_date ASC`,
      [this.merchantId]
    );

    return res.rows.map((r) => ({
      id: r.id,
      billNumber: r.bill_number,
      vendorName: r.vendor_name,
      vendorEmail: r.vendor_email,
      amountCents: parseInt(r.amount_cents, 10),
      dueDate: r.due_date instanceof Date ? r.due_date.toISOString().slice(0, 10) : String(r.due_date),
      daysUntilDue: r.days_until_due,
      status: r.status,
      description: r.description,
      category: r.category,
    }));
  }

  async getAuditLogs(): Promise<AuditLogEntry[]> {
    const pool = getPgPool();
    const res = await pool.query(
      `SELECT id, created_at, actor, action, details, amount_cents, is_simulated
       FROM audit_logs
       WHERE merchant_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [this.merchantId]
    );

    return res.rows.map((r) => ({
      id: r.id,
      timestamp: new Date(r.created_at).toISOString(),
      actor: r.actor,
      action: r.action,
      details: r.details,
      amountCents: r.amount_cents ? parseInt(r.amount_cents, 10) : undefined,
      isSimulated: r.is_simulated,
    }));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const invoices = await this.getInvoices();
    return invoices.find((i) => i.id === id);
  }

  async getInvoiceByPayPalId(paypalInvoiceId: string): Promise<Invoice | undefined> {
    const invoices = await this.getInvoices();
    return invoices.find((i) => i.paypalInvoiceId === paypalInvoiceId);
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined> {
    const invoices = await this.getInvoices();
    return invoices.find((i) => i.invoiceNumber === invoiceNumber);
  }

  async getSnapshot(): Promise<StateSnapshot> {
    const [account, invoices, bills, auditLogs] = await Promise.all([
      this.getAccount(),
      this.getInvoices(),
      this.getBills(),
      this.getAuditLogs(),
    ]);

    return {
      account,
      invoices,
      bills,
      auditLogs,
      paypalBalance: createUnavailablePayPalBalance(),
      capabilities: {
        paypalSandboxEnabled: PAYPAL_SANDBOX_ENABLED,
        payoutMode: PAYPAL_SANDBOX_ENABLED ? 'SANDBOX_UNVERIFIED' : 'SIMULATION',
        verifiedBatchId: null,
      },
      demoConfig: {
        asOfDate: DEMO_AS_OF,
        forecastDays: DEFAULT_FORECAST_DAYS,
        payoutEpoch: 'v1',
        paypalPayoutFeeCents: PAYPAL_PAYOUT_FEE_CENTS,
      },
    };
  }

  async payInvoice(
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
  > {
    const pool = getPgPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const invRes = await client.query(
        'SELECT * FROM invoices WHERE id = $1 AND merchant_id = $2 FOR UPDATE',
        [id, this.merchantId]
      );

      if (invRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'NOT_FOUND' };
      }

      const inv = invRes.rows[0];
      if (inv.status === 'PAID') {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'ALREADY_PAID' };
      }

      const amountCents = parseInt(inv.amount_cents, 10);
      const actor = options?.actor ?? 'MERCHANT';
      const isSimulated = options?.isSimulated ?? true;
      const action = options?.action ?? (isSimulated ? 'INVOICE_PAID_SIMULATED' : 'INVOICE_PAID_PAYPAL');
      const details =
        options?.details ??
        `Invoice ${inv.invoice_number} for ${inv.customer_name} marked paid (+$${(amountCents / 100).toFixed(2)}).`;

      // 1. Update invoice
      await client.query(
        'UPDATE invoices SET status = $1, days_overdue = 0 WHERE id = $2',
        ['PAID', id]
      );

      // 2. Append ledger credit
      await client.query(
        `INSERT INTO ledger_entries (id, merchant_id, entry_type, amount_cents, reference_type, reference_id, description)
         VALUES ($1, $2, 'INVOICE_PAYMENT', $3, 'INVOICE', $4, $5)`,
        [crypto.randomUUID(), this.merchantId, amountCents, id, details]
      );

      // 3. Append audit log
      await client.query(
        `INSERT INTO audit_logs (id, merchant_id, actor, action, details, amount_cents, is_simulated)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [crypto.randomUUID(), this.merchantId, actor, action, details, amountCents, isSimulated]
      );

      await client.query('COMMIT');

      const updatedInv = await this.getInvoice(id);
      const snapshot = await this.getSnapshot();
      return { ok: true, invoice: updatedInv!, snapshot };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async attachPayPalInvoice(
    id: string,
    details: {
      paypalInvoiceId: string;
      recipientViewUrl?: string | null;
      qrCodeUrl?: string | null;
    }
  ): Promise<
    | { ok: true; invoice: Invoice; snapshot: StateSnapshot }
    | { ok: false; reason: 'NOT_FOUND' }
  > {
    const pool = getPgPool();
    const res = await pool.query(
      `UPDATE invoices
       SET paypal_invoice_id = $1,
           recipient_view_url = COALESCE($2, recipient_view_url),
           payment_url = COALESCE($2, payment_url),
           qr_code_url = COALESCE($3, qr_code_url)
       WHERE id = $4 AND merchant_id = $5
       RETURNING *`,
      [details.paypalInvoiceId, details.recipientViewUrl ?? null, details.qrCodeUrl ?? null, id, this.merchantId]
    );

    if (res.rows.length === 0) return { ok: false, reason: 'NOT_FOUND' };

    await pool.query(
      `INSERT INTO audit_logs (id, merchant_id, actor, action, details, is_simulated)
       VALUES ($1, $2, 'SYSTEM', 'INVOICE_SYNCED_PAYPAL', $3, false)`,
      [
        crypto.randomUUID(),
        this.merchantId,
        `Invoice ${res.rows[0].invoice_number} linked to PayPal Sandbox ID ${details.paypalInvoiceId}.`,
      ]
    );

    const updatedInv = await this.getInvoice(id);
    const snapshot = await this.getSnapshot();
    return { ok: true, invoice: updatedInv!, snapshot };
  }

  async recordReminderSent(
    id: string,
    subject: string,
    body: string,
    options?: { deliveredViaPayPal?: boolean }
  ): Promise<
    | { ok: true; invoice: Invoice; snapshot: StateSnapshot }
    | { ok: false; reason: 'NOT_FOUND' }
  > {
    const pool = getPgPool();
    const now = new Date();
    const res = await pool.query(
      'UPDATE invoices SET last_reminder_sent_at = $1 WHERE id = $2 AND merchant_id = $3 RETURNING *',
      [now, id, this.merchantId]
    );

    if (res.rows.length === 0) return { ok: false, reason: 'NOT_FOUND' };

    const inv = res.rows[0];
    const viaPayPal = options?.deliveredViaPayPal ?? false;

    await pool.query(
      `INSERT INTO audit_logs (id, merchant_id, actor, action, details, amount_cents, is_simulated)
       VALUES ($1, $2, 'MERCHANT', $3, $4, $5, $6)`,
      [
        crypto.randomUUID(),
        this.merchantId,
        viaPayPal ? 'REMINDER_DISPATCHED_PAYPAL' : 'REMINDER_DRAFT_APPROVED',
        viaPayPal
          ? `Merchant approved reminder "${subject}" for ${inv.customer_name}; dispatched via PayPal Sandbox Invoicing API.`
          : `Merchant approved reminder draft "${subject}" for ${inv.customer_name}, ${body.length} characters. Staged locally.`,
        parseInt(inv.amount_cents, 10),
        !viaPayPal,
      ]
    );

    const updatedInv = await this.getInvoice(id);
    const snapshot = await this.getSnapshot();
    return { ok: true, invoice: updatedInv!, snapshot };
  }

  async beginPayout(input: {
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
  > {
    const pool = getPgPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // CONCURRENCY CONTROL: Transaction-level advisory lock on bill_id
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [input.billId]);

      // Check existing payout request by idempotency key
      const payoutRes = await client.query(
        'SELECT * FROM payouts WHERE request_id = $1',
        [input.idempotencyKey]
      );

      if (payoutRes.rows.length > 0) {
        const row = payoutRes.rows[0];
        await client.query('ROLLBACK');
        return {
          ok: false,
          reason: 'DUPLICATE_REQUEST',
          outcome: {
            billId: row.bill_id,
            idempotencyKey: row.request_id,
            status: row.status,
            executionMode: row.execution_mode,
            paypalBatchId: row.batch_id ?? undefined,
          },
        };
      }

      const billRes = await client.query(
        'SELECT * FROM bills WHERE id = $1 AND merchant_id = $2 FOR UPDATE',
        [input.billId, this.merchantId]
      );

      if (billRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'NOT_FOUND' };
      }

      const bill = billRes.rows[0];
      if (bill.status === 'DISBURSED') {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'ALREADY_DISBURSED' };
      }
      if (bill.status === 'IN_FLIGHT') {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'IN_FLIGHT' };
      }
      if (bill.status === 'APPROVED') {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'APPROVAL_PENDING' };
      }
      if (bill.status === 'FAILED') {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'PAYOUT_FAILED' };
      }

      const amountCents = parseInt(bill.amount_cents, 10);
      if (amountCents <= 0) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'INVALID_AMOUNT' };
      }

      // Compute cleared balance and reserved in-flight cash
      const balRes = await client.query(
        `SELECT COALESCE(SUM(amount_cents), 0) as balance FROM ledger_entries WHERE merchant_id = $1`,
        [this.merchantId]
      );
      const clearedBalance = parseInt(balRes.rows[0].balance, 10);

      const inFlightRes = await client.query(
        `SELECT COALESCE(SUM(amount_cents), 0) as in_flight FROM bills WHERE merchant_id = $1 AND status IN ('IN_FLIGHT', 'APPROVED')`,
        [this.merchantId]
      );
      const inFlightCents = parseInt(inFlightRes.rows[0].in_flight, 10);

      const feeCents = input.feeCents ?? (input.executionMode === 'PAYPAL_SANDBOX' ? calculatePayoutFeeCents(amountCents) : 0);
      const postPayoutBalanceCents = clearedBalance - inFlightCents - amountCents - feeCents;

      const merchantRes = await client.query('SELECT min_reserve_cents FROM merchants WHERE id = $1', [this.merchantId]);
      const minReserve = parseInt(merchantRes.rows[0].min_reserve_cents, 10);

      if (postPayoutBalanceCents < minReserve) {
        const deficitCents = minReserve - postPayoutBalanceCents;
        await client.query('ROLLBACK');
        return {
          ok: false,
          reason: 'RESERVE_BREACH',
          deficitCents,
          postPayoutBalanceCents,
        };
      }

      // Mark bill APPROVED & record payout row
      await client.query('UPDATE bills SET status = $1 WHERE id = $2', ['APPROVED', input.billId]);
      await client.query(
        `INSERT INTO payouts (id, merchant_id, bill_id, request_id, amount_cents, fee_cents, status, execution_mode)
         VALUES ($1, $2, $3, $4, $5, $6, 'APPROVED', $7)`,
        [
          crypto.randomUUID(),
          this.merchantId,
          input.billId,
          input.idempotencyKey,
          amountCents,
          feeCents,
          input.executionMode ?? 'SIMULATION',
        ]
      );

      await client.query(
        `INSERT INTO audit_logs (id, merchant_id, actor, action, details, amount_cents, is_simulated)
         VALUES ($1, $2, 'MERCHANT', 'PAYOUT_APPROVED', $3, $4, $5)`,
        [
          crypto.randomUUID(),
          this.merchantId,
          `Merchant approved payout to ${bill.vendor_name} (${bill.bill_number}); funds reserved.`,
          amountCents,
          input.executionMode !== 'PAYPAL_SANDBOX',
        ]
      );

      await client.query('COMMIT');

      const bills = await this.getBills();
      const updatedBill = bills.find((b) => b.id === input.billId);
      const snapshot = await this.getSnapshot();
      return { ok: true, bill: updatedBill!, postPayoutBalanceCents, snapshot };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async markPayoutInFlight(input: {
    billId: string;
    idempotencyKey: string;
  }): Promise<StateSnapshot> {
    const pool = getPgPool();
    await pool.query('UPDATE bills SET status = $1 WHERE id = $2', ['IN_FLIGHT', input.billId]);
    await pool.query('UPDATE payouts SET status = $1 WHERE request_id = $2', ['IN_FLIGHT', input.idempotencyKey]);
    return this.getSnapshot();
  }

  async markPayoutAccepted(input: {
    billId: string;
    idempotencyKey: string;
    batchId: string;
    paypalStatus: string;
    response: unknown;
  }): Promise<StateSnapshot> {
    const pool = getPgPool();
    await pool.query(
      'UPDATE payouts SET batch_id = $1, response_payload = $2 WHERE request_id = $3',
      [input.batchId, JSON.stringify(input.response), input.idempotencyKey]
    );
    return this.getSnapshot();
  }

  async completePayout(input: {
    billId: string;
    idempotencyKey: string;
    isRealPayPal: boolean;
    externalRef?: string;
    response: unknown;
    actor?: AuditLogEntry['actor'];
  }): Promise<StateSnapshot> {
    const pool = getPgPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const payoutRes = await client.query('SELECT * FROM payouts WHERE request_id = $1 FOR UPDATE', [input.idempotencyKey]);
      if (payoutRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return this.getSnapshot();
      }

      const payout = payoutRes.rows[0];
      if (payout.status === 'SUCCEEDED') {
        await client.query('ROLLBACK');
        return this.getSnapshot();
      }

      const amountCents = parseInt(payout.amount_cents, 10);
      const feeCents = parseInt(payout.fee_cents, 10);

      // 1. Debit ledger
      await client.query(
        `INSERT INTO ledger_entries (id, merchant_id, entry_type, amount_cents, reference_type, reference_id, description)
         VALUES ($1, $2, 'PAYOUT_DISBURSEMENT', $3, 'BILL', $4, $5)`,
        [crypto.randomUUID(), this.merchantId, -amountCents, input.billId, `Settlement for payout ${input.idempotencyKey}`]
      );

      if (feeCents > 0) {
        await client.query(
          `INSERT INTO ledger_entries (id, merchant_id, entry_type, amount_cents, reference_type, reference_id, description)
           VALUES ($1, $2, 'PAYOUT_FEE', $3, 'PAYOUT', $4, 'PayPal payout transaction fee')`,
          [crypto.randomUUID(), this.merchantId, -feeCents, input.idempotencyKey]
        );
      }

      // 2. Mark bill DISBURSED
      await client.query('UPDATE bills SET status = $1 WHERE id = $2', ['DISBURSED', input.billId]);

      // 3. Mark payout SUCCEEDED
      await client.query(
        'UPDATE payouts SET status = $1, batch_id = COALESCE($2, batch_id), response_payload = $3 WHERE request_id = $4',
        ['SUCCEEDED', input.externalRef ?? null, JSON.stringify(input.response), input.idempotencyKey]
      );

      // 4. Audit
      await client.query(
        `INSERT INTO audit_logs (id, merchant_id, actor, action, details, amount_cents, is_simulated)
         VALUES ($1, $2, $3, 'PAYOUT_DISBURSED', $4, $5, $6)`,
        [
          crypto.randomUUID(),
          this.merchantId,
          input.actor ?? 'MERCHANT',
          `Disbursement completed for bill ${input.billId}. Total debited: $${((amountCents + feeCents) / 100).toFixed(2)}.`,
          amountCents,
          !input.isRealPayPal,
        ]
      );

      await client.query('COMMIT');
      return this.getSnapshot();
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async failPayout(input: {
    billId: string;
    idempotencyKey: string;
    code: string;
    message: string;
    isRealPayPal: boolean;
    externalRef?: string;
    actor?: AuditLogEntry['actor'];
  }): Promise<StateSnapshot> {
    const pool = getPgPool();
    await pool.query('UPDATE bills SET status = $1 WHERE id = $2', ['FAILED', input.billId]);
    await pool.query('UPDATE payouts SET status = $1 WHERE request_id = $2', ['FAILED', input.idempotencyKey]);
    return this.getSnapshot();
  }

  async getIdempotencyOutcome(idempotencyKey: string): Promise<IdempotencyOutcome | undefined> {
    const pool = getPgPool();
    const res = await pool.query('SELECT * FROM payouts WHERE request_id = $1', [idempotencyKey]);
    if (res.rows.length === 0) return undefined;
    const r = res.rows[0];
    return {
      billId: r.bill_id,
      idempotencyKey: r.request_id,
      status: r.status,
      executionMode: r.execution_mode,
      paypalBatchId: r.batch_id ?? undefined,
    };
  }

  async getPayoutRequestByBatchId(batchId: string): Promise<IdempotencyOutcome | undefined> {
    const pool = getPgPool();
    const res = await pool.query('SELECT * FROM payouts WHERE batch_id = $1', [batchId]);
    if (res.rows.length === 0) return undefined;
    const r = res.rows[0];
    return {
      billId: r.bill_id,
      idempotencyKey: r.request_id,
      status: r.status,
      executionMode: r.execution_mode,
      paypalBatchId: r.batch_id ?? undefined,
    };
  }

  async resetDemoData(): Promise<StateSnapshot> {
    // For demo reset, can truncate and re-run seed or reinitialize
    return this.getSnapshot();
  }
}

