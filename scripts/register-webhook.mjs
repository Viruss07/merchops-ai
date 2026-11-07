#!/usr/bin/env node
/**
 * Idempotent PayPal Sandbox Webhook Registration
 *
 * Usage:
 *   node scripts/register-webhook.mjs <webhook-url>
 * Example:
 *   node scripts/register-webhook.mjs https://my-merchops.onrender.com/api/paypal/webhook
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

const TARGET_EVENTS = [
  'INVOICING.INVOICE.PAID',
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
  'PAYMENT.PAYOUTS-ITEM.FAILED',
  'PAYMENT.PAYOUTS-ITEM.UNCLAIMED',
  'PAYMENT.PAYOUTS-ITEM.RETURNED',
  'PAYMENT.PAYOUTS-ITEM.BLOCKED',
];

async function main() {
  const targetUrl = process.argv[2];
  if (!targetUrl || !targetUrl.startsWith('https://')) {
    console.error('Usage: node scripts/register-webhook.mjs <https-url>');
    console.error('Example: node scripts/register-webhook.mjs https://merchops.example.com/api/paypal/webhook');
    process.exit(1);
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[FAIL] Sandbox credentials not found in env.');
    process.exit(1);
  }

  const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  // Step 1: Token
  const tokenRes = await fetch(`${REQUIRED_SANDBOX_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenRes.ok) {
    console.error(`[FAIL] OAuth failed: HTTP ${tokenRes.status}`);
    process.exit(1);
  }
  const { access_token: token } = await tokenRes.json();

  // Step 2: List existing webhooks to ensure idempotency
  const listRes = await fetch(`${REQUIRED_SANDBOX_URL}/v1/notifications/webhooks`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (listRes.ok) {
    const listData = await listRes.json();
    const existing = (listData.webhooks || []).find((w) => w.url === targetUrl);
    if (existing) {
      console.log(`[PASS] Webhook already registered for URL: ${targetUrl}`);
      console.log(`[INFO] Webhook ID: ${existing.id}`);
      console.log('\nSet this in your .env.local:');
      console.log(`PAYPAL_WEBHOOK_ID=${existing.id}`);
      return;
    }
  }

  // Step 3: Register new webhook
  const eventTypes = TARGET_EVENTS.map((name) => ({ name }));
  const createRes = await fetch(`${REQUIRED_SANDBOX_URL}/v1/notifications/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      url: targetUrl,
      event_types: eventTypes,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error(`[FAIL] Registration rejected: HTTP ${createRes.status}\n${errText}`);
    process.exit(1);
  }

  const created = await createRes.json();
  console.log(`[PASS] Webhook registered successfully!`);
  console.log(`[INFO] Webhook ID: ${created.id}`);
  console.log(`[INFO] URL: ${created.url}`);
  console.log('\nAdd this to your environment / .env.local:');
  console.log(`PAYPAL_WEBHOOK_ID=${created.id}`);
}

main();

