/**
 * End-to-end runtime test for Payouts API Guardrails
 */
const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3005';

async function runTests() {
  console.log(`[E2E] Testing MerchOps AI Payouts API at ${BASE_URL}...`);

  // 1. Reset state
  const resetRes = await fetch(`${BASE_URL}/api/reset`, { method: 'POST' });
  const resetText = await resetRes.text();
  let resetData;
  try {
    resetData = JSON.parse(resetText);
  } catch (e) {
    console.error(`[E2E ERROR] Failed to parse JSON. Status: ${resetRes.status}, Body: ${resetText}`);
    throw e;
  }
  console.log(`[E2E] 1. Reset state: HTTP ${resetRes.status} -> ${resetData.message}`);

  // 2. Attempt payout without merchant confirmation
  const idemp1 = 'test-idemp-001';
  const unconfirmedRes = await fetch(`${BASE_URL}/api/payouts/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      billId: 'bill-acme-01',
      confirmed: false,
      idempotencyKey: idemp1,
    }),
  });
  const unconfirmedData = await unconfirmedRes.json();
  console.log(`[E2E] 2. Unconfirmed payout: HTTP ${unconfirmedRes.status} (${unconfirmedData.error}) -> "${unconfirmedData.message}"`);
  if (unconfirmedRes.status !== 400 || unconfirmedData.error !== 'MERCHANT_APPROVAL_REQUIRED') {
    throw new Error('Test 2 failed: expected HTTP 400 MERCHANT_APPROVAL_REQUIRED');
  }

  // 3. Attempt payout with confirmation, but while cash is $4,200 (breaches $2,000 reserve by $800)
  const idemp2 = 'test-idemp-002';
  const breachRes = await fetch(`${BASE_URL}/api/payouts/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      billId: 'bill-acme-01',
      confirmed: true,
      idempotencyKey: idemp2,
      executionMode: 'SIMULATION',
    }),
  });
  const breachData = await breachRes.json();
  console.log(`[E2E] 3. Breaching payout ($3,000 bill on $4,200 balance): HTTP ${breachRes.status} (${breachData.error}) -> "${breachData.message}"`);
  if (breachRes.status !== 403 || breachData.error !== 'RESERVE_BREACH_BLOCKED') {
    throw new Error('Test 3 failed: expected HTTP 403 RESERVE_BREACH_BLOCKED');
  }
  if (breachData.deficitCents !== 80000 || breachData.postPayoutBalanceCents !== 120000) {
    throw new Error(`Test 3 failed: unexpected math: deficit=${breachData.deficitCents}, postBalance=${breachData.postPayoutBalanceCents}`);
  }

  // 4. Resolve shortfall by collecting Apex Corp ($1,500)
  const collectRes = await fetch(`${BASE_URL}/api/invoices/simulate-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId: 'inv-apex-01' }),
  });
  const collectData = await collectRes.json();
  console.log(`[E2E] 4. Collect Apex Corp ($1,500): HTTP ${collectRes.status} -> Cleared balance: $${(collectData.account.clearedBalanceCents / 100).toFixed(2)}`);
  if (collectData.account.clearedBalanceCents !== 570000) {
    throw new Error(`Test 4 failed: expected balance 570000, got ${collectData.account.clearedBalanceCents}`);
  }

  // 5. Authorize payout now that cash is $5,700 (leaves $2,700, +$700 buffer over $2,000 reserve)
  const idemp3 = 'test-idemp-003';
  const authRes = await fetch(`${BASE_URL}/api/payouts/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      billId: 'bill-acme-01',
      confirmed: true,
      idempotencyKey: idemp3,
      executionMode: 'SIMULATION',
    }),
  });
  const authData = await authRes.json();
  console.log(`[E2E] 5. Authorize payout on $5,700 balance: HTTP ${authRes.status} -> "${authData.message}"`);
  if (authRes.status !== 200 || !authData.success) {
    throw new Error(`Test 5 failed: expected HTTP 200 success, got ${authRes.status} ${JSON.stringify(authData)}`);
  }

  // 6. Test Idempotency enforcement: replay attempt with same key idemp3
  const replayRes = await fetch(`${BASE_URL}/api/payouts/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      billId: 'bill-acme-01',
      confirmed: true,
      idempotencyKey: idemp3,
      executionMode: 'SIMULATION',
    }),
  });
  const replayData = await replayRes.json();
  console.log(`[E2E] 6. Replay with identical key ("${idemp3}"): HTTP ${replayRes.status} (${replayData.error}) -> "${replayData.message}"`);
  if (replayRes.status !== 409 || replayData.error !== 'DUPLICATE_REQUEST') {
    throw new Error('Test 6 failed: expected HTTP 409 DUPLICATE_REQUEST');
  }

  // 7. Reset state to clean baseline
  await fetch(`${BASE_URL}/api/reset`, { method: 'POST' });
  console.log('[E2E] 7. State cleanly reset to initial baseline.');
  console.log('[E2E] ALL PAYOUT GUARDRAIL INTEGRATION TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('[E2E ERROR]', err);
  process.exit(1);
});
