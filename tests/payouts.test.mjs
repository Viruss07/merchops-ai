import test from 'node:test';
import assert from 'node:assert/strict';

// Pure integer math helpers
function addCents(a, b) {
  return Math.round(a) + Math.round(b);
}

function subtractCents(a, b) {
  return Math.round(a) - Math.round(b);
}

function evaluatePayoutPolicy({ currentBalanceCents, minReserveCents, billAmountCents }) {
  const postPayoutBalanceCents = subtractCents(currentBalanceCents, billAmountCents);
  const wouldBreach = postPayoutBalanceCents < minReserveCents;
  const deficitCents = wouldBreach ? subtractCents(minReserveCents, postPayoutBalanceCents) : 0;
  const bufferCents = !wouldBreach ? subtractCents(postPayoutBalanceCents, minReserveCents) : 0;

  return {
    allowed: !wouldBreach,
    currentBalanceCents,
    billAmountCents,
    postPayoutBalanceCents,
    minReserveCents,
    wouldBreach,
    deficitCents,
    bufferCents,
  };
}

test('Payout Policy: Acme Supplies ($3,000) is blocked when balance is $4,200 (deficit $800)', () => {
  const result = evaluatePayoutPolicy({
    currentBalanceCents: 420000, // $4,200.00
    minReserveCents: 200000,     // $2,000.00
    billAmountCents: 300000,     // $3,000.00
  });

  assert.equal(result.allowed, false, 'Payout should be blocked');
  assert.equal(result.wouldBreach, true);
  assert.equal(result.postPayoutBalanceCents, 120000, 'Projected balance should be $1,200.00');
  assert.equal(result.deficitCents, 80000, 'Reserve breach deficit should be exact $800.00 (80000 cents)');
  assert.equal(result.bufferCents, 0);
});

test('Payout Policy: Collecting Apex Corp ($1,500) unlocks Acme Supplies ($3,000) with $700 buffer', () => {
  const openingBalance = 420000;
  const collectedInvoice = 150000;
  const replenishedBalance = addCents(openingBalance, collectedInvoice); // $5,700.00

  assert.equal(replenishedBalance, 570000, 'Balance after Apex collection must be $5,700.00');

  const result = evaluatePayoutPolicy({
    currentBalanceCents: replenishedBalance,
    minReserveCents: 200000, // $2,000.00
    billAmountCents: 300000, // $3,000.00
  });

  assert.equal(result.allowed, true, 'Payout must be allowed when reserve is protected');
  assert.equal(result.wouldBreach, false);
  assert.equal(result.postPayoutBalanceCents, 270000, 'Projected balance should be $2,700.00 (270000 cents)');
  assert.equal(result.deficitCents, 0);
  assert.equal(result.bufferCents, 70000, 'Safety buffer above reserve floor must be $700.00 (70000 cents)');
});

test('Human Authorization & Idempotency Key Guards', () => {
  // Simulate mock store for idempotency tracking
  const idempotencyStore = new Set();

  function processPayoutAttempt({ billId, confirmed, idempotencyKey, currentBalanceCents, reserveCents, billAmountCents }) {
    if (!confirmed) {
      return { status: 400, error: 'MERCHANT_APPROVAL_REQUIRED' };
    }
    if (idempotencyStore.has(idempotencyKey)) {
      return { status: 409, error: 'DUPLICATE_REQUEST' };
    }
    const postBalance = currentBalanceCents - billAmountCents;
    if (postBalance < reserveCents) {
      return { status: 403, error: 'RESERVE_BREACH_BLOCKED' };
    }
    idempotencyStore.add(idempotencyKey);
    return { status: 200, success: true, newBalanceCents: postBalance };
  }

  // 1. Unconfirmed attempt rejected
  const unconfirmed = processPayoutAttempt({
    billId: 'bill-acme-01',
    confirmed: false,
    idempotencyKey: 'key-101',
    currentBalanceCents: 570000,
    reserveCents: 200000,
    billAmountCents: 300000,
  });
  assert.equal(unconfirmed.status, 400);
  assert.equal(unconfirmed.error, 'MERCHANT_APPROVAL_REQUIRED');

  // 2. Reserve breach attempt rejected
  const breached = processPayoutAttempt({
    billId: 'bill-acme-01',
    confirmed: true,
    idempotencyKey: 'key-102',
    currentBalanceCents: 420000, // insufficient
    reserveCents: 200000,
    billAmountCents: 300000,
  });
  assert.equal(breached.status, 403);
  assert.equal(breached.error, 'RESERVE_BREACH_BLOCKED');

  // 3. Valid payout succeeds
  const valid = processPayoutAttempt({
    billId: 'bill-acme-01',
    confirmed: true,
    idempotencyKey: 'key-103',
    currentBalanceCents: 570000,
    reserveCents: 200000,
    billAmountCents: 300000,
  });
  assert.equal(valid.status, 200);
  assert.equal(valid.newBalanceCents, 270000);

  // 4. Replay attack with same idempotency key is rejected
  const replay = processPayoutAttempt({
    billId: 'bill-acme-01',
    confirmed: true,
    idempotencyKey: 'key-103', // Reused key
    currentBalanceCents: 270000,
    reserveCents: 200000,
    billAmountCents: 300000,
  });
  assert.equal(replay.status, 409);
  assert.equal(replay.error, 'DUPLICATE_REQUEST');
});

