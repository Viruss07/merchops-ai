#!/usr/bin/env node
/**
 * API-level verification of the deterministic demo scenario.
 *
 * MANUAL / OPT-IN ONLY:
 * - Requires a running MerchOps AI server (default http://localhost:3000).
 * - Asserts seed invariants and the derived Day-10 reserve breach from /api/state.
 * - Does NOT assert HTML, CSS classes, pixel heights, or pixel strings.
 * - Not part of `npm test`; run explicitly with `node scripts/verify-chart-render.mjs`.
 *
 * Environment:
 *   BASE_URL      Server origin (default http://localhost:3000)
 *   DEMO_AS_OF    Expected deterministic clock (default 2026-11-03)
 */

import assert from 'node:assert/strict';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const DEMO_AS_OF = process.env.DEMO_AS_OF || '2026-11-03';

function extractState(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.state && typeof payload.state === 'object') return payload.state;
  if (payload.snapshot && typeof payload.snapshot === 'object') return payload.snapshot;
  if (payload.data && typeof payload.data === 'object') {
    if (payload.data.state && typeof payload.data.state === 'object') return payload.data.state;
    if (payload.data.snapshot && typeof payload.data.snapshot === 'object') return payload.data.snapshot;
    if (payload.data.account) return payload.data;
  }
  if (payload.account) return payload;
  return null;
}

function findById(collection, id) {
  return Array.isArray(collection) ? collection.find((item) => item && item.id === id) : undefined;
}

function daysBetween(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

async function verify() {
  console.log(`[verify] Fetching ${BASE_URL}/api/state ...`);
  const response = await fetch(`${BASE_URL}/api/state`, {
    headers: { Accept: 'application/json' },
  });
  assert.equal(response.status, 200, `GET /api/state returned HTTP ${response.status}`);

  const state = extractState(await response.json());
  assert.ok(state, 'Response did not contain a state snapshot with an account');

  const account = state.account;
  assert.equal(account.clearedBalanceCents, 420_000, 'Opening balance must be $4,200.00');
  assert.equal(account.minReserveCents, 200_000, 'Reserve floor must be $2,000.00');

  const acme = findById(state.bills, 'bill-acme-01');
  const apex = findById(state.invoices, 'inv-apex-01');
  assert.ok(acme, 'Seed bill bill-acme-01 is missing');
  assert.ok(apex, 'Seed invoice inv-apex-01 is missing');
  assert.equal(acme.amountCents, 300_000, 'Acme bill must be $3,000.00');
  assert.equal(acme.status, 'PENDING', 'Acme bill must start PENDING');
  assert.equal(apex.amountCents, 150_000, 'Apex invoice must be $1,500.00');
  assert.notEqual(apex.status, 'PAID', 'Apex invoice must start unpaid');

  const asOf = state.asOf || state.demoAsOf || DEMO_AS_OF;
  const dayOfBill = daysBetween(asOf, acme.dueDate);
  assert.equal(dayOfBill, 10, `Acme bill dueDate must map to Day 10 from ${asOf}`);

  // Deterministic Day-10 math from seed invariants.
  const day10EndingBalance = account.clearedBalanceCents - acme.amountCents;
  const day10Deficit = account.minReserveCents - day10EndingBalance;
  assert.equal(day10EndingBalance, 120_000, 'Day 10 ending balance must be $1,200.00');
  assert.equal(day10Deficit, 80_000, 'Day 10 reserve deficit must be $800.00');

  // Apex aging is derived from dueDate, not a hard-coded field.
  const apexOverdueDays = daysBetween(apex.dueDate, asOf);
  assert.equal(apexOverdueDays, 12, `Apex dueDate must be 12 days before ${asOf}`);
  if (typeof apex.daysOverdue === 'number') {
    assert.equal(apex.daysOverdue, 12, 'Apex daysOverdue must be derived from dueDate');
  }

  assert.ok(state.capabilities, 'State snapshot must include capabilities');
  assert.equal(
    typeof state.capabilities.paypalSandboxEnabled,
    'boolean',
    'capabilities.paypalSandboxEnabled must be a boolean'
  );

  console.log(
    `[verify] OK: asOf=${asOf}, opening=$4,200.00, reserve=$2,000.00, ` +
      `Day ${dayOfBill} balance=$1,200.00, deficit=$800.00`
  );
}

verify().catch((error) => {
  console.error('[verify] FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
