#!/usr/bin/env node
/**
 * PayPal Sandbox Readiness & Endpoint Diagnostic
 *
 * Usage:
 *   node scripts/sandbox-check.mjs
 *   node scripts/sandbox-check.mjs --deep
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const REQUIRED_SANDBOX_URL = 'https://api-m.sandbox.paypal.com';
const isDeep = process.argv.includes('--deep');

async function main() {
  const baseUrl = (process.env.PAYPAL_API_BASE_URL || REQUIRED_SANDBOX_URL).trim().replace(/\/+$/, '');
  if (baseUrl !== REQUIRED_SANDBOX_URL) {
    console.error(`[FAIL] PAYPAL_API_BASE_URL must be strictly "${REQUIRED_SANDBOX_URL}"`);
    process.exit(1);
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId.startsWith('your_') || clientSecret.startsWith('your_')) {
    console.error('[FAIL] Sandbox credentials not found in env.');
    process.exit(1);
  }

  console.log(`=== PayPal Sandbox Diagnostic (${isDeep ? 'Deep' : 'Standard'}) ===`);
  const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  // Step 1: Token
  let token = '';
  let scopes = [];
  try {
    const res = await fetch(`${REQUIRED_SANDBOX_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      console.error(`[FAIL] OAuth request rejected: HTTP ${res.status}`);
      process.exit(1);
    }
    const data = await res.json();
    token = data.access_token;
    scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/) : [];
    console.log('[PASS] 1. OAuth Authentication: OK');
  } catch (err) {
    console.error(`[FAIL] OAuth connection error: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Payouts scope
  const hasPayouts = scopes.some((s) => s.includes('payouts'));
  console.log(`[${hasPayouts ? 'PASS' : 'WARN'}] 2. Payouts Scope: ${hasPayouts ? 'Confirmed' : 'Not found in token scope'}`);

  // Step 3: Invoicing v2 reachability
  try {
    const res = await fetch(`${REQUIRED_SANDBOX_URL}/v2/invoicing/invoices?page=1&page_size=1&total_required=true`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    if (res.ok) {
      const data = await res.json();
      const count = data.total_invoices ?? (data.items ? data.items.length : 0);
      console.log(`[PASS] 3. Invoicing v2 API: Reachable (Existing invoices: ${count})`);
      if (isDeep && data.items && data.items.length > 0) {
        console.log(`  Latest Invoice ID: ${data.items[0].id} (Status: ${data.items[0].status})`);
      }
    } else {
      console.log(`[WARN] 3. Invoicing v2 returned HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`[FAIL] 3. Invoicing v2 error: ${err.message}`);
  }

  // Step 4: Webhooks endpoint & configuration
  const configuredWebhookId = process.env.PAYPAL_WEBHOOK_ID;
  try {
    const res = await fetch(`${REQUIRED_SANDBOX_URL}/v1/notifications/webhooks`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    if (res.ok) {
      const data = await res.json();
      const webhooks = data.webhooks || [];
      console.log(`[PASS] 4. Webhook API: Reachable (${webhooks.length} webhooks registered)`);
      if (configuredWebhookId) {
        const found = webhooks.find((w) => w.id === configuredWebhookId);
        if (found) {
          console.log(`  Configured PAYPAL_WEBHOOK_ID (${configuredWebhookId}): ACTIVE (URL: ${found.url})`);
        } else {
          console.log(`  Configured PAYPAL_WEBHOOK_ID (${configuredWebhookId}): NOT FOUND in sandbox account`);
        }
      } else {
        console.log('  PAYPAL_WEBHOOK_ID: Not configured in env (use scripts/register-webhook.mjs)');
      }
    } else {
      console.log(`[WARN] 4. Webhook list returned HTTP ${res.status}`);
    }
  } catch (err) {
    console.log(`[FAIL] 4. Webhook check error: ${err.message}`);
  }

  console.log('=== Diagnostic Complete ===');
}

main();

