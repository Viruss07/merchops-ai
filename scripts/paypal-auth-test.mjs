/**
 * PayPal Sandbox OAuth Authentication Test
 *
 * MANUAL / OPT-IN ONLY:
 * - Requires network access and real PayPal Sandbox credentials in the env.
 * - NOT part of `npm test` and never run by CI.
 * - Never initiates a payment or payout.
 *
 * Security Guardrails:
 * 1. Requires exact Sandbox Base URL: https://api-m.sandbox.paypal.com
 * 2. Reads credentials strictly from process.env.
 * 3. Zero leakage: never prints tokens, credentials, headers, error bodies, or raw responses.
 * 4. Does not write tokens or credentials to disk.
 * 5. Uses native Node.js built-ins only (fetch, Buffer).
 * 6. Sets a non-zero process.exitCode on any failure.
 */

const REQUIRED_SANDBOX_URL = 'https://api-m.sandbox.paypal.com';

function fail(message) {
  console.log('Authentication: FAILED');
  if (message) console.log(message);
  process.exitCode = 1;
}

async function runAuthTest() {
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
    // Verify presence of access_token without exposing its value
    if (data && typeof data.access_token === 'string' && data.access_token.length > 0) {
      console.log('Authentication: SUCCESS');
    } else {
      fail('Error: PayPal authentication response did not include an access token.');
    }
  } catch {
    fail('Error: Network or runtime failure.');
  }
}

runAuthTest();
