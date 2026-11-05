import test from 'node:test';
import assert from 'node:assert/strict';
import { demoStore } from '../src/lib/store';

test.beforeEach(() => {
  demoStore.resetDemoData();
});

test('store: payInvoice twice -> ALREADY_PAID', () => {
  const result1 = demoStore.payInvoice('inv-apex-01');
  assert.equal(result1.ok, true);

  const result2 = demoStore.payInvoice('inv-apex-01');
  assert.equal(result2.ok, false);
  if (!result2.ok) {
    assert.equal(result2.reason, 'ALREADY_PAID');
  }
});

test('store: beginPayout approves and reserves, then second begin with same key -> DUPLICATE_REQUEST', () => {
  const result1 = demoStore.beginPayout({ billId: 'bill-cloud-02', idempotencyKey: 'key1' });
  assert.equal(result1.ok, true);
  if (result1.ok) {
    assert.equal(result1.bill.status, 'APPROVED');
  }

  const result2 = demoStore.beginPayout({ billId: 'bill-cloud-02', idempotencyKey: 'key1' });
  assert.equal(result2.ok, false);
  if (!result2.ok) {
    assert.equal(result2.reason, 'DUPLICATE_REQUEST');
    assert.equal(result2.outcome?.status, 'APPROVED');
  }
});

test('store: a second begin on the same approved bill with a different key -> APPROVAL_PENDING', () => {
  const result1 = demoStore.beginPayout({ billId: 'bill-cloud-02', idempotencyKey: 'key1' });
  assert.equal(result1.ok, true);

  const result2 = demoStore.beginPayout({ billId: 'bill-cloud-02', idempotencyKey: 'key2' });
  assert.equal(result2.ok, false);
  if (!result2.ok) {
    assert.equal(result2.reason, 'APPROVAL_PENDING');
  }
});

test('store: RESERVE_BREACH does not leave the bill IN_FLIGHT', () => {
  // Acme bill is $3000, balance is $4200, reserve $2000
  // Post payout would be $1200 < $2000, so breach
  const result = demoStore.beginPayout({ billId: 'bill-acme-01', idempotencyKey: 'key1' });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'RESERVE_BREACH');
  }

  const bill = demoStore.getBills().find(b => b.id === 'bill-acme-01');
  assert.equal(bill?.status, 'PENDING');
});

test('store: in-flight payouts are reserved so concurrent authorizations cannot jointly breach', () => {
  const paid = demoStore.payInvoice('inv-beacon-02'); // +$850 -> $5,050
  assert.equal(paid.ok, true);

  const first = demoStore.beginPayout({ billId: 'bill-acme-01', idempotencyKey: 'key1' }); // $3,000 -> $2,050 left
  assert.equal(first.ok, true);

  const second = demoStore.beginPayout({ billId: 'bill-cloud-02', idempotencyKey: 'key2' }); // would leave $1,650
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.equal(second.reason, 'RESERVE_BREACH');
    assert.equal(second.deficitCents, 35000);
  }
});

test('store: completePayout marks DISBURSED, debits balance once, stores SUCCEEDED outcome', () => {
  const snapshot = demoStore.getSnapshot();
  const balanceBefore = snapshot.account.clearedBalanceCents;

  demoStore.beginPayout({ billId: 'bill-cloud-02', idempotencyKey: 'key1' }); // $400, balance $4200, reserve $2000, post is $3800, OK
  demoStore.markPayoutInFlight({ billId: 'bill-cloud-02', idempotencyKey: 'key1' });
  const result = demoStore.completePayout({ billId: 'bill-cloud-02', idempotencyKey: 'key1', isRealPayPal: false, response: { id: '123' } });

  assert.equal(result.account.clearedBalanceCents, balanceBefore - 40000);
  const bill = result.bills.find(b => b.id === 'bill-cloud-02');
  assert.equal(bill?.status, 'DISBURSED');

  const outcome = demoStore.getIdempotencyOutcome('key1');
  assert.equal(outcome?.status, 'SUCCEEDED');

  // Duplicate webhook/retry must not debit twice.
  const replay = demoStore.completePayout({ billId: 'bill-cloud-02', idempotencyKey: 'key1', isRealPayPal: false, response: { id: '123' } });
  assert.equal(replay.account.clearedBalanceCents, balanceBefore - 40000);
});

test('store: accepted-but-pending does not debit; failPayout marks FAILED without balance change', () => {
  const balanceBefore = demoStore.getSnapshot().account.clearedBalanceCents;
  demoStore.beginPayout({ billId: 'bill-cloud-02', idempotencyKey: 'key1' });
  demoStore.markPayoutInFlight({ billId: 'bill-cloud-02', idempotencyKey: 'key1' });
  demoStore.markPayoutAccepted({
    billId: 'bill-cloud-02',
    idempotencyKey: 'key1',
    batchId: 'BATCH-123',
    paypalStatus: 'PENDING',
    response: { batch_header: { payout_batch_id: 'BATCH-123' } },
  });

  const pending = demoStore.getSnapshot();
  assert.equal(pending.account.clearedBalanceCents, balanceBefore);
  assert.equal(pending.bills.find(b => b.id === 'bill-cloud-02')?.status, 'IN_FLIGHT');
  assert.equal(demoStore.getPayoutRequestByBatchId('BATCH-123')?.status, 'IN_FLIGHT');

  const result = demoStore.failPayout({ billId: 'bill-cloud-02', idempotencyKey: 'key1', code: 'ERR', message: 'failed' });

  const bill = result.bills.find(b => b.id === 'bill-cloud-02');
  assert.equal(bill?.status, 'FAILED');
  assert.equal(result.account.clearedBalanceCents, balanceBefore);

  const outcome = demoStore.getIdempotencyOutcome('key1');
  assert.equal(outcome?.status, 'FAILED');
  if (outcome?.status === 'FAILED') {
    assert.equal(outcome.code, 'ERR');
  }
});

test('store: unknown outcome stays IN_FLIGHT and cannot be retried', () => {
  demoStore.beginPayout({ billId: 'bill-cloud-02', idempotencyKey: 'key1' });
  demoStore.markPayoutInFlight({ billId: 'bill-cloud-02', idempotencyKey: 'key1' });
  const result = demoStore.markPayoutUnknown({
    billId: 'bill-cloud-02',
    idempotencyKey: 'key1',
    code: 'PAYPAL_OUTCOME_UNKNOWN',
    message: 'timeout',
  });

  const bill = result.bills.find(b => b.id === 'bill-cloud-02');
  assert.equal(bill?.status, 'IN_FLIGHT');
  assert.equal(demoStore.getIdempotencyOutcome('key1')?.status, 'IN_FLIGHT');

  const retry = demoStore.beginPayout({ billId: 'bill-cloud-02', idempotencyKey: 'key1' });
  assert.equal(retry.ok, false);
  if (!retry.ok) assert.equal(retry.reason, 'DUPLICATE_REQUEST');
});

test('store: resetDemoData restores balance $4,200 and clears outcomes', () => {
  demoStore.payInvoice('inv-apex-01');
  demoStore.beginPayout({ billId: 'bill-cloud-02', idempotencyKey: 'key1' });

  const result = demoStore.resetDemoData();
  assert.equal(result.account.clearedBalanceCents, 420000);

  const outcome = demoStore.getIdempotencyOutcome('key1');
  assert.equal(outcome, undefined);
});

test('audit IDs are unique (randomUUID), simulated invoice actor is MERCHANT', () => {
  const result1 = demoStore.payInvoice('inv-apex-01');
  const result2 = demoStore.payInvoice('inv-beacon-02');
  assert.equal(result1.ok, true);
  assert.equal(result2.ok, true);

  const audit1 = demoStore.getAuditLogs().find(a => a.action === 'INVOICE_PAID_SIMULATED');
  assert.equal(audit1?.actor, 'MERCHANT');
  assert.equal(audit1?.isSimulated, true);

  // Check IDs are unique
  const ids = demoStore.getAuditLogs().map(a => a.id);
  const uniqueIds = new Set(ids);
  assert.equal(ids.length, uniqueIds.size);
});
