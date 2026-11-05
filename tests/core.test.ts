import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRunway } from '../src/lib/runway';
import { demoStore } from '../src/lib/store';
import { DEMO_AS_OF } from '../src/lib/config';

test.beforeEach(() => {
  demoStore.resetDemoData();
});

test('REGRESSION: with startDate DEMO_AS_OF, the documented scenario holds', () => {
  const snapshot = demoStore.getSnapshot();
  const { account, invoices, bills } = snapshot;

  const forecast = calculateRunway({
    clearedBalanceCents: account.clearedBalanceCents,
    minReserveCents: account.minReserveCents,
    invoices,
    bills,
    startDate: DEMO_AS_OF,
  });

  assert.equal(forecast.firstBreachDay, 10);
  assert.equal(forecast.firstBreachDeficitCents, 80000);
  assert.equal(forecast.days[9].endingBalanceCents, 120000); // Day 10 is index 9
  // Check no bill double-charged - verify outflow only once
  assert.equal(forecast.days[9].outflowCents, 300000);
});

test('Regression: bill due 2026-11-13 with daysUntilDue 10 charged once when startDate is 2026-11-04 (day 9 only), not twice', () => {
  const forecast = calculateRunway({
    clearedBalanceCents: 420000,
    minReserveCents: 200000,
    invoices: [],
    bills: [
      { id: 'b1', billNumber: 'B1', vendorName: 'V', vendorEmail: 'v@v.com', amountCents: 300000, dueDate: '2026-11-13', daysUntilDue: 10, status: 'PENDING', description: 'x', category: 'x' }
    ],
    startDate: '2026-11-04',
  });

  // Count how many days have outflow
  const daysWithOutflow = forecast.days.filter(d => d.outflowCents > 0);
  assert.equal(daysWithOutflow.length, 1);
  assert.equal(daysWithOutflow[0].dayNumber, 9);
});

test('Day-0/past-due PENDING bill is counted on day 1', () => {
  const forecast = calculateRunway({
    clearedBalanceCents: 420000,
    minReserveCents: 200000,
    invoices: [],
    bills: [
      { id: 'b1', billNumber: 'B1', vendorName: 'V', vendorEmail: 'v@v.com', amountCents: 100000, dueDate: '2026-11-01', daysUntilDue: 0, status: 'PENDING', description: 'x', category: 'x' }
    ],
    startDate: '2026-11-03',
  });

  // Bill with daysUntilDue 0 might be counted on day 1
  const daysWithOutflow = forecast.days.filter(d => d.outflowCents > 0);
  assert(daysWithOutflow.length >= 1);
  assert.equal(daysWithOutflow[0].dayNumber, 1);
});

test('CURRENT invoice already due is clamped to day 1 exactly once', () => {
  const forecast = calculateRunway({
    clearedBalanceCents: 420000,
    minReserveCents: 200000,
    invoices: [
      { id: 'i1', invoiceNumber: 'I1', customerName: 'C', customerEmail: 'c@c.com', amountCents: 100000, dueDate: '2026-11-01', daysOverdue: 2, status: 'CURRENT', description: 'x' },
    ],
    bills: [],
    startDate: '2026-11-03',
  });

  const daysWithInflow = forecast.days.filter((d) => d.inflowCents > 0);
  assert.equal(daysWithInflow.length, 1);
  assert.equal(daysWithInflow[0].dayNumber, 1);
  assert.equal(daysWithInflow[0].inflowCents, 100000);
});

test('stale daysUntilDue never overrides dueDate: future bill is charged only on its due day', () => {
  const forecast = calculateRunway({
    clearedBalanceCents: 420000,
    minReserveCents: 200000,
    invoices: [],
    bills: [
      { id: 'b1', billNumber: 'B1', vendorName: 'V', vendorEmail: 'v@v.com', amountCents: 300000, dueDate: '2026-11-13', daysUntilDue: 0, status: 'PENDING', description: 'x', category: 'x' },
    ],
    startDate: '2026-11-03',
  });

  const daysWithOutflow = forecast.days.filter((d) => d.outflowCents > 0);
  assert.equal(daysWithOutflow.length, 1);
  assert.equal(daysWithOutflow[0].dayNumber, 10);
});

test('items due after the horizon are excluded', () => {
  const forecast = calculateRunway({
    clearedBalanceCents: 420000,
    minReserveCents: 200000,
    invoices: [
      { id: 'i1', invoiceNumber: 'I1', customerName: 'C', customerEmail: 'c@c.com', amountCents: 100000, dueDate: '2026-12-15', daysOverdue: 0, status: 'CURRENT', description: 'x' },
    ],
    bills: [
      { id: 'b1', billNumber: 'B1', vendorName: 'V', vendorEmail: 'v@v.com', amountCents: 100000, dueDate: '2026-12-20', daysUntilDue: 47, status: 'PENDING', description: 'x', category: 'x' },
    ],
    startDate: '2026-11-03',
    horizonDays: 30,
  });

  assert.equal(forecast.days.some((d) => d.inflowCents > 0 || d.outflowCents > 0), false);
});

test('APPROVED bill is included; IN_FLIGHT included; DISBURSED excluded', () => {
  const forecast = calculateRunway({
    clearedBalanceCents: 420000,
    minReserveCents: 200000,
    invoices: [],
    bills: [
      { id: 'b1', billNumber: 'B1', vendorName: 'V1', vendorEmail: 'v1@v.com', amountCents: 100000, dueDate: '2026-11-04', daysUntilDue: 1, status: 'APPROVED', description: 'x', category: 'x' },
      { id: 'b2', billNumber: 'B2', vendorName: 'V2', vendorEmail: 'v2@v.com', amountCents: 100000, dueDate: '2026-11-05', daysUntilDue: 2, status: 'IN_FLIGHT', description: 'x', category: 'x' },
      { id: 'b3', billNumber: 'B3', vendorName: 'V3', vendorEmail: 'v3@v.com', amountCents: 100000, dueDate: '2026-11-06', daysUntilDue: 3, status: 'DISBURSED', description: 'x', category: 'x' },
    ],
    startDate: '2026-11-03',
  });

  const outflows = forecast.days.filter(d => d.outflowCents > 0);
  assert.equal(outflows.length, 2); // APPROVED and IN_FLIGHT only
});

test('Opening balance below reserve sets firstBreachDay===0 and the correct opening deficit', () => {
  const forecast = calculateRunway({
    clearedBalanceCents: 150000, // below reserve 200000
    minReserveCents: 200000,
    invoices: [],
    bills: [],
    startDate: '2026-11-03',
  });

  assert.equal(forecast.firstBreachDay, 0);
  assert.equal(forecast.firstBreachDeficitCents, 50000); // 200000 - 150000
});

test('horizonDays 0/negative/non-integer throws RangeError', () => {
  assert.throws(() => {
    calculateRunway({
      clearedBalanceCents: 420000,
      minReserveCents: 200000,
      invoices: [],
      bills: [],
      horizonDays: 0,
    });
  }, RangeError);

  assert.throws(() => {
    calculateRunway({
      clearedBalanceCents: 420000,
      minReserveCents: 200000,
      invoices: [],
      bills: [],
      horizonDays: -5,
    });
  }, RangeError);

  assert.throws(() => {
    calculateRunway({
      clearedBalanceCents: 420000,
      minReserveCents: 200000,
      invoices: [],
      bills: [],
      horizonDays: 1.5,
    });
  }, RangeError);
});

test('UTC/DST: startDate 2026-03-01, day 8 date === 2026-03-09 and day 10 === 2026-03-11', () => {
  const forecast = calculateRunway({
    clearedBalanceCents: 420000,
    minReserveCents: 200000,
    invoices: [],
    bills: [],
    startDate: '2026-03-01',
  });

  assert.equal(forecast.days[7].date, '2026-03-09'); // day 8
  assert.equal(forecast.days[9].date, '2026-03-11'); // day 10
});
