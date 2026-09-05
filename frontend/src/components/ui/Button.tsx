import React from 'react';
import { Link } from 'react-router-dom';

/**
 * The only button in the app.
 *
 * The audit found thirteen hand-rolled button treatments doing five jobs, plus
 * four differently-shaped pill toggles for what is the same control. Everything
 * below is one of those five jobs; nothing renders a button by writing its own
 * class string any more.
 *
 * Shape, size and state are props rather than variants, so a pill toggle and a
 * rectangular action cannot drift apart in padding or type the way they did.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';

/**
 * `md` is the mobile control — 16px, the minimum a supervisor reads with
 * gloves on. `sm` is the planner's dense mono control. `xs` exists only for
 * controls that sit inside a fixed-height toolbar row (the Schedule filter
 * bar is `h-11`); `sm` would be 42px tall and change that layout, which this
 * pass is not allowed to do.
 */
export type ButtonSize = 'md' | 'sm' | 'xs';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover font-medium shadow-none',
  secondary: 'bg-raised border border-hair text-fg hover:bg-selected hover:border-strong font-medium shadow-none',
  danger: 'bg-raised border border-danger-line text-danger hover:bg-danger-bg font-medium shadow-none',
  ghost: 'text-muted hover:text-fg hover:bg-selected font-medium',
  icon: '',
};

/** Rectangular sizing. Clean and restrained. */
const RECT_SIZE: Record<ButtonSize, string> = {
  md: 'text-lead font-medium px-4 py-2.5',
  sm: 'text-body font-medium px-3 py-1.5',
  xs: 'text-label font-medium px-2.5 h-7',
};

/** Pill sizing. Same clean type steps. */
const PILL_SIZE: Record<ButtonSize, string> = {
  md: 'text-lead font-medium px-4 py-2',
  sm: 'text-label font-medium px-3 py-1',
  xs: 'text-label font-medium px-3 py-1',
};

/**
 * A toggle's two states. `active === undefined` means the control is not a
 * toggle at all and keeps its plain variant styling — that is what separates
 * the agent's suggestion chips from the filter chips above them.
 */
const TOGGLE = {
  on: 'border border-strong bg-selected text-fg font-medium',
  off: 'border border-hair bg-raised text-muted hover:bg-selected hover:text-fg',
};

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: 'rect' | 'pill';
  /** Toggle state. Omit entirely for a control that is not a toggle. */
  active?: boolean;
  /** Icon buttons only: muted until hover, or accent throughout. */
  tone?: 'muted' | 'accent';
  block?: boolean;
  className?: string;
  children?: React.ReactNode;
}

type ButtonProps = BaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & {
    to?: undefined;
  };

type LinkProps = BaseProps & {
  /** Renders a react-router Link that looks exactly like the button. */
  to: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  title?: string;
  'aria-label'?: string;
};

function classesFor({
  variant = 'primary',
  size = 'md',
  shape = 'rect',
  active,
  tone = 'muted',
  block,
  className = '',
}: BaseProps): string {
  const base =
    'inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50';

  if (variant === 'icon') {
    // One padding and one radius for every icon button. The audit found three
    // paddings and three different hover treatments for this single job.
    const toneClass =
      tone === 'accent'
        ? 'text-accent hover:bg-selected'
        : 'text-muted hover:bg-selected hover:text-accent';
    return `${base} p-2 rounded-sm shrink-0 ${toneClass} ${className}`.trim();
  }

  const radius = shape === 'pill' ? 'rounded-full' : 'rounded-sm';
  const sizing = shape === 'pill' ? PILL_SIZE[size] : RECT_SIZE[size];
  const look = active === undefined ? VARIANT[variant] : active ? TOGGLE.on : TOGGLE.off;

  return `${base} ${radius} ${sizing} ${look} ${block ? 'w-full' : ''} ${className}`
    .replace(/\s+/g, ' ')
    .trim();
}

export function Button(props: ButtonProps | LinkProps) {
  const {
    variant,
    size,
    shape,
    active,
    tone,
    block,
    className,
    children,
    ...rest
  } = props as BaseProps & Record<string, unknown>;

  const cls = classesFor({ variant, size, shape, active, tone, block, className });

  if (typeof rest.to === 'string') {
    const { to, ...linkRest } = rest as { to: string } & Record<string, unknown>;
    return (
      <Link to={to} className={cls} {...(linkRest as object)}>
        {children}
      </Link>
    );
  }

  return (
    <button className={cls} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
