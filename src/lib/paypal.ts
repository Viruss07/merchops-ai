import { centsToPayPalAmount, parseUSDToCents } from '@/lib/money';
import { PAYPAL_SANDBOX_ENABLED } from '@/lib/config';
import {
  createUnavailablePayPalBalance,
  PAYPAL_SANDBOX_ACCOUNTS_URL,
} from '@/lib/paypalBalance';
import type { PayPalBalanceSnapshot } from '@/types';

export const PERMITTED_SANDBOX_ORIGIN =
  'https://api-m.sandbox.paypal.com';

const TOKEN_SAFETY_MARGIN_MS = 60_000;
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;
const PAYOUT_REQUEST_TIMEOUT_MS = 15_000;

export type PayPalErrorCode =
  | 'PAYPAL_ENDPOINT_INVALID'
  | 'PAYPAL_AUTH_FAILED'
  | 'PAYPAL_INSUFFICIENT_FUNDS'
  | 'PAYPAL_API_REJECTED'
  | 'PAYPAL_OUTCOME_UNKNOWN'
  | 'PAYPAL_WEBHOOK_NOT_CONFIGURED'
  | 'PAYPAL_WEBHOOK_INVALID';

export class PayPalError extends Error {
  readonly code: PayPalErrorCode;
  readonly status?: number;
  readonly paypalName?: string;
  readonly paypalMessage?: string;
  readonly debugId?: string;
  readonly details?: unknown;

  constructor(
    code: PayPalErrorCode,
    message: string,
    details?: {
      status?: number;
      paypalName?: string;
      paypalMessage?: string;
      debugId?: string;
      details?: unknown;
    }
  ) {
    super(message);
    this.name = 'PayPalError';
    this.code = code;
    this.status = details?.status;
    this.paypalName = details?.paypalName;
    this.paypalMessage = details?.paypalMessage;
    this.debugId = details?.debugId;
    this.details = details?.details;
  }
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

export function clearPayPalTokenCache(): void {
  cachedToken = null;
}

function getPermittedBaseUrl(): string {
  return assertPermittedBaseUrl(
    process.env.PAYPAL_API_BASE_URL?.trim() || PERMITTED_SANDBOX_ORIGIN
  );
}

/** Throws PAYPAL_ENDPOINT_INVALID for anything but the exact sandbox origin. */
export function assertPermittedBaseUrl(configured: string): string {
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

export async function getPayPalAccessToken(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedToken !== null &&
    cachedToken.expiresAt - TOKEN_SAFETY_MARGIN_MS > now
  ) {
    return cachedToken.token;
  }

  const baseUrl = getPermittedBaseUrl();
  const { clientId, clientSecret } = getCredentials();

  const authHeader =
    'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  // Request default client_credentials grant so PayPal returns every scope enabled on the
  // Sandbox REST app (invoicing, payouts, and reporting/balances if enabled) without
  // requesting unapproved permissions or stripping app-granted Reporting scopes.
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
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
    let paypalMessage: string | undefined;
    let hasInsufficientFundsDetail = false;
    try {
      const errorBody: unknown = await response.json();
      if (typeof errorBody === 'object' && errorBody !== null) {
        const record = errorBody as Record<string, unknown>;
        if (typeof record.name === 'string' && record.name.length > 0) {
          paypalName = record.name;
        }
        if (typeof record.message === 'string' && record.message.length > 0) {
          paypalMessage = record.message;
        }
        if (Array.isArray(record.details)) {
          hasInsufficientFundsDetail = record.details.some((entry) => {
            if (typeof entry !== 'object' || entry === null) return false;
            const detailRecord = entry as Record<string, unknown>;
            return detailRecord.issue === 'INSUFFICIENT_FUNDS';
          });
        }
      }
    } catch {
      paypalName = undefined;
      paypalMessage = undefined;
      hasInsufficientFundsDetail = false;
    }

    // A 5xx or 429 does not prove the batch was not created. Treat it as an
    // unknown outcome so the payout stays reserved until a sync resolves it,
    // instead of releasing funds and telling the merchant nothing moved.
    if (response.status >= 500 || response.status === 429) {
      throw new PayPalError(
        'PAYPAL_OUTCOME_UNKNOWN',
        `PayPal Payouts API returned HTTP ${response.status}; the batch may or may not exist. Sync before retrying.`,
        { status: response.status, paypalName }
      );
    }

    const isInsufficientFunds =
      paypalName === 'INSUFFICIENT_FUNDS' ||
      hasInsufficientFundsDetail ||
      (paypalMessage?.toUpperCase().includes('INSUFFICIENT_FUNDS') ?? false);

    if (isInsufficientFunds) {
      throw new PayPalError(
        'PAYPAL_INSUFFICIENT_FUNDS',
        `PayPal Payouts rejected (INSUFFICIENT_FUNDS): insufficient available funds in your Sandbox Business wallet. Replenish funds at ${PAYPAL_SANDBOX_ACCOUNTS_URL}.`,
        {
          status: response.status,
          paypalName: paypalName ?? 'INSUFFICIENT_FUNDS',
          paypalMessage,
        }
      );
    }

    let detail = `PayPal Payouts API rejected the request with status HTTP ${response.status}.`;
    if (paypalName && paypalMessage) {
      detail = `PayPal Payouts rejected (${paypalName}): ${paypalMessage}`;
    } else if (paypalName) {
      detail = `PayPal Payouts rejected with ${paypalName} (HTTP ${response.status}).`;
    }

    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      detail,
      { status: response.status, paypalName, paypalMessage }
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
  actualFeeCents: number | null;
  insufficientFunds: boolean;
}

function extractUsdFeeCents(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const currency = record.currency ?? record.currency_code;
  if (currency !== undefined && currency !== 'USD') return null;
  if (typeof record.value !== 'string') return null;
  const trimmed = record.value.trim();
  if (/^0(?:\.0{1,2})?$/.test(trimmed)) return 0;
  return parseUSDToCents(trimmed);
}

function hasInsufficientFundsError(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const record = raw as Record<string, unknown>;
  if (record.name === 'INSUFFICIENT_FUNDS') return true;
  if (Array.isArray(record.errors)) {
    return record.errors.some(
      (err) =>
        typeof err === 'object' &&
        err !== null &&
        (err as Record<string, unknown>).name === 'INSUFFICIENT_FUNDS'
    );
  }
  return false;
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
    return {
      batchId: null,
      batchStatus: null,
      itemStatuses: [],
      outcome: 'PENDING',
      actualFeeCents: null,
      insufficientFunds: false,
    };
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

  const headerFeeCents = extractUsdFeeCents(batchHeader?.fees);

  const rawItems = Array.isArray(root.items) ? root.items : [];
  const itemStatuses: string[] = [];
  let summedItemFeesCents = 0;
  let hasItemFee = false;
  let itemInsufficientFunds = false;

  for (const item of rawItems) {
    if (typeof item !== 'object' || item === null) continue;
    const itemRecord = item as Record<string, unknown>;
    const status = itemRecord.transaction_status;
    if (typeof status === 'string') {
      itemStatuses.push(status.toUpperCase());
    }
    const itemFee = extractUsdFeeCents(itemRecord.payout_item_fee);
    if (itemFee !== null) {
      summedItemFeesCents += itemFee;
      hasItemFee = true;
    }
    if (hasInsufficientFundsError(itemRecord.errors) || hasInsufficientFundsError(itemRecord)) {
      itemInsufficientFunds = true;
    }
  }

  const insufficientFunds =
    itemInsufficientFunds ||
    hasInsufficientFundsError(batchHeader?.errors) ||
    hasInsufficientFundsError(batchHeader);

  const actualFeeCents =
    headerFeeCents !== null ? headerFeeCents : hasItemFee ? summedItemFeesCents : null;

  // Settlement is decided by item transaction_status only. A batch_status of
  // SUCCESS means PayPal finished processing the batch, not that the money
  // arrived: items can still be UNCLAIMED, ONHOLD or PENDING. Those stay PENDING.
  let outcome: PayoutBatchOutcome = 'PENDING';
  if (
    (batchStatus !== null && FAILED_BATCH_STATUSES.has(batchStatus)) ||
    itemStatuses.some((status) => FAILED_ITEM_STATUSES.has(status))
  ) {
    outcome = 'FAILED';
  } else if (itemStatuses.length > 0 && itemStatuses.every((status) => status === 'SUCCESS')) {
    outcome = 'SUCCESS';
  }

  return { batchId, batchStatus, itemStatuses, outcome, actualFeeCents, insufficientFunds };
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

/**
 * Safely extracts the final non-empty path segment from a URL string using the URL API.
 */
export function extractInvoiceIdFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    return last ? decodeURIComponent(last).trim() : null;
  } catch {
    return null;
  }
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
  paidAmountCents: number;
  dueAmountCents: number;
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

  const formattedAmount = centsToPayPalAmount(input.amountCents);

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
          value: formattedAmount,
        },
      },
    ],
    amount: {
      currency_code: input.currency || 'USD',
      value: formattedAmount,
      breakdown: {
        item_total: {
          currency_code: input.currency || 'USD',
          value: formattedAmount,
        },
      },
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

    // If 401/403, clear cached token and retry with a freshly requested scoped token
    if (response.status === 401 || response.status === 403) {
      clearPayPalTokenCache();
      const freshToken = await getPayPalAccessToken(true);
      if (freshToken && freshToken !== accessToken) {
        response = await fetch(`${baseUrl}/v2/invoicing/invoices`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${freshToken}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': requestId,
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(PAYOUT_REQUEST_TIMEOUT_MS),
          cache: 'no-store',
        });
      }
    }

    // If duplicate invoice number, retry with unique short suffix
    if (response.status === 422) {
      const errClone = response.clone();
      try {
        const errJson = (await errClone.json()) as Record<string, unknown>;
        const isDuplicate =
          Array.isArray(errJson.details) &&
          errJson.details.some(
            (d: unknown) =>
              typeof d === 'object' &&
              d !== null &&
              (d as Record<string, unknown>).issue === 'DUPLICATE_INVOICE_NUMBER'
          );
        if (isDuplicate) {
          const uniqueNumber = `${input.invoiceNumber.slice(0, 18)}-${Date.now().toString().slice(-4)}`;
          payload.detail.invoice_number = uniqueNumber;
          response = await fetch(`${baseUrl}/v2/invoicing/invoices`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'PayPal-Request-Id': `inv-create-${uniqueNumber}`,
              Accept: 'application/json',
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(PAYOUT_REQUEST_TIMEOUT_MS),
            cache: 'no-store',
          });
        }
      } catch {
        // proceed to normal error handler
      }
    }
  } catch {
    throw new PayPalError(
      'PAYPAL_OUTCOME_UNKNOWN',
      'PayPal Invoicing create request timed out or network failed.'
    );
  }

  if (!response.ok) {
    let paypalName: string | undefined;
    let paypalMessage: string | undefined;
    let paypalDebugId: string | undefined;
    let detailDescription = '';
    try {
      const errBody = (await response.json()) as Record<string, unknown>;
      paypalName = typeof errBody.name === 'string' ? errBody.name : undefined;
      paypalMessage = typeof errBody.message === 'string' ? errBody.message : undefined;
      paypalDebugId = typeof errBody.debug_id === 'string' ? errBody.debug_id : undefined;
      if (Array.isArray(errBody.details) && errBody.details.length > 0) {
        detailDescription = errBody.details
          .map((d: unknown) =>
            typeof d === 'object' && d !== null
              ? (d as Record<string, unknown>).description ||
                (d as Record<string, unknown>).issue
              : ''
          )
          .filter(Boolean)
          .join('; ');
      }
    } catch {
      paypalName = undefined;
    }

    const message =
      response.status === 403
        ? 'PayPal Invoicing rejected with HTTP 403 (NOT_AUTHORIZED): The Sandbox REST App lacks Invoicing permissions. Enable "Invoicing" under App Settings in developer.paypal.com.'
        : `PayPal Invoicing creation rejected with status HTTP ${response.status}${paypalName ? ` (${paypalName})` : ''}: ${detailDescription || paypalMessage || 'Schema or validation failure'}.`;

    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      message,
      {
        status: response.status,
        paypalName,
        paypalMessage,
        debugId: paypalDebugId || response.headers.get('paypal-debug-id') || undefined,
      }
    );
  }

  const data = (await response.json()) as Record<string, unknown>;

  let invoiceId = '';
  if (typeof data.id === 'string' && data.id.trim()) {
    invoiceId = data.id.trim();
  } else if (typeof data.invoice_id === 'string' && data.invoice_id.trim()) {
    invoiceId = data.invoice_id.trim();
  } else if (typeof data.href === 'string' && data.href.trim()) {
    const extracted = extractInvoiceIdFromUrl(data.href.trim());
    if (extracted) {
      invoiceId = extracted;
    }
  }

  if (!invoiceId) {
    const location = response.headers.get('location');
    if (location && location.trim()) {
      const extracted = extractInvoiceIdFromUrl(location.trim());
      if (extracted) {
        invoiceId = extracted;
      }
    }
  }

  if (!invoiceId) {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      'PayPal Invoicing creation succeeded with HTTP 201 Created but failed to extract a valid invoice ID from the response (checked data.id, data.invoice_id, data.href, and Location header).'
    );
  }

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
  const cleanId = typeof invoiceId === 'string' ? invoiceId.trim() : '';
  if (!cleanId) {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      'Cannot send invoice: invoiceId must be a non-empty string.'
    );
  }

  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(cleanId)}/send`,
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
  const cleanId = typeof invoiceId === 'string' ? invoiceId.trim() : '';
  if (!cleanId) {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      'Cannot retrieve invoice: invoiceId must be a non-empty string.'
    );
  }

  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(cleanId)}`,
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
    let paypalName: string | undefined;
    let paypalMessage: string | undefined;
    try {
      const errorBody: unknown = await response.json();
      if (typeof errorBody === 'object' && errorBody !== null) {
        const record = errorBody as Record<string, unknown>;
        if (typeof record.name === 'string' && record.name.length > 0) {
          paypalName = record.name;
        }
        if (typeof record.message === 'string' && record.message.length > 0) {
          paypalMessage = record.message;
        }
      }
    } catch {
      paypalName = undefined;
      paypalMessage = undefined;
    }

    const code: PayPalErrorCode =
      response.status >= 500 || response.status === 429
        ? 'PAYPAL_OUTCOME_UNKNOWN'
        : 'PAYPAL_API_REJECTED';

    let detail = `PayPal Invoicing lookup rejected with status HTTP ${response.status}.`;
    if (paypalName && paypalMessage) {
      detail = `PayPal Invoicing lookup rejected (${paypalName}, HTTP ${response.status}): ${paypalMessage}`;
    } else if (paypalName) {
      detail = `PayPal Invoicing lookup rejected with ${paypalName} (HTTP ${response.status}).`;
    } else if (paypalMessage) {
      detail = `PayPal Invoicing lookup rejected (HTTP ${response.status}): ${paypalMessage}`;
    }

    throw new PayPalError(code, detail, {
      status: response.status,
      paypalName,
      paypalMessage,
    });
  }

  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      'PayPal Invoicing lookup returned an unreadable response.'
    );
  }

  if (typeof rawPayload !== 'object' || rawPayload === null) {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      'PayPal Invoicing lookup returned an unexpected payload shape.'
    );
  }

  const data = rawPayload as Record<string, unknown>;
  const detail = typeof data.detail === 'object' && data.detail !== null ? (data.detail as Record<string, unknown>) : {};
  const metadata = typeof detail.metadata === 'object' && detail.metadata !== null ? (detail.metadata as Record<string, unknown>) : {};
  const amountObj = typeof data.amount === 'object' && data.amount !== null ? (data.amount as Record<string, unknown>) : {};
  const paymentsObj = typeof data.payments === 'object' && data.payments !== null ? (data.payments as Record<string, unknown>) : {};
  const paidAmountObj = typeof paymentsObj.paid_amount === 'object' && paymentsObj.paid_amount !== null ? (paymentsObj.paid_amount as Record<string, unknown>) : {};
  const dueAmountObj = typeof data.due_amount === 'object' && data.due_amount !== null ? (data.due_amount as Record<string, unknown>) : {};

  const id = typeof data.id === 'string' ? data.id : invoiceId;
  const status = typeof data.status === 'string' ? data.status.toUpperCase() : 'UNKNOWN';
  const invoiceNumber = typeof detail.invoice_number === 'string' ? detail.invoice_number : '';
  const recipientViewUrl = typeof metadata.recipient_view_url === 'string' ? metadata.recipient_view_url : null;
  const invoicerViewUrl = typeof metadata.invoicer_view_url === 'string' ? metadata.invoicer_view_url : null;

  const rawAmountVal = typeof amountObj.value === 'string' ? amountObj.value : '0';
  const amountCents = parseUSDToCents(rawAmountVal) ?? 0;
  const currency = typeof amountObj.currency_code === 'string' ? amountObj.currency_code : 'USD';

  const parsedPaidCents =
    typeof paidAmountObj.value === 'string' ? parseUSDToCents(paidAmountObj.value) : null;
  const parsedDueCents =
    typeof dueAmountObj.value === 'string' ? parseUSDToCents(dueAmountObj.value) : null;
  const txPaidCents = Array.isArray(paymentsObj.transactions)
    ? paymentsObj.transactions.reduce<number>((sum, tx) => {
        if (typeof tx !== 'object' || tx === null) return sum;
        const amt = (tx as Record<string, unknown>).amount;
        if (typeof amt !== 'object' || amt === null) return sum;
        const val = (amt as Record<string, unknown>).value;
        const cents = typeof val === 'string' ? parseUSDToCents(val) : null;
        return sum + (cents ?? 0);
      }, 0)
    : 0;

  const settled = status === 'PAID' || status === 'MARKED_AS_PAID';
  let paidAmountCents: number;
  if (parsedPaidCents !== null) {
    paidAmountCents = parsedPaidCents;
  } else if (txPaidCents > 0) {
    paidAmountCents = txPaidCents;
  } else if (settled) {
    paidAmountCents = amountCents;
  } else if (parsedDueCents !== null) {
    paidAmountCents = Math.max(0, amountCents - parsedDueCents);
  } else {
    paidAmountCents = 0;
  }

  let dueAmountCents: number;
  if (parsedDueCents !== null) {
    dueAmountCents = parsedDueCents;
  } else if (settled) {
    dueAmountCents = 0;
  } else {
    dueAmountCents = Math.max(0, amountCents - paidAmountCents);
  }

  return {
    id,
    status,
    invoiceNumber,
    recipientViewUrl,
    invoicerViewUrl,
    amountCents,
    paidAmountCents,
    dueAmountCents,
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
  const cleanId = typeof invoiceId === 'string' ? invoiceId.trim() : '';
  if (!cleanId) {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      'Cannot remind invoice: invoiceId must be a non-empty string.'
    );
  }

  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(cleanId)}/remind`,
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
  const cleanId = typeof invoiceId === 'string' ? invoiceId.trim() : '';
  if (!cleanId) {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      'Cannot cancel invoice: invoiceId must be a non-empty string.'
    );
  }

  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(cleanId)}/cancel`,
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
  const cleanId = typeof invoiceId === 'string' ? invoiceId.trim() : '';
  if (!cleanId) {
    throw new PayPalError(
      'PAYPAL_API_REJECTED',
      'Cannot generate invoice QR code: invoiceId must be a non-empty string.'
    );
  }

  const baseUrl = getPermittedBaseUrl();
  const accessToken = await getPayPalAccessToken();

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/v2/invoicing/invoices/${encodeURIComponent(cleanId)}/generate-qr-code`,
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

function parsePayPalAvailableUSD(rawValue: string): number | null {
  const trimmed = rawValue.trim();
  if (/^-?0(?:\.0{1,2})?$/.test(trimmed)) return 0;
  if (trimmed.startsWith('-')) {
    const absCents = parseUSDToCents(trimmed.slice(1));
    return absCents === null ? null : -absCents;
  }
  return parseUSDToCents(trimmed);
}

/**
 * Parses a PayPal Reporting API `/v1/reporting/balances` payload cleanly.
 * Never invents or substitutes an internal ledger balance if USD available balance is absent.
 */
export function parsePayPalReportingBalanceResponse(
  payload: unknown,
  checkedAt = new Date().toISOString()
): PayPalBalanceSnapshot {
  if (typeof payload !== 'object' || payload === null) {
    return createUnavailablePayPalBalance(
      'PayPal Reporting API returned an unreadable balance payload.',
      { checkedAt }
    );
  }

  const root = payload as Record<string, unknown>;
  const balances = Array.isArray(root.balances) ? root.balances : [];
  const usdEntry = balances.find((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const rec = entry as Record<string, unknown>;
    const avail =
      typeof rec.available_balance === 'object' && rec.available_balance !== null
        ? (rec.available_balance as Record<string, unknown>)
        : null;
    return rec.currency === 'USD' || avail?.currency_code === 'USD' || rec.primary === true;
  }) as Record<string, unknown> | undefined;

  const availObj =
    usdEntry && typeof usdEntry.available_balance === 'object' && usdEntry.available_balance !== null
      ? (usdEntry.available_balance as Record<string, unknown>)
      : null;

  const currency = availObj?.currency_code ?? usdEntry?.currency;
  const rawValue = typeof availObj?.value === 'string' ? availObj.value.trim() : null;
  const availableCents =
    rawValue !== null && (currency === undefined || currency === 'USD')
      ? parsePayPalAvailableUSD(rawValue)
      : null;

  if (availableCents === null) {
    return createUnavailablePayPalBalance(
      'PayPal Reporting API response did not contain a verified USD available balance.',
      { checkedAt }
    );
  }

  const asOfTime =
    typeof root.as_of_time === 'string' && root.as_of_time.length > 0
      ? root.as_of_time
      : checkedAt;

  return {
    availability: 'AVAILABLE',
    availableCents,
    currency: 'USD',
    checkedAt: asOfTime,
    source: 'PAYPAL_REPORTING_API',
    reason: null,
    lastInsufficientFundsAt: null,
    lastInsufficientFundsMessage: null,
  };
}

/**
 * Checks PayPal Sandbox available USD wallet balance using existing OAuth scopes.
 * Does NOT request extra OAuth scopes; gracefully degrades to UNAVAILABLE if the
 * current Sandbox credentials lack reporting permissions (e.g. HTTP 401/403).
 */
export async function getPayPalSandboxBalance(): Promise<PayPalBalanceSnapshot> {
  const checkedAt = new Date().toISOString();

  if (!PAYPAL_SANDBOX_ENABLED) {
    return createUnavailablePayPalBalance(
      'PayPal Sandbox payouts are disabled; live wallet balance was not queried.',
      { checkedAt }
    );
  }

  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    return createUnavailablePayPalBalance(
      'PayPal Sandbox credentials are not configured.',
      { checkedAt }
    );
  }

  let baseUrl: string;
  let accessToken: string;
  try {
    baseUrl = getPermittedBaseUrl();
    accessToken = await getPayPalAccessToken();
  } catch (error) {
    return createUnavailablePayPalBalance(
      error instanceof Error
        ? `PayPal balance unavailable: ${error.message}`
        : 'PayPal Sandbox authentication failed before querying balance.',
      { checkedAt }
    );
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/reporting/balances?currency_code=USD`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    return createUnavailablePayPalBalance(
      'PayPal balance unavailable: Reporting API timed out or was unreachable.',
      { checkedAt }
    );
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return createUnavailablePayPalBalance(
        `PayPal balance unavailable: current Sandbox app credentials lack the Reporting List Balances permission (HTTP ${response.status}). Check your available balance directly in the PayPal Sandbox wallet; internal cleared cash is not substituted.`,
        { checkedAt }
      );
    }
    return createUnavailablePayPalBalance(
      `PayPal balance unavailable (Reporting API returned HTTP ${response.status}).`,
      { checkedAt }
    );
  }

  try {
    const payload: unknown = await response.json();
    return parsePayPalReportingBalanceResponse(payload, checkedAt);
  } catch {
    return createUnavailablePayPalBalance(
      'PayPal balance unavailable: unreadable JSON from Reporting API.',
      { checkedAt }
    );
  }
}
