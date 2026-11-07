-- 002_webhook_events.sql
-- Idempotent PayPal Webhook Deduplication and Processing Log

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id VARCHAR(128) PRIMARY KEY,
  event_type VARCHAR(128) NOT NULL,
  resource_type VARCHAR(64),
  summary TEXT,
  payload JSONB NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_type ON webhook_events(event_type);

