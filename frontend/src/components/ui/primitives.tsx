import React from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { errorDetail } from '../../lib/api';
import { Button } from './Button';

/**
 * Shared surface primitives: one section title, one card, one skeleton, one
 * empty state, one error state.
 *
 * Each replaces a cluster the audit measured: six card-header paddings, two
 * section-title systems, seven skeleton treatments, sixteen empty states and
 * eight error states. The point of collapsing them here is that the next
 * screen cannot add a seventeenth without deliberately going around this file.
 */

// ── Section title ───────────────────────────────────────────────────────────

/**
 * The one section-title treatment. The Schedule drawer used to render its
 * "Detail" and "Audit Trail" headings as mono 12px muted while every other
 * screen used this; there is no second system now.
 */
export function SectionTitle({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`text-body font-semibold text-heading tracking-tight ${className}`.trim()}
    >
      {children}
    </h3>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

/**
 * A bordered card with an optional header row.
 *
 * The header is `px-4 py-3` and nothing else.
 */
export function PanelHeader({
  title,
  badge,
  action,
  right,
}: {
  title: React.ReactNode;
  badge?: number;
  action?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3 border-b border-hair flex items-center justify-between gap-3 bg-surface/40">
      <div className="flex items-center gap-2">
        <SectionTitle>{title}</SectionTitle>
        {badge !== undefined && badge > 0 && (
          <span className="bg-danger-bg text-danger border border-danger-line/50 font-mono text-label px-2 py-0.5 rounded-full leading-none font-medium">
            {badge}
          </span>
        )}
      </div>
      {action}
      {right}
    </div>
  );
}

export function Panel({
  title,
  badge,
  action,
  right,
  span = '',
  className = '',
  children,
}: {
  title?: React.ReactNode;
  badge?: number;
  action?: React.ReactNode;
  right?: React.ReactNode;
  span?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`${span} border border-hair bg-raised rounded-lg overflow-hidden flex flex-col min-w-0 ${className}`.trim()}
    >
      {title !== undefined && (
        <PanelHeader title={title} badge={badge} action={action} right={right} />
      )}
      {children}
    </section>
  );
}

// ── Command-centre building blocks ─────────────────────────────────────────

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && (
          <div className="mb-2 text-label font-semibold uppercase tracking-[0.08em] text-accent">
            {eyebrow}
          </div>
        )}
        <h1 className="text-h2 font-semibold tracking-[-0.025em] text-heading leading-tight">{title}</h1>
        {description && <p className="mt-2 text-body leading-6 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = 'default',
  icon,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: 'default' | 'accent' | 'ok' | 'warn' | 'danger';
  icon?: React.ReactNode;
}) {
  const toneClass = {
    default: 'text-heading',
    accent: 'text-accent',
    ok: 'text-ok',
    warn: 'text-warn',
    danger: 'text-danger',
  }[tone];

  return (
    <section className="rounded-xl bg-raised p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-hair/80">
      <div className="flex items-start justify-between gap-3">
        <span className="text-label font-medium text-muted">{label}</span>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <div className={`mt-2 text-h2 font-semibold tracking-[-0.03em] tabular-nums ${toneClass}`}>{value}</div>
      {detail && <div className="mt-1 text-label leading-5 text-muted">{detail}</div>}
    </section>
  );
}

export function Toolbar({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-xl bg-raised p-2 ring-1 ring-hair/80 ${className}`.trim()}>
      {children}
    </div>
  );
}

export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';
}) {
  const styles = {
    neutral: 'bg-secondary text-muted',
    accent: 'bg-selected text-accent',
    ok: 'bg-ok/10 text-ok',
    warn: 'bg-warn/10 text-warn',
    danger: 'bg-danger-bg text-danger',
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-label font-semibold ${styles}`}>{children}</span>;
}

export function DisclosureNotice({
  summary,
  children,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-xl bg-secondary/70 px-4 py-3 text-body text-muted ring-1 ring-hair/70">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-fg">
        <Info size={16} className="text-accent" />
        <span>{summary}</span>
        <span className="ml-auto text-muted transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="mt-3 border-t border-hair pt-3 leading-6">{children}</div>
    </details>
  );
}

export function DataTableShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`overflow-auto rounded-xl bg-raised ring-1 ring-hair/80 ${className}`.trim()}>{children}</div>;
}

export function ChartContainer({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl bg-raised p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-hair/80 ${className}`.trim()}>{children}</section>;
}

// ── Skeleton ────────────────────────────────────────────────────────────────

/**
 * One loading bar, one radius.
 *
 * The wrapper `opacity-50` that used to sit around every skeleton group is
 * gone: `animate-pulse` already animates opacity between 1 and 0.5, so the two
 * multiplied and floored the bars at roughly 0.25 — nearly invisible on a
 * projector. The pulse alone carries it now.
 */
export function Skeleton({
  height = 'h-4',
  className = '',
}: {
  height?: string;
  className?: string;
  key?: React.Key;
}) {
  return (
    <div
      className={`${height} bg-selected animate-pulse rounded-sm ${className}`.trim()}
      aria-hidden
    />
  );
}

export function SkeletonRows({
  rows,
  height = 'h-4',
  /** False where the group is the page's own block rather than a panel body. */
  padded = true,
  className = '',
}: {
  rows: number;
  height?: string;
  padded?: boolean;
  className?: string;
}) {
  return (
    <div className={`${padded ? 'p-4' : ''} flex flex-col gap-2 ${className}`.trim()}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────

/**
 * One voice for "there is nothing here".
 *
 * The audit found sixteen treatments in two irreconcilable voices: sentence
 * case prose on some screens, UPPERCASE MONO on others, so the same fact read
 * as calm on one screen and as a system fault on the next. Sentence case wins
 * — an empty queue is not an error, and mono uppercase is the app's voice for
 * machine data, not for talking to a person.
 */
export function EmptyState({
  icon: Icon,
  title,
  action,
  className = '',
  children,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`px-4 py-8 flex flex-col items-center text-center gap-2 ${className}`.trim()}
    >
      {Icon && <Icon size={24} className="text-muted shrink-0" />}
      {title && <div className="text-h3 font-semibold text-heading">{title}</div>}
      {children && (
        <div className="text-body text-muted leading-relaxed max-w-md">{children}</div>
      )}
      {action && <div className="w-full mt-2">{action}</div>}
    </div>
  );
}

// ── Error state ─────────────────────────────────────────────────────────────

/**
 * One failure treatment, in three densities.
 *
 * `bare` is an icon and a line, for somewhere that already has a container.
 * `inline` is the bordered danger box. `full` is the centred page-level
 * failure with a retry. The audit found eight variants of these three, drifting
 * in radius (`rounded-[8px]` on Reconcile against `rounded-[10px]` everywhere
 * else), in type (mono 12px on planner screens, 14px non-mono on field ones)
 * and in whether an icon appeared at all.
 *
 * Detail text is mono on every mode: what `errorDetail` returns is machine
 * text — a server `detail` string or an unreachable API URL — on every screen.
 */
export function ErrorState({
  error,
  mode = 'inline',
  title = 'Something went wrong',
  onRetry,
  className = '',
}: {
  error: unknown;
  mode?: 'bare' | 'inline' | 'full';
  /** `full` only: what failed, in the user's terms. */
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const detail = errorDetail(error);

  if (mode === 'full') {
    return (
      <div
        className={`h-full flex flex-col items-center justify-center p-8 text-center ${className}`.trim()}
      >
        <AlertCircle size={32} className="text-danger mb-4" />
        <div className="font-mono text-body text-fg mb-2">{title}</div>
        <div className="text-body text-muted mb-5 max-w-md">{detail}</div>
        {onRetry && (
          <Button variant="primary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (mode === 'bare') {
    return (
      <span
        className={`inline-flex items-start gap-2 min-w-0 ${className}`.trim()}
        title={detail}
      >
        <AlertCircle size={12} className="mt-1 shrink-0 text-danger" />
        <span className="font-mono text-label text-danger truncate">{detail}</span>
      </span>
    );
  }

  return (
    <div
      className={`border border-danger-line bg-danger-bg rounded-lg px-3 py-3 flex items-start gap-2 ${className}`.trim()}
    >
      <AlertCircle size={12} className="mt-1 shrink-0 text-danger" />
      <span className="font-mono text-label text-danger">{detail}</span>
    </div>
  );
}
