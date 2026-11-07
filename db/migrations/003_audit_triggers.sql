-- 003_audit_triggers.sql
-- Immutable Audit Log and PostgreSQL Mutation Prevention Triggers

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  merchant_id VARCHAR(64) NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  actor VARCHAR(32) NOT NULL, -- MERCHANT | AI_COPILOT | SYSTEM | PAYPAL_WEBHOOK
  action VARCHAR(64) NOT NULL,
  details TEXT NOT NULL,
  amount_cents BIGINT,
  is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_merchant_time ON audit_logs(merchant_id, created_at DESC);

-- Trigger function enforcing append-only behavior: forbids UPDATE and DELETE
CREATE OR REPLACE FUNCTION prevent_audit_ledger_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Immutable financial table violation: UPDATE and DELETE operations are forbidden on %.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- Apply immutability trigger to audit_logs
DROP TRIGGER IF EXISTS trigger_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trigger_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_ledger_mutation();

-- Apply immutability trigger to ledger_entries
DROP TRIGGER IF EXISTS trigger_ledger_entries_immutable ON ledger_entries;
CREATE TRIGGER trigger_ledger_entries_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_ledger_mutation();

