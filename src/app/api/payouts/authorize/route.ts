import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/store';
import { formatCentsToUSD, evaluatePayoutPolicy } from '@/lib/money';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { billId, confirmed, idempotencyKey, executionMode = 'SIMULATION' } = body;

    // Guard 1: Validate payload parameters
    if (!billId || !idempotencyKey) {
      return NextResponse.json(
        { error: 'MISSING_PARAMETERS', message: 'billId and idempotencyKey are required.' },
        { status: 400 }
      );
    }

    if (!confirmed) {
      return NextResponse.json(
        { error: 'MERCHANT_APPROVAL_REQUIRED', message: 'Explicit merchant confirmation is mandatory for all outbound payouts.' },
        { status: 400 }
      );
    }

    // Guard 2: Enforce Idempotency Protection
    // NOTE: In-memory duplicate protection for demo purposes. Resets on server restart and is not production-ready.
    if (demoStore.hasIdempotencyKey(idempotencyKey)) {
      return NextResponse.json(
        {
          error: 'DUPLICATE_REQUEST',
          message: `Idempotency violation: Payout with key "${idempotencyKey}" has already been processed.`,
        },
        { status: 409 }
      );
    }

    // Guard 3: Validate Bill & Status
    const bills = demoStore.getBills();
    const bill = bills.find((b) => b.id === billId);

    if (!bill) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Vendor bill not found.' }, { status: 404 });
    }

    if (bill.status === 'DISBURSED') {
      return NextResponse.json(
        { error: 'ALREADY_DISBURSED', message: `Bill ${bill.billNumber} has already been paid and settled.` },
        { status: 400 }
      );
    }

    // Guard 4: Enforce Minimum Cash Reserve Protection
    const account = demoStore.getAccount();
    const policy = evaluatePayoutPolicy({
      currentBalanceCents: account.clearedBalanceCents,
      minReserveCents: account.minReserveCents,
      billAmountCents: bill.amountCents,
    });

    if (!policy.allowed) {
      // Record blocked attempt in audit log
      demoStore.addAuditLog({
        actor: 'SYSTEM',
        action: 'PAYOUT_BLOCKED_RESERVE_BREACH',
        details: `Blocked payout of ${formatCentsToUSD(bill.amountCents)} to ${bill.vendorName}. Projected balance ${formatCentsToUSD(policy.postPayoutBalanceCents)} breaches ${formatCentsToUSD(account.minReserveCents)} reserve by ${formatCentsToUSD(policy.deficitCents)}.`,
        amountCents: bill.amountCents,
        isSimulated: executionMode === 'SIMULATION',
      });

      return NextResponse.json(
        {
          error: 'RESERVE_BREACH_BLOCKED',
          message: `Payout blocked by Cash Reserve Policy. Paying ${formatCentsToUSD(bill.amountCents)} would drop cleared cash to ${formatCentsToUSD(policy.postPayoutBalanceCents)}, breaching your ${formatCentsToUSD(account.minReserveCents)} reserve floor by ${formatCentsToUSD(policy.deficitCents)}.`,
          postPayoutBalanceCents: policy.postPayoutBalanceCents,
          reserveCents: account.minReserveCents,
          deficitCents: policy.deficitCents,
          bufferCents: policy.bufferCents,
        },
        { status: 403 }
      );
    }

    // Guard 5: Execution Mode (PayPal Sandbox Live API vs. Simulation Fallback)
    if (executionMode === 'PAYPAL_SANDBOX') {
      const PERMITTED_SANDBOX_ORIGIN = 'https://api-m.sandbox.paypal.com';
      const configuredBaseUrl = process.env.PAYPAL_API_BASE_URL || PERMITTED_SANDBOX_ORIGIN;

      // Strict Security Lockdown: Only the official PayPal Sandbox origin is permitted
      if (configuredBaseUrl !== PERMITTED_SANDBOX_ORIGIN) {
        return NextResponse.json(
          {
            error: 'INVALID_PAYPAL_ENDPOINT',
            message: `Security Lockdown: Only the official PayPal Sandbox API (${PERMITTED_SANDBOX_ORIGIN}) is permitted. Configured endpoint origin is rejected.`,
          },
          { status: 500 }
        );
      }

      const baseUrl = PERMITTED_SANDBOX_ORIGIN;
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

      if (!clientId || !clientSecret || clientId.startsWith('your_')) {
        return NextResponse.json(
          {
            error: 'PAYPAL_CREDENTIALS_MISSING',
            message: 'PayPal Sandbox credentials not configured in environment. Use simulated payout mode instead.',
          },
          { status: 503 }
        );
      }

      // Step A: Request OAuth Token
      const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      if (!tokenRes.ok) {
        return NextResponse.json(
          {
            error: 'PAYPAL_AUTH_FAILED',
            message: `PayPal Sandbox OAuth failed with status HTTP ${tokenRes.status}.`,
          },
          { status: 502 }
        );
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // Step B: Dispatch Payouts Batch Request
      const payoutPayload = {
        sender_batch_header: {
          sender_batch_id: `batch-${idempotencyKey.slice(0, 16)}`,
          email_subject: `Payment from ${account.businessName}`,
          email_message: `You received payment for bill ${bill.billNumber}.`,
        },
        items: [
          {
            recipient_type: 'EMAIL',
            amount: {
              value: (bill.amountCents / 100).toFixed(2),
              currency: 'USD',
            },
            note: `Payment for ${bill.description}`,
            sender_item_id: `item-${bill.id}`,
            receiver: bill.vendorEmail,
          },
        ],
      };

      const payoutRes = await fetch(`${baseUrl}/v1/payments/payouts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': idempotencyKey,
        },
        body: JSON.stringify(payoutPayload),
      });

      if (!payoutRes.ok) {
        const errData = await payoutRes.json().catch(() => ({}));
        const errName = errData.name || 'PAYPAL_PAYOUTS_ERROR';
        const errMessage = errData.message || `PayPal API rejected request with status HTTP ${payoutRes.status}`;

        return NextResponse.json(
          {
            error: 'PAYPAL_API_REJECTED',
            name: errName,
            status: payoutRes.status,
            message: errMessage,
            suggestion: 'You can complete this presentation step using the verified Simulated Payout Mode.',
          },
          { status: 502 }
        );
      }

      const payoutData = await payoutRes.json();

      // Record Idempotency & Settle
      demoStore.recordIdempotencyKey(idempotencyKey);
      demoStore.markBillDisbursed(bill.id, true);

      return NextResponse.json({
        success: true,
        mode: 'PAYPAL_SANDBOX',
        isSimulated: false,
        billId: bill.id,
        batchId: payoutData.batch_header?.payout_batch_id || 'SANDBOX-BATCH',
        message: `Successfully executed live PayPal Sandbox Payout of ${formatCentsToUSD(bill.amountCents)} to ${bill.vendorName}.`,
        account: demoStore.getAccount(),
        bills: demoStore.getBills(),
        auditLogs: demoStore.getAuditLogs(),
      });
    }

    // Default: Simulation Mode
    demoStore.recordIdempotencyKey(idempotencyKey);
    demoStore.markBillDisbursed(bill.id, false);

    return NextResponse.json({
      success: true,
      mode: 'SIMULATION',
      isSimulated: true,
      billId: bill.id,
      idempotencyKey,
      message: `Simulated payout of ${formatCentsToUSD(bill.amountCents)} to ${bill.vendorName} confirmed. Cash balance updated.`,
      account: demoStore.getAccount(),
      bills: demoStore.getBills(),
      auditLogs: demoStore.getAuditLogs(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'An error occurred during payout authorization.' },
      { status: 500 }
    );
  }
}

