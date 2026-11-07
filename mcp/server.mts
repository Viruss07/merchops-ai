import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { demoStore } from '../src/lib/store.js';
import { calculateRunway } from '../src/lib/runway.js';
import { validateCashPlan } from '../src/lib/plan/validate.js';
import { PlanAction } from '../src/lib/plan/types.js';
import { createDraftInvoice } from '../src/lib/paypal.js';

/**
 * MerchOps AI — Agentic Commerce Model Context Protocol (MCP) Server
 *
 * Strictly adheres to the Non-Negotiable Rule:
 * "AI proposes, rules decide. AI must never independently move money."
 *
 * Tools exposed are strictly READ-ONLY or PROPOSE-ONLY.
 * No tool exists to send payouts, pay bills, or cancel invoices.
 */

const server = new McpServer({
  name: 'merchops-ai-agent',
  version: '1.0.0',
});

// Tool 1: get_runway (Read-only)
server.tool(
  'get_runway',
  'Returns current merchant cleared cash balance, safety reserve floor, and 30-day runway projection.',
  {},
  async () => {
    const snapshot = demoStore.getSnapshot();
    const forecast = calculateRunway({
      clearedBalanceCents: snapshot.account.clearedBalanceCents,
      minReserveCents: snapshot.account.minReserveCents,
      invoices: snapshot.invoices,
      bills: snapshot.bills,
      startDate: snapshot.demoConfig.asOfDate,
      horizonDays: snapshot.demoConfig.forecastDays,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              clearedCashUSD: `$${(snapshot.account.clearedBalanceCents / 100).toFixed(2)}`,
              minReserveUSD: `$${(snapshot.account.minReserveCents / 100).toFixed(2)}`,
              hasReserveBreach: forecast.hasReserveBreach,
              firstBreachDay: forecast.firstBreachDay,
              breachDeficitUSD: forecast.breachDeficitCents
                ? `$${(forecast.breachDeficitCents / 100).toFixed(2)}`
                : null,
              minBalanceUSD: `$${(forecast.minBalanceCents / 100).toFixed(2)}`,
              forecastHorizonDays: snapshot.demoConfig.forecastDays,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 2: list_invoices (Read-only)
server.tool(
  'list_invoices',
  'Returns all customer accounts receivable invoices with aging and status.',
  {},
  async () => {
    const invoices = demoStore.getInvoices();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            invoices.map((inv) => ({
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              customerName: inv.customerName,
              amountUSD: `$${(inv.amountCents / 100).toFixed(2)}`,
              dueDate: inv.dueDate,
              daysOverdue: inv.daysOverdue,
              status: inv.status,
              hasPayPalLink: Boolean(inv.recipientViewUrl || inv.paypalInvoiceId),
            })),
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 3: list_bills (Read-only)
server.tool(
  'list_bills',
  'Returns all upcoming vendor payables and due dates.',
  {},
  async () => {
    const bills = demoStore.getBills();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            bills.map((b) => ({
              id: b.id,
              billNumber: b.billNumber,
              vendorName: b.vendorName,
              amountUSD: `$${(b.amountCents / 100).toFixed(2)}`,
              dueDate: b.dueDate,
              daysUntilDue: b.daysUntilDue,
              status: b.status,
              category: b.category,
            })),
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 4: get_audit_trail (Read-only)
server.tool(
  'get_audit_trail',
  'Retrieves the recent immutable financial audit logs.',
  {},
  async () => {
    const logs = demoStore.getAuditLogs();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(logs.slice(0, 15), null, 2),
        },
      ],
    };
  }
);

// Tool 5: propose_cash_plan (Propose-only)
server.tool(
  'propose_cash_plan',
  'Submits a candidate cash management action plan to the deterministic rule validator.',
  {
    title: z.string().describe('Title of the proposed strategy'),
    actions: z.array(
      z.object({
        type: z.enum([
          'CHASE_INVOICE',
          'SEND_INVOICE_REMINDER',
          'OFFER_EARLY_PAY_DISCOUNT',
          'SCHEDULE_BILL',
          'DEFER_BILL',
          'HOLD_PAYOUT',
        ]),
        invoiceId: z.string().optional(),
        billId: z.string().optional(),
        tone: z.enum(['FRIENDLY', 'FIRM', 'URGENT']).optional(),
        discountBps: z.number().optional(),
        payOnDay: z.number().optional(),
        deferDays: z.number().optional(),
        rationale: z.string(),
      })
    ),
  },
  async (args) => {
    const snapshot = demoStore.getSnapshot();
    const candidate = {
      id: 'fastest_cash' as const,
      title: args.title,
      subtitle: 'Proposed via Model Context Protocol Agent',
      actions: args.actions as unknown as PlanAction[],
      narrative: 'Proposed via Claude / MCP agent.',
    };

    const validated = validateCashPlan(candidate, {
      clearedBalanceCents: snapshot.account.clearedBalanceCents,
      minReserveCents: snapshot.account.minReserveCents,
      invoices: snapshot.invoices,
      bills: snapshot.bills,
      asOfDate: snapshot.demoConfig.asOfDate,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              verdict: validated.verdict,
              rejectionReason: validated.rejectionReason,
              rulesPassed: validated.rulesPassed,
              rulesFailed: validated.rulesFailed,
              minProjectedBalanceUSD: `$${(validated.minProjectedBalanceCents / 100).toFixed(2)}`,
              reserveBreached: validated.reserveBreached,
              notice:
                'AI proposals cannot execute disbursements directly. Staged for merchant interactive approval in MerchOps UI.',
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// Tool 6: stage_invoice (Propose-only: creates DRAFT, never sends or moves money)
server.tool(
  'stage_invoice',
  'Creates a DRAFT invoice in PayPal Sandbox for merchant review. Does NOT send or move money.',
  {
    invoiceNumber: z.string(),
    customerName: z.string(),
    customerEmail: z.string().email(),
    amountUSD: z.number().positive(),
    dueDate: z.string(),
    description: z.string(),
  },
  async (args) => {
    const amountCents = Math.round(args.amountUSD * 100);
    try {
      const draft = await createDraftInvoice({
        invoiceNumber: args.invoiceNumber,
        customerName: args.customerName,
        customerEmail: args.customerEmail,
        amountCents,
        dueDate: args.dueDate,
        itemDescription: args.description,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                status: 'DRAFT_CREATED',
                paypalInvoiceId: draft.invoiceId,
                notice:
                  'Invoice staged as DRAFT on PayPal Sandbox. Requires merchant interactive confirmation to send.',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Draft creation failed';
      return {
        content: [{ type: 'text', text: `Failed to stage draft: ${message}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('[FATAL] MCP Server error:', err);
  process.exit(1);
});
