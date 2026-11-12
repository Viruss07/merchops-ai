/**
 * The one place UI words come from. Every status, event and actor goes through here, so no raw
 * enum (OVERDUE, PAYOUT_BLOCKED_RESERVE_BREACH, AI_COPILOT) ever reaches the screen.
 */
import type { AuditLogEntry, Bill, Invoice } from '@/types';

export type Tone = 'safe' | 'risk' | 'blocked' | 'neutral';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-13" → "13 Nov 2026". Parsed by hand so the server and the browser agree on the day. */
export function formatDate(iso: string, opts: { year?: boolean } = {}): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return iso;
  return opts.year === false
    ? `${day} ${MONTHS[month - 1]}`
    : `${day} ${MONTHS[month - 1]} ${year}`;
}

/** "2026-11-03T09:10:00Z" → "3 Nov · 09:10" (UTC, the ledger's clock). */
export function formatStamp(iso: string): string {
  return `${formatDate(iso, { year: false })} · ${iso.slice(11, 16)}`;
}

/** Full readable UTC timestamp parts for audit inspection. */
export function formatStampParts(iso: string): { date: string; time: string } {
  const time = iso.length >= 19 ? `${iso.slice(11, 19)} UTC` : `${iso.slice(11, 16)} UTC`;
  return {
    date: formatDate(iso, { year: true }),
    time,
  };
}

/** Day number on the runway (Day 1 = the day after the as-of date, as in lib/runway.ts). */
export function dayOnRunway(asOf: string, iso: string): number {
  const utc = (value: string) => {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const a = utc(asOf);
  const b = utc(iso);
  return Math.round((b - a) / 86_400_000);
}

/* ---------- Invoices ---------- */

export function invoiceStatus(invoice: Invoice): { label: string; tone: Tone } {
  if (invoice.status === 'PAID') return { label: 'Collected', tone: 'safe' };
  if (invoice.status === 'OVERDUE')
    return { label: `Overdue · ${invoice.daysOverdue} days`, tone: 'risk' };
  return { label: `Due ${formatDate(invoice.dueDate, { year: false })}`, tone: 'neutral' };
}

export const INVOICE_STEPS = ['Issued', 'On PayPal', 'Reminded', 'Collected'] as const;

/** How far an invoice has travelled: index of the current step (all done = steps.length). */
export function invoiceStep(invoice: Invoice): number {
  if (invoice.status === 'PAID') return INVOICE_STEPS.length;
  if (invoice.lastReminderSentAt) return 3;
  if (invoice.paypalInvoiceId) return 2;
  return 1;
}

/* ---------- Bills ---------- */

export function billStatus(bill: Bill): { label: string; tone: Tone } {
  switch (bill.status) {
    case 'DISBURSED':
      return { label: 'Paid', tone: 'safe' };
    case 'IN_FLIGHT':
      return { label: 'In flight', tone: 'risk' };
    case 'APPROVED':
      return { label: 'Approved', tone: 'neutral' };
    case 'FAILED':
      return { label: 'Failed · nothing moved', tone: 'blocked' };
    default:
      return { label: `Due ${formatDate(bill.dueDate, { year: false })}`, tone: 'neutral' };
  }
}

export const BILL_STEPS = ['Due', 'Reserve check', 'You approve', 'PayPal settles'] as const;

export function billStep(bill: Bill): number {
  switch (bill.status) {
    case 'DISBURSED':
      return BILL_STEPS.length;
    case 'IN_FLIGHT':
    case 'APPROVED':
      return 3;
    case 'FAILED':
      return 3;
    default:
      return 1;
  }
}

/** Steps an invoice passed without taking (paid without PayPal, or without a reminder). */
export function invoiceSkipped(invoice: Invoice): number[] {
  const current = invoiceStep(invoice);
  const skipped: number[] = [];
  if (current > 1 && !invoice.paypalInvoiceId) skipped.push(1);
  if (current > 2 && !invoice.lastReminderSentAt) skipped.push(2);
  return skipped;
}

export const isOpenBill = (bill: Bill) =>
  bill.status === 'PENDING' || bill.status === 'APPROVED' || bill.status === 'IN_FLIGHT';

/* ---------- The ledger ---------- */

const EVENTS: Record<string, string> = {
  SYSTEM_INITIALIZED: 'Ledger opened',
  RUNWAY_MONITOR_ACTIVE: 'Runway monitor saw the reserve crossed',
  PAYOUT_BLOCKED_RESERVE_BREACH: 'Payout refused by the reserve',
  PAYOUT_BLOCKED_PAYPAL_BALANCE: 'Payout blocked by low PayPal balance',
  PAYOUT_APPROVED: 'You approved a payout',
  PAYOUT_ACCEPTED_PAYPAL: 'PayPal accepted the payout batch',
  PAYOUT_IN_FLIGHT: 'Payout in flight',
  PAYOUT_FAILED: 'Payout failed, nothing moved',
  PAYOUT_OUTCOME_UNKNOWN: 'Payout outcome unknown',
  PAYOUT_DISBURSED_PAYPAL: 'PayPal settled the payout',
  PAYOUT_DISBURSED_SIMULATED: 'Payout settled (simulated)',
  INVOICE_PAID_PAYPAL: 'Invoice collected through PayPal',
  INVOICE_PAID_SIMULATED: 'Invoice collected (simulated)',
  INVOICE_SYNCED_PAYPAL: 'Invoice sent to PayPal',
  REMINDER_DRAFTED_OPENROUTER: 'AI drafted a reminder',
  REMINDER_DRAFTED_TEMPLATE: 'Reminder drafted from the template',
  REMINDER_DRAFT_APPROVED: 'You approved a reminder',
  REMINDER_DISPATCHED_PAYPAL: 'Reminder sent through PayPal',
};

export function eventLabel(action: string): string {
  if (EVENTS[action]) return EVENTS[action];
  const words = action.toLowerCase().split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function eventTone(action: string): Tone {
  if (action.includes('BLOCKED') || action.includes('FAILED')) return 'blocked';
  if (action.includes('UNKNOWN') || action.includes('IN_FLIGHT') || action.includes('MONITOR'))
    return 'risk';
  if (action.includes('PAID') || action.includes('DISBURSED') || action.includes('ACCEPTED'))
    return 'safe';
  return 'neutral';
}

export type EventGroup = 'payouts' | 'collections' | 'guardrails' | 'system';

export function eventGroup(action: string): EventGroup {
  if (action.includes('BLOCKED') || action.includes('MONITOR')) return 'guardrails';
  if (action.includes('PAYOUT')) return 'payouts';
  if (action.includes('INVOICE') || action.includes('REMINDER')) return 'collections';
  return 'system';
}

const ACTORS: Record<AuditLogEntry['actor'], string> = {
  MERCHANT: 'You',
  AI_COPILOT: 'AI copilot',
  SYSTEM: 'Fixed rules',
  PAYPAL_WEBHOOK: 'PayPal',
};

export const actorLabel = (actor: AuditLogEntry['actor']) => ACTORS[actor] ?? actor;

/** The ledger rows that mention a record, newest first. Audit details name the invoice or bill number. */
export function eventsFor(logs: AuditLogEntry[], ...needles: string[]): AuditLogEntry[] {
  return logs
    .filter((log) => needles.some((needle) => needle && log.details.includes(needle)))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export const newestFirst = (logs: AuditLogEntry[]) =>
  [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
