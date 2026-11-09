import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { formatCentsToUSD } from '@/lib/money';
import { getModelChain } from '@/lib/ai/client';
import {
  getClientIp,
  jsonError,
  rateLimit,
  requireSameOrigin,
  sanitizeText,
} from '@/lib/http';
import {
  draftReminderSchema,
  parseJson,
  reminderDraftOutputSchema,
} from '@/lib/validation';

export const dynamic = 'force-dynamic';

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const OPENROUTER_TIMEOUT_MS = 15_000;

export async function POST(req: NextRequest) {
  const originResponse = requireSameOrigin(req);
  if (originResponse) return originResponse;

  const ip = getClientIp(req);
  if (!rateLimit(`draft-reminder:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return jsonError(
      429,
      'RATE_LIMITED',
      'Too many reminder drafts requested. Please try again shortly.'
    );
  }

  const parsed = await parseJson(req, draftReminderSchema);
  if (!parsed.ok) return parsed.response;

  const invoice = demoStore.getInvoice(parsed.data.invoiceId);
  if (!invoice) {
    return jsonError(404, 'NOT_FOUND', 'Invoice not found.');
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = getModelChain()[0];
  const siteUrl = process.env.OPENROUTER_SITE_URL || 'http://localhost:3000';
  const siteName = process.env.OPENROUTER_SITE_NAME || 'MerchOps AI';

  const customerName = sanitizeText(invoice.customerName, 200);
  const invoiceNumber = sanitizeText(invoice.invoiceNumber, 100);
  const description = sanitizeText(invoice.description, 500);
  const safePaymentUrl = sanitizeText(invoice.paymentUrl ?? '', 500);
  const paymentLink =
    safePaymentUrl ||
    `https://sandbox.paypal.com/checkout/simulate/${sanitizeText(invoice.id, 100)}`;

  const formattedAmount = formatCentsToUSD(invoice.amountCents);
  const daysOverdue = Number.isFinite(invoice.daysOverdue)
    ? invoice.daysOverdue
    : 0;
  const isOverdue = daysOverdue > 0;
  const timingPhrase = isOverdue
    ? `${daysOverdue} days overdue`
    : `due on ${sanitizeText(invoice.dueDate, 100)}`;

  const promptMessage = `Draft a polite, professional, and clear payment reminder email for an ${isOverdue ? 'overdue' : 'upcoming'} invoice.
Merchant Business: ${sanitizeText(demoStore.getSnapshot().account.businessName, 200)}
Customer: ${customerName}
Invoice Number: ${invoiceNumber}
Amount Due: ${formattedAmount}
Due Date: ${timingPhrase}
Description: ${description}
PayPal Payment Link (Demo Simulation Link): ${paymentLink}

Tone Guidelines:
- Professional and respectful, and clear about the ${timingPhrase} status.
- State that prompt payment helps maintain uninterrupted supplier order fulfillment.
- Prominently include the PayPal Sandbox payment link.
- Return ONLY valid JSON in this format:
{
  "subject": "Payment Reminder: Invoice ${invoiceNumber} for ${customerName} (${formattedAmount})",
  "body": "Email body content here..."
}`;

  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const hasUsableKey =
    trimmedKey.length > 10 && !trimmedKey.startsWith('your_');

  let notice =
    'OpenRouter API key is not configured in environment; reliable template provided.';

  if (hasUsableKey) {
    notice =
      'OpenRouter API call failed, returned invalid output, or timed out; reliable template provided.';

    try {
      const response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${trimmedKey}`,
            'HTTP-Referer': siteUrl,
            'X-Title': siteName,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content:
                  'You are an intelligent financial operations copilot for small merchants. You draft tailored accounts receivable reminders. Always respond with strict valid JSON containing "subject" and "body".',
              },
              {
                role: 'user',
                content: promptMessage,
              },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
          cache: 'no-store',
        }
      );

      if (response.ok) {
        const completionData: unknown = await response.json();
        const choices =
          typeof completionData === 'object' && completionData !== null
            ? (completionData as Record<string, unknown>).choices
            : undefined;
        const firstChoice =
          Array.isArray(choices) && choices.length > 0 ? choices[0] : undefined;
        const message =
          typeof firstChoice === 'object' && firstChoice !== null
            ? (firstChoice as Record<string, unknown>).message
            : undefined;
        const content =
          typeof message === 'object' && message !== null
            ? (message as Record<string, unknown>).content
            : undefined;

        if (typeof content === 'string') {
          let rawOutput: unknown;
          try {
            rawOutput = JSON.parse(content);
          } catch {
            rawOutput = undefined;
          }

          const outputResult =
            reminderDraftOutputSchema.safeParse(rawOutput);

          if (outputResult.success) {
            demoStore.addAuditLog({
              actor: 'AI_COPILOT',
              action: 'REMINDER_DRAFTED_OPENROUTER',
              details: `AI generated reminder draft for ${customerName} (${invoiceNumber}) using ${model}.`,
              amountCents: invoice.amountCents,
              isSimulated: false,
            });

            return NextResponse.json({
              source: 'OPENROUTER_AI',
              model,
              subject: outputResult.data.subject,
              body: outputResult.data.body,
            });
          }
        }
      }
    } catch {
      notice =
        'OpenRouter API call failed, returned invalid output, or timed out; reliable template provided.';
    }
  }

  const fallbackSubject = isOverdue
    ? `Friendly Reminder: Invoice ${invoiceNumber} is Overdue (${formattedAmount})`
    : `Upcoming Payment Reminder: Invoice ${invoiceNumber} (${formattedAmount})`;
  const fallbackBody = `Dear ${customerName} Accounts Team,

We hope this message finds you well.

This is a friendly reminder that invoice ${invoiceNumber} for ${formattedAmount} is ${isOverdue ? `currently ${daysOverdue} days past due (due on ${sanitizeText(invoice.dueDate, 100)})` : `due on ${sanitizeText(invoice.dueDate, 100)}`}.

Invoice Details:
- Invoice #: ${invoiceNumber}
- Description: ${description}
- Balance Due: ${formattedAmount}

Payment Link (Demo Simulation Link — live PayPal Invoicing API integration pending):
${paymentLink}

If you have already processed this payment, please disregard this note. Thank you for your continued partnership!

Warm regards,
Alex & the MerchOps Retail Operations Team`;

  demoStore.addAuditLog({
    actor: 'AI_COPILOT',
    action: 'REMINDER_DRAFTED_TEMPLATE',
    details: `Generated standard reminder template for ${customerName} (${invoiceNumber}).`,
    amountCents: invoice.amountCents,
    isSimulated: false,
  });

  return NextResponse.json({
    source: 'FALLBACK_TEMPLATE',
    model: 'Deterministic Template Engine',
    subject: fallbackSubject,
    body: fallbackBody,
    notice,
  });
}
