import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { derivePayoutRequestId } from '../src/lib/idempotency';
import { parsePayoutBatch } from '../src/lib/paypal';
import { POST as webhookPOST } from '../src/app/api/paypal/webhook/route';

test('idempotency: payout request id is deterministic per bill and action', () => {
  const first = derivePayoutRequestId('bill-cloud-02');
  const second = derivePayoutRequestId('bill-cloud-02');
  const other = derivePayoutRequestId('bill-acme-01');

  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.ok(first.length <= 108);
});

test('idempotency: unsafe characters are normalized, not passed through', () => {
  assert.equal(
    derivePayoutRequestId('bill/../x?y=z'),
    'merchops-payout-bill----x-y-z-v1',
  );
});

test('PayPal batch: accepted PENDING response is not a settlement', () => {
  const parsed = parsePayoutBatch({
    batch_header: { payout_batch_id: 'BATCH-1', batch_status: 'PENDING' },
    items: [{ transaction_status: 'PENDING' }],
  });

  assert.equal(parsed.batchId, 'BATCH-1');
  assert.equal(parsed.outcome, 'PENDING');
});

test('PayPal batch: only SUCCESS settles', () => {
  const parsed = parsePayoutBatch({
    batch_header: { payout_batch_id: 'BATCH-2', batch_status: 'SUCCESS' },
    items: [{ transaction_status: 'SUCCESS' }],
  });

  assert.equal(parsed.outcome, 'SUCCESS');
});

test('PayPal batch: item-level SUCCESS also settles', () => {
  const parsed = parsePayoutBatch({
    batch_header: { payout_batch_id: 'BATCH-3', batch_status: 'PENDING' },
    items: [{ transaction_status: 'SUCCESS' }],
  });

  assert.equal(parsed.outcome, 'SUCCESS');
});

test('PayPal batch: FAILED and DENIED are terminal failures', () => {
  assert.equal(
    parsePayoutBatch({
      batch_header: { payout_batch_id: 'BATCH-4', batch_status: 'DENIED' },
      items: [],
    }).outcome,
    'FAILED',
  );
  assert.equal(
    parsePayoutBatch({
      batch_header: { payout_batch_id: 'BATCH-5', batch_status: 'PENDING' },
      items: [{ transaction_status: 'FAILED' }],
    }).outcome,
    'FAILED',
  );
});

test('webhook: rejects when PAYPAL_WEBHOOK_ID is not configured', async () => {
  const previous = process.env.PAYPAL_WEBHOOK_ID;
  delete process.env.PAYPAL_WEBHOOK_ID;

  try {
    const request = new NextRequest('http://localhost/api/paypal/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED' }),
    });
    const response = await webhookPOST(request);
    assert.equal(response.status, 503);
  } finally {
    if (previous === undefined) delete process.env.PAYPAL_WEBHOOK_ID;
    else process.env.PAYPAL_WEBHOOK_ID = previous;
  }
});

test('webhook: rejects missing signature headers before verification', async () => {
  const previous = process.env.PAYPAL_WEBHOOK_ID;
  process.env.PAYPAL_WEBHOOK_ID = 'test-webhook-id';

  try {
    const request = new NextRequest('http://localhost/api/paypal/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED' }),
    });
    const response = await webhookPOST(request);
    assert.equal(response.status, 401);
  } finally {
    if (previous === undefined) delete process.env.PAYPAL_WEBHOOK_ID;
    else process.env.PAYPAL_WEBHOOK_ID = previous;
  }
});
