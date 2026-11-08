import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractInvoiceIdFromUrl,
  createDraftInvoice,
  sendInvoice,
  getInvoice,
  remindInvoice,
  cancelInvoice,
  generateInvoiceQrCode,
  clearPayPalTokenCache,
  PayPalError,
} from '../src/lib/paypal';

const originalEnv = { ...process.env };

test.beforeEach(() => {
  process.env.PAYPAL_CLIENT_ID = 'test-client-id';
  process.env.PAYPAL_CLIENT_SECRET = 'test-client-secret';
  process.env.PAYPAL_API_BASE_URL = 'https://api-m.sandbox.paypal.com';
  clearPayPalTokenCache();
});

test.afterEach(() => {
  process.env.PAYPAL_CLIENT_ID = originalEnv.PAYPAL_CLIENT_ID;
  process.env.PAYPAL_CLIENT_SECRET = originalEnv.PAYPAL_CLIENT_SECRET;
  process.env.PAYPAL_API_BASE_URL = originalEnv.PAYPAL_API_BASE_URL;
  clearPayPalTokenCache();
});

test('extractInvoiceIdFromUrl: extracts ID correctly across URL patterns', () => {
  // Standard PayPal v2 HATEOAS href
  assert.equal(
    extractInvoiceIdFromUrl('https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2-DNTS-ADDB-J59Q-5ZEA'),
    'INV2-DNTS-ADDB-J59Q-5ZEA'
  );

  // URL with custom port and trailing slash
  assert.equal(
    extractInvoiceIdFromUrl('https://api-m.sandbox.paypal.com:8443/v2/invoicing/invoices/INV2-DNTS-ADDB-J59Q-5ZEA/'),
    'INV2-DNTS-ADDB-J59Q-5ZEA'
  );

  // URL with query parameters
  assert.equal(
    extractInvoiceIdFromUrl('https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2-TEST-QUERY?mode=draft'),
    'INV2-TEST-QUERY'
  );

  // URL encoded segments
  assert.equal(
    extractInvoiceIdFromUrl('https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2%2DTEST%2DENC'),
    'INV2-TEST-ENC'
  );

  // Malformed or empty inputs return null
  assert.equal(extractInvoiceIdFromUrl(''), null);
  assert.equal(extractInvoiceIdFromUrl('not-a-valid-url'), null);
  assert.equal(extractInvoiceIdFromUrl('https://api.sandbox.paypal.com/'), null);
});

test('sendInvoice & getInvoice: rejects empty or whitespace-only invoice IDs before network call', async () => {
  // Verify empty string rejection
  await assert.rejects(
    async () => sendInvoice(''),
    (err: unknown) => {
      assert.ok(err instanceof PayPalError);
      assert.match((err as Error).message, /invoiceId must be a non-empty string/);
      return true;
    }
  );

  // Verify whitespace string rejection
  await assert.rejects(
    async () => sendInvoice('   \t\n  '),
    (err: unknown) => {
      assert.ok(err instanceof PayPalError);
      assert.match((err as Error).message, /invoiceId must be a non-empty string/);
      return true;
    }
  );

  // Verify getInvoice empty rejection
  await assert.rejects(
    async () => getInvoice(''),
    (err: unknown) => {
      assert.ok(err instanceof PayPalError);
      assert.match((err as Error).message, /invoiceId must be a non-empty string/);
      return true;
    }
  );

  // Verify getInvoice whitespace rejection
  await assert.rejects(
    async () => getInvoice('   '),
    (err: unknown) => {
      assert.ok(err instanceof PayPalError);
      assert.match((err as Error).message, /invoiceId must be a non-empty string/);
      return true;
    }
  );

  // Verify remindInvoice empty rejection
  await assert.rejects(
    async () => remindInvoice('', { subject: 'Test' }),
    (err: unknown) => {
      assert.ok(err instanceof PayPalError);
      assert.match((err as Error).message, /invoiceId must be a non-empty string/);
      return true;
    }
  );

  // Verify cancelInvoice empty rejection
  await assert.rejects(
    async () => cancelInvoice(''),
    (err: unknown) => {
      assert.ok(err instanceof PayPalError);
      assert.match((err as Error).message, /invoiceId must be a non-empty string/);
      return true;
    }
  );

  // Verify generateInvoiceQrCode empty rejection
  await assert.rejects(
    async () => generateInvoiceQrCode(''),
    (err: unknown) => {
      assert.ok(err instanceof PayPalError);
      assert.match((err as Error).message, /invoiceId must be a non-empty string/);
      return true;
    }
  );
});

test('createDraftInvoice: extracts ID from href in mock response', async () => {
  const originalFetch = globalThis.fetch;
  const mockCalls: { url: string; method?: string }[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    mockCalls.push({ url: urlStr, method: init?.method });

    if (urlStr.includes('/v1/oauth2/token')) {
      return new Response(
        JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.includes('/v2/invoicing/invoices')) {
      return new Response(
        JSON.stringify({
          rel: 'self',
          href: 'https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2-HREF-EXTRACT-1234',
          method: 'GET',
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof globalThis.fetch;

  try {
    const res = await createDraftInvoice({
      invoiceNumber: 'INV-TEST-HREF',
      customerName: 'Acme Client',
      customerEmail: 'acme@example.test',
      amountCents: 5000,
      dueDate: '2026-11-30',
      itemDescription: 'Consulting services',
    });

    assert.equal(res.invoiceId, 'INV2-HREF-EXTRACT-1234');
    assert.equal(res.href, 'https://api.sandbox.paypal.com/v2/invoicing/invoices/INV2-HREF-EXTRACT-1234');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createDraftInvoice: extracts ID from Location header in mock response', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (urlStr.includes('/v1/oauth2/token')) {
      return new Response(
        JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.includes('/v2/invoicing/invoices')) {
      // Body has no href or id; only Location header provides ID
      return new Response(JSON.stringify({}), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          location: 'https://api-m.sandbox.paypal.com:8443/v2/invoicing/invoices/INV2-LOCATION-HEADER-5678',
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof globalThis.fetch;

  try {
    const res = await createDraftInvoice({
      invoiceNumber: 'INV-TEST-LOC',
      customerName: 'Acme Client',
      customerEmail: 'acme@example.test',
      amountCents: 5000,
      dueDate: '2026-11-30',
      itemDescription: 'Consulting services',
    });

    assert.equal(res.invoiceId, 'INV2-LOCATION-HEADER-5678');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createDraftInvoice: extracts ID from existing id or invoice_id property formats', async () => {
  const originalFetch = globalThis.fetch;

  // Case 1: data.id format
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.includes('/v1/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'mock-tok', expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: 'INV2-DIRECT-ID-1111' }), { status: 201 });
  }) as typeof globalThis.fetch;

  try {
    const res1 = await createDraftInvoice({
      invoiceNumber: 'INV-TEST-ID',
      customerName: 'Acme Client',
      customerEmail: 'acme@example.test',
      amountCents: 5000,
      dueDate: '2026-11-30',
      itemDescription: 'Consulting services',
    });
    assert.equal(res1.invoiceId, 'INV2-DIRECT-ID-1111');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Case 2: data.invoice_id format
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.includes('/v1/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'mock-tok', expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify({ invoice_id: 'INV2-INVOICE-ID-2222' }), { status: 201 });
  }) as typeof globalThis.fetch;

  try {
    const res2 = await createDraftInvoice({
      invoiceNumber: 'INV-TEST-INVOICE-ID',
      customerName: 'Acme Client',
      customerEmail: 'acme@example.test',
      amountCents: 5000,
      dueDate: '2026-11-30',
      itemDescription: 'Consulting services',
    });
    assert.equal(res2.invoiceId, 'INV2-INVOICE-ID-2222');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createDraftInvoice: throws clear PayPalError when ID is missing or malformed in response', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.includes('/v1/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'mock-tok', expires_in: 3600 }), { status: 200 });
    }
    // Returns 201 Created but without id, invoice_id, href, or Location header
    return new Response(JSON.stringify({ status: 'DRAFT', currency: 'USD' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;

  try {
    await assert.rejects(
      async () =>
        createDraftInvoice({
          invoiceNumber: 'INV-TEST-MISSING',
          customerName: 'Acme Client',
          customerEmail: 'acme@example.test',
          amountCents: 5000,
          dueDate: '2026-11-30',
          itemDescription: 'Consulting services',
        }),
      (err: unknown) => {
        assert.ok(err instanceof PayPalError);
        assert.match(
          (err as Error).message,
          /failed to extract a valid invoice ID from the response/
        );
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
