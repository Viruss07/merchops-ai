import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { formatCentsToUSD } from '@/lib/money';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { invoiceId } = body;

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 });
    }

    const invoices = demoStore.getInvoices();
    const invoice = invoices.find((i) => i.id === invoiceId);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
    const siteUrl = process.env.OPENROUTER_SITE_URL || 'http://localhost:3000';
    const siteName = process.env.OPENROUTER_SITE_NAME || 'MerchOps AI';

    const formattedAmount = formatCentsToUSD(invoice.amountCents);
    const paymentLink = invoice.paymentUrl || `https://sandbox.paypal.com/checkout/simulate/${invoice.id}`;

    // Sanitized prompt context: zero secrets, isolated domain data
    const promptMessage = `Draft a polite, professional, and clear payment reminder email for an overdue invoice.
Merchant Business: MerchOps Specialty Retail
Customer: ${invoice.customerName}
Invoice Number: ${invoice.invoiceNumber}
Amount Due: ${formattedAmount}
Due Date: ${invoice.dueDate} (${invoice.daysOverdue} days overdue)
Description: ${invoice.description}
PayPal Payment Link (Demo Simulation Link): ${paymentLink}

Tone Guidelines:
- Professional, respectful, but clear about the 12-day overdue status.
- State that prompt payment helps maintain uninterrupted supplier order fulfillment.
- Prominently include the PayPal Sandbox payment link.
- Return ONLY valid JSON in this format:
{
  "subject": "Payment Reminder: Invoice INV-2026-089 for Apex Corp ($1,500.00)",
  "body": "Email body content here..."
}`;

    // Check if OpenRouter API key is configured
    if (apiKey && !apiKey.startsWith('your_') && apiKey.trim().length > 10) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'HTTP-Referer': siteUrl,
            'X-Title': siteName,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: 'You are an intelligent financial operations copilot for small merchants. You draft tailored accounts receivable reminders. Always respond with strict valid JSON containing "subject" and "body".',
              },
              {
                role: 'user',
                content: promptMessage,
              },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
          }),
        });

        if (response.ok) {
          const completionData = await response.json();
          const contentStr = completionData.choices?.[0]?.message?.content;
          if (contentStr) {
            try {
              const parsed = JSON.parse(contentStr);
              if (parsed.subject && parsed.body) {
                // Log AI action in audit trail
                demoStore.addAuditLog({
                  actor: 'AI_COPILOT',
                  action: 'REMINDER_DRAFTED_OPENROUTER',
                  details: `AI generated reminder draft for ${invoice.customerName} (${invoice.invoiceNumber}) using ${model}.`,
                  amountCents: invoice.amountCents,
                  isSimulated: false,
                });

                return NextResponse.json({
                  source: 'OPENROUTER_AI',
                  model: model,
                  subject: parsed.subject,
                  body: parsed.body,
                });
              }
            } catch {
              // Fall through to template if JSON parse fails
            }
          }
        }
      } catch (err) {
        console.warn('OpenRouter call encountered an error, using reliable fallback template:', err);
      }
    }

    // Honest Fallback Template (Zero Fabrication)
    const fallbackSubject = `Friendly Reminder: Invoice ${invoice.invoiceNumber} is Overdue (${formattedAmount})`;
    const fallbackBody = `Dear ${invoice.customerName} Accounts Team,

We hope this message finds you well.

This is a friendly reminder that invoice ${invoice.invoiceNumber} for ${formattedAmount} was due on ${invoice.dueDate} and is currently ${invoice.daysOverdue} days past due.

Invoice Details:
- Invoice #: ${invoice.invoiceNumber}
- Description: ${invoice.description}
- Balance Due: ${formattedAmount}

Payment Link (Demo Simulation Link — live PayPal Invoicing API integration pending):
${paymentLink}

If you have already processed this payment, please disregard this note. Thank you for your continued partnership!

Warm regards,
Alex & the MerchOps Retail Operations Team`;

    demoStore.addAuditLog({
      actor: 'AI_COPILOT',
      action: 'REMINDER_DRAFTED_TEMPLATE',
      details: `Generated standard reminder template for ${invoice.customerName} (${invoice.invoiceNumber}).`,
      amountCents: invoice.amountCents,
      isSimulated: false,
    });

    return NextResponse.json({
      source: 'FALLBACK_TEMPLATE',
      model: 'Deterministic Template Engine',
      subject: fallbackSubject,
      body: fallbackBody,
      notice: apiKey && !apiKey.startsWith('your_')
        ? 'OpenRouter API responded with non-JSON or timeout; reliable template provided.'
        : 'OpenRouter API key is not configured in environment; reliable template provided.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal server error while drafting reminder', message: error.message },
      { status: 500 }
    );
  }
}

