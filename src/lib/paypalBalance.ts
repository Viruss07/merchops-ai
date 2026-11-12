import type {
  Bill,
  PayPalBalanceSnapshot,
  PayPalBalanceStatus,
  StateSnapshot,
} from '@/types';
import { formatCentsToUSD } from '@/lib/money';

export const PAYPAL_SANDBOX_ACCOUNTS_URL = 'https://developer.paypal.com/dashboard/accounts';

/** Default cushion threshold (500 USD) below which a remaining PayPal balance triggers Low Balance. */
export const PAYPAL_LOW_BALANCE_CUSHION_CENTS = 50_000;

export interface PayPalWalletEvaluation {
  status: PayPalBalanceStatus;
  availableCents: number | null;
  billAmountCents: number;
  feeCents: number;
  requiredCents: number;
  shortfallCents: number;
  remainingCents: number | null;
  canSubmitSandboxPayout: boolean;
  headline: string;
  detail: string;
  dashboardUrl: string;
}

export interface PayPalPortfolioEvaluation {
  status: PayPalBalanceStatus;
  availableCents: number | null;
  openBillsCount: number;
  openBillsTotalCents: number;
  openBillsFeesCents: number;
  totalRequiredCents: number;
  nextPayableBill: {
    id: string;
    vendorName: string;
    requiredCents: number;
    shortfallCents: number;
  } | null;
  blockedByPayPalCount: number;
  headline: string;
  detail: string;
  dashboardUrl: string;
}

export function createUnavailablePayPalBalance(
  reason = 'PayPal balance has not been verified from the Sandbox Reporting API.',
  overrides?: Partial<PayPalBalanceSnapshot>
): PayPalBalanceSnapshot {
  return {
    availability: 'UNAVAILABLE',
    availableCents: null,
    currency: 'USD',
    checkedAt: overrides?.checkedAt ?? null,
    source: 'UNVERIFIED',
    reason,
    lastInsufficientFundsAt: overrides?.lastInsufficientFundsAt ?? null,
    lastInsufficientFundsMessage: overrides?.lastInsufficientFundsMessage ?? null,
  };
}

/**
 * Evaluates whether verified PayPal Sandbox funds cover a single bill payout (amount + PayPal API fee).
 * Never substitutes internal cleared ledger cash when PayPal wallet balance is unavailable.
 */
export function evaluateBillPayPalBalance(input: {
  paypalBalance: PayPalBalanceSnapshot;
  billAmountCents: number;
  feeCents: number;
}): PayPalWalletEvaluation {
  const billAmountCents = Math.max(0, input.billAmountCents);
  const feeCents = Math.max(0, input.feeCents);
  const requiredCents = billAmountCents + feeCents;
  const { paypalBalance } = input;

  if (paypalBalance.availability !== 'AVAILABLE' || paypalBalance.availableCents === null) {
    return {
      status: 'UNAVAILABLE',
      availableCents: null,
      billAmountCents,
      feeCents,
      requiredCents,
      shortfallCents: 0,
      remainingCents: null,
      canSubmitSandboxPayout: true,
      headline: 'PayPal balance unavailable',
      detail:
        paypalBalance.reason ??
        'Sandbox wallet balance cannot be verified with current API permissions. Internal cleared cash does not guarantee PayPal wallet funding.',
      dashboardUrl: PAYPAL_SANDBOX_ACCOUNTS_URL,
    };
  }

  const availableCents = paypalBalance.availableCents;

  if (availableCents < requiredCents) {
    const shortfallCents = requiredCents - availableCents;
    return {
      status: 'INSUFFICIENT',
      availableCents,
      billAmountCents,
      feeCents,
      requiredCents,
      shortfallCents,
      remainingCents: null,
      canSubmitSandboxPayout: false,
      headline: `Insufficient PayPal balance (${formatCentsToUSD(shortfallCents)} short)`,
      detail: `Needs ${formatCentsToUSD(requiredCents)} (${formatCentsToUSD(billAmountCents)} payout + ${formatCentsToUSD(feeCents)} PayPal fee), but Sandbox wallet holds ${formatCentsToUSD(availableCents)}. Replenish Sandbox funds before paying.`,
      dashboardUrl: PAYPAL_SANDBOX_ACCOUNTS_URL,
    };
  }

  const remainingCents = availableCents - requiredCents;
  const lowThreshold = Math.min(PAYPAL_LOW_BALANCE_CUSHION_CENTS, Math.max(25_000, Math.round(requiredCents * 0.25)));

  if (remainingCents < lowThreshold) {
    return {
      status: 'LOW',
      availableCents,
      billAmountCents,
      feeCents,
      requiredCents,
      shortfallCents: 0,
      remainingCents,
      canSubmitSandboxPayout: true,
      headline: `Low PayPal balance after payout (${formatCentsToUSD(remainingCents)} left)`,
      detail: `Covers ${formatCentsToUSD(requiredCents)} now, leaving ${formatCentsToUSD(remainingCents)} in the Sandbox wallet.`,
      dashboardUrl: PAYPAL_SANDBOX_ACCOUNTS_URL,
    };
  }

  return {
    status: 'SUFFICIENT',
    availableCents,
    billAmountCents,
    feeCents,
    requiredCents,
    shortfallCents: 0,
    remainingCents,
    canSubmitSandboxPayout: true,
    headline: 'Sufficient PayPal balance',
    detail: `Verified Sandbox wallet (${formatCentsToUSD(availableCents)}) covers ${formatCentsToUSD(requiredCents)} (${formatCentsToUSD(remainingCents)} remaining).`,
    dashboardUrl: PAYPAL_SANDBOX_ACCOUNTS_URL,
  };
}

/**
 * Portfolio-level PayPal Sandbox wallet status for the Bills overview card.
 */
export function evaluatePortfolioPayPalBalance(
  snapshot: StateSnapshot,
  openBills?: Bill[]
): PayPalPortfolioEvaluation {
  const feePerPayout = snapshot.demoConfig.paypalPayoutFeeCents;
  const targetBills =
    openBills ??
    snapshot.bills.filter(
      (b) => b.status === 'PENDING' || b.status === 'APPROVED' || b.status === 'FAILED'
    );

  const openBillsTotalCents = targetBills.reduce((sum, b) => sum + b.amountCents, 0);
  const openBillsFeesCents = targetBills.length * feePerPayout;
  const totalRequiredCents = openBillsTotalCents + openBillsFeesCents;
  const { paypalBalance } = snapshot;

  if (paypalBalance.availability !== 'AVAILABLE' || paypalBalance.availableCents === null) {
    return {
      status: 'UNAVAILABLE',
      availableCents: null,
      openBillsCount: targetBills.length,
      openBillsTotalCents,
      openBillsFeesCents,
      totalRequiredCents,
      nextPayableBill: null,
      blockedByPayPalCount: 0,
      headline: 'PayPal balance unavailable',
      detail:
        paypalBalance.reason ??
        'Sandbox wallet balance could not be verified with existing PayPal API scopes. Never assume internal cleared cash exists in PayPal.',
      dashboardUrl: PAYPAL_SANDBOX_ACCOUNTS_URL,
    };
  }

  const availableCents = paypalBalance.availableCents;
  const sortedByDue = [...targetBills].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const blockedBills = sortedByDue.filter((b) => availableCents < b.amountCents + feePerPayout);

  const primaryBill = sortedByDue[0] ?? null;
  const nextPayableBill = primaryBill
    ? {
        id: primaryBill.id,
        vendorName: primaryBill.vendorName,
        requiredCents: primaryBill.amountCents + feePerPayout,
        shortfallCents: Math.max(0, primaryBill.amountCents + feePerPayout - availableCents),
      }
    : null;

  if (targetBills.length > 0 && blockedBills.length === targetBills.length && nextPayableBill) {
    return {
      status: 'INSUFFICIENT',
      availableCents,
      openBillsCount: targetBills.length,
      openBillsTotalCents,
      openBillsFeesCents,
      totalRequiredCents,
      nextPayableBill,
      blockedByPayPalCount: blockedBills.length,
      headline: 'Insufficient PayPal balance',
      detail: `Sandbox wallet (${formatCentsToUSD(availableCents)}) is ${formatCentsToUSD(nextPayableBill.shortfallCents)} short for ${nextPayableBill.vendorName} (${formatCentsToUSD(nextPayableBill.requiredCents)} incl. fee). Replenish Sandbox funds.`,
      dashboardUrl: PAYPAL_SANDBOX_ACCOUNTS_URL,
    };
  }

  if (
    blockedBills.length > 0 ||
    (targetBills.length > 0 && availableCents < totalRequiredCents) ||
    availableCents < PAYPAL_LOW_BALANCE_CUSHION_CENTS
  ) {
    const firstBlocked = blockedBills[0];
    const detail = firstBlocked
      ? `Sandbox wallet (${formatCentsToUSD(availableCents)}) cannot cover ${firstBlocked.vendorName} (${formatCentsToUSD(firstBlocked.amountCents + feePerPayout)} incl. ${formatCentsToUSD(feePerPayout)} fee).`
      : targetBills.length > 0 && availableCents < totalRequiredCents
        ? `Sandbox wallet (${formatCentsToUSD(availableCents)}) covers individual small bills, but falls ${formatCentsToUSD(totalRequiredCents - availableCents)} short of all ${targetBills.length} unpaid bills (${formatCentsToUSD(totalRequiredCents)}).`
        : `Sandbox wallet holds ${formatCentsToUSD(availableCents)}, below the ${formatCentsToUSD(PAYPAL_LOW_BALANCE_CUSHION_CENTS)} low-balance threshold.`;

    return {
      status: blockedBills.length > 0 && sortedByDue.length === 1 ? 'INSUFFICIENT' : 'LOW',
      availableCents,
      openBillsCount: targetBills.length,
      openBillsTotalCents,
      openBillsFeesCents,
      totalRequiredCents,
      nextPayableBill,
      blockedByPayPalCount: blockedBills.length,
      headline:
        blockedBills.length > 0 && sortedByDue.length === 1
          ? 'Insufficient PayPal balance'
          : 'Low PayPal balance',
      detail,
      dashboardUrl: PAYPAL_SANDBOX_ACCOUNTS_URL,
    };
  }

  return {
    status: 'SUFFICIENT',
    availableCents,
    openBillsCount: targetBills.length,
    openBillsTotalCents,
    openBillsFeesCents,
    totalRequiredCents,
    nextPayableBill,
    blockedByPayPalCount: 0,
    headline: 'Sufficient PayPal balance',
    detail:
      targetBills.length > 0
        ? `Verified Sandbox wallet (${formatCentsToUSD(availableCents)}) covers all ${targetBills.length} unpaid bills (${formatCentsToUSD(totalRequiredCents)} incl. fees).`
        : `Verified Sandbox wallet holds ${formatCentsToUSD(availableCents)} with no open bills pending.`,
    dashboardUrl: PAYPAL_SANDBOX_ACCOUNTS_URL,
  };
}

