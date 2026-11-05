import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseUSDToCents,
  isValidCents,
  centsToPayPalAmount,
  evaluatePayoutPolicy as evaluatePayoutPolicyFromMoney,
} from '../src/lib/money';
import { evaluatePayoutPolicy, evaluatePayoutSchedule } from '../src/lib/payoutPolicy';
import { demoStore } from '../src/lib/store';

test.beforeEach(() => {
  demoStore.resetDemoData();
});

test('money: evaluatePayoutPolicy is available from the public money module', () => {
  const result = evaluatePayoutPolicyFromMoney({
    currentBalanceCents: 355000,
    minReserveCents: 200000,
    billAmountCents: 40000,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.bufferCents, 115000);
});

test('money: strict parse', () => {
  assert.equal(parseUSDToCents('$1,500.00'), 150000);
  assert.equal(parseUSDToCents('1.234,56'), null); // European format
  assert.equal(parseUSDToCents('(1,500.00)'), null);
  assert.equal(parseUSDToCents('1.005'), null); // 3 decimals must be null
  assert.equal(parseUSDToCents('abc'), null);
});

test('money: isValidCents', () => {
  assert.equal(isValidCents(100), true);
  assert.equal(isValidCents(0), true);
  assert.equal(isValidCents(-5), false);
  assert.equal(isValidCents(1.5), false);
  assert.equal(isValidCents('100'), false);
  assert.equal(isValidCents(null), false);
});

test('money: centsToPayPalAmount', () => {
  assert.equal(centsToPayPalAmount(150000), '1500.00');
  assert.equal(centsToPayPalAmount(5), '0.05');
});

test('payoutPolicy: $400 bill from $3,550 cash is safe with $1,150 above reserve', () => {
  const result = evaluatePayoutPolicy({
    currentBalanceCents: 355000,
    minReserveCents: 200000,
    billAmountCents: 40000,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.wouldBreach, false);
  assert.equal(result.postPayoutBalanceCents, 315000);
  assert.equal(result.deficitCents, 0);
  assert.equal(result.bufferCents, 115000);
});

test('payoutPolicy: boundary post===reserve is NOT a breach; below is', () => {
  // post === reserve means not a breach (breach is when post < reserve)
  const result1 = evaluatePayoutPolicy({
    currentBalanceCents: 250000,
    minReserveCents: 200000,
    billAmountCents: 50000,
  });
  assert.equal(result1.postPayoutBalanceCents, 200000);
  assert.equal(result1.wouldBreach, false);

  const result2 = evaluatePayoutPolicy({
    currentBalanceCents: 250000,
    minReserveCents: 200000,
    billAmountCents: 50001,
  });
  assert.equal(result2.postPayoutBalanceCents, 199999);
  assert.equal(result2.wouldBreach, true);
  assert.equal(result2.deficitCents, 1);
});

test('payoutPolicy: schedule shows two individually-safe bills where the second would breach', () => {
  const bills = [
    {
      id: 'b1',
      billNumber: 'B1',
      vendorName: 'V1',
      vendorEmail: 'v1@v.com',
      amountCents: 100000,
      dueDate: '2026-11-10',
      daysUntilDue: 5,
      status: 'PENDING' as const,
      description: 'x',
      category: 'x',
    },
    {
      id: 'b2',
      billNumber: 'B2',
      vendorName: 'V2',
      vendorEmail: 'v2@v.com',
      amountCents: 150000,
      dueDate: '2026-11-11',
      daysUntilDue: 6,
      status: 'PENDING' as const,
      description: 'x',
      category: 'x',
    },
  ];

  const schedule = evaluatePayoutSchedule({
    clearedBalanceCents: 300000,
    minReserveCents: 100000,
    bills,
  });

  // First bill: 300000 - 100000 = 200000 >= 100000, no breach
  assert.equal(schedule['b1'].wouldBreach, false);
  assert.equal(schedule['b1'].postPayoutBalanceCents, 200000);

  // Second bill: running balance becomes 200000, pay 150000 -> 50000 < 100000, breach
  assert.equal(schedule['b2'].wouldBreach, true);
  assert.equal(schedule['b2'].postPayoutBalanceCents, 50000);
  assert.equal(schedule['b2'].deficitCents, 50000);
});
