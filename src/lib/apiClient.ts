import type { StateSnapshot } from '@/types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly snapshot?: StateSnapshot;

  constructor(status: number, code: string, message: string, snapshot?: StateSnapshot) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.snapshot = snapshot;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export interface SimulatePaymentResponse {
  success: boolean;
  message: string;
  snapshot: StateSnapshot;
}

export type PayoutExecutionMode = 'SIMULATION' | 'PAYPAL_SANDBOX';

export interface AuthorizePayoutInput {
  billId: string;
  idempotencyKey: string;
  executionMode: PayoutExecutionMode;
}

export interface AuthorizePayoutResponse {
  success: boolean;
  mode: PayoutExecutionMode;
  isSimulated: boolean;
  billId: string;
  batchId?: string;
  message: string;
  snapshot: StateSnapshot;
}

export interface ResetDemoResponse {
  success: boolean;
  message: string;
  snapshot: StateSnapshot;
}

export interface ApproveReminderInput {
  invoiceId: string;
  subject: string;
  body: string;
}

export interface ApproveReminderResponse {
  success: boolean;
  message: string;
  snapshot: StateSnapshot;
}

export type ReminderSource = 'OPENROUTER_AI' | 'FALLBACK_TEMPLATE';

export interface DraftReminderResponse {
  source: ReminderSource;
  model: string;
  subject: string;
  body: string;
  notice?: string;
}

interface ErrorBody {
  error?: string;
  message?: string;
  snapshot?: StateSnapshot;
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Unable to reach the server. Check your connection and try again.',
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const body = (payload ?? {}) as ErrorBody;
    throw new ApiError(
      response.status,
      body.error ?? 'HTTP_ERROR',
      body.message ?? `Request failed with status ${response.status}.`,
      body.snapshot,
    );
  }

  return payload as T;
}

export function getState(signal?: AbortSignal): Promise<StateSnapshot> {
  return request<StateSnapshot>('/api/state', { method: 'GET', signal });
}

export function simulatePayment(invoiceId: string): Promise<SimulatePaymentResponse> {
  return request<SimulatePaymentResponse>('/api/invoices/simulate-payment', {
    method: 'POST',
    body: JSON.stringify({ invoiceId }),
  });
}

export function authorizePayout(input: AuthorizePayoutInput): Promise<AuthorizePayoutResponse> {
  return request<AuthorizePayoutResponse>('/api/payouts/authorize', {
    method: 'POST',
    body: JSON.stringify({ ...input, confirmed: true }),
  });
}

export function resetDemo(): Promise<ResetDemoResponse> {
  return request<ResetDemoResponse>('/api/reset', {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  });
}

export function approveReminder(input: ApproveReminderInput): Promise<ApproveReminderResponse> {
  return request<ApproveReminderResponse>('/api/reminders/approve', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function draftReminder(
  invoiceId: string,
  signal?: AbortSignal,
): Promise<DraftReminderResponse> {
  return request<DraftReminderResponse>('/api/ai/draft-reminder', {
    method: 'POST',
    body: JSON.stringify({ invoiceId }),
    signal,
  });
}

function uuidV4FromRandomValues(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

export function createIdempotencyKey(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    return uuidV4FromRandomValues();
  }
  throw new ApiError(
    0,
    'CRYPTO_UNAVAILABLE',
    'A secure random number generator is required to authorize payouts.',
  );
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}
