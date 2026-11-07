import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePayoutFeeCents, evaluatePayoutPolicy } from '../src/lib/money';
import { demoStore } from '../src/lib/store';

test.beforeEach(() => {
  demoStore.resetDemoData();
});

test('fee calculation: US domestic payout fee minimum $0.25, maximum $1.00 (2%)', () => {
  // $1.00 payout = 100 cents -> 2% is $0.02, min applies: 25 cents ($0.25)
  assert.equal(calculatePayoutFeeCents(100), 25);

  // $10.00 payout = 1000 cents -> 2% is $0.20, min applies: 25 cents ($0.25)
  assert.equal(calculatePayoutFeeCents(1000), 25);

  // $20.00 payout = 2000 cents -> 2% is $0.40 = 40 cents
  assert.equal(calculatePayoutFeeCents(2000), 40);

  // $50.00 payout = 5000 cents -> 2% is $1.00 = 100 cents
  assert.equal(calculatePayoutFeeCents(5000), 100);

  // $400.00 payout = 40000 cents -> 2% is $8.00, cap applies: 100 cents ($1.00)
  assert.equal(calculatePayoutFeeCents(40000), 100);

  // $3000.00 payout = 300000 cents -> 2% is $60.00, cap applies: 100 cents ($1.00)
  assert.equal(calculatePayoutFeeCents(300000), 100);

  // Invalid / 0
  assert.equal(calculatePayoutFeeCents(0), 0);
  assert.equal(calculatePayoutFeeCents(-100), 0);
});

test('payoutPolicy: fee-inclusive check prevents breach caused by transaction fee', () => {
  // Current cash $2,501.00 (250100 cents), Reserve $2,000.00 (200000 cents)
  // Bill is $500.00 (50000 cents)
  // Without fee: post = 250100 - 50000 = 200100 >= 200000 (Safe, buffer $1.00)
  const noFee = evaluatePayoutPolicy({
    currentBalanceCents: 250100,
    minReserveCents: 200000,
    billAmountCents: 50000,
  });
  assert.equal(noFee.allowed, true);
  assert.equal(noFee.wouldBreach, false);
  assert.equal(noFee.bufferCents, 100);

  // With fee: $500 payout has $1.00 (100 cents) fee
  // Post = 250100 - 50000 - 100 = 200000 (Exactly hits reserve, allowed)
  const withFeeExact = evaluatePayoutPolicy({
    currentBalanceCents: 250100,
    minReserveCents: 200000,
    billAmountCents: 50000,
    feeCents: 100,
  });
  assert.equal(withFeeExact.allowed, true);
  assert.equal(withFeeExact.wouldBreach, false);
  assert.equal(withFeeExact.postPayoutBalanceCents, 200000);

  // If cash was $2,500.50 (250050 cents):
  // Post = 250050 - 50000 - 100 = 199950 < 200000 -> Breach by 50 cents!
  const withFeeBreach = evaluatePayoutPolicy({
    currentBalanceCents: 250050,
    minReserveCents: 200000,
    billAmountCents: 50000,
    feeCents: 100,
  });
  assert.equal(withFeeBreach.allowed, false);
  assert.equal(withFeeBreach.wouldBreach, true);
  assert.equal(withFeeBreach.deficitCents, 50);
});

test('store: attachPayPalInvoice links external invoice ID and payment URL', () => {
  const result = demoStore.attachPayPalInvoice('inv-apex-01', {
    paypalInvoiceId: 'INV2-TEST-1234',
    recipientViewUrl: 'https://www.sandbox.paypal.com/invoice/p/#TEST1234',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.invoice.paypalInvoiceId, 'INV2-TEST-1234');
    assert.equal(result.invoice.recipientViewUrl, 'https://www.sandbox.paypal.com/invoice/p/#TEST1234');
    assert.equal(result.invoice.paymentUrl, 'https://www.sandbox.paypal.com/invoice/p/#TEST1234');
  }

  const lookup = demoStore.getInvoiceByPayPalId('INV2-TEST-1234');
  assert.equal(lookup?.id, 'inv-apex-01');

  const logs = demoStore.getAuditLogs();
  assert.equal(logs[0].action, 'INVOICE_SYNCED_PAYPAL');
  assert.equal(logs[0].actor, 'SYSTEM');
});

test('store: payInvoice supports real PayPal webhook settlement and prevents duplicate credit', () => {
  const initialBalance = demoStore.getSnapshot().account.clearedBalanceCents; // $4,200.00
  const invoice = demoStore.getInvoice('inv-apex-01'); // $1,500.00
  assert.ok(invoice);

  // Settle via simulated webhook
  const payResult = demoStore.payInvoice('inv-apex-01', {
    actor: 'PAYPAL_WEBHOOK',
    isSimulated: false,
    action: 'INVOICE_PAID_PAYPAL',
    details: 'PayPal Webhook confirmed payment for INV-2026-089',
  });

  assert.equal(payResult.ok, true);
  if (payResult.ok) {
    assert.equal(payResult.invoice.status, 'PAID');
    assert.equal(payResult.snapshot.account.clearedBalanceCents, initialBalance + 150000);
  }

  // Attempt duplicate payment (replay webhook)
  const replayResult = demoStore.payInvoice('inv-apex-01', {
    actor: 'PAYPAL_WEBHOOK',
    isSimulated: false,
  });

  assert.equal(replayResult.ok, false);
  if (!replayResult.ok) {
    assert.equal(replayResult.reason, 'ALREADY_PAID');
  }

  // Balance must not change on duplicate
  assert.equal(demoStore.getSnapshot().account.clearedBalanceCents, initialBalance + 150000);
});

test('store: recordReminderSent with deliveredViaPayPal records live dispatch audit', () => {
  const result = demoStore.recordReminderSent(
    'inv-apex-01',
    'Action Required: Invoice Overdue',
    'Please settle your outstanding balance.',
    { deliveredViaPayPal: true }
  );

  assert.equal(result.ok, true);
  const logs = demoStore.getAuditLogs();
  assert.equal(logs[0].action, 'REMINDER_DISPATCHED_PAYPAL');
  assert.equal(logs[0].isSimulated, false);
});

