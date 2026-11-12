'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAppState } from '@/components/shell/AppState';
import { StatusPill, TONE_SURFACE, btn } from '@/components/ui/kit';
import { getErrorMessage, getPayPalBalance } from '@/lib/apiClient';
import { calculatePayoutFeeCents, formatCentsToUSD } from '@/lib/money';
import { formatStamp, type Tone } from '@/lib/client/states';
import {
  evaluateBillPayPalBalance,
  evaluatePortfolioPayPalBalance,
  PAYPAL_SANDBOX_ACCOUNTS_URL,
} from '@/lib/paypalBalance';
import type { Bill, PayPalBalanceStatus, StateSnapshot } from '@/types';

const STATUS_UI: Record<PayPalBalanceStatus, { label: string; tone: Tone }> = {
  SUFFICIENT: { label: 'Sufficient balance', tone: 'safe' },
  LOW: { label: 'Low balance', tone: 'risk' },
  INSUFFICIENT: { label: 'Insufficient balance', tone: 'blocked' },
  UNAVAILABLE: { label: 'Balance unavailable', tone: 'neutral' },
};

export function PayPalBalanceCard({
  snapshot,
  bill,
}: {
  snapshot: StateSnapshot;
  bill?: Bill;
}) {
  const { setSnapshot } = useAppState();
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const paypalFeeCents = snapshot.demoConfig.paypalPayoutFeeCents;
  const isBillSettled = bill?.status === 'DISBURSED';
  const isBillInFlight = bill?.status === 'IN_FLIGHT';
  const billEvaluation = bill
    ? evaluateBillPayPalBalance({
        paypalBalance: snapshot.paypalBalance,
        billAmountCents: bill.amountCents,
        feeCents: paypalFeeCents,
      })
    : null;
  const portfolioEvaluation = bill ? null : evaluatePortfolioPayPalBalance(snapshot);
  const evaluation = billEvaluation ?? portfolioEvaluation!;

  const hasOpenBillsNeedingDispatch = bill
    ? bill.status === 'PENDING' || bill.status === 'APPROVED' || bill.status === 'FAILED'
    : (portfolioEvaluation?.openBillsCount ?? 0) > 0;

  const statusMeta = isBillSettled
    ? { label: 'Settled · Paid', tone: 'safe' as Tone }
    : isBillInFlight
      ? { label: 'Payout processing', tone: 'risk' as Tone }
      : STATUS_UI[evaluation.status];
  const hasInsufficientFundsRejection =
    !isBillSettled &&
    !isBillInFlight &&
    hasOpenBillsNeedingDispatch &&
    Boolean(snapshot.paypalBalance.lastInsufficientFundsAt);

  // Auto-query read-only PayPal balance once per session when Sandbox is enabled and unchecked.
  useEffect(() => {
    if (!snapshot.capabilities.paypalSandboxEnabled) return;
    if (snapshot.paypalBalance.checkedAt !== null) return;

    let cancelled = false;
    const controller = new AbortController();
    setRefreshing(true);

    void getPayPalBalance(controller.signal)
      .then((res) => {
        if (!cancelled) {
          setSnapshot(res.snapshot);
          setFetchError(null);
        }
      })
      .catch((caught) => {
        if (!cancelled && !(caught instanceof DOMException && caught.name === 'AbortError')) {
          setFetchError(getErrorMessage(caught));
        }
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [snapshot.capabilities.paypalSandboxEnabled, snapshot.paypalBalance.checkedAt, setSnapshot]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setFetchError(null);
    try {
      const res = await getPayPalBalance();
      setSnapshot(res.snapshot);
    } catch (caught) {
      setFetchError(getErrorMessage(caught));
    } finally {
      setRefreshing(false);
    }
  };

  const reserveFeeCapCents = bill
    ? calculatePayoutFeeCents(bill.amountCents)
    : calculatePayoutFeeCents(300_000);
  const verifiedBatchFeeCents = snapshot.account.payoutVerification?.actualFeeCents;
  const shortfallCents =
    'shortfallCents' in evaluation
      ? evaluation.shortfallCents
      : (evaluation.nextPayableBill?.shortfallCents ?? 0);

  return (
    <section
      aria-label="PayPal Sandbox Balance Status"
      className={`rounded-xl border p-4 ${TONE_SURFACE[statusMeta.tone]}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">PayPal Sandbox Wallet</h2>
            <StatusPill label={statusMeta.label} tone={statusMeta.tone} />
            {snapshot.paypalBalance.checkedAt && (
              <span className="text-xs text-ink-3">
                Checked {formatStamp(snapshot.paypalBalance.checkedAt)}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">
            {isBillSettled && bill
              ? `Final settlement confirmed for ${formatCentsToUSD(bill.amountCents)} to ${bill.vendorName}${bill.paypalBatchId ? ` (Batch ${bill.paypalBatchId})` : ''}. Historical warnings remain preserved in the audit log.`
              : isBillInFlight && bill
                ? `Batch ${bill.paypalBatchId ?? 'pending'} is processing at PayPal. No pre-payout check or duplicate debit applies while PayPal settles.`
                : evaluation.detail}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className={btn.small}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {refreshing ? 'Checking…' : 'Check balance'}
          </button>
          <a
            href={PAYPAL_SANDBOX_ACCOUNTS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={btn.small}
          >
            Sandbox Accounts
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Three separated cash figures: never substitute internal cleared cash for PayPal wallet */}
      <dl className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div className="rounded-lg border border-rule bg-paper/80 px-3 py-2.5">
          <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-2">
            MerchOps Cleared Cash
          </dt>
          <dd className="money mt-0.5 text-base font-semibold text-ink">
            {formatCentsToUSD(snapshot.account.clearedBalanceCents)}
          </dd>
          <p className="mt-0.5 text-[11px] text-ink-3">Internal ledger balance</p>
        </div>

        <div className="rounded-lg border border-rule bg-paper/80 px-3 py-2.5">
          <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-2">
            Safety Reserve Floor
          </dt>
          <dd className="money mt-0.5 text-base font-semibold text-ink">
            {formatCentsToUSD(snapshot.account.minReserveCents)}
          </dd>
          <p className="mt-0.5 text-[11px] text-ink-3">Protected post-payout minimum</p>
        </div>

        <div className="rounded-lg border border-rule bg-paper/80 px-3 py-2.5">
          <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-2">
            PayPal Sandbox Available
          </dt>
          <dd
            className={`mt-0.5 text-base font-semibold ${
              evaluation.availableCents !== null && isBillSettled
                ? 'money text-ink'
                : evaluation.status === 'INSUFFICIENT'
                  ? 'money text-blocked'
                  : evaluation.status === 'LOW'
                    ? 'money text-risk'
                    : evaluation.status === 'SUFFICIENT'
                      ? 'money text-safe'
                      : 'text-ink-2'
            }`}
          >
            {evaluation.availableCents !== null
              ? formatCentsToUSD(evaluation.availableCents)
              : 'PayPal balance unavailable'}
          </dd>
          <p className="mt-0.5 text-[11px] text-ink-3">
            {evaluation.availableCents !== null
              ? 'Verified via PayPal Reporting API'
              : 'Check directly in PayPal Sandbox wallet'}
          </p>
        </div>
      </dl>

      {/* Reconciled PayPal fee vs reserve check fee */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-rule/80 pt-2.5 text-xs text-ink-2">
        <span>
          PayPal Payouts API fee:{' '}
          <strong className="money text-ink">{formatCentsToUSD(paypalFeeCents)}</strong> flat
          {verifiedBatchFeeCents != null && (
            <>
              {' '}
              · Last settled batch fee:{' '}
              <strong className="money text-ink">{formatCentsToUSD(verifiedBatchFeeCents)}</strong>
            </>
          )}{' '}
          {!isBillSettled && (
            <>
              · Reserve guard buffer:{' '}
              <strong className="money text-ink">{formatCentsToUSD(reserveFeeCapCents)}</strong>
            </>
          )}
        </span>
        {bill && (
          <span className="money font-medium text-ink">
            {isBillSettled
              ? `Settled payout: ${formatCentsToUSD(bill.amountCents)}${bill.actualFeeCents != null ? ` (+ ${formatCentsToUSD(bill.actualFeeCents)} fee)` : ''}`
              : `PayPal check total: ${formatCentsToUSD(bill.amountCents + paypalFeeCents)}`}
          </span>
        )}
      </div>

      {/* Warning when PayPal wallet cannot be verified (never shown as pending warning on settled bills) */}
      {evaluation.status === 'UNAVAILABLE' &&
        !isBillSettled &&
        !isBillInFlight &&
        hasOpenBillsNeedingDispatch && (
          <div
            role="status"
            className="mt-3 flex items-start gap-2 rounded-lg border border-rule-strong bg-paper/90 px-3 py-2 text-xs text-ink-2"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-risk" aria-hidden="true" />
            <span>
              <strong className="text-ink">PayPal balance unavailable:</strong> Internal cleared cash (
              <span className="money">{formatCentsToUSD(snapshot.account.clearedBalanceCents)}</span>)
              is separate from your PayPal Sandbox wallet. Confirm funds in{' '}
              <a
                href={PAYPAL_SANDBOX_ACCOUNTS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-focus underline"
              >
                PayPal Developer Sandbox Accounts
              </a>{' '}
              before dispatching; MerchOps never guesses whether wallet funds are sufficient or insufficient.
            </span>
          </div>
        )}

      {/* Explicit warning banner after INSUFFICIENT_FUNDS API failure or verified shortfall (suppressed once settled) */}
      {!isBillSettled &&
        !isBillInFlight &&
        hasOpenBillsNeedingDispatch &&
        (evaluation.status === 'INSUFFICIENT' || hasInsufficientFundsRejection) && (
          <div
            role="alert"
            className="mt-3 flex flex-wrap items-start justify-between gap-2 rounded-lg border border-blocked/40 bg-blocked-field/80 px-3 py-2.5 text-xs text-ink"
          >
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-blocked" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold text-blocked">
                  {evaluation.status === 'INSUFFICIENT'
                    ? `Blocked before dispatch · ${formatCentsToUSD(shortfallCents)} PayPal Sandbox shortfall`
                    : 'PayPal Sandbox returned INSUFFICIENT_FUNDS'}
                </p>
                <p className="mt-0.5 text-ink-2">
                  {hasInsufficientFundsRejection && snapshot.paypalBalance.lastInsufficientFundsMessage
                    ? `${snapshot.paypalBalance.lastInsufficientFundsMessage} `
                    : ''}
                  Failed payout status is preserved, internal ledger was not debited, and automatic retry is disabled.
                </p>
              </div>
            </div>
            <a
              href={PAYPAL_SANDBOX_ACCOUNTS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-blocked underline"
            >
              Top up in Sandbox Dashboard
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        )}

      {fetchError && (
        <p className="mt-2 text-xs text-risk">Could not query balance endpoint: {fetchError}</p>
      )}
    </section>
  );
}
