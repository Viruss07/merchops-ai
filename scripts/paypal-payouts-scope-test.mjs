/**
 * PayPal Sandbox Payouts Scope Test
 *
 * MANUAL / OPT-IN ONLY:
 * - Requires network access and real PayPal Sandbox credentials in the env.
 * - NOT part of `npm test` and never run by CI.
 * - Does NOT initiate or execute any payment or payout request.
 *
 * Purpose:
 * Checks whether the OAuth token granted by PayPal Sandbox includes the Payouts API permission.
 *
 * Security Guardrails:
 * 1. Requires exact Sandbox Base URL: https://api-m.sandbox.paypal.com
 * 2. Reads credentials strictly from process.env.
 * 3. Zero leakage: never prints tokens, credentials, headers, scope lists, or raw responses.
 * 4. Does not write tokens or credentials to disk.
 * 5. Uses native Node.js built-ins only (fetch, Buffer).
 * 6. Sets a non-zero process.exitCode on any failure.
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
const TARGET_PAYOUTS_SCOPE = 'https://uri.paypal.com/payments/payouts';

function fail(message) {
  console.log('OAuth authentication: FAILED');
  console.log('Payouts permission: NOT CONFIRMED');
  if (message) console.log(message);
  process.exitCode = 1;
}

async function runScopeTest() {
  const rawBaseUrl = process.env.PAYPAL_API_BASE_URL || REQUIRED_SANDBOX_URL;
  const normalizedBaseUrl = rawBaseUrl.trim().replace(/\/+$/, '');

  // Guard 1: Enforce exact sandbox endpoint before handling credentials
  if (normalizedBaseUrl !== REQUIRED_SANDBOX_URL) {
    fail(
      `Security Error: PAYPAL_API_BASE_URL must be exactly "${REQUIRED_SANDBOX_URL}". Request aborted.`
    );
    return;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  // Guard 2: Safe presence check without exposing partial values
  const missing = [];
  if (!clientId) missing.push('PAYPAL_CLIENT_ID');
  if (!clientSecret) missing.push('PAYPAL_CLIENT_SECRET');

  if (missing.length > 0) {
    fail(`Error: Missing required environment variable(s): ${missing.join(', ')}`);
    return;
  }

  const endpoint = `${REQUIRED_SANDBOX_URL}/v1/oauth2/token`;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });

    console.log(`HTTP Status: ${response.status}`);

    if (!response.ok) {
      fail('Error: PayPal authentication request was rejected.');
      return;
    }

    const data = await response.json().catch(() => ({}));

    if (!data || typeof data.access_token !== 'string' || data.access_token.length === 0) {
      fail('Error: PayPal authentication response did not include an access token.');
      return;
    }

    console.log('OAuth authentication: SUCCESS');

    const scopeString = typeof data.scope === 'string' ? data.scope : '';
    const scopes = scopeString.split(/\s+/).filter(Boolean);

    if (scopes.includes(TARGET_PAYOUTS_SCOPE)) {
      console.log('Payouts permission: PRESENT');
    } else {
      console.log('Payouts permission: NOT FOUND');
      process.exitCode = 1;
    }
  } catch {
    fail('Error: Network or runtime failure.');
  }
}

runScopeTest();
