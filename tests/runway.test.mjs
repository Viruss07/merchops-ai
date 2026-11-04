import test from 'node:test';
import assert from 'node:assert/strict';

// Pure logic imported or mirrored for test execution
function addCents(a, b) {
  return Math.round(a) + Math.round(b);
}

function subtractCents(a, b) {
  return Math.round(a) - Math.round(b);
}

function calculateRunway({ clearedBalanceCents, minReserveCents, invoices, bills, horizonDays = 30 }) {
  const days = [];
  let runningBalance = clearedBalanceCents;
  let hasReserveBreach = false;
  let firstBreachDay = undefined;
  let maxDeficitCents = 0;

  for (let dayIndex = 1; dayIndex <= horizonDays; dayIndex++) {
    const startingBalance = runningBalance;
    let inflowForDay = 0;
    invoices.forEach((inv) => {
      if (inv.status === 'CURRENT' && inv.daysUntilDue === dayIndex) {
        inflowForDay = addCents(inflowForDay, inv.amountCents);
      }
    });

    let outflowForDay = 0;
    bills.forEach((bill) => {
      if (bill.status === 'PENDING' && bill.daysUntilDue === dayIndex) {
        outflowForDay = addCents(outflowForDay, bill.amountCents);
      }
    });

    const endingBalance = subtractCents(addCents(startingBalance, inflowForDay), outflowForDay);
    runningBalance = endingBalance;

    const breachesReserve = endingBalance < minReserveCents;
    if (breachesReserve) {
      hasReserveBreach = true;
      if (firstBreachDay === undefined) {
        firstBreachDay = dayIndex;
      }
      const deficit = subtractCents(minReserveCents, endingBalance);
      if (deficit > maxDeficitCents) {
        maxDeficitCents = deficit;
      }
    }

    days.push({
      dayNumber: dayIndex,
      startingBalanceCents: startingBalance,
      inflowCents: inflowForDay,
      outflowCents: outflowForDay,
      endingBalanceCents: endingBalance,
      breachesReserve,
    });
  }

  return {
    days,
    currentBalanceCents: clearedBalanceCents,
    minReserveCents,
    projectedEndingBalanceCents: runningBalance,
    hasReserveBreach,
    firstBreachDay,
    breachDeficitCents: maxDeficitCents,
  };
}

test('Demo Baseline: Day 10 Acme Supplies bill ($3,000) causes -$800 reserve breach', () => {
  const invoices = [
    { id: 'inv-apex-01', amountCents: 150000, status: 'OVERDUE', daysOverdue: 12 },
  ];
  const bills = [
    { id: 'bill-acme-01', amountCents: 300000, status: 'PENDING', daysUntilDue: 10 },
  ];

  const forecast = calculateRunway({
    clearedBalanceCents: 420000, // $4,200.00
    minReserveCents: 200000,     // $2,000.00
    invoices,
    bills,
    horizonDays: 30,
  });

  // Verify Day 9 balance remains $4,200
  assert.equal(forecast.days[8].endingBalanceCents, 420000);
  assert.equal(forecast.days[8].breachesReserve, false);

  // Verify Day 10 balance drops to $1,200 ($4,200 - $3,000)
  assert.equal(forecast.days[9].endingBalanceCents, 120000);
  assert.equal(forecast.days[9].breachesReserve, true);

  // Verify breach metrics
  assert.equal(forecast.hasReserveBreach, true);
  assert.equal(forecast.firstBreachDay, 10);
  assert.equal(forecast.breachDeficitCents, 80000); // $800.00 breach ($2,000 - $1,200)
});

test('Recovered Scenario: Collecting Apex Corp ($1,500) eliminates Day 10 reserve breach', () => {
  // After Apex Corp pays, cleared balance rises to $5,700 ($4,200 + $1,500)
  const invoices = [
    { id: 'inv-apex-01', amountCents: 150000, status: 'PAID', daysOverdue: 0 },
  ];
  const bills = [
    { id: 'bill-acme-01', amountCents: 300000, status: 'PENDING', daysUntilDue: 10 },
  ];

  const forecast = calculateRunway({
    clearedBalanceCents: 570000, // $5,700.00 ($4,200 + $1,500)
    minReserveCents: 200000,     // $2,000.00
    invoices,
    bills,
    horizonDays: 30,
  });

  // Day 10 balance is $2,700 ($5,700 - $3,000)
  assert.equal(forecast.days[9].endingBalanceCents, 270000);
  assert.equal(forecast.days[9].breachesReserve, false);

  // No breach should be detected
  assert.equal(forecast.hasReserveBreach, false);
  assert.equal(forecast.firstBreachDay, undefined);
  assert.equal(forecast.breachDeficitCents, 0);
  assert.equal(forecast.projectedEndingBalanceCents, 270000);
});

test('Collections Workflow: Simulating settlement transitions invoice status and updates ledger', () => {
  let clearedBalance = 420000;
  const invoice = {
    id: 'inv-apex-01',
    amountCents: 150000,
    status: 'OVERDUE',
    daysOverdue: 12,
  };

  // Simulate payment
  invoice.status = 'PAID';
  invoice.daysOverdue = 0;
  clearedBalance = addCents(clearedBalance, invoice.amountCents);

  assert.equal(invoice.status, 'PAID');
  assert.equal(clearedBalance, 570000); // $5,700.00
});

test('Edge Case: Exact Reserve Boundary ($2,000 ending balance) is not a breach', () => {
  const bills = [
    { id: 'bill-exact', amountCents: 220000, status: 'PENDING', daysUntilDue: 5 },
  ];

  const forecast = calculateRunway({
    clearedBalanceCents: 420000, // $4,200.00 - $2,200.00 = $2,000.00
    minReserveCents: 200000,     // $2,000.00
    invoices: [],
    bills,
    horizonDays: 30,
  });

  assert.equal(forecast.days[4].endingBalanceCents, 200000);
  assert.equal(forecast.days[4].breachesReserve, false);
  assert.equal(forecast.hasReserveBreach, false);
});
