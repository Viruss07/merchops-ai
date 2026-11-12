import { getErrorMessage, type SyncInvoicesResponse } from '@/lib/apiClient';
import { formatCentsToUSD } from '@/lib/money';
import type { Tone } from '@/lib/client/states';

export interface InvoiceCheckNotice {
  tone: Tone;
  title: string;
  text: string;
  hint?: string;
  canRetry?: boolean;
}

const PERMISSION_HINT =
  'The PayPal sandbox app needs the Invoicing permission: developer.paypal.com → Apps & Credentials → your app → tick Invoicing → Save. Until then, mark it paid in simulation.';

/** Formats a completed PayPal invoice sync response into a clear user notice. */
export function formatInvoiceSyncNotice(res: SyncInvoicesResponse): InvoiceCheckNotice {
  switch (res.outcome) {
    case 'PAID': {
      const amountText =
        typeof res.paidAmountCents === 'number'
          ? formatCentsToUSD(res.paidAmountCents)
          : undefined;
      return {
        tone: 'safe',
        title: 'Payment confirmed on PayPal',
        text: amountText
          ? `PayPal confirmed payment of ${amountText}. The ledger has been updated.`
          : res.message,
      };
    }
    case 'ALREADY_PAID': {
      const amountText =
        typeof res.paidAmountCents === 'number'
          ? formatCentsToUSD(res.paidAmountCents)
          : undefined;
      return {
        tone: 'safe',
        title: 'Payment already confirmed',
        text: amountText
          ? `PayPal confirmed ${amountText} is already settled. No duplicate ledger credit was applied.`
          : res.message,
      };
    }
    case 'PARTIALLY_PAID': {
      const hasAmounts =
        typeof res.paidAmountCents === 'number' && typeof res.dueAmountCents === 'number';
      return {
        tone: 'risk',
        title: 'Partially paid on PayPal',
        text: hasAmounts
          ? `${formatCentsToUSD(res.paidAmountCents!)} received; ${formatCentsToUSD(res.dueAmountCents!)} remaining balance.`
          : res.message,
      };
    }
    case 'UNPAID':
      return {
        tone: 'risk',
        title: 'Invoice is still unpaid',
        text:
          res.paypalStatus === 'PAYMENT_PENDING'
            ? 'PayPal confirms this invoice is still unpaid. Buyer payment is pending clearance.'
            : 'PayPal confirms this invoice is still unpaid.',
      };
    default:
      return {
        tone: res.updated > 0 ? 'safe' : 'risk',
        title: res.updated > 0 ? 'Payment confirmed on PayPal' : 'PayPal check complete',
        text: res.message || 'Checked PayPal for payment.',
      };
  }
}

/** Formats a failed invoice action into a retryable error notice. */
export function formatInvoiceActionErrorNotice(
  failTitle: string,
  error: unknown,
  options?: { allowRetry?: boolean; status?: number },
): InvoiceCheckNotice {
  return {
    tone: 'blocked',
    title: failTitle,
    text: getErrorMessage(error),
    hint: options?.status === 403 ? PERMISSION_HINT : undefined,
    canRetry: options?.allowRetry,
  };
}

