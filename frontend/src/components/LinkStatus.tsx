import React, { useState } from 'react';
import {
  Antenna,
  CloudOff,
  Loader2,
  RefreshCw,
  Signal,
  SignalHigh,
  SignalLow,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useConnectivity } from '../hooks/useConnectivity';
import type { LinkBand, LinkMode } from '../types';

/**
 * The bandwidth pill, and the panel behind it.
 *
 * This replaces a `useState(false)` toggle in `FieldWorkspaceShell` that
 * changed a word on screen and nothing else. Everything shown here is either
 * measured (round-trip time), browser-reported (throughput, where the browser
 * offers it), or a count of what is actually sitting in the outbox.
 *
 * The panel exists because a supervisor whose report has not been sent is
 * entitled to know that, to see how much is waiting, and to force a retry —
 * rather than trusting a green dot.
 */

const BAND_STYLE: Record<LinkBand, { label: string; cls: string; Icon: typeof Signal }> = {
  good: {
    label: 'Good signal',
    cls: 'bg-emerald-400/15 text-emerald-200',
    Icon: SignalHigh,
  },
  weak: {
    label: 'Weak signal',
    cls: 'bg-amber-400/15 text-amber-200',
    Icon: Signal,
  },
  poor: {
    label: 'Poor signal',
    cls: 'bg-orange-400/15 text-orange-200',
    Icon: SignalLow,
  },
  unknown: {
    label: 'Signal unknown',
    cls: 'bg-slate-400/15 text-slate-200',
    Icon: Antenna,
  },
};

const MODE_COPY: Record<LinkMode, { title: string; body: string }> = {
  rich: {
    title: 'Full capture',
    body: 'Voice and text both work. Updates are sent the moment you submit them.',
  },
  lean: {
    title: 'Text only',
    body:
      'Voice capture is off to save data. Your update is complete either way — ' +
      'NAVIS never scores a typed report lower than a spoken one.',
  },
  offline: {
    title: 'Saved on this phone',
    body:
      'Nothing can reach the server right now. Everything you submit is kept ' +
      'here and sent automatically as soon as the signal returns.',
  },
};

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export function LinkStatusPill({ inverse = true }: { inverse?: boolean }) {
  const [open, setOpen] = useState(false);
  const link = useConnectivity();
  const queued = link.pending.length;
  const style = BAND_STYLE[link.band];

  // Offline is its own presentation regardless of the last measured band: the
  // one thing the supervisor must never see is a green pill above an update
  // that has not been sent.
  const offline = link.mode === 'offline';
  const Icon = offline ? WifiOff : queued > 0 ? CloudOff : style.Icon;
  const pillCls = offline
    ? 'bg-amber-400/15 text-amber-200'
    : queued > 0
      ? 'bg-blue-400/15 text-blue-200'
      : style.cls;
  const label = offline
    ? queued > 0
      ? `Offline · ${queued} waiting`
      : 'Offline'
    : queued > 0
      ? `${queued} waiting`
      : style.label;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-label font-semibold transition-colors ${
          inverse ? pillCls : pillCls
        }`}
        title="Connection and unsent updates"
        aria-label="Connection status"
      >
        <Icon size={13} />
        <span>{label}</span>
      </button>

      {open && <LinkPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function LinkPanel({ onClose }: { onClose: () => void }) {
  const link = useConnectivity();
  const copy = MODE_COPY[link.mode];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 max-h-[88dvh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] text-fg ring-1 ring-hair sm:max-w-md sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lead font-semibold text-heading">Connection</h2>
            <p className="mt-0.5 text-label text-muted">{copy.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 rounded-lg p-2 text-muted hover:bg-selected hover:text-heading"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-3 rounded-xl bg-secondary p-3 text-body leading-6 text-fg">
          {copy.body}
        </p>

        {/* Measured, browser-reported and derived, each labelled as such —
            a browser-reported throughput must not read as a measurement. */}
        <dl className="mt-4 grid grid-cols-2 gap-2 text-label">
          <Fact label="Round trip" value={link.rttMs === null ? '—' : `${link.rttMs} ms`} note="measured" />
          <Fact
            label="Throughput"
            value={link.downlinkKbps === null ? 'Not reported' : `${link.downlinkKbps} kbps`}
            note={link.downlinkKbps === null ? 'this browser does not report it' : 'browser estimate'}
          />
          <Fact label="Waiting to send" value={String(link.pending.length)} note={bytes(link.queuedBytes)} />
          <Fact
            label="Last checked"
            value={
              link.lastProbeAt
                ? new Date(link.lastProbeAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'
            }
            note={link.online ? 'server reachable' : 'server unreachable'}
          />
        </dl>

        {link.rejected.length > 0 && (
          <div className="mt-4 rounded-xl bg-danger/10 p-3 ring-1 ring-danger/30">
            <p className="text-label font-semibold text-danger">
              {link.rejected.length} update{link.rejected.length === 1 ? '' : 's'} refused
              by the server
            </p>
            <p className="mt-1 text-label leading-5 text-muted">
              These were not lost and were not sent. The server declined them —
              usually a crew or activity that no longer exists. Show them to
              your planner.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {link.rejected.slice(0, 3).map((item) => (
                <li key={item.id} className="text-label text-fg">
                  · {item.rejected?.detail}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4">
          <p className="text-label font-semibold text-heading">Capture mode</p>
          <p className="mt-0.5 text-label leading-5 text-muted">
            Pin a mode to save data on a metered connection. NAVIS drops to text
            on its own when the signal is poor.
          </p>
          <div className="mt-2 flex gap-2">
            {(['rich', 'lean'] as const).map((option) => {
              const active = link.pinned === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => link.setPinned(active ? null : option)}
                  className={`min-h-11 flex-1 rounded-xl px-3 text-label font-semibold ring-1 transition-colors ${
                    active
                      ? 'bg-accent text-accent-fg ring-accent'
                      : 'bg-surface text-heading ring-hair hover:bg-selected'
                  }`}
                >
                  {option === 'rich' ? 'Voice + text' : 'Text only'}
                </button>
              );
            })}
          </div>
          {link.pinned && (
            <p className="mt-2 text-label text-muted">
              Pinned to {link.pinned === 'rich' ? 'voice + text' : 'text only'}.
              Tap again to let NAVIS decide.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void link.refresh()}
          disabled={link.flushing}
          className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-body font-semibold text-accent-fg disabled:opacity-60"
        >
          {link.flushing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {link.flushing
            ? 'Sending…'
            : link.pending.length
              ? `Send ${link.pending.length} now`
              : 'Check connection'}
        </button>

        {link.lastFlush && (
          <p className="mt-2 text-center text-label text-muted">
            Last attempt: {link.lastFlush.sent} sent
            {link.lastFlush.kept ? `, ${link.lastFlush.kept} still waiting` : ''}
            {link.lastFlush.rejected ? `, ${link.lastFlush.rejected} refused` : ''}.
          </p>
        )}
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-xl bg-secondary p-2.5">
      <dt className="text-label text-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-body font-semibold text-heading">{value}</dd>
      <dd className="text-label text-muted">{note}</dd>
    </div>
  );
}

/** A compact inline banner for a page that must not be missed. */
export function OfflineBanner() {
  const link = useConnectivity();
  if (link.mode !== 'offline' && link.pending.length === 0) return null;

  return (
    <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 ring-1 ring-amber-500/30">
      {link.mode === 'offline' ? (
        <WifiOff size={16} className="mt-0.5 shrink-0 text-amber-500" />
      ) : (
        <Wifi size={16} className="mt-0.5 shrink-0 text-amber-500" />
      )}
      <p className="text-label leading-5 text-fg">
        {link.mode === 'offline'
          ? 'No signal. What you submit is saved on this phone and sent automatically when the signal returns.'
          : `${link.pending.length} update${
              link.pending.length === 1 ? '' : 's'
            } waiting to send.`}
      </p>
    </div>
  );
}
