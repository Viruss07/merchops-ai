import { centsToPayPalAmount, parseUSDToCents } from '@/lib/money';

export const PERMITTED_SANDBOX_ORIGIN =
  'https://api-m.sandbox.paypal.com';

const TOKEN_SAFETY_MARGIN_MS = 60_000;
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;
const PAYOUT_REQUEST_TIMEOUT_MS = 15_000;

export type PayPalErrorCode =
  | 'PAYPAL_ENDPOINT_INVALID'
  | 'PAYPAL_AUTH_FAILED'
  | 'PAYPAL_API_REJECTED'
  | 'PAYPAL_OUTCOME_UNKNOWN'
  | 'PAYPAL_WEBHOOK_NOT_CONFIGURED'
  | 'PAYPAL_WEBHOOK_INVALID';

export class PayPalError extends Error {
  readonly code: PayPalErrorCode;
  readonly status?: number;
  readonly paypalName?: string;

  constructor(
    code: PayPalErrorCode,
    message: string,
    details?: { status?: number; paypalName?: string }
  ) {
    super(message);
    this.name = 'PayPalError';
    this.code = code;
    this.status = details?.status;
    this.paypalName = details?.paypalName;
  }
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

function getPermittedBaseUrl(): string {
  const configured =
    process.env.PAYPAL_API_BASE_URL?.trim() || PERMITTED_SANDBOX_ORIGIN;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new PayPalError(
      'PAYPAL_ENDPOINT_INVALID',
      'Configured PayPal API endpoint is invalid.'
    );
  }

  if (
    parsed.origin !== PERMITTED_SANDBOX_ORIGIN ||
    (parsed.pathname !== '/' && parsed.pathname !== '') ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new PayPalError(
      'PAYPAL_ENDPOINT_INVALID',
      'Only the official PayPal Sandbox API endpoint is permitted.'
    );
  }

  return PERMITTED_SANDBOX_ORIGIN;
}

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (
    !clientId ||
    !clientSecret ||
    clientId.startsWith('your_') ||
    clientSecret.startsWith('your_')
  ) {
    throw new PayPalError(
      'PAYPAL_AUTH_FAILED',
      'PayPal Sandbox credentials are not configured.'
    );
  }

  return { clientId, clientSecret };
}

export async function getPayPalAccessToken(): Promise<string> {
  const now = Date.now();
  if (
    cachedToken !== null &&
    cachedToken.expiresAt - TOKEN_SAFETY_MARGIN_MS > now
  ) {
    return cachedToken.token;
  }

  const baseUrl = getPermittedBaseUrl();
  const { clientId, clientSecret } = getCredentials();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new PayPalError(
      'PAYPAL_AUTH_FAILED',
      'PayPal authentication request failed or timed out.'
    );
  }

  if (!response.ok) {
    throw new PayPalError(
      'PAYPAL_AUTH_FAILED',
      `PayPal authentication failed with status HTTP ${response.status}.`,
      { status: response.status }
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new PayPalError(
      'PAYPAL_AUTH_FAILED',
      'PayPal authentication response could not be parsed.'
    );
  }

  if (typeof data !== 'object' || data === null) {
    throw new PayPalError(
      'PAYPAL_AUTH_FAILED',
      'PayPal authentication response was malformed.'
    );
  }

  const body = data as Record<string, unknown>;
  const token = body.access_token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new PayPalError(
      'PAYPAL_AUTH_FAILED',
      'PayPal authentication response did not include an access token.'
    );
  }

  const expiresInRaw = body.expires_in;
  const expiresInSeconds =
    typeof expiresInRaw === 'number' && Number.isFinite(expiresInRaw)
      ? Math.max(1, expiresInRaw)
      : 300;

  cachedToken = {
    token,
    expiresAt: now + expiresInSeconds * 1000,
  };

  return token;
}

export interface DispatchPayoutParams {
  idempotencyKey: string;
  amountCents: number;
  currency: string;
  receiverEmail: string;
  senderBatchId?: string;
  note: string;
  emailSubject: string;
  emailMessage: string;
  mockApplicationCodes?: string;
}

export async function dispatchPayout(
  params: DispatchPayoutParams
): Promise<unknown> {
  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();
  const senderBatchId = `batch-${params.idempotencyKey}`;

  const payload = {
    sender_batch_header: {
      sender_batch_id: senderBatchId,
      email_subject: params.emailSubject,
      email_message: params.emailMessage,
    },
    items: [
      {
        recipient_type: 'EMAIL',
        amount: {
          value: centsToPayPalAmount(params.amountCents),
          currency: params.currency,
        },
        note: params.note,
        sender_item_id: `item-${params.idempotencyKey}`,
        receiver: params.receiverEmail,
      },
    ],
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'PayPal-Request-Id': params.idempotencyKey,
  };

  if (params.mockApplicationCodes) {
    headers['PayPal-Mock-Response'] = JSON.stringify({
      mock_application_codes: params.mockApplicationCodes,
    });
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/payments/payouts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(PAYOUT_REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new PayPalError(
      'PAYPAL_OUTCOME_UNKNOWN',
      'PayPal Payouts API did not confirm the outcome due to a timeout or network failure.'
    );
  }

  if (!response.ok) {
    let paypalName: string | undefined;
    try {
      const errorBody: unknown = await response.json();
      if (typeof errorBody === 'object' && errorBody !== null) {
        const name = (errorBody as Record<string, unknown>).name;
        if (typeof name === 'string' && name.length > 0) {
          paypalName = name;
        }
      }
    } catch {
      paypalName = undefined;
    }

    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      `PayPal Payouts API rejected the request with status HTTP ${response.status}.`,
      { status: response.status, paypalName }
    );
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new PayPalError(
      'PAYPAL_OUTCOME_UNKNOWN',
      'PayPal Payouts API response could not be parsed, so the payout outcome is unconfirmed.'
    );
  }
}


export type PayoutBatchOutcome = 'SUCCESS' | 'FAILED' | 'PENDING';

export interface ParsedPayoutBatch {
  batchId: string | null;
  batchStatus: string | null;
  itemStatuses: string[];
  outcome: PayoutBatchOutcome;
}

const FAILED_ITEM_STATUSES = new Set([
  'FAILED',
  'DENIED',
  'BLOCKED',
  'RETURNED',
  'REVERSED',
  'REFUNDED',
]);

const FAILED_BATCH_STATUSES = new Set([
  'DENIED',
  'FAILED',
  'CANCELED',
  'CANCELLED',
  'EXPIRED',
]);

export function parsePayoutBatch(payload: unknown): ParsedPayoutBatch {
  if (typeof payload !== 'object' || payload === null) {
    return { batchId: null, batchStatus: null, itemStatuses: [], outcome: 'PENDING' };
  }

  const root = payload as Record<string, unknown>;
  const batchHeader =
    typeof root.batch_header === 'object' && root.batch_header !== null
      ? (root.batch_header as Record<string, unknown>)
      : null;

  const rawBatchId = batchHeader?.payout_batch_id;
  const batchId = typeof rawBatchId === 'string' && rawBatchId.length > 0 ? rawBatchId : null;

  const rawBatchStatus = batchHeader?.batch_status;
  const batchStatus =
    typeof rawBatchStatus === 'string' ? rawBatchStatus.toUpperCase() : null;

  const rawItems = Array.isArray(root.items) ? root.items : [];
  const itemStatuses: string[] = [];
  for (const item of rawItems) {
    if (typeof item !== 'object' || item === null) continue;
    const status = (item as Record<string, unknown>).transaction_status;
    if (typeof status === 'string') {
      itemStatuses.push(status.toUpperCase());
    }
  }

  let outcome: PayoutBatchOutcome = 'PENDING';
  if (batchStatus === 'SUCCESS' || itemStatuses.includes('SUCCESS')) {
    outcome = 'SUCCESS';
  } else if (
    (batchStatus !== null && FAILED_BATCH_STATUSES.has(batchStatus)) ||
    itemStatuses.some((status) => FAILED_ITEM_STATUSES.has(status))
  ) {
    outcome = 'FAILED';
  }

  return { batchId, batchStatus, itemStatuses, outcome };
}

export async function getPayoutBatch(batchId: string): Promise<unknown> {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(batchId)) {
    throw new PayPalError('PAYPAL_API_REJECTED', 'Invalid PayPal batch id.');
  }

  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/payments/payouts/${encodeURIComponent(batchId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(PAYOUT_REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new PayPalError(
      'PAYPAL_OUTCOME_UNKNOWN',
      'PayPal batch status could not be retrieved due to a timeout or network failure.'
    );
  }

  if (!response.ok) {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      `PayPal batch status request failed with status HTTP ${response.status}.`,
      { status: response.status }
    );
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new PayPalError(
      'PAYPAL_OUTCOME_UNKNOWN',
      'PayPal batch status response could not be parsed.'
    );
  }
}

export interface PayPalWebhookHeaders {
  authAlgo: string | null;
  certUrl: string | null;
  transmissionId: string | null;
  transmissionSig: string | null;
  transmissionTime: string | null;
}

export async function verifyWebhookSignature(
  event: unknown,
  headers: PayPalWebhookHeaders
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new PayPalError(
      'PAYPAL_WEBHOOK_NOT_CONFIGURED',
      'PAYPAL_WEBHOOK_ID is not configured; unverified webhooks are rejected.'
    );
  }

  if (
    !headers.authAlgo ||
    !headers.certUrl ||
    !headers.transmissionId ||
    !headers.transmissionSig ||
    !headers.transmissionTime
  ) {
    throw new PayPalError(
      'PAYPAL_WEBHOOK_INVALID',
      'PayPal webhook signature headers are missing.'
    );
  }

  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        auth_algo: headers.authAlgo,
        cert_url: headers.certUrl,
        transmission_id: headers.transmissionId,
        transmission_sig: headers.transmissionSig,
        transmission_time: headers.transmissionTime,
        webhook_id: webhookId,
        webhook_event: event,
      }),
      signal: AbortSignal.timeout(PAYOUT_REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new PayPalError(
      'PAYPAL_OUTCOME_UNKNOWN',
      'PayPal webhook verification request failed or timed out.'
    );
  }

  if (!response.ok) {
    throw new PayPalError(
      'PAYPAL_WEBHOOK_INVALID',
      `PayPal webhook verification failed with status HTTP ${response.status}.`,
      { status: response.status }
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new PayPalError(
      'PAYPAL_OUTCOME_UNKNOWN',
      'PayPal webhook verification response could not be parsed.'
    );
  }

  if (typeof data !== 'object' || data === null) return false;
  return (data as Record<string, unknown>).verification_status === 'SUCCESS';
}

export interface CreateInvoiceInput {
  invoiceNumber: string;
  invoiceDate?: string;
  dueDate: string;
  currency?: string;
  customerName: string;
  customerEmail: string;
  itemDescription: string;
  amountCents: number;
  note?: string;
}

export interface PayPalInvoiceDetails {
  id: string;
  status: string;
  invoiceNumber: string;
  recipientViewUrl: string | null;
  invoicerViewUrl: string | null;
  amountCents: number;
  currency: string;
}

/**
 * Creates a DRAFT invoice using PayPal Invoicing v2 (POST /v2/invoicing/invoices)
 */
export async function createDraftInvoice(
  input: CreateInvoiceInput
): Promise<{ invoiceId: string; href?: string }> {
  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();

  const nameParts = input.customerName.trim().split(/\s+/);
  const givenName = nameParts[0] || 'Customer';
  const surname = nameParts.slice(1).join(' ') || 'Recipient';

  const payload = {
    detail: {
      invoice_number: input.invoiceNumber,
      invoice_date: input.invoiceDate || new Date().toISOString().slice(0, 10),
      payment_term: {
        term_type: 'DUE_ON_DATE_SPECIFIED',
        due_date: input.dueDate,
      },
      currency_code: input.currency || 'USD',
      note: input.note || 'Payment due per merchant agreement.',
    },
    primary_recipients: [
      {
        billing_info: {
          name: {
            given_name: givenName,
            surname: surname,
          },
          email_address: input.customerEmail,
        },
      },
    ],
    items: [
      {
        name: input.itemDescription,
        quantity: '1',
        unit_amount: {
          currency_code: input.currency || 'USD',
          value: centsToPayPalAmount(input.amountCents),
        },
      },
    ],
    amount: {
      currency_code: input.currency || 'USD',
      value: centsToPayPalAmount(input.amountCents),
    },
  };

  const requestId = `inv-create-${input.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '-')}`;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v2/invoicing/invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': requestId,
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(PAYOUT_REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new PayPalError(
      'PAYPAL_OUTCOME_UNKNOWN',
      'PayPal Invoicing create request timed out or network failed.'
    );
  }

  if (!response.ok) {
    let paypalName: string | undefined;
    try {
      const errBody = (await response.json()) as Record<string, unknown>;
      paypalName = typeof errBody.name === 'string' ? errBody.name : undefined;
    } catch {
      paypalName = undefined;
    }
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      `PayPal Invoicing creation rejected with status HTTP ${response.status}.`,
      { status: response.status, paypalName }
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const rawId = data.id || data.invoice_id;
  const invoiceId = typeof rawId === 'string' ? rawId : '';
  const href = typeof data.href === 'string' ? data.href : undefined;

  return { invoiceId, href };
}

/**
 * Sends a draft invoice to the customer via PayPal (POST /v2/invoicing/invoices/{id}/send)
 */
export async function sendInvoice(
  invoiceId: string,
  sendToRecipient = true
): Promise<void> {
  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ send_to_recipient: sendToRecipient }),
        signal: AbortSignal.timeout(PAYOUT_REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      }
    );
  } catch {
    throw new PayPalError(
      'PAYPAL_OUTCOME_UNKNOWN',
      'PayPal Invoicing send request timed out or network failed.'
    );
  }

  if (!response.ok && response.status !== 202 && response.status !== 200) {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      `PayPal Invoicing send rejected with status HTTP ${response.status}.`,
      { status: response.status }
    );
  }
}

/**
 * Fetches invoice details and extract recipient_view_url (GET /v2/invoicing/invoices/{id})
 */
export async function getInvoice(invoiceId: string): Promise<PayPalInvoiceDetails> {
  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(PAYOUT_REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      }
    );
  } catch {
    throw new PayPalError(
      'PAYPAL_OUTCOME_UNKNOWN',
      'PayPal Invoicing lookup timed out or network failed.'
    );
  }

  if (!response.ok) {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      `PayPal Invoicing lookup rejected with status HTTP ${response.status}.`,
      { status: response.status }
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const detail = typeof data.detail === 'object' && data.detail !== null ? (data.detail as Record<string, unknown>) : {};
  const metadata = typeof detail.metadata === 'object' && detail.metadata !== null ? (detail.metadata as Record<string, unknown>) : {};
  const amountObj = typeof data.amount === 'object' && data.amount !== null ? (data.amount as Record<string, unknown>) : {};

  const id = typeof data.id === 'string' ? data.id : invoiceId;
  const status = typeof data.status === 'string' ? data.status.toUpperCase() : 'UNKNOWN';
  const invoiceNumber = typeof detail.invoice_number === 'string' ? detail.invoice_number : '';
  const recipientViewUrl = typeof metadata.recipient_view_url === 'string' ? metadata.recipient_view_url : null;
  const invoicerViewUrl = typeof metadata.invoicer_view_url === 'string' ? metadata.invoicer_view_url : null;

  const rawAmountVal = typeof amountObj.value === 'string' ? amountObj.value : '0';
  const amountCents = parseUSDToCents(rawAmountVal) ?? 0;
  const currency = typeof amountObj.currency_code === 'string' ? amountObj.currency_code : 'USD';

  return {
    id,
    status,
    invoiceNumber,
    recipientViewUrl,
    invoicerViewUrl,
    amountCents,
    currency,
  };
}

/**
 * Sends a reminder for an invoice using approved AI text (POST /v2/invoicing/invoices/{id}/remind)
 */
export async function remindInvoice(
  invoiceId: string,
  options: { subject?: string; note?: string; sendToInvoicer?: boolean }
): Promise<void> {
  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/remind`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          subject: options.subject || 'Payment Reminder',
          note: options.note || 'This is a gentle reminder regarding your outstanding invoice.',
          send_to_invoicer: options.sendToInvoicer ?? false,
        }),
        signal: AbortSignal.timeout(PAYOUT_REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      }
    );
  } catch {
    throw new PayPalError(
      'PAYPAL_OUTCOME_UNKNOWN',
      'PayPal Invoicing remind request timed out or network failed.'
    );
  }

  if (!response.ok && response.status !== 204 && response.status !== 200) {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      `PayPal Invoicing remind rejected with status HTTP ${response.status}.`,
      { status: response.status }
    );
  }
}

/**
 * Cancels a sent invoice (POST /v2/invoicing/invoices/{id}/cancel)
 */
export async function cancelInvoice(
  invoiceId: string,
  options?: { subject?: string; note?: string; sendToRecipient?: boolean }
): Promise<void> {
  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/cancel`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          subject: options?.subject || 'Invoice Cancelled',
          note: options?.note || 'Cancelled per merchant instructions.',
          send_to_invoicer: false,
          send_to_recipient: options?.sendToRecipient ?? true,
        }),
        signal: AbortSignal.timeout(PAYOUT_REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      }
    );
  } catch {
    throw new PayPalError(
      'PAYPAL_OUTCOME_UNKNOWN',
      'PayPal Invoicing cancel request timed out or network failed.'
    );
  }

  if (!response.ok && response.status !== 204 && response.status !== 200) {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      `PayPal Invoicing cancel rejected with status HTTP ${response.status}.`,
      { status: response.status }
    );
  }
}

/**
 * Generates a payment QR code for the invoice (POST /v2/invoicing/invoices/{id}/generate-qr-code)
 */
export async function generateInvoiceQrCode(
  invoiceId: string,
  width = 300,
  height = 300
): Promise<string> {
  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/generate-qr-code`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ width, height }),
        signal: AbortSignal.timeout(PAYOUT_REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      }
    );
  } catch {
    throw new PayPalError(
      'PAYPAL_OUTCOME_UNKNOWN',
      'PayPal QR code generation timed out or network failed.'
    );
  }

  if (!response.ok) {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      `PayPal QR code generation rejected with status HTTP ${response.status}.`,
      { status: response.status }
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('image/')) {
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  }

  const data = (await response.json()) as Record<string, unknown>;
  return typeof data.image === 'string' ? data.image : '';
}

/**
 * Records an off-PayPal external payment (POST /v2/invoicing/invoices/{id}/payments)
 */
export async function recordInvoicePayment(
  invoiceId: string,
  options: {
    amountCents: number;
    method?: 'CASH' | 'CHECK' | 'OTHER' | 'CREDIT_CARD';
    paymentDate?: string;
    note?: string;
  }
): Promise<void> {
  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/payments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          method: options.method || 'OTHER',
          payment_date: options.paymentDate || new Date().toISOString().slice(0, 10),
          amount: {
            currency_code: 'USD',
            value: centsToPayPalAmount(options.amountCents),
          },
          note: options.note || 'Recorded offline/external payment',
        }),
        signal: AbortSignal.timeout(PAYOUT_REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      }
    );
  } catch {
    throw new PayPalError(
      'PAYPAL_OUTCOME_UNKNOWN',
      'PayPal payment recording timed out or network failed.'
    );
  }

  if (!response.ok && response.status !== 200 && response.status !== 201) {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      `PayPal payment recording rejected with status HTTP ${response.status}.`,
      { status: response.status }
    );
  }
}
