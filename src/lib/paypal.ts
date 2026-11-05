import { centsToPayPalAmount } from '@/lib/money';

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

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/payments/payouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': params.idempotencyKey,
      },
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
