import type { StateSnapshot, Invoice } from '@/types';
import type { CashPlanProposal } from '@/lib/plan/types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly snapshot?: StateSnapshot;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    snapshot?: StateSnapshot,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.snapshot = snapshot;
    this.details = details;
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
  executionMode: PayoutExecutionMode;
}

export type PayoutSettlementStatus = 'DISBURSED' | 'IN_FLIGHT';

export interface AuthorizePayoutResponse {
  success: boolean;
  status: PayoutSettlementStatus;
  mode: PayoutExecutionMode;
  isSimulated: boolean;
  billId: string;
  batchId?: string | null;
  message: string;
  snapshot: StateSnapshot;
}

export interface SyncPayoutResponse {
  success: boolean;
  status: PayoutSettlementStatus;
  billId: string;
  batchId?: string | null;
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
  [key: string]: unknown;
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
    const { error, message, snapshot, ...details } = body;
    throw new ApiError(
      response.status,
      error ?? 'HTTP_ERROR',
      message ?? `Request failed with status ${response.status}.`,
      snapshot,
      details,
    );
  }

  return payload as T;
}

export function getState(signal?: AbortSignal): Promise<StateSnapshot> {
  return request<StateSnapshot>('/api/state', { method: 'GET', signal });
}

export function proposePlan(signal?: AbortSignal): Promise<CashPlanProposal> {
  return request<CashPlanProposal>('/api/ai/propose-plan', {
    method: 'POST',
    body: JSON.stringify({}),
    signal,
  });
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

export function syncPayout(billId: string): Promise<SyncPayoutResponse> {
  return request<SyncPayoutResponse>('/api/payouts/sync', {
    method: 'POST',
    body: JSON.stringify({ billId }),
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

export interface CreatePayPalInvoiceResponse {
  success: boolean;
  paypalInvoiceId: string;
  recipientViewUrl: string | null;
  invoice: Invoice;
  snapshot: StateSnapshot;
}

export interface SyncInvoicesResponse {
  success: boolean;
  message: string;
  updated: number;
  snapshot: StateSnapshot;
}

export function createPayPalInvoice(invoiceId?: string): Promise<CreatePayPalInvoiceResponse> {
  return request<CreatePayPalInvoiceResponse>('/api/invoices/create', {
    method: 'POST',
    body: JSON.stringify({ invoiceId }),
  });
}

export function syncInvoices(invoiceId?: string): Promise<SyncInvoicesResponse> {
  return request<SyncInvoicesResponse>('/api/invoices/sync', {
    method: 'POST',
    body: JSON.stringify({ invoiceId }),
  });
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}

export interface RecordPayPalPaymentResponse {
  success: boolean;
  paypalInvoiceId: string;
  paypalStatus: string;
  message: string;
  snapshot: StateSnapshot;
}

/** Records the customer's payment on the PayPal sandbox invoice, so no buyer login is needed. */
export function recordPayPalPayment(invoiceId: string): Promise<RecordPayPalPaymentResponse> {
  return request<RecordPayPalPaymentResponse>('/api/invoices/record-payment', {
    method: 'POST',
    body: JSON.stringify({ invoiceId }),
  });
}
