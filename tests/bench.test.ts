import test from 'node:test';
import assert from 'node:assert/strict';
import { runBench } from '../src/lib/bench/run';
import { BENCH_SCENARIOS } from '../src/lib/bench/scenarios';
import { demoStore } from '../src/lib/store';

test('guardrail bench: every scenario runs a real guard and is blocked', async () => {
  const saved = process.env.PAYPAL_WEBHOOK_ID;
  delete process.env.PAYPAL_WEBHOOK_ID; // keep TRAP-08 offline in CI
  try {
    const results = await runBench();
    assert.equal(results.length, BENCH_SCENARIOS.length);
    for (const r of results) {
      assert.ok(r.blocked, `${r.id} not blocked: ${r.evidence}`);
      assert.notEqual(r.guard, 'none');
    }
  } finally {
    if (saved !== undefined) process.env.PAYPAL_WEBHOOK_ID = saved;
  }
});

test('guardrail bench: running it never changes the live demo state', async () => {
  demoStore.resetDemoData();
  demoStore.payInvoice('inv-beacon-02');
  const before = JSON.stringify(demoStore.getSnapshot());
  await runBench();
  assert.equal(JSON.stringify(demoStore.getSnapshot()), before);
});
