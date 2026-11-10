import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Check, X } from 'lucide-react';
import { formatCentsToUSD } from '@/lib/money';
import { actorLabel, eventLabel, eventTone, formatStamp, type Tone } from '@/lib/client/states';
import type { AuditLogEntry } from '@/types';

/* ---------- Buttons: one primary per screen, everything else secondary or quiet. ---------- */

const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper';

export const btn = {
  primary: `inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-ink transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`,
  secondary: `inline-flex items-center justify-center gap-2 rounded-md border border-rule-strong bg-panel px-4 py-2.5 text-sm font-medium text-ink transition-colors duration-150 hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`,
  small: `inline-flex items-center justify-center gap-1.5 rounded-md border border-rule-strong bg-panel px-3 py-1.5 text-xs font-medium text-ink transition-colors duration-150 hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`,
  quiet: `inline-flex items-center gap-1.5 rounded-sm text-sm text-ink-2 underline decoration-rule-strong underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink ${focusRing}`,
};

/* ---------- Tones ---------- */

export const TONE_TEXT: Record<Tone, string> = {
  safe: 'text-safe',
  risk: 'text-risk',
  blocked: 'text-blocked',
  neutral: 'text-ink-2',
};

export const TONE_DOT: Record<Tone, string> = {
  safe: 'bg-safe',
  risk: 'bg-risk',
  blocked: 'bg-blocked',
  neutral: 'bg-ink-3',
};

/** A state-tinted surface: safe green, risk amber, blocked red, or a plain panel. */
export const TONE_SURFACE: Record<Tone, string> = {
  safe: 'border-safe/40 bg-safe-field/60',
  risk: 'border-risk/40 bg-risk-field/60',
  blocked: 'border-blocked/40 bg-blocked-field/60',
  neutral: 'border-rule bg-panel',
};

export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  const surface: Record<Tone, string> = {
    safe: 'bg-safe-field text-safe',
    risk: 'bg-risk-field text-risk',
    blocked: 'bg-blocked-field text-blocked',
    neutral: 'bg-paper text-ink-2 ring-1 ring-inset ring-rule',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${surface[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Where a record is on its way: done steps are filled green with a check, the current one is an
 * ink ring, upcoming ones are hairlines. A step the rules stopped is drawn red.
 */
export function Tracker({
  steps,
  current,
  stoppedAt,
  skipped = [],
  label,
}: {
  steps: readonly string[];
  current: number;
  stoppedAt?: number;
  /** Steps the record went past without taking: drawn as hairlines, never as done. */
  skipped?: number[];
  label: string;
}) {
  return (
    <ol
      aria-label={label}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((step, index) => {
        const wasSkipped = skipped.includes(index);
        const done = index < current && stoppedAt !== index && !wasSkipped;
        const stopped = stoppedAt === index;
        const isCurrent = index === current && !stopped;
        const state = done
          ? 'done'
          : stopped
            ? 'stopped'
            : isCurrent
              ? 'current'
              : wasSkipped
                ? 'skipped'
                : 'upcoming';
        return (
          <li key={step} className="relative min-w-0" aria-current={isCurrent ? 'step' : undefined}>
            <div className="relative h-1 overflow-hidden rounded-full bg-rule">
              {(done || stopped) && (
                <div
                  className={`step-fill absolute inset-0 ${stopped ? 'bg-blocked' : 'bg-safe'}`}
                  style={{ animationDelay: `${Math.min(index, 4) * 140}ms` }}
                />
              )}
              {isCurrent && <div className="absolute inset-y-0 left-0 w-1/3 bg-ink" />}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                  state === 'done'
                    ? 'bg-safe text-paper'
                    : state === 'stopped'
                      ? 'bg-blocked text-paper'
                      : state === 'current'
                        ? 'ring-[1.5px] ring-inset ring-ink'
                        : 'ring-1 ring-inset ring-rule-strong'
                }`}
                aria-hidden="true"
              >
                {state === 'done' && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                {state === 'stopped' && <X className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              <span
                className={`relative truncate text-xs ${
                  state === 'upcoming' || state === 'skipped'
                    ? 'text-ink-3'
                    : state === 'stopped'
                      ? 'font-medium text-blocked'
                      : 'font-medium text-ink'
                }`}
              >
                {step}
                {state === 'skipped' && <span aria-hidden="true"> · skipped</span>}
                <span className="sr-only">
                  {state === 'done'
                    ? ', done'
                    : state === 'stopped'
                      ? ', stopped by the rules'
                      : state === 'current'
                        ? ', current step'
                        : state === 'skipped'
                          ? ', skipped'
                          : ''}
                </span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Page structure ---------- */

export function Page({
  children,
  narrow = false,
}: {
  children: React.ReactNode;
  narrow?: boolean;
}) {
  return (
    <main
      className={`mx-auto w-full ${narrow ? 'max-w-3xl' : 'max-w-6xl'} px-4 pb-24 pt-6 sm:px-6 sm:pt-8`}
    >
      {children}
    </main>
  );
}

/** A page's title block: optional breadcrumb, the title, one sentence, and an aside (an amount or an action). */
export function PageHeader({
  back,
  title,
  meta,
  aside,
  children,
}: {
  back?: { href: string; label: string };
  title: React.ReactNode;
  meta?: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-rule pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 no-underline transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-semibold text-ink sm:text-3xl">{title}</h1>
        {meta && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
            {meta}
          </div>
        )}
        {children && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{children}</p>
        )}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  );
}

/** A big figure with its label, right-aligned on wide screens. */
export function Figure({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <p className="sm:text-right">
      <span className="block text-xs text-ink-2">{label}</span>
      <span
        className={`money text-3xl font-semibold ${tone === 'neutral' ? 'text-ink' : TONE_TEXT[tone]}`}
      >
        {value}
      </span>
    </p>
  );
}

export function Section({
  title,
  description,
  action,
  tone = 'neutral',
  id,
  children,
  className = '',
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: Tone;
  id?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-h` : undefined;
  return (
    <section
      aria-labelledby={headingId}
      className={`rounded-lg border p-4 sm:p-5 ${TONE_SURFACE[tone]} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-ink-2">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

/** A receipt line: label left, amount right. `total` draws the rule above the bottom line. */
export function Line({
  label,
  value,
  total = false,
  tone = 'neutral',
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  total?: boolean;
  tone?: Tone;
  hint?: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${total ? 'mt-1 border-t border-rule-strong pt-2' : 'py-1'}`}
    >
      <dt className={total ? 'text-sm font-medium text-ink' : 'text-sm text-ink-2'}>
        {label}
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </dt>
      <dd
        className={`money text-right ${total ? 'text-lg font-semibold' : 'text-sm font-medium'} ${tone === 'neutral' ? 'text-ink' : TONE_TEXT[tone]}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** A reference id (PayPal, request id): label left, mono value right, truncated with a title. */
export function Ref({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-rule/70 py-1.5 first:border-t-0">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="mono min-w-0 truncate text-xs text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}

export function Notice({
  tone = 'risk',
  title,
  children,
  onDismiss,
  action,
}: {
  tone?: Tone;
  title: string;
  children?: React.ReactNode;
  onDismiss?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'blocked' ? 'alert' : 'status'}
      className={`detail-in rounded-lg border p-4 text-sm ${TONE_SURFACE[tone]}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 shrink-0 ${TONE_TEXT[tone]}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{title}</p>
          {children && <div className="mt-1 leading-relaxed text-ink-2">{children}</div>}
          {action && <div className="mt-3">{action}</div>}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="-m-1 rounded p-1 text-ink-3 transition-colors hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Every step as a dated mark: date · what happened · who · amount. Newest first. */
export function Trail({
  logs,
  empty = 'Nothing has happened here yet.',
}: {
  logs: AuditLogEntry[];
  empty?: string;
}) {
  if (logs.length === 0) return <p className="text-sm text-ink-3">{empty}</p>;
  return (
    <ol>
      {logs.map((log) => {
        const tone = eventTone(log.action);
        return (
          <li
            key={log.id}
            className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-0.5 border-t border-rule py-2.5 text-sm first:border-t-0 sm:grid-cols-[7.5rem_1fr_auto]"
          >
            <time dateTime={log.timestamp} className="mono pt-0.5 text-xs text-ink-3">
              {formatStamp(log.timestamp)}
            </time>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-ink">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`}
                  aria-hidden="true"
                />
                <span className={tone === 'blocked' ? 'font-medium text-blocked' : ''}>
                  {eventLabel(log.action)}
                </span>
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{log.details}</p>
              <p className="mt-0.5 text-xs text-ink-3">
                {actorLabel(log.actor)}
                {log.isSimulated ? ' · simulated' : ''}
              </p>
            </div>
            {typeof log.amountCents === 'number' && (
              <span className="money col-start-2 text-xs font-medium text-ink-2 sm:col-start-auto sm:pt-0.5 sm:text-right">
                {formatCentsToUSD(log.amountCents)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A row in a list page: the whole row is the link, the amount sits right. Stacks under `sm`. */
export function ListRow({
  href,
  title,
  sub,
  status,
  amount,
  amountTone = 'neutral',
}: {
  href: string;
  title: React.ReactNode;
  sub: React.ReactNode;
  status: React.ReactNode;
  amount: string;
  amountTone?: Tone;
}) {
  return (
    <li className="border-t border-rule first:border-t-0">
      <Link
        href={href}
        className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3.5 no-underline transition-colors duration-150 hover:bg-paper sm:grid-cols-[minmax(0,1fr)_11rem_8rem] sm:px-5"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{title}</p>
          <p className="mt-0.5 truncate text-xs text-ink-3">{sub}</p>
        </div>
        <div className="order-3 col-span-2 sm:order-none sm:col-span-1">{status}</div>
        <p
          className={`money text-right text-sm font-semibold ${amountTone === 'neutral' ? 'text-ink' : TONE_TEXT[amountTone]}`}
        >
          {amount}
        </p>
      </Link>
    </li>
  );
}

export function Skeleton({ label }: { label: string }) {
  return (
    <Page>
      <div role="status" aria-live="polite" aria-busy="true" className="space-y-5">
        <span className="sr-only">{label}</span>
        <div className="h-9 w-72 max-w-full rounded-md bg-rule/70" />
        <div className="h-4 w-96 max-w-full rounded bg-rule/60" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="h-64 rounded-lg border border-rule bg-panel" />
          <div className="h-64 rounded-lg border border-rule bg-panel" />
        </div>
      </div>
    </Page>
  );
}

/** A record id that isn't in the ledger (a typo, or the demo was reset). */
export function Missing({ kind, href }: { kind: string; href: string }) {
  return (
    <Page narrow>
      <div className="py-10">
        <h1 className="text-xl font-semibold">There&apos;s no {kind} with that id</h1>
        <p className="mt-2 text-sm text-ink-2">
          It may have been typed wrong, or the demo was reset. Every {kind} in this ledger is on the
          list.
        </p>
        <Link href={href} className={`${btn.primary} mt-5`}>
          See all {kind}s
        </Link>
      </div>
    </Page>
  );
}
