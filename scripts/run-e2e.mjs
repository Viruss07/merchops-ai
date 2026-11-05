#!/usr/bin/env node
/**
 * Cross-platform end-to-end smoke test for MerchOps AI.
 *
 * MANUAL / OPT-IN ONLY:
 * - Builds and starts the app on a free port using Node's child_process.
 * - Exercises the deterministic demo flow against the real HTTP API.
 * - Never calls live PayPal: PAYPAL_PAYOUTS_ENABLED is forced to false.
 * - Not part of `npm test`; run explicitly with `node scripts/run-e2e.mjs`.
 *
 * Requires a prior `npm install` (offline test execution is not supported).
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

const DEMO_AS_OF = process.env.DEMO_AS_OF || '2026-11-03';
const ADMIN_TOKEN = process.env.DEMO_ADMIN_TOKEN || '';

const childEnv = {
  ...process.env,
  DEMO_AS_OF,
  // Keep reset deterministic: only use a token supplied to this script, never
  // one picked up implicitly from .env.local.
  DEMO_ADMIN_TOKEN: ADMIN_TOKEN,
  // Never let this script trigger a live PayPal sandbox dispatch.
  PAYPAL_PAYOUTS_ENABLED: 'false',
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: childEnv,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`));
    });
  });
}

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

async function request(baseUrl, route, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: baseUrl,
    Referer: `${baseUrl}/`,
    ...(options.headers || {}),
  };

  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  return { status: response.status, body, text };
}

async function fetchState(baseUrl) {
  const { status, body } = await request(baseUrl, '/api/state', { method: 'GET' });
  assert.equal(status, 200, `GET /api/state returned HTTP ${status}`);
  const state = extractState(body);
  assert.ok(state, 'GET /api/state did not return a state snapshot with an account');
  return state;
}

async function resetDemo(baseUrl) {
  const headers = ADMIN_TOKEN ? { 'x-demo-admin-token': ADMIN_TOKEN } : {};
  const { status, body } = await request(baseUrl, '/api/reset', {
    method: 'POST',
    headers,
    body: JSON.stringify({ confirm: true }),
  });
  assert.equal(status, 200, `POST /api/reset returned HTTP ${status}: ${JSON.stringify(body)}`);
  return extractState(body) || (await fetchState(baseUrl));
}

async function waitForState(baseUrl, serverProcess, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Server exited early with code ${serverProcess.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/state`, {
        headers: { Origin: baseUrl, Accept: 'application/json' },
      });
      if (response.ok) return;
    } catch {
      // Server not up yet.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/state`);
}

async function stopServer(serverProcess) {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill('SIGTERM');
  await Promise.race([once(serverProcess, 'exit'), delay(5_000)]);
  if (serverProcess.exitCode === null) {
    serverProcess.kill('SIGKILL');
    await Promise.race([once(serverProcess, 'exit'), delay(2_000)]);
  }
}

async function main() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let serverProcess = null;

  try {
    console.log(`[e2e] Building app (DEMO_AS_OF=${DEMO_AS_OF})...`);
    await runCommand(process.execPath, [nextBin, 'build']);

    console.log(`[e2e] Starting app on ${baseUrl} ...`);
    serverProcess = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
      cwd: repoRoot,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
    serverProcess.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));

    await waitForState(baseUrl, serverProcess);
    console.log('[e2e] Server is ready.');

    // 1. Reset to the documented baseline.
    const seeded = await resetDemo(baseUrl);
    assert.equal(seeded.account.clearedBalanceCents, 420_000, 'Opening balance must be $4,200.00');
    assert.equal(seeded.account.minReserveCents, 200_000, 'Reserve must be $2,000.00');

    const acme = findById(seeded.bills, 'bill-acme-01');
    const apex = findById(seeded.invoices, 'inv-apex-01');
    assert.ok(acme, 'Seed bill bill-acme-01 is missing');
    assert.ok(apex, 'Seed invoice inv-apex-01 is missing');
    assert.equal(acme.amountCents, 300_000, 'Acme bill must be $3,000.00');
    assert.equal(acme.status, 'PENDING', 'Acme bill must start PENDING');
    assert.equal(apex.amountCents, 150_000, 'Apex invoice must be $1,500.00');
    assert.notEqual(apex.status, 'PAID', 'Apex invoice must start unpaid');

    assert.ok(seeded.capabilities, 'State snapshot must include capabilities');
    assert.equal(
      seeded.capabilities.paypalSandboxEnabled,
      false,
      'Live PayPal rail must be disabled in the e2e run'
    );
    console.log('[e2e] 1. Baseline seed invariants verified.');

    // 2. Reserve blocking: $3,000 bill on $4,200 leaves $1,200, a $800 breach.
    const blocked = await request(baseUrl, '/api/payouts/authorize', {
      method: 'POST',
      body: JSON.stringify({
        billId: 'bill-acme-01',
        confirmed: true,
        idempotencyKey: crypto.randomUUID(),
        executionMode: 'SIMULATION',
      }),
    });
    assert.equal(blocked.status, 403, `Expected reserve block HTTP 403, got ${blocked.status}`);
    assert.equal(blocked.body?.error, 'RESERVE_BREACH_BLOCKED');
    assert.equal(blocked.body?.postPayoutBalanceCents, 120_000);
    assert.equal(blocked.body?.deficitCents, 80_000);
    console.log('[e2e] 2. Reserve breach correctly blocked (HTTP 403).');

    // 3. Collect Apex Corp: $4,200 + $1,500 = $5,700.
    const collected = await request(baseUrl, '/api/invoices/simulate-payment', {
      method: 'POST',
      body: JSON.stringify({ invoiceId: 'inv-apex-01' }),
    });
    assert.equal(collected.status, 200, `simulate-payment returned HTTP ${collected.status}`);
    const afterCollection = extractState(collected.body) || (await fetchState(baseUrl));
    assert.equal(afterCollection.account.clearedBalanceCents, 570_000);
    console.log('[e2e] 3. Apex collection raised balance to $5,700.00.');

    // 4. Authorize the same bill: $5,700 - $3,000 = $2,700, safely above reserve.
    const payoutKey = crypto.randomUUID();
    const authorized = await request(baseUrl, '/api/payouts/authorize', {
      method: 'POST',
      body: JSON.stringify({
        billId: 'bill-acme-01',
        confirmed: true,
        idempotencyKey: payoutKey,
        executionMode: 'SIMULATION',
      }),
    });
    assert.equal(
      authorized.status,
      200,
      `Expected payout HTTP 200, got ${authorized.status}: ${JSON.stringify(authorized.body)}`
    );
    assert.equal(authorized.body?.success, true);
    const afterPayout = extractState(authorized.body) || (await fetchState(baseUrl));
    assert.equal(afterPayout.account.clearedBalanceCents, 270_000);
    assert.equal(findById(afterPayout.bills, 'bill-acme-01')?.status, 'DISBURSED');
    console.log('[e2e] 4. Payout authorized; balance is $2,700.00.');

    // 5. Replay the SUCCEEDED key: must return the stored result, not disburse again.
    const replay = await request(baseUrl, '/api/payouts/authorize', {
      method: 'POST',
      body: JSON.stringify({
        billId: 'bill-acme-01',
        confirmed: true,
        idempotencyKey: payoutKey,
        executionMode: 'SIMULATION',
      }),
    });
    assert.equal(replay.status, 200, `Idempotent replay returned HTTP ${replay.status}`);
    assert.ok(
      replay.body && typeof replay.body === 'object',
      'Idempotent replay should return the stored result body'
    );
    const afterReplay = extractState(replay.body) || (await fetchState(baseUrl));
    assert.equal(
      afterReplay.account.clearedBalanceCents,
      270_000,
      'Idempotent replay must not double-disburse'
    );
    console.log('[e2e] 5. Idempotent replay returned the stored result; no double disbursement.');

    // 6. Reset restores the baseline.
    const resetAgain = await resetDemo(baseUrl);
    assert.equal(resetAgain.account.clearedBalanceCents, 420_000);
    console.log('[e2e] 6. Reset restored the $4,200.00 baseline.');

    console.log('[e2e] ALL END-TO-END CHECKS PASSED.');
  } finally {
    await stopServer(serverProcess);
  }
}

main().catch((error) => {
  console.error('[e2e] FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
