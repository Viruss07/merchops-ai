import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as syncInvoicesRoute } from '../src/app/api/invoices/sync/route';
import { demoStore } from '../src/lib/store';
import { clearPayPalTokenCache, getInvoice } from '../src/lib/paypal';
import { ApiError, syncInvoices } from '../src/lib/apiClient';
import {
  formatInvoiceActionErrorNotice,
  formatInvoiceSyncNotice,
} from '../src/lib/client/invoiceSyncFeedback';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function makeSyncRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/invoices/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    },
    body: JSON.stringify(body),
  });
}

function mockPayPalGetInvoiceFetch(
  handler: (paypalInvoiceId: string, url: string) => Response | Promise<Response>,
) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.includes('/v1/oauth2/token')) {
      return new Response(
        JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Enforce test rule: never issue PayPal mutations (create, send, payment, payout).
    assert.equal(method, 'GET', `Unexpected PayPal mutation call: ${method} ${url}`);
    assert.ok(
      url.includes('/v2/invoicing/invoices/'),
      `Unexpected external call in invoice sync test: ${url}`,
    );

    const idSegment = url.split('/v2/invoicing/invoices/')[1]?.split('?')[0] ?? '';
    return handler(decodeURIComponent(idSegment), url);
  }) as typeof globalThis.fetch;
}

test.beforeEach(() => {
  process.env.PAYPAL_CLIENT_ID = 'test-client-id';
  process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
  process.env.PAYPAL_API_BASE_URL = 'https://api-m.sandbox.paypal.com';
  clearPayPalTokenCache();
  demoStore.resetDemoData();
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.PAYPAL_CLIENT_ID = originalEnv.PAYPAL_CLIENT_ID;
  process.env.PAYPAL_CLIENT_SECRET = originalEnv.PAYPAL_CLIENT_SECRET;
  process.env.PAYPAL_API_BASE_URL = originalEnv.PAYPAL_API_BASE_URL;
  clearPayPalTokenCache();
  demoStore.resetDemoData();
});

test('invoice sync PAID: updates ledger once and formats confirmed payment amount', async () => {
  const initialBalance = demoStore.getAccount().clearedBalanceCents;
  demoStore.attachPayPalInvoice('inv-beacon-02', {
    paypalInvoiceId: 'INV2-BEACON-PAID',
  });

  mockPayPalGetInvoiceFetch(() =>
    new Response(
      JSON.stringify({
        id: 'INV2-BEACON-PAID',
        status: 'PAID',
        detail: { invoice_number: 'INV-2026-092' },
        amount: { currency_code: 'USD', value: '850.00' },
        payments: { paid_amount: { currency_code: 'USD', value: '850.00' } },
        due_amount: { currency_code: 'USD', value: '0.00' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );

  const response = await syncInvoicesRoute(makeSyncRequest({ invoiceId: 'inv-beacon-02' }));
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.success, true);
  assert.equal(body.outcome, 'PAID');
  assert.equal(body.credited, true);
  assert.equal(body.updated, 1);
  assert.equal(body.paypalStatus, 'PAID');
  assert.equal(body.paidAmountCents, 85000);
  assert.equal(body.dueAmountCents, 0);

  assert.equal(demoStore.getInvoice('inv-beacon-02')?.status, 'PAID');
  assert.equal(demoStore.getAccount().clearedBalanceCents, initialBalance + 85000);

  const paidLogs = demoStore
    .getAuditLogs()
    .filter((log) => log.action === 'INVOICE_PAID_PAYPAL');
  assert.equal(paidLogs.length, 1);
  assert.match(paidLogs[0].details, /\$850\.00/);

  const notice = formatInvoiceSyncNotice(body);
  assert.equal(notice.tone, 'safe');
  assert.equal(notice.title, 'Payment confirmed on PayPal');
  assert.match(notice.text, /\$850\.00/);
});

test('invoice sync UNPAID: leaves ledger unchanged and returns exact unpaid confirmation', async () => {
  const initialBalance = demoStore.getAccount().clearedBalanceCents;
  demoStore.attachPayPalInvoice('inv-beacon-02', {
    paypalInvoiceId: 'INV2-BEACON-UNPAID',
  });

  mockPayPalGetInvoiceFetch(() =>
    new Response(
      JSON.stringify({
        id: 'INV2-BEACON-UNPAID',
        status: 'SENT',
        detail: { invoice_number: 'INV-2026-092' },
        amount: { currency_code: 'USD', value: '850.00' },
        due_amount: { currency_code: 'USD', value: '850.00' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );

  const response = await syncInvoicesRoute(makeSyncRequest({ invoiceId: 'inv-beacon-02' }));
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.success, true);
  assert.equal(body.outcome, 'UNPAID');
  assert.equal(body.credited, false);
  assert.equal(body.updated, 0);
  assert.equal(body.message, 'PayPal confirms this invoice is still unpaid.');

  assert.equal(demoStore.getInvoice('inv-beacon-02')?.status, 'CURRENT');
  assert.equal(demoStore.getAccount().clearedBalanceCents, initialBalance);
  assert.equal(
    demoStore.getAuditLogs().filter((log) => log.action === 'INVOICE_PAID_PAYPAL').length,
    0,
  );

  const notice = formatInvoiceSyncNotice(body);
  assert.equal(notice.tone, 'risk');
  assert.equal(notice.text, 'PayPal confirms this invoice is still unpaid.');
});

test('invoice sync PARTIALLY PAID: reports received amount and remaining balance without full credit', async () => {
  const initialBalance = demoStore.getAccount().clearedBalanceCents;
  demoStore.attachPayPalInvoice('inv-beacon-02', {
    paypalInvoiceId: 'INV2-BEACON-PARTIAL',
  });

  mockPayPalGetInvoiceFetch(() =>
    new Response(
      JSON.stringify({
        id: 'INV2-BEACON-PARTIAL',
        status: 'PARTIALLY_PAID',
        detail: { invoice_number: 'INV-2026-092' },
        amount: { currency_code: 'USD', value: '850.00' },
        payments: { paid_amount: { currency_code: 'USD', value: '300.00' } },
        due_amount: { currency_code: 'USD', value: '550.00' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );

  const details = await getInvoice('INV2-BEACON-PARTIAL');
  assert.equal(details.paidAmountCents, 30000);
  assert.equal(details.dueAmountCents, 55000);

  const response = await syncInvoicesRoute(makeSyncRequest({ invoiceId: 'inv-beacon-02' }));
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.equal(body.success, true);
  assert.equal(body.outcome, 'PARTIALLY_PAID');
  assert.equal(body.credited, false);
  assert.equal(body.updated, 0);
  assert.equal(body.paidAmountCents, 30000);
  assert.equal(body.dueAmountCents, 55000);
  assert.equal(body.totalAmountCents, 85000);

  assert.equal(demoStore.getInvoice('inv-beacon-02')?.status, 'CURRENT');
  assert.equal(demoStore.getAccount().clearedBalanceCents, initialBalance);
  assert.equal(
    demoStore.getAuditLogs().filter((log) => log.action === 'INVOICE_PAID_PAYPAL').length,
    0,
  );

  const notice = formatInvoiceSyncNotice(body);
  assert.equal(notice.tone, 'risk');
  assert.match(notice.text, /\$300\.00 received/);
  assert.match(notice.text, /\$550\.00 remaining balance/);
});

test('invoice sync API ERROR: propagates useful PayPal error, allows retry, and stops loading', async () => {
  const initialBalance = demoStore.getAccount().clearedBalanceCents;
  demoStore.attachPayPalInvoice('inv-beacon-02', {
    paypalInvoiceId: 'INV2-BEACON-ERR',
  });

  mockPayPalGetInvoiceFetch(() =>
    new Response(
      JSON.stringify({
        name: 'RESOURCE_NOT_FOUND',
        message: 'The specified invoice ID does not exist in Sandbox.',
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    ),
  );

  const apiResponse = await syncInvoicesRoute(makeSyncRequest({ invoiceId: 'inv-beacon-02' }));
  assert.equal(apiResponse.status, 502);
  const apiErrorPayload = await apiResponse.json();
  assert.equal(apiErrorPayload.error, 'PAYPAL_API_REJECTED');
  assert.match(apiErrorPayload.message, /RESOURCE_NOT_FOUND/);
  assert.match(apiErrorPayload.message, /HTTP 404/);

  // Ledger must remain untouched.
  assert.equal(demoStore.getInvoice('inv-beacon-02')?.status, 'CURRENT');
  assert.equal(demoStore.getAccount().clearedBalanceCents, initialBalance);

  // Verify frontend apiClient + retryable feedback + loading cleanup when server returns error.
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(apiErrorPayload), {
      status: apiResponse.status,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof globalThis.fetch;

  let busy = true;
  let notice = null;
  try {
    await syncInvoices('inv-beacon-02');
    assert.fail('Expected syncInvoices to reject on API error');
  } catch (caught) {
    assert.ok(caught instanceof ApiError);
    notice = formatInvoiceActionErrorNotice('PayPal could not be checked', caught, {
      allowRetry: true,
      status: caught.status,
    });
  } finally {
    busy = false;
  }

  assert.equal(busy, false);
  assert.ok(notice);
  assert.equal(notice.tone, 'blocked');
  assert.equal(notice.canRetry, true);
  assert.match(notice.text, /RESOURCE_NOT_FOUND/);
});

test('invoice sync DUPLICATE VERIFICATION: repeated and concurrent checks credit ledger exactly once', async () => {
  const initialBalance = demoStore.getAccount().clearedBalanceCents;
  demoStore.attachPayPalInvoice('inv-beacon-02', {
    paypalInvoiceId: 'INV2-BEACON-DUP',
  });

  mockPayPalGetInvoiceFetch(() =>
    new Response(
      JSON.stringify({
        id: 'INV2-BEACON-DUP',
        status: 'MARKED_AS_PAID',
        detail: { invoice_number: 'INV-2026-092' },
        amount: { currency_code: 'USD', value: '850.00' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );

  // Concurrent double-click simulation before state transitions to PAID
  const [resA, resB] = await Promise.all([
    syncInvoicesRoute(makeSyncRequest({ invoiceId: 'inv-beacon-02' })),
    syncInvoicesRoute(makeSyncRequest({ invoiceId: 'inv-beacon-02' })),
  ]);
  const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()]);

  assert.equal(resA.status, 200);
  assert.equal(resB.status, 200);
  assert.equal(bodyA.updated + bodyB.updated, 1);
  assert.equal([bodyA.credited, bodyB.credited].filter(Boolean).length, 1);

  // Subsequent check after invoice is already PAID
  const res3 = await syncInvoicesRoute(makeSyncRequest({ invoiceId: 'inv-beacon-02' }));
  const body3 = await res3.json();
  assert.equal(res3.status, 200);
  assert.equal(body3.outcome, 'ALREADY_PAID');
  assert.equal(body3.credited, false);
  assert.equal(body3.updated, 0);

  const dupNotice = formatInvoiceSyncNotice(body3);
  assert.equal(dupNotice.tone, 'safe');
  assert.match(dupNotice.text, /No duplicate ledger credit was applied/);

  // Ledger credited once (+85000) and only 1 audit log entry recorded.
  assert.equal(demoStore.getAccount().clearedBalanceCents, initialBalance + 85000);
  assert.equal(
    demoStore.getAuditLogs().filter((log) => log.action === 'INVOICE_PAID_PAYPAL').length,
    1,
  );
});

test('invoice sync refuses to mark unpaid local invoice paid without PayPal ID', async () => {
  const initialBalance = demoStore.getAccount().clearedBalanceCents;
  const response = await syncInvoicesRoute(makeSyncRequest({ invoiceId: 'inv-beacon-02' }));
  assert.equal(response.status, 409);
  const body = await response.json();

  assert.equal(body.error, 'NOT_ON_PAYPAL');
  assert.equal(demoStore.getInvoice('inv-beacon-02')?.status, 'CURRENT');
  assert.equal(demoStore.getAccount().clearedBalanceCents, initialBalance);
});

