-- 004_ai_proposals.sql
-- AI Proposal Cache & Operational Rate Limits

CREATE TABLE IF NOT EXISTS ai_proposals (
  id VARCHAR(64) PRIMARY KEY,
  merchant_id VARCHAR(64) NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  prompt_hash VARCHAR(128) NOT NULL,
  model VARCHAR(128) NOT NULL,
  proposal_json JSONB NOT NULL,
  validation_status VARCHAR(32) NOT NULL DEFAULT 'VALIDATED', -- VALIDATED | REJECTED | PENDING
  validation_errors JSONB,
  decided_by VARCHAR(32), -- MERCHANT | SYSTEM | EXPIRED
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_hash ON ai_proposals(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_proposals_merchant ON ai_proposals(merchant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  key VARCHAR(128) PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL
);

