#!/usr/bin/env node
/**
 * PostgreSQL Database Migration Runner & Demo Seeder
 *
 * Runs all SQL files in db/migrations/ in order inside transactions.
 * Seeds initial demo accounts and baseline records if empty.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.join(repoRoot, '.env.local'));
loadEnvFile(path.join(repoRoot, '.env'));

const { Pool } = pg;

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === '') {
    console.log('[INFO] DATABASE_URL is not set. MerchOps AI will run with in-memory persistence.');
    return;
  }

  console.log('[INFO] Connecting to PostgreSQL database...');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    // 1. Ensure migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Discover migration files
    const migrationsDir = path.join(repoRoot, 'db', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      const res = await client.query('SELECT version FROM schema_migrations WHERE version = $1', [file]);
      if (res.rows.length === 0) {
        console.log(`[INFO] Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`[PASS] Migration applied: ${file}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[FAIL] Migration error in ${file}: ${err.message}`);
          throw err;
        }
      } else {
        console.log(`[SKIP] Already applied: ${file}`);
      }
    }

    // 3. Seed initial demo dataset if empty
    const countRes = await client.query('SELECT COUNT(*) as count FROM merchants');
    const count = parseInt(countRes.rows[0].count, 10);

    if (count === 0) {
      console.log('[INFO] Seeding initial MerchOps demo merchant and accounts...');
      await client.query('BEGIN');
      try {
        // Merchant
        await client.query(
          `INSERT INTO merchants (id, business_name, currency, min_reserve_cents)
           VALUES ('merchant-001', 'MerchOps Specialty Retail', 'USD', 200000)`
        );

        // Opening Ledger Entry: $4,200.00
        await client.query(
          `INSERT INTO ledger_entries (id, merchant_id, entry_type, amount_cents, reference_type, description)
           VALUES ('ledger-init-001', 'merchant-001', 'OPENING_BALANCE', 420000, 'ACCOUNT', 'Opening working capital balance')`
        );

        // Invoices
        await client.query(
          `INSERT INTO invoices (id, merchant_id, invoice_number, customer_name, customer_email, amount_cents, due_date, days_overdue, status, description, payment_url)
           VALUES
           ('inv-apex-01', 'merchant-001', 'INV-2026-089', 'Apex Corp', 'billing@apexcorp.test', 150000, '2026-10-22', 12, 'OVERDUE', 'Q3 Custom Inventory & Packaging Supply', 'https://sandbox.paypal.com/checkout/simulate/inv-apex-01'),
           ('inv-beacon-02', 'merchant-001', 'INV-2026-092', 'Beacon Studios', 'accounts@beaconstudios.test', 85000, '2026-11-15', 0, 'CURRENT', 'Retail Merchandising Display Kit', NULL)`
        );

        // Bills
        await client.query(
          `INSERT INTO bills (id, merchant_id, bill_number, vendor_name, vendor_email, amount_cents, due_date, days_until_due, status, description, category)
           VALUES
           ('bill-acme-01', 'merchant-001', 'BILL-SUP-401', 'Acme Supplies', 'receivables@acmesupplies.test', 300000, '2026-11-13', 10, 'PENDING', 'Bulk raw inventory shipment (Batch #849)', 'Supplier / Inventory'),
           ('bill-cloud-02', 'merchant-001', 'BILL-OPS-104', 'Nexus Cloud Services', 'billing@nexuscloud.test', 40000, '2026-11-20', 17, 'PENDING', 'Monthly ecommerce server infrastructure', 'Operations')`
        );

        // Audit Log
        await client.query(
          `INSERT INTO audit_logs (id, merchant_id, actor, action, details, amount_cents, is_simulated)
           VALUES ('audit-001', 'merchant-001', 'SYSTEM', 'SYSTEM_INITIALIZED', 'MerchOps AI PostgreSQL ledger initialized with opening balance $4,200.00 and reserve $2,000.00.', 420000, false)`
        );

        await client.query('COMMIT');
        console.log('[PASS] Demo dataset successfully seeded in PostgreSQL.');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[FAIL] Seed error: ${err.message}`);
        throw err;
      }
    }

    console.log('[PASS] Database is up to date.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('[FATAL] Migration failed:', err);
  process.exit(1);
});

