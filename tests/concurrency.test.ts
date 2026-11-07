import test from 'node:test';
import assert from 'node:assert/strict';
import { demoStore } from '../src/lib/store';
import { derivePayoutRequestId } from '../src/lib/idempotency';

test.beforeEach(() => {
  demoStore.resetDemoData();
});

test('concurrency: 20 simultaneous payout authorization attempts result in exactly 1 approval', async () => {
  const billId = 'bill-cloud-02'; // $400.00 bill, safe with $4,200 cash and $2,000 reserve
  const key = derivePayoutRequestId(billId);

  // Fire 20 parallel authorization attempts with the same deterministic key
  const attempts = Array.from({ length: 20 }, () =>
    Promise.resolve(
      demoStore.beginPayout({
        billId,
        idempotencyKey: key,
        executionMode: 'SIMULATION',
      })
    )
  );

  const results = await Promise.all(attempts);

  const successes = results.filter((r) => r.ok === true);
  const duplicates = results.filter(
    (r) => !r.ok && (r.reason === 'DUPLICATE_REQUEST' || r.reason === 'APPROVAL_PENDING')
  );

  assert.equal(successes.length, 1, 'Exactly one concurrent authorization attempt must succeed');
  assert.equal(duplicates.length, 19, 'All 19 concurrent duplicates must be rejected');

  // Verify bill state remains APPROVED and only 1 outcome is mapped
  const bill = demoStore.getBills().find((b) => b.id === billId);
  assert.equal(bill?.status, 'APPROVED');

  const outcome = demoStore.getIdempotencyOutcome(key);
  assert.equal(outcome?.status, 'APPROVED');
});

test('health route: reports ok and system status', async () => {
  // Test health check route handler logic directly
  const { GET } = await import('../src/app/api/health/route');
  const res = await GET();
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.commit);
  assert.ok(data.db === 'memory' || data.db === 'up');
});

