import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError } from '@/lib/http';

export const invoiceIdSchema = z.string().min(1).max(100);

export const invoiceIdBodySchema = z.object({
  invoiceId: invoiceIdSchema,
});

export const invoiceCreateSchema = z.object({
  invoiceId: invoiceIdSchema.optional(),
  invoiceNumber: z.string().min(1).max(50).optional(),
  customerName: z.string().min(1).max(100).optional(),
  customerEmail: z.string().email().optional(),
  amountCents: z.number().int().positive().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().min(1).max(500).optional(),
});

export const invoiceSyncSchema = z.object({
  invoiceId: invoiceIdSchema.optional(),
});

export const payoutSchema = z.object({
  billId: z.string().min(1).max(100),
  confirmed: z.literal(true),
  executionMode: z
    .enum(['SIMULATION', 'PAYPAL_SANDBOX'])
    .optional()
    .default('SIMULATION'),
});

export const payoutSyncSchema = z.object({
  billId: z.string().min(1).max(100),
});

export const resetSchema = z.object({
  confirm: z.literal(true),
});

export const reminderApproveSchema = z.object({
  invoiceId: invoiceIdSchema,
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});

export const draftReminderSchema = invoiceIdBodySchema;

export const reminderDraftOutputSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});

export type PayoutInput = z.infer<typeof payoutSchema>;
export type ResetInput = z.infer<typeof resetSchema>;
export type ReminderApproveInput = z.infer<typeof reminderApproveSchema>;
export type DraftReminderInput = z.infer<typeof draftReminderSchema>;
export type ReminderDraftOutput = z.infer<typeof reminderDraftOutputSchema>;

export type ParseJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function parseJson<T extends z.ZodTypeAny>(
  req: NextRequest,
  schema: T
): Promise<ParseJsonResult<z.infer<T>>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      response: jsonError(
        400,
        'VALIDATION_ERROR',
        'Request body must be valid JSON.'
      ),
    };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      ok: false,
      response: jsonError(
        400,
        'VALIDATION_ERROR',
        'Request body validation failed.'
      ),
    };
  }

  return { ok: true, data: result.data };
}
