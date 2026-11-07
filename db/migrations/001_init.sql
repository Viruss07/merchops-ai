-- 001_init.sql
-- Core Financial Schema: Integer cents everywhere, append-only ledger

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Merchants / Tenants
CREATE TABLE IF NOT EXISTS merchants (
  id VARCHAR(64) PRIMARY KEY,
  business_name VARCHAR(255) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  min_reserve_cents BIGINT NOT NULL DEFAULT 200000, -- $2,000.00
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoices (Receivables)
CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(64) PRIMARY KEY,
  merchant_id VARCHAR(64) NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  invoice_number VARCHAR(64) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  amount_cents BIGINT NOT NULL,
  due_date DATE NOT NULL,
  days_overdue INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'CURRENT', -- PAID | CURRENT | OVERDUE
  description TEXT NOT NULL,
  payment_url TEXT,
  paypal_invoice_id VARCHAR(128),
  recipient_view_url TEXT,
  qr_code_url TEXT,
  last_reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_merchant ON invoices(merchant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_paypal_id ON invoices(paypal_invoice_id);

-- Bills (Payables)
CREATE TABLE IF NOT EXISTS bills (
  id VARCHAR(64) PRIMARY KEY,
  merchant_id VARCHAR(64) NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  bill_number VARCHAR(64) NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_email VARCHAR(255) NOT NULL,
  amount_cents BIGINT NOT NULL,
  due_date DATE NOT NULL,
  days_until_due INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | IN_FLIGHT | DISBURSED | FAILED
  description TEXT NOT NULL,
  category VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bills_merchant ON bills(merchant_id);

-- Payouts (Idempotent outbound dispatches)
CREATE TABLE IF NOT EXISTS payouts (
  id VARCHAR(64) PRIMARY KEY,
  merchant_id VARCHAR(64) NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  bill_id VARCHAR(64) NOT NULL REFERENCES bills(id) ON DELETE RESTRICT,
  request_id VARCHAR(128) UNIQUE NOT NULL, -- Deterministic PayPal-Request-Id
  batch_id VARCHAR(128),
  item_id VARCHAR(128),
  amount_cents BIGINT NOT NULL,
  fee_cents BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL, -- APPROVED | IN_FLIGHT | SUCCEEDED | FAILED
  execution_mode VARCHAR(32) NOT NULL DEFAULT 'SIMULATION', -- SIMULATION | PAYPAL_SANDBOX
  response_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_batch_id ON payouts(batch_id);

-- Ledger Entries: STRICTLY APPEND-ONLY. Cleared cash balance = SUM(amount_cents)
CREATE TABLE IF NOT EXISTS ledger_entries (
  id VARCHAR(64) PRIMARY KEY,
  merchant_id VARCHAR(64) NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  entry_type VARCHAR(32) NOT NULL, -- OPENING_BALANCE | INVOICE_PAYMENT | PAYOUT_DISBURSEMENT | PAYOUT_FEE | ADJUSTMENT
  amount_cents BIGINT NOT NULL, -- Positive for credits, negative for debits
  reference_type VARCHAR(64),   -- INVOICE | BILL | PAYOUT
  reference_id VARCHAR(64),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_merchant ON ledger_entries(merchant_id);

