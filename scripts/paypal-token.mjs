#!/usr/bin/env node
/**
 * PayPal Sandbox OAuth Token & Scopes Diagnostic
 *
 * Checks credentials, tests OAuth token issuance, and lists granted scopes.
 *
 * Security Guardrails:
 * - Origin locked to https://api-m.sandbox.paypal.com
 * - Never prints tokens, secrets, or raw credentials
 * - Exits non-zero on failure
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Helper to load env safely if not already loaded
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

const REQUIRED_SANDBOX_URL = 'https://api-m.sandbox.paypal.com';

async function main() {
  const baseUrl = (process.env.PAYPAL_API_BASE_URL || REQUIRED_SANDBOX_URL).trim().replace(/\/+$/, '');
  if (baseUrl !== REQUIRED_SANDBOX_URL) {
    console.error(`[FAIL] PAYPAL_API_BASE_URL must be strictly "${REQUIRED_SANDBOX_URL}"`);
    process.exit(1);
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId.startsWith('your_') || clientSecret.startsWith('your_')) {
    console.error('[FAIL] PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET missing or placeholder in environment.');
    process.exit(1);
  }

  console.log(`[INFO] Connecting to PayPal Sandbox: ${REQUIRED_SANDBOX_URL}`);
  const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const start = Date.now();
    const res = await fetch(`${REQUIRED_SANDBOX_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });
    const elapsed = Date.now() - start;

    if (!res.ok) {
      console.error(`[FAIL] OAuth rejected with status HTTP ${res.status} (${elapsed}ms)`);
      process.exit(1);
    }

    const data = await res.json();
    if (!data.access_token) {
      console.error('[FAIL] OAuth response did not contain access_token');
      process.exit(1);
    }

    console.log(`[PASS] OAuth Token granted successfully (${elapsed}ms)`);
    console.log(`[INFO] Token Type: ${data.token_type}`);
    console.log(`[INFO] Expires In: ${data.expires_in}s`);

    const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/) : [];
    console.log(`[INFO] Granted Scopes (${scopes.length}):`);
    const keyScopes = [
      { name: 'Invoicing', uri: 'https://uri.paypal.com/services/invoicing' },
      { name: 'Payouts', uri: 'https://uri.paypal.com/payments/payouts' },
      { name: 'Payments', uri: 'https://uri.paypal.com/services/payments/realtimepayment' },
      { name: 'Webhooks', uri: 'https://uri.paypal.com/services/notifications/webhooks' },
    ];

    for (const item of keyScopes) {
      const hasScope = scopes.some((s) => s === item.uri || s.includes(item.name.toLowerCase()));
      console.log(`  - ${item.name}: ${hasScope ? 'GRANTED' : 'NOT FOUND IN TOKEN'}`);
    }
  } catch (err) {
    console.error(`[FAIL] Network or execution error: ${err.message}`);
    process.exit(1);
  }
}

main();

