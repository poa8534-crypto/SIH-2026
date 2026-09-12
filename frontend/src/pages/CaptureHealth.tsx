import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Antenna,
  CloudOff,
  Radio,
  SignalHigh,
  Timer,
  TriangleAlert,
} from 'lucide-react';
import { api } from '../lib/api';
import { usePageHeader } from '../hooks/usePageHeader';
import {
  DataTableShell,
  DisclosureNotice,
  ErrorState,
  MetricCard,
  PageIntro,
  SkeletonRows,
  StatusBadge,
} from '../components/ui';
import type { DeviceView, LinkBand } from '../types';

/**
 * Capture health: whether "near real-time" was true today.
 *
 * WHY THIS SCREEN EXISTS AT ALL
 * -----------------------------
 * NAVIS's central claim is that actual progress reaches the schedule in near
 * real time. Every other planner screen assumes that claim holds. This is the
 * one that checks it, and it exists because of a silent ambiguity with
 * opposite remedies:
 *
 *   piping has not reported for three days
 *     → no work happened      chase the contractor
 *     → no signal reached us  chase the connectivity
 *
 * A planner looking at NAVIS could not previously tell those apart, and would
 * act on the first reading because it was the only one offered.
 *
 * The three panels answer, in order: who is reaching us right now, how long
 * capture actually took, and which disciplines produced nothing at all today.
 */

/**
 * A band's colour, in each component's own vocabulary.
 *
 * `StatusBadge` calls the absence of a tone "neutral" and `MetricCard` calls
 * it "default". Mapping once here keeps the two spellings out of every call
 * site and stops an `unknown` band silently rendering as a failing one.
 */
const BADGE_TONE: Record<LinkBand, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  good: 'ok',
  weak: 'warn',
  poor: 'danger',
  unknown: 'neutral',
};

const METRIC_TONE: Record<LinkBand, 'ok' | 'warn' | 'danger' | 'default'> = {
  good: 'ok',
  weak: 'warn',
  poor: 'danger',
  unknown: 'default',
};

function ago(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86_400)} d ago`;
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export default function CaptureHealth() {
  usePageHeader(
    'Capture Health',
    'Whether the data is reaching you, and how late',
    '/capture-health'
  );

  const health = useQuery({
    queryKey: ['link-health'],
    queryFn: () => api.getLinkHealth(),
    // The point of this screen is liveness, so it polls. Cheap: one row per
    // device, and the field clients only heartbeat every 20 seconds anyway.
    refetchInterval: 10_000,
  });
  const lag = useQuery({
    queryKey: ['reporting-lag'],
    queryFn: () => api.getReportingLag(14),
  });
  const coverage = useQuery({
    queryKey: ['capture-coverage'],
    queryFn: () => api.getCaptureCoverage(),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageIntro
        eyebrow="Data capture"
        title="Capture Health"
        description="NAVIS claims progress reaches the schedule in near real time. This is the screen that checks the claim — and separates “no work happened” from “no signal reached us”, which lead to opposite actions."
      />

      {health.error && <ErrorState error={health.error} />}
      {health.isLoading && <SkeletonRows rows={4} />}

      {health.data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Devices reaching you"
            value={`${health.data.online} / ${health.data.total}`}
            detail={
              health.data.total === 0
                ? 'No field device has reported in yet'
                : `${health.data.offline} not currently reachable`
            }
            tone={health.data.offline > 0 ? 'warn' : 'ok'}
            icon={<Radio size={15} />}
          />
          <MetricCard
            label="Weakest live link"
            value={health.data.worst_band ?? '—'}
            detail={
              health.data.worst_band === null
                ? 'Nothing is online, so there is no link to band'
                : 'The worst signal among devices currently reaching you'
            }
            tone={
              health.data.worst_band === null
                ? 'default'
                : METRIC_TONE[health.data.worst_band]
            }
            icon={<SignalHigh size={15} />}
          />
          <MetricCard
            label="Held on devices"
            value={health.data.queued_submissions}
            detail={`${bytes(
              health.data.queued_bytes
            )} of progress captured but not yet delivered`}
            tone={health.data.queued_submissions > 0 ? 'warn' : 'ok'}
            icon={<CloudOff size={15} />}
          />
          <MetricCard
            label="Median capture lag"
            value={
              lag.data?.median_lag_hours === null || lag.data === undefined
                ? '—'
                : `${lag.data.median_lag_hours} h`
            }
            detail="From the day work is claimed for, to the moment it reached this server"
            icon={<Timer size={15} />}
          />
        </div>
      )}

      <DisclosureNotice summary="What is measured here, and what is only reported">
        <p>
          <strong className="text-heading">Round-trip time</strong> is measured
          by each device against <code>/health</code>.{' '}
          <strong className="text-heading">Throughput</strong> is not measured:
          probing it honestly means pushing enough bytes to saturate the link
          this feature exists to protect, so NAVIS reports the browser's own
          estimate where the browser offers one (Chromium does; Safari and
          Firefox do not) and shows nothing where it does not.
        </p>
        <p className="mt-2">
          <strong className="text-heading">Capture lag</strong> is computed from
          data NAVIS was already storing — the day an event was reported for,
          against the moment its row was written — so it works retroactively
          across the whole corpus with no new instrumentation.
        </p>
        <p className="mt-2">
          A degraded link never lowers a confidence score. Dropping a supervisor
          to text-only removes an assist, not a guarantee (D-005): a typed
          report is a complete report.
        </p>
      </DisclosureNotice>

      {/* Silence first: this is the screen's reason for existing. */}
      <section className="flex flex-col gap-2">
        <h3 className="text-lead font-semibold text-heading">
          Is anything silent today?
        </h3>
        <p className="text-label text-muted">
          Counted against the disciplines that <em>have crews on the books</em>,
          not the ones that happened to send something — otherwise a completely
          silent site would score full coverage.
        </p>
        {coverage.isLoading && <SkeletonRows rows={2} />}
        {coverage.error && <ErrorState error={coverage.error} />}
        {coverage.data && (
          <DataTableShell>
            <table className="w-full min-w-[560px] text-body">
              <thead className="bg-secondary text-label uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Discipline</th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Progress events
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold">Muster taken</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Reading</th>
                </tr>
              </thead>
              <tbody>
                {coverage.data.rows.map((r) => (
                  <tr key={r.discipline} className="border-t border-hair">
                    <td className="px-4 py-2.5 font-medium text-heading">
                      {r.discipline.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.progress_events}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.attendance_marked ? (
                        <StatusBadge tone="ok">Yes</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">No</StatusBadge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {/* The three readings a planner acts on differently. */}
                      {r.silent
                        ? 'Nothing arrived — treat as a capture question'
                        : r.progress_events === 0
                          ? 'Crews counted, no progress filed — a work question'
                          : 'Reporting'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-lead font-semibold text-heading">
          How late the data arrives, per discipline
        </h3>
        <p className="text-label text-muted">
          Per discipline because that is the unit that goes quiet: one
          supervisor losing signal silences one discipline, and a project-wide
          median would hide it completely.
        </p>
        {lag.isLoading && <SkeletonRows rows={3} />}
        {lag.error && <ErrorState error={lag.error} />}
        {lag.data && lag.data.rows.length === 0 && (
          <p className="rounded-xl bg-secondary p-4 text-body text-muted">
            No events were reported in the last {lag.data.window_days} days.
          </p>
        )}
        {lag.data && lag.data.rows.length > 0 && (
          <DataTableShell>
            <table className="w-full min-w-[640px] text-body">
              <thead className="bg-secondary text-label uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Discipline</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Events</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Median lag</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Worst lag</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Last heard</th>
                </tr>
              </thead>
              <tbody>
                {lag.data.rows.map((r) => (
                  <tr key={r.discipline} className="border-t border-hair">
                    <td className="px-4 py-2.5 font-medium text-heading">
                      {r.discipline.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.events}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.median_lag_hours === null ? '—' : `${r.median_lag_hours} h`}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {r.max_lag_hours === null ? '—' : `${r.max_lag_hours} h`}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.days_since_last_report === null ? (
                        <span className="text-muted">—</span>
                      ) : r.days_since_last_report >= 3 ? (
                        <span className="flex items-center gap-1.5 text-warn">
                          <TriangleAlert size={13} />
                          {r.days_since_last_report} days ago
                        </span>
                      ) : (
                        <span className="text-muted">
                          {r.days_since_last_report === 0
                            ? 'today'
                            : `${r.days_since_last_report} day${
                                r.days_since_last_report === 1 ? '' : 's'
                              } ago`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-lead font-semibold text-heading">Field devices</h3>
        <p className="text-label text-muted">
          Offline first — this list exists to answer “who is not reaching us”.
        </p>
        {health.data && health.data.devices.length === 0 && (
          <p className="rounded-xl bg-secondary p-4 text-body text-muted">
            No field device has reported in yet. A device appears here the first
            time it opens the field app.
          </p>
        )}
        <div className="grid gap-2 lg:grid-cols-2">
          {(health.data?.devices ?? []).map((d) => (
            <DeviceCard key={d.device_id} device={d} />
          ))}
        </div>
      </section>
    </div>
  );
}

function DeviceCard({ device }: { device: DeviceView }) {
  return (
    <div
      className={`rounded-xl bg-raised p-4 ring-1 ${
        device.online ? 'ring-hair/80' : 'ring-warn/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-label text-muted">
            {device.device_id.slice(0, 8)}
          </p>
          <p className="mt-0.5 text-body font-medium text-heading">
            {device.label ?? device.role}
          </p>
        </div>
        {device.online ? (
          <StatusBadge tone={BADGE_TONE[device.band]}>{device.band}</StatusBadge>
        ) : (
          <StatusBadge tone="warn">offline</StatusBadge>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-label">
        <div>
          <dt className="text-muted">Round trip</dt>
          <dd className="font-mono text-heading">
            {device.rtt_ms === null ? '—' : `${Math.round(device.rtt_ms)} ms`}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Mode</dt>
          <dd className="text-heading">
            {device.mode}
            {/* What it SAID vs what is TRUE. A device that has gone quiet
                reads offline whatever its last ping claimed. */}
            {device.mode !== device.declared_mode && (
              <span className="text-muted"> (said {device.declared_mode})</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Queued</dt>
          <dd className="font-mono text-heading">{device.queue_depth}</dd>
        </div>
      </dl>

      <p className="mt-2 flex items-center gap-1.5 text-label text-muted">
        <Antenna size={12} />
        Last heard {ago(device.seconds_since_seen)}
      </p>
    </div>
  );
}
