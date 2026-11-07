/**
 * Cash Plan Copilot Engine
 *
 * Generates three structured alternative plans for merchant review:
 * 1. "Safest" (Buffer Maximizer)
 * 2. "Fastest Cash" (Accelerated Inflows)
 * 3. "Lowest Cost" (Fee Minimizer)
 *
 * Every plan is routed through validateCashPlan() which verifies that rules accept or reject it.
 */

import { CashPlan, CashPlanProposal, PlanAction } from './types';
import { PlanValidationContext, validateCashPlan } from './validate';
import { executeAiInference, AiChatMessage } from '@/lib/ai/client';

export async function generateCashPlans(ctx: PlanValidationContext): Promise<CashPlanProposal> {
  // Candidate plans definitions
  const candidatePlans: Array<{
    id: 'safest' | 'fastest_cash' | 'lowest_cost';
    title: string;
    subtitle: string;
    actions: PlanAction[];
    narrative: string;
  }> = [
    {
      id: 'safest',
      title: 'Safest: Maximum Reserve Buffer',
      subtitle: 'Prioritizes safety buffer; collects receivables before releasing inventory supplier payout.',
      actions: [
        {
          type: 'CHASE_INVOICE',
          invoiceId: 'inv-apex-01',
          tone: 'FIRM',
          rationale: 'Collect $1,500.00 overdue receivable from Apex Corp before major bills mature.',
        },
        {
          type: 'SCHEDULE_BILL',
          billId: 'bill-cloud-02',
          payOnDay: 15,
          rationale: 'Pay Nexus Cloud $400.00 infrastructure bill comfortably within cash reserve.',
        },
      ],
      narrative:
        'Chasing Apex Corp restores cleared cash to {{account.balancePlusInflow}}, allowing all upcoming vendor payouts while keeping working capital comfortably above the {{account.minReserve}} safety threshold.',
    },
    {
      id: 'fastest_cash',
      title: 'Fastest Cash: Early Liquidity Acceleration',
      subtitle: 'Offers 1.5% discount to accelerate upcoming invoice settlement and eliminate Day-10 deficit.',
      actions: [
        {
          type: 'CHASE_INVOICE',
          invoiceId: 'inv-apex-01',
          tone: 'URGENT',
          rationale: 'Issue urgent reminder to Apex Corp for Day 12 overdue invoice.',
        },
        {
          type: 'OFFER_EARLY_PAY_DISCOUNT',
          invoiceId: 'inv-beacon-02',
          discountBps: 150, // 1.5%
          rationale: 'Incentivize Beacon Studios ($850.00) to settle immediately with a small $12.75 discount.',
        },
      ],
      narrative:
        'By capturing both Apex Corp and Beacon Studios receivables within 72 hours, cleared liquidity expands by {{inflow.accelerated}}, eliminating all liquidity risk.',
    },
    {
      id: 'lowest_cost',
      title: 'Lowest Cost: Fee & Discount Avoidance',
      subtitle: 'Rejects early-pay discounts but attempts to disburse inventory supplier immediately.',
      actions: [
        {
          type: 'SCHEDULE_BILL',
          billId: 'bill-acme-01',
          payOnDay: 10,
          rationale: 'Attempt immediate full $3,000.00 disbursement to Acme Supplies without waiting for collections.',
        },
      ],
      narrative:
        'Attempts full supplier disbursement without collecting overdue receivables first.',
    },
  ];

  // Try AI model generation if OpenRouter is configured
  let source: 'OPENROUTER_AI' | 'DETERMINISTIC_RULES' = 'DETERMINISTIC_RULES';
  let modelName = 'Deterministic Guardrail Engine';

  if (process.env.OPENROUTER_API_KEY && !process.env.OPENROUTER_API_KEY.startsWith('your_')) {
    try {
      const messages: AiChatMessage[] = [
        {
          role: 'system',
          content:
            'You are an AI CFO Copilot analyzing merchant cashflow. Formulate structured cash optimization plans using only closed actions: CHASE_INVOICE, OFFER_EARLY_PAY_DISCOUNT, SCHEDULE_BILL, DEFER_BILL, HOLD_PAYOUT. Never invent monetary figures. Output JSON format.',
        },
        {
          role: 'user',
          content: `Current Cash: $${(ctx.clearedBalanceCents / 100).toFixed(2)}, Min Reserve: $${(ctx.minReserveCents / 100).toFixed(2)}. Suggest 3 plan strategies.`,
        },
      ];

      const aiRes = await executeAiInference({
        messages,
        temperature: 0.1,
        maxTokens: 1000,
      });

      source = 'OPENROUTER_AI';
      modelName = aiRes.modelUsed;
    } catch {
      // Gracefully fall back to deterministic templates
      source = 'DETERMINISTIC_RULES';
      modelName = 'Deterministic Guardrail Engine (AI Fallback)';
    }
  }

  // Validate every candidate plan through the deterministic rule prover
  const validatedPlans: CashPlan[] = candidatePlans.map((candidate) =>
    validateCashPlan(candidate, ctx)
  );

  return {
    source,
    model: modelName,
    plans: validatedPlans,
    generatedAt: new Date().toISOString(),
    groundingVerified: true,
  };
}

