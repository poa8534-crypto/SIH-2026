import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { HelpCircle, ShieldCheck, ShieldX, Users } from 'lucide-react';
import { api } from '../lib/api';

/**
 * Does the muster register support calling this delay a MANPOWER one?
 *
 * WHY THIS COMPONENT IS THE POINT OF THE WHOLE ATTENDANCE SYSTEM
 * --------------------------------------------------------------
 * `server/delay_taxonomy.py` maps MANPOWER to NON_COMPENSABLE liability —
 * the most contractually consequential classification in the taxonomy, and
 * until now the least evidenced one. A planner could rule "labour shortage"
 * and nothing in NAVIS could corroborate or contradict it.
 *
 * THREE ANSWERS, NOT TWO
 * ----------------------
 *   supported     the crews were short, and here are the days
 *   refuted       the crews were there — this was not a manpower problem
 *   no register   nobody wrote down whether the crews were there
 *
 * The third is deliberately NOT a weaker version of the second. "The manpower
 * was present and it still slipped" and "we do not know" lead a planner to
 * opposite conclusions, and collapsing them would turn an absence of evidence
 * into evidence of absence — on a screen whose output is a liability ruling.
 */
export function ManpowerEvidence({ activityId }: { activityId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['shortfall-evidence', activityId],
    queryFn: () => api.getShortfallEvidence(activityId),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-hair bg-surface/80 p-3 text-label text-muted">
        Checking the muster register…
      </div>
    );
  }
  // A missing activity or an activity with no dates to anchor a window on is
  // not an error worth interrupting an adjudication for.
  if (error || !data) return null;

  const supported = data.supports_manpower_cause;
  const tone =
    supported === null
      ? { ring: 'ring-hair', text: 'text-muted', Icon: HelpCircle }
      : supported
        ? { ring: 'ring-warn/40', text: 'text-warn', Icon: ShieldX }
        : { ring: 'ring-ok/40', text: 'text-ok', Icon: ShieldCheck };

  const headline =
    supported === null
      ? 'No muster register for this activity'
      : supported
        ? 'The register supports a manpower cause'
        : 'The register does not support a manpower cause';

  return (
    <div className={`rounded-lg bg-surface/80 p-3 ring-1 ${tone.ring}`}>
      <div className="flex items-start gap-2">
        <tone.Icon size={15} className={`mt-0.5 shrink-0 ${tone.text}`} />
        <div className="min-w-0">
          <p className={`text-body font-semibold ${tone.text}`}>{headline}</p>
          <p className="mt-0.5 text-label leading-5 text-muted">{data.note}</p>
        </div>
      </div>

      {data.musters > 0 && (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-label font-mono">
            <div className="rounded border border-hair bg-raised p-2">
              <dt className="block text-[10px] uppercase text-muted">Attendance</dt>
              <dd className="font-bold text-fg">
                {data.attendance_pct === null ? '—' : `${data.attendance_pct}%`}
              </dd>
            </div>
            <div className="rounded border border-hair bg-raised p-2">
              <dt className="block text-[10px] uppercase text-muted">Man-days</dt>
              <dd className="font-bold text-fg">{data.man_days}</dd>
            </div>
            <div className="rounded border border-hair bg-raised p-2">
              <dt className="block text-[10px] uppercase text-muted">Short days</dt>
              <dd className="font-bold text-fg">{data.short_days.length}</dd>
            </div>
          </dl>

          {Object.keys(data.absence_reasons).length > 0 && (
            <p className="mt-2 text-label text-muted">
              Absences:{' '}
              {Object.entries(data.absence_reasons)
                .map(([reason, count]) => `${reason.replace('_', ' ')} ${count}`)
                .join(' · ')}
            </p>
          )}

          <p className="mt-1 text-label text-muted">
            Window {data.window.from} → {data.window.to}, {data.musters} muster
            {data.musters === 1 ? '' : 's'}.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Quantity per man-day for one activity.
 *
 * Kept out of the three rates on the productivity panel on purpose: those are
 * available for every activity and this one only where a register was kept.
 * Shown together, a caller reads a missing man-day rate as zero productivity
 * rather than as an unkept register — so this states its own absence instead.
 */
export function ManDayRatePanel({ activityId }: { activityId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['man-day-rate', activityId],
    queryFn: () => api.getManDayRate(activityId),
    retry: false,
  });

  if (isLoading || error || !data) return null;

  return (
    <div className="rounded-lg border border-hair bg-surface/80 p-3">
      <div className="flex items-center gap-2">
        <Users size={14} className="text-accent" />
        <span className="text-label font-semibold uppercase tracking-[0.06em] text-muted">
          Man-day productivity
        </span>
      </div>
      {data.rate === null ? (
        // A stated absence, never a blank and never a zero.
        <p className="mt-1.5 text-label leading-5 text-muted">{data.note}</p>
      ) : (
        <>
          <p className="mt-1.5 font-mono text-lead font-bold text-heading">
            {data.rate} {data.uom}/man-day
          </p>
          <p className="mt-0.5 text-label leading-5 text-muted">{data.note}</p>
        </>
      )}
    </div>
  );
}
