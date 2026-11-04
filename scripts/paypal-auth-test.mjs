/**
 * Temporary PayPal Sandbox OAuth Authentication Test
 * 
 * Security Guardrails:
 * 1. Requires exact Sandbox Base URL: https://api-m.sandbox.paypal.com
 * 2. Reads credentials strictly from process.env.
 * 3. Zero leakage: Never prints tokens, credentials, headers, error_description, or raw responses.
 * 4. Does not write tokens or credentials to disk.
 * 5. Uses native Node.js built-ins only (fetch, Buffer).
 */

const REQUIRED_SANDBOX_URL = 'https://api-m.sandbox.paypal.com';

async function runAuthTest() {
  const rawBaseUrl = process.env.PAYPAL_API_BASE_URL || REQUIRED_SANDBOX_URL;
  const normalizedBaseUrl = rawBaseUrl.trim().replace(/\/+$/, '');

  // Guard 1: Enforce exact sandbox endpoint before handling credentials
  if (normalizedBaseUrl !== REQUIRED_SANDBOX_URL) {
    console.log('Authentication: FAILED');
    console.log(`Security Error: PAYPAL_API_BASE_URL must be exactly "${REQUIRED_SANDBOX_URL}". Request aborted.`);
    process.exit(1);
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  // Guard 2: Safe presence check without exposing partial values
  const missing = [];
  if (!clientId) missing.push('PAYPAL_CLIENT_ID');
  if (!clientSecret) missing.push('PAYPAL_CLIENT_SECRET');

  if (missing.length > 0) {
    console.log('Authentication: FAILED');
    console.log(`Error: Missing required environment variable(s): ${missing.join(', ')}`);
    process.exit(1);
  }

  const endpoint = `${REQUIRED_SANDBOX_URL}/v1/oauth2/token`;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials'
    });

    console.log(`HTTP Status: ${response.status}`);

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      // Verify presence of access_token without exposing its value
      if (data && typeof data.access_token === 'string' && data.access_token.length > 0) {
        console.log('Authentication: SUCCESS');
      } else {
        console.log('Authentication: FAILED');
        console.log('Error: PayPal authentication request was rejected.');
      }
    } else {
      console.log('Authentication: FAILED');
      console.log('Error: PayPal authentication request was rejected.');
    }
  } catch {
    console.log('Authentication: FAILED');
    console.log('Error: Network or runtime failure.');
  }
}

runAuthTest();
