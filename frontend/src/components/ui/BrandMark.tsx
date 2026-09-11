import React from 'react';

export function BrandMark({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 min-w-0" aria-label="NAVIS">
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        className={`shrink-0 ${compact ? 'h-7 w-7' : 'h-8 w-8'}`}
      >
        <rect width="32" height="32" rx="9" fill={inverse ? '#FFFFFF' : 'var(--accent)'} />
        <path d="M8.5 22.5 13.2 9l5.1 8.2L23.5 9l-4.2 13.5-5.2-8.2-5.6 8.2Z" fill={inverse ? '#0B1F3A' : '#FFFFFF'} />
        <circle cx="23.5" cy="9" r="2" fill={inverse ? '#1D4ED8' : '#FFFFFF'} />
      </svg>
      {!compact && (
        <span className={`font-semibold tracking-[-0.02em] text-lead ${inverse ? 'text-white' : 'text-heading'}`}>
          NAVIS
        </span>
      )}
    </span>
  );
}
