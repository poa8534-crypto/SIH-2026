import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  Calendar,
  Flame,
} from 'lucide-react';
import { ScheduleActivity } from '../types';
import { DisciplineTag } from './DisciplineTag';
import { Button } from './ui';

interface GanttChartProps {
  activities: ScheduleActivity[];
  selectedId: string | null;
  onSelectActivity: (activityId: string) => void;
  dataDate?: string;
}

const MS_PER_DAY = 86_400_000;

function parseISODate(d: string): number {
  const parts = d.split('-').map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function formatShortDate(timestamp: number): string {
  const d = new Date(timestamp);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function formatMonthHeader(timestamp: number): string {
  const d = new Date(timestamp);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

type ZoomLevel = 'compact' | 'normal' | 'detailed';

const PX_PER_DAY_MAP: Record<ZoomLevel, number> = {
  compact: 6,
  normal: 12,
  detailed: 20,
};

export function GanttChart({
  activities,
  selectedId,
  onSelectActivity,
  dataDate = '2026-04-10',
}: GanttChartProps) {
  const [zoom, setZoom] = useState<ZoomLevel>('normal');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const pxPerDay = PX_PER_DAY_MAP[zoom];

  // Compute timeline boundaries across all activities and dataDate
  const { minTimestamp, maxTimestamp, totalDays, months, dataDateOffsetPx } = useMemo(() => {
    let minTime = Infinity;
    let maxTime = -Infinity;

    if (dataDate) {
      const ddTime = parseISODate(dataDate);
      if (!isNaN(ddTime)) {
        minTime = Math.min(minTime, ddTime);
        maxTime = Math.max(maxTime, ddTime);
      }
    }

    activities.forEach((act) => {
      if (act.planned_start) {
        const t = parseISODate(act.planned_start);
        if (!isNaN(t)) minTime = Math.min(minTime, t);
      }
      if (act.planned_finish) {
        const t = parseISODate(act.planned_finish);
        if (!isNaN(t)) maxTime = Math.max(maxTime, t);
      }
      if (act.actual_start) {
        const t = parseISODate(act.actual_start);
        if (!isNaN(t)) minTime = Math.min(minTime, t);
      }
      if (act.actual_finish) {
        const t = parseISODate(act.actual_finish);
        if (!isNaN(t)) maxTime = Math.max(maxTime, t);
      }
    });

    // Fallbacks if no valid dates exist
    if (minTime === Infinity || maxTime === -Infinity) {
      minTime = parseISODate('2026-03-01');
      maxTime = parseISODate('2026-10-31');
    }

    // Add padding (7 days before, 14 days after)
    minTime -= 7 * MS_PER_DAY;
    maxTime += 14 * MS_PER_DAY;

    // Align minTime to the start of its month
    const minD = new Date(minTime);
    minTime = Date.UTC(minD.getUTCFullYear(), minD.getUTCMonth(), 1);

    const diffDays = Math.max(30, Math.ceil((maxTime - minTime) / MS_PER_DAY));

    // Generate month headers
    const monthList: { label: string; offsetDays: number; durationDays: number }[] = [];
    const cur = new Date(minTime);
    const end = new Date(maxTime);

    while (cur <= end) {
      const year = cur.getUTCFullYear();
      const month = cur.getUTCMonth();
      const monthStart = Date.UTC(year, month, 1);
      const nextMonthStart = Date.UTC(year, month + 1, 1);
      const monthDays = Math.round((nextMonthStart - monthStart) / MS_PER_DAY);
      const offsetDays = Math.max(0, Math.round((monthStart - minTime) / MS_PER_DAY));

      monthList.push({
        label: formatMonthHeader(monthStart),
        offsetDays,
        durationDays: monthDays,
      });

      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }

    const ddTime = dataDate ? parseISODate(dataDate) : null;
    const ddOffset = ddTime && ddTime >= minTime
      ? Math.round((ddTime - minTime) / MS_PER_DAY) * pxPerDay
      : null;

    return {
      minTimestamp: minTime,
      maxTimestamp: maxTime,
      totalDays: diffDays,
      months: monthList,
      dataDateOffsetPx: ddOffset,
    };
  }, [activities, dataDate, pxPerDay]);

  const timelineWidth = totalDays * pxPerDay;

  // Scroll to selected activity or Data Date initially
  useEffect(() => {
    if (selectedId && rowRefs.current[selectedId]) {
      rowRefs.current[selectedId]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedId]);

  const scrollToDataDate = () => {
    if (scrollContainerRef.current && dataDateOffsetPx !== null) {
      scrollContainerRef.current.scrollTo({
        left: Math.max(0, dataDateOffsetPx - 300),
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-raised border border-hair rounded-lg overflow-hidden">
      {/* TOOLBAR CONTROLS */}
      <div className="shrink-0 h-10 px-4 border-b border-hair flex items-center justify-between gap-3 bg-surface">
        <div className="flex items-center gap-3 font-mono text-label">
          <span className="text-muted">Scale:</span>
          <div className="flex items-center rounded border border-hair overflow-hidden">
            <button
              onClick={() => setZoom('compact')}
              className={`px-2.5 py-1 text-label font-mono transition-colors ${
                zoom === 'compact'
                  ? 'bg-selected text-accent font-semibold'
                  : 'text-muted hover:text-fg'
              }`}
            >
              Compact
            </button>
            <button
              onClick={() => setZoom('normal')}
              className={`px-2.5 py-1 text-label font-mono border-l border-r border-hair transition-colors ${
                zoom === 'normal'
                  ? 'bg-selected text-accent font-semibold'
                  : 'text-muted hover:text-fg'
              }`}
            >
              Standard
            </button>
            <button
              onClick={() => setZoom('detailed')}
              className={`px-2.5 py-1 text-label font-mono transition-colors ${
                zoom === 'detailed'
                  ? 'bg-selected text-accent font-semibold'
                  : 'text-muted hover:text-fg'
              }`}
            >
              Detailed
            </button>
          </div>

          {dataDateOffsetPx !== null && (
            <Button
              variant="secondary"
              size="xs"
              onClick={scrollToDataDate}
              title={`Scroll timeline to project data date (${dataDate})`}
            >
              <Calendar size={12} className="text-accent" />
              Focus Data Date ({dataDate})
            </Button>
          )}
        </div>

        {/* COMPACT LEGEND */}
        <div className="flex items-center gap-4 font-mono text-label text-muted">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-2 bg-hair border border-strong/40 rounded-xs" />
            <span>Planned</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-2.5 bg-accent/30 border border-accent rounded-xs" />
            <span>Actual / Progress</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-2.5 bg-danger/25 border border-danger rounded-xs" />
            <span className="text-danger font-medium flex items-center gap-1">
              <Flame size={11} /> Critical (Float ≤ 0)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0 border-t border-dashed border-warn" />
            <span>Slack / Float</span>
          </div>
        </div>
      </div>

      {/* GANTT BODY (SINGLE SYNCHRONIZED SCROLL CONTAINER) */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-auto relative bg-raised select-none"
      >
        <div
          style={{ width: 440 + timelineWidth }}
          className="relative min-h-full flex flex-col"
        >
          {/* HEADER ROW */}
          <div className="sticky top-0 z-30 flex border-b border-hair bg-surface font-mono text-label">
            {/* Left Header: Activity Info (Sticky both vertically and horizontally) */}
            <div className="sticky left-0 z-40 w-[440px] shrink-0 border-r border-hair bg-surface flex items-center px-4 py-2 font-medium uppercase tracking-wider text-heading">
              <span className="w-28">Activity ID</span>
              <span className="w-14 text-center">Disc</span>
              <span className="flex-1 px-2">Description</span>
              <span className="w-16 text-right">Float</span>
              <span className="w-14 text-right">% Done</span>
            </div>

            {/* Right Header: Months & Days Timeline */}
            <div
              style={{ width: timelineWidth }}
              className="relative h-12 flex flex-col"
            >
              {/* Top tier: Months */}
              <div className="h-6 flex relative border-b border-hair">
                {months.map((m, idx) => {
                  const left = m.offsetDays * pxPerDay;
                  const width = m.durationDays * pxPerDay;
                  return (
                    <div
                      key={idx}
                      style={{ left, width }}
                      className="absolute top-0 bottom-0 border-r border-hair/70 px-2 flex items-center font-semibold text-fg tracking-wide truncate bg-surface/80"
                    >
                      {m.label}
                    </div>
                  );
                })}
              </div>

              {/* Bottom tier: Weeks / Day markers */}
              <div className="h-6 relative">
                {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, wIdx) => {
                  const dayOffset = wIdx * 7;
                  const time = minTimestamp + dayOffset * MS_PER_DAY;
                  const left = dayOffset * pxPerDay;
                  return (
                    <div
                      key={wIdx}
                      style={{ left }}
                      className="absolute top-0 bottom-0 border-r border-hair/40 px-1 flex items-center text-muted text-[11px] tabular-nums"
                    >
                      {formatShortDate(time)}
                    </div>
                  );
                })}
              </div>

              {/* Data Date Tag in Header */}
              {dataDateOffsetPx !== null && (
                <div
                  style={{ left: dataDateOffsetPx }}
                  className="absolute top-0 bottom-0 z-20 pointer-events-none flex flex-col items-center"
                >
                  <div className="bg-accent text-surface px-1.5 py-0.5 rounded-xs text-[10px] font-bold uppercase tracking-wider whitespace-nowrap shadow-sm">
                    Data Date
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* BACKGROUND VERTICAL GRID LINES & DATA DATE LINE */}
          <div
            style={{ left: 440, width: timelineWidth }}
            className="absolute top-12 bottom-0 pointer-events-none z-0 overflow-hidden"
          >
            {/* Monthly grid lines */}
            {months.map((m, idx) => (
              <div
                key={idx}
                style={{ left: m.offsetDays * pxPerDay }}
                className="absolute top-0 bottom-0 border-l border-hair/80"
              />
            ))}

            {/* Weekly subtle grid lines */}
            {Array.from({ length: Math.ceil(totalDays / 7) }).map((_, wIdx) => (
              <div
                key={wIdx}
                style={{ left: wIdx * 7 * pxPerDay }}
                className="absolute top-0 bottom-0 border-l border-hair/30"
              />
            ))}

            {/* Continuous Data Date vertical marker */}
            {dataDateOffsetPx !== null && (
              <div
                style={{ left: dataDateOffsetPx }}
                className="absolute top-0 bottom-0 w-0.5 bg-accent opacity-75 z-10"
              />
            )}
          </div>

          {/* ACTIVITY ROWS */}
          <div className="flex-1 flex flex-col z-10 divide-y divide-hair">
            {activities.map((act) => {
              const isSelected = act.activity_id === selectedId;
              const isCritical = Boolean(act.critical);
              const hasActual = Boolean(act.actual_start || act.actual_finish);

              // Planned bar calculations
              let pLeft = 0;
              let pWidth = 0;
              let hasPlanned = false;

              if (act.planned_start && act.planned_finish) {
                const ps = parseISODate(act.planned_start);
                const pf = parseISODate(act.planned_finish);
                if (!isNaN(ps) && !isNaN(pf)) {
                  hasPlanned = true;
                  pLeft = Math.round((ps - minTimestamp) / MS_PER_DAY) * pxPerDay;
                  pWidth = Math.max(6, Math.round((pf - ps) / MS_PER_DAY) * pxPerDay);
                }
              }

              // Actual bar calculations
              let aLeft = 0;
              let aWidth = 0;
              if (act.actual_start) {
                const as = parseISODate(act.actual_start);
                let af = act.actual_finish ? parseISODate(act.actual_finish) : parseISODate(dataDate);
                if (isNaN(af) || af < as) af = as + MS_PER_DAY;

                if (!isNaN(as)) {
                  aLeft = Math.round((as - minTimestamp) / MS_PER_DAY) * pxPerDay;
                  aWidth = Math.max(6, Math.round((af - as) / MS_PER_DAY) * pxPerDay);
                }
              }

              // Float slack calculation
              let floatSlackPx = 0;
              if (act.total_float && act.total_float > 0 && hasPlanned) {
                floatSlackPx = act.total_float * pxPerDay;
              }

              const isDelayed = (act.finish_variance_days ?? 0) > 0;

              return (
                <div
                  key={act.activity_id}
                  ref={(el) => {
                    rowRefs.current[act.activity_id] = el;
                  }}
                  onClick={() => onSelectActivity(act.activity_id)}
                  className={`flex h-12 cursor-pointer transition-colors group ${
                    isSelected
                      ? 'bg-selected'
                      : isCritical
                      ? 'bg-danger-bg/20 hover:bg-selected'
                      : 'hover:bg-selected even:bg-surface/50'
                  }`}
                >
                  {/* LEFT PANE: Sticky Activity Meta */}
                  <div
                    className={`sticky left-0 z-20 w-[440px] shrink-0 border-r border-hair px-4 flex items-center font-mono text-label transition-colors ${
                      isSelected
                        ? 'bg-selected'
                        : isCritical
                        ? 'bg-raised group-hover:bg-selected border-l-2 border-l-danger'
                        : 'bg-raised group-hover:bg-selected'
                    }`}
                  >
                    {/* Activity ID & Critical Icon */}
                    <div className="w-28 flex items-center gap-1.5">
                      {isCritical ? (
                        <span
                          title="Critical Path Activity (Zero Float)"
                          className="flex items-center gap-0.5 text-danger font-bold"
                        >
                          <Flame size={12} className="text-danger animate-pulse" />
                          <span className="text-[10px] bg-danger/15 px-1 rounded-xs">CRIT</span>
                        </span>
                      ) : (
                        <span className="w-5" />
                      )}
                      <span className="font-semibold text-fg truncate">
                        {act.activity_id}
                      </span>
                    </div>

                    {/* Discipline Badge */}
                    <div className="w-14 flex justify-center">
                      <DisciplineTag discipline={act.discipline} />
                    </div>

                    {/* Description */}
                    <div
                      className="flex-1 px-2 truncate text-body text-fg group-hover:text-accent transition-colors"
                      title={act.description}
                    >
                      {act.description}
                    </div>

                    {/* Total Float */}
                    <div className="w-16 text-right tabular-nums">
                      {act.total_float !== null && act.total_float !== undefined ? (
                        <span
                          className={`font-mono ${
                            isCritical ? 'text-danger font-bold' : 'text-muted'
                          }`}
                          title={`Total Float: ${act.total_float} days`}
                        >
                          {act.total_float}d
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </div>

                    {/* Percent Complete */}
                    <div className="w-14 text-right tabular-nums">
                      {act.percent_complete !== null && act.percent_complete !== undefined ? (
                        <span
                          className={`font-mono ${
                            act.percent_complete >= 100
                              ? 'text-ok font-semibold'
                              : hasActual
                              ? 'text-fg'
                              : 'text-muted'
                          }`}
                        >
                          {act.percent_complete.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-muted">0%</span>
                      )}
                    </div>
                  </div>

                  {/* RIGHT PANE: DUAL-BAR TIMELINE CANVAS */}
                  <div
                    style={{ width: timelineWidth }}
                    className="relative h-full flex items-center"
                  >
                    {/* TOP BAR: Baseline Plan */}
                    {hasPlanned && (
                      <div
                        style={{ left: pLeft, width: pWidth }}
                        className="absolute top-2 h-2.5 bg-hair/80 border border-strong/40 rounded-xs transition-opacity hover:opacity-100 opacity-80"
                        title={`Baseline Plan: ${act.planned_start} → ${act.planned_finish} (${act.planned_qty} ${act.uom})`}
                      />
                    )}

                    {/* FLOAT SLACK CONNECTOR */}
                    {floatSlackPx > 0 && hasPlanned && (
                      <div
                        style={{
                          left: pLeft + pWidth,
                          width: floatSlackPx,
                        }}
                        className="absolute top-3 h-0 border-t border-dashed border-warn/70 flex items-center justify-end"
                        title={`Float Slack Buffer: ${act.total_float} days before impacting project milestone`}
                      >
                        <span className="text-[9px] font-mono text-warn bg-surface/90 px-0.5 rounded-xs -translate-y-2 border border-hair">
                          +{act.total_float}d
                        </span>
                      </div>
                    )}

                    {/* BOTTOM BAR: Actual / Earned Progress */}
                    {hasActual ? (
                      <div
                        style={{ left: aLeft, width: aWidth }}
                        className={`absolute top-5 h-4 rounded-xs border overflow-hidden transition-all shadow-xs ${
                          isCritical
                            ? 'bg-danger/20 border-danger'
                            : isDelayed
                            ? 'bg-warn/20 border-warn'
                            : 'bg-accent/20 border-accent'
                        }`}
                        title={`Actual: ${act.actual_start} → ${
                          act.actual_finish ?? 'In Progress'
                        }\nProgress: ${act.percent_complete ?? 0}%\nVariance: Start ${
                          act.start_variance_days ?? 0
                        }d, Finish ${act.finish_variance_days ?? 0}d`}
                      >
                        {/* Interior progress fill */}
                        <div
                          style={{ width: `${Math.min(100, Math.max(0, act.percent_complete || 0))}%` }}
                          className={`h-full transition-all ${
                            isCritical
                              ? 'bg-danger'
                              : isDelayed
                              ? 'bg-warn'
                              : 'bg-accent'
                          }`}
                        />
                        {/* Progress label if width is sufficient */}
                        {aWidth > 32 && (
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-fg drop-shadow-xs">
                            {(act.percent_complete || 0).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    ) : (
                      // Ghost bar if not started yet
                      hasPlanned && (
                        <div
                          style={{ left: pLeft, width: pWidth }}
                          className="absolute top-5 h-3 border border-hair/50 border-dashed rounded-xs opacity-40 pointer-events-none"
                          title="Pending field start"
                        />
                      )
                    )}
                  </div>
                </div>
              );
            })}

            {activities.length === 0 && (
              <div className="p-8 text-center text-muted font-mono text-body">
                No activities to display for the current filter.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
