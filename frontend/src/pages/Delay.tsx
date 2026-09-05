/**
 * QUESTION:  This activity ran late. Whose problem is it, is the claim still
 *            alive, and did it actually move the completion date?
 * ACTION:    Rule on it, or record the notice that keeps it alive.
 *
 * The planner half of the Contractor Dispute Shield. The backend has built the
 * whole chain — taxonomy (D-076), persisted delay events (D-077), adjudication
 * (D-078), the report (D-079), the notice clock (D-080), concurrency (D-081)
 * and float (D-082) — and every one of those decisions is a proposal until a
 * human rules. This screen is the place a human rules.
 *
 * NOTE ON THE DESIGN. Every other planner screen reproduces a mockup in
 * `Design/`. There is no mockup for this one, so the layout here is assembled
 * from the vocabulary the shipped screens already use — Reconcile's queue and
 * detail pane, Raid's panels, the same tokens and the same `ui` primitives.
 * Nothing new was invented; if a mockup arrives, this reproduces it instead.
 *
 * THE RULE THE SCREEN IS BUILT AROUND. A proposal never renders as a finding.
 * Every unruled row says so on its face, the totals separate ruled days from
 * proposals, and the whole slip is shown beside the part that outran float —
 * the smaller number is credible precisely because the larger one is next to
 * it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Clock, ExternalLink, Layers } from 'lucide-react';

import { api, errorDetail } from '../lib/api';
import { usePageHeader } from '../hooks/usePageHeader';
import type { ConcurrentDelayPair, DelayEvent, Liability } from '../types';
import {
  Button,
  EmptyState,
  ErrorState,
  Panel,
  PanelHeader,
  SkeletonRows,
} from '../components/ui';

/** The four outcomes, in the order the report prints them: owner side first,
 *  because that is the column a claim is built from; contested last, because
 *  it is work outstanding rather than a finding. */
const LIABILITIES: Liability[] = [
  'COMPENSABLE',
  'NON_COMPENSABLE',
  'EXCUSABLE',
  'CONTESTED',
];

const LIABILITY_LABEL: Record<Liability, string> = {
  COMPENSABLE: 'Compensable',
  NON_COMPENSABLE: 'Non-compensable',
  EXCUSABLE: 'Excusable',
  CONTESTED: 'Contested',
};

const LIABILITY_WHO: Record<Liability, string> = {
  COMPENSABLE: 'Owner — time and cost',
  NON_COMPENSABLE: 'Contractor — LD applies',
  EXCUSABLE: 'Neither party — time only',
  CONTESTED: 'Not determinable from the evidence',
};

/** Colour by role, from the app's own tokens. Contested is deliberately not a
 *  warning colour: it is unfinished work, not a problem. */
const LIABILITY_CLASS: Record<Liability, string> = {
  COMPENSABLE: 'text-accent border-accent',
  NON_COMPENSABLE: 'text-danger border-danger',
  EXCUSABLE: 'text-warn border-warn',
  CONTESTED: 'text-muted border-hair',
};

/** The secondary button's own classes, for the two controls that have to be
 *  anchors. Kept beside the map below so a change to one is visible next to
 *  the other rather than buried in the markup. */
const REPORT_LINK =
  'inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border border-hair ' +
  'bg-raised text-muted text-body hover:bg-selected hover:text-accent ' +
  'transition-colors';

const NOTICE_CLASS: Record<string, string> = {
  LAPSED: 'text-danger',
  OPEN: 'text-accent',
  SERVED: 'text-ok',
  UNKNOWN: 'text-muted',
};

function LiabilityTag({
  liability,
  muted = false,
}: {
  liability: Liability;
  muted?: boolean;
}) {
  return (
    <span
      className={`px-2 py-0.5 border rounded-full text-label uppercase tracking-[0.05em] shrink-0 ${
        muted ? 'text-muted border-hair' : LIABILITY_CLASS[liability]
      }`}
    >
      {LIABILITY_LABEL[liability]}
    </span>
  );
}

/** One line saying where the delay stands against its notice window.
 *
 *  LAPSED is stated as "no notice recorded", never "no notice given": NAVIS
 *  holds no notice register and the difference is the whole of the claim. */
function NoticeLine({ event }: { event: DelayEvent }) {
  const cls = NOTICE_CLASS[event.notice_status] ?? 'text-muted';
  if (event.notice_status === 'SERVED') {
    return (
      <span className={cls}>
        Notice served {event.notice_served_on}
        {event.notice_reference ? ` · ${event.notice_reference}` : ''}
      </span>
    );
  }
  if (event.notice_status === 'LAPSED') {
    return (
      <span className={cls}>
        Notice window closed {event.notice_due_on} —{' '}
        {Math.abs(event.notice_days_remaining ?? 0)}d ago, none recorded
      </span>
    );
  }
  if (event.notice_status === 'OPEN') {
    return (
      <span className={cls}>
        Notice due {event.notice_due_on} — {event.notice_days_remaining}d left
      </span>
    );
  }
  return <span className={cls}>No notice window — evidenced date unknown</span>;
}

/** The slip, and the part of it that outran the float the baseline gave.
 *
 *  Both numbers, always. `impact_days` alone overstates; `beyond_float_days`
 *  alone would look like a figure conjured from nowhere. */
function FloatLine({ event }: { event: DelayEvent }) {
  if (event.activity_total_float === null) {
    return (
      <span className="text-muted">
        {event.impact_days}d slip · float not established, so none is credited
      </span>
    );
  }
  if (event.beyond_float_days > 0) {
    return (
      <span className="text-danger">
        {event.impact_days}d slip · {event.beyond_float_days}d beyond float
        {event.on_critical_path ? ' · critical path' : ''}
      </span>
    );
  }
  return (
    <span className="text-muted">
      {event.impact_days}d slip · absorbed by {event.activity_total_float}d float
    </span>
  );
}

function EventRow({
  event,
  selected,
  onSelect,
}: {
  event: DelayEvent;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      id={`delay-row-${event.id}`}
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 border-b border-hair last:border-0 transition-colors ${
        selected ? 'bg-selected' : 'hover:bg-raised'
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-body text-fg">
          {event.activity_id ?? '—'}
        </span>
        <LiabilityTag
          liability={event.liability_effective}
          muted={!event.adjudicated}
        />
        {!event.adjudicated && (
          <span className="text-label uppercase tracking-[0.05em] text-muted">
            proposal
          </span>
        )}
      </div>
      <p className="mt-1 text-body text-muted truncate">{event.phrase}</p>
      <div className="mt-1 flex flex-col gap-0.5 text-label font-mono">
        <FloatLine event={event} />
        <NoticeLine event={event} />
      </div>
    </button>
  );
}

function ConcurrencyPanel({ pairs }: { pairs: ConcurrentDelayPair[] }) {
  if (pairs.length === 0) return null;
  return (
    <Panel>
      <PanelHeader title="Concurrent delay" />
      <div className="px-4 py-3 flex flex-col gap-3">
        <p className="text-body text-muted">
          Delays open over the same period. NAVIS names the overlap and cites
          both sides; splitting it between parties is a matter for the contract,
          not for software.
        </p>
        {pairs.map((pair) => (
          <div
            key={`${pair.left_delay_event_id}:${pair.right_delay_event_id}`}
            className="border border-hair rounded-sm px-3 py-2"
          >
            <div className="flex items-center gap-2 flex-wrap text-label font-mono uppercase">
              <span
                className={
                  pair.status === 'CONFLICT' ? 'text-danger' : 'text-muted'
                }
              >
                {pair.status}
              </span>
              <span className="text-muted">
                {pair.overlap_start} → {pair.overlap_end} · {pair.overlap_days}d
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 flex-wrap text-body">
              <span className="font-mono text-fg">{pair.left_activity_id}</span>
              <LiabilityTag liability={pair.left_liability} />
              <span className="text-muted">vs</span>
              <span className="font-mono text-fg">{pair.right_activity_id}</span>
              <LiabilityTag liability={pair.right_liability} />
            </div>
            <p className="mt-1 text-label text-muted">
              {pair.kind === 'SAME_ACTIVITY'
                ? 'Same activity — the two causes share one overrun by construction.'
                : pair.both_beyond_float
                  ? 'Different activities, and both outran their own float — each could have moved the completion date.'
                  : 'Different activities, and at least one was absorbed by float — the overlap did not by itself move the finish.'}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function Delay() {
  usePageHeader(
    'Delay',
    'What ran late, whose problem it is, and whether it moved the finish.',
    '/delay'
  );
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noticeDate, setNoticeDate] = useState('');
  const [noticeRef, setNoticeRef] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['delayAttribution'],
    queryFn: () => api.getDelayAttribution(),
    refetchInterval: 3000,
  });

  const events = useMemo(() => data?.events ?? [], [data]);
  const selected = useMemo(
    () => events.find((e) => e.id === selectedId) ?? null,
    [events, selectedId]
  );

  // Auto-select the first delay, and clear the composers when the selection
  // moves — a note typed against one ruling must never be submitted with
  // another.
  useEffect(() => {
    if (events.length > 0 && !selected) setSelectedId(events[0].id);
  }, [events, selected]);

  /* Clear the composers when the selection MOVES, not when it first arrives.
     A note typed against one ruling must never be submitted with another —
     but the auto-select above sets `selectedId` a render after the pane is
     already on screen, and clearing on that first transition wiped anything
     typed in between. The composers start empty, so there is nothing to clear
     on the way in. */
  const previousId = useRef<string | null>(null);
  useEffect(() => {
    const moved = previousId.current !== null && previousId.current !== selectedId;
    previousId.current = selectedId;
    if (!moved) return;
    setNote('');
    setNoticeDate('');
    setNoticeRef('');
    setActionError(null);
  }, [selectedId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['delayAttribution'] });
    // A ruling writes an audit record, so the trail and the register move too.
    queryClient.invalidateQueries({ queryKey: ['auditRecent'] });
  };

  const classify = useMutation({
    mutationFn: (variables: { id: string; liability: Liability; note?: string }) =>
      api.classifyDelay(variables.id, {
        liability: variables.liability,
        note: variables.note || undefined,
      }),
    onSuccess: (result) => {
      setToast(result.message);
      setNote('');
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(errorDetail(e)),
  });

  const recordNotice = useMutation({
    mutationFn: (variables: { id: string; served_on: string; reference?: string }) =>
      api.recordDelayNotice(variables.id, {
        served_on: variables.served_on,
        reference: variables.reference || undefined,
      }),
    onSuccess: (result) => {
      setToast(result.message);
      setNoticeDate('');
      setNoticeRef('');
      setActionError(null);
      invalidate();
    },
    onError: (e) => setActionError(errorDetail(e)),
  });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (error) {
    return (
      <ErrorState
        error={error}
        mode="full"
        title="The delay attribution could not be loaded"
      />
    );
  }

  const network = data?.network;
  const beyondTotal = Object.values(data?.beyond_float_days ?? {}).reduce(
    (sum, days) => sum + days,
    0
  );
  const proposedTotal = Object.values(data?.proposed_days ?? {}).reduce(
    (sum, days) => sum + days,
    0
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── Headline ── */}
      <Panel>
        <PanelHeader title="Delay attribution" />
        <div className="px-4 py-3 flex flex-col gap-3">
          <div className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-label">
            <span className="text-muted">
              <span className="text-fg">{data?.total_events ?? 0}</span> delays
              classified
            </span>
            <span className="text-muted">
              <span className="text-fg">{data?.adjudicated_events ?? 0}</span>{' '}
              {data?.adjudicated_events === 1 ? 'carries' : 'carry'} a ruling
            </span>
            <span className="text-muted">
              <span className="text-fg">{proposedTotal}</span>d recorded, of
              which <span className="text-danger">{beyondTotal}</span>d beyond
              float
            </span>
            <span className="text-muted">
              <span className="text-danger">
                {data?.notice_counts?.LAPSED ?? 0}
              </span>{' '}
              notice windows closed
            </span>
          </div>
          <p className="text-body text-muted">
            {data?.impact_days_basis}
          </p>
          {/* Plain anchors, not <Button to=...>: `to` renders a react-router
              Link, and the report is served from the API origin, which in
              development is a different one. They wear the secondary button's
              look so the toolbar reads as one row of controls. */}
          <div className="flex gap-2 flex-wrap">
            <a
              href={api.delayReportUrl('html')}
              target="_blank"
              rel="noreferrer"
              className={REPORT_LINK}
            >
              <ExternalLink size={14} />
              Open report
            </a>
            <a
              href={api.delayReportUrl('csv')}
              download
              className={REPORT_LINK}
            >
              Download CSV
            </a>
          </div>
        </div>
      </Panel>

      {/* The baseline's own dates disagreeing with its logic is a fact about
          the schedule, not about this screen, and every float figure below
          rests on it. It is stated before the numbers, not after. */}
      {network && !network.logic_matches_dates && (
        <Panel>
          <div className="px-4 py-3 flex items-start gap-3">
            <AlertTriangle size={16} className="text-warn mt-0.5 shrink-0" />
            <p className="text-body text-muted">
              The baseline&apos;s own dates break{' '}
              <span className="text-fg">{network.logic_conflicts}</span> of the
              logic ties it states, so the network finishes{' '}
              <span className="font-mono text-fg">{network.project_finish}</span>{' '}
              against an authored{' '}
              <span className="font-mono text-fg">
                {network.authored_finish}
              </span>
              . Float below is computed from the logic and is advisory until the
              two are reconciled.
            </p>
          </div>
        </Panel>
      )}

      <ConcurrencyPanel pairs={data?.concurrency?.pairs ?? []} />

      {toast && (
        <Panel>
          <div className="px-4 py-2 flex items-center gap-2 text-body text-ok">
            <Check size={14} />
            {toast}
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-4">
        {/* ── The delays ── */}
        <Panel>
          <PanelHeader title={`Delays (${events.length})`} />
          {isLoading ? (
            <SkeletonRows rows={4} />
          ) : events.length === 0 ? (
            <EmptyState icon={Layers} title="No classified delays">
              Delay causes are read from the field evidence already in the
              audit trail. Ingest a report that names one, and it appears here.
            </EmptyState>
          ) : (
            <div>
              {events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  selected={event.id === selectedId}
                  onSelect={() => setSelectedId(event.id)}
                />
              ))}
            </div>
          )}
        </Panel>

        {/* ── The one being adjudicated ── */}
        <Panel>
          {!selected ? (
            <EmptyState icon={Layers} title="Nothing selected">
              Choose a delay to see the evidence behind it and rule on who
              carries it.
            </EmptyState>
          ) : (
            <>
              <PanelHeader
                title={selected.activity_id ?? 'Unattributed delay'}
                right={
                  <span className="font-mono text-label uppercase text-muted">
                    {selected.category}
                  </span>
                }
              />
              <div className="px-4 py-3 flex flex-col gap-4">
                {/* Evidence, verbatim, with the line it came from. */}
                <div>
                  <p className="text-body text-fg italic">
                    &ldquo;{selected.source_span}&rdquo;
                  </p>
                  <p className="mt-1 font-mono text-label text-muted">
                    {selected.source_file}
                    {selected.source_row !== null
                      ? `, row ${selected.source_row}`
                      : selected.source_line !== null
                        ? `, line ${selected.source_line}`
                        : ''}
                    {selected.discipline ? ` · ${selected.discipline}` : ''}
                  </p>
                </div>

                <div className="flex flex-col gap-1 font-mono text-label">
                  <FloatLine event={selected} />
                  <NoticeLine event={selected} />
                  {selected.evidenced_on && (
                    <span className="text-muted">
                      Evidenced {selected.evidenced_on} (
                      {selected.evidenced_basis})
                    </span>
                  )}
                </div>

                {/* ── Ruling ── */}
                <div className="border-t border-hair pt-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-label uppercase tracking-[0.05em] text-muted">
                      Proposed
                    </span>
                    <LiabilityTag liability={selected.liability_proposed} muted />
                    {selected.adjudicated && (
                      <>
                        <span className="text-label uppercase tracking-[0.05em] text-muted">
                          Ruled
                        </span>
                        <LiabilityTag liability={selected.liability_effective} />
                      </>
                    )}
                  </div>
                  {selected.adjudication_note && (
                    <p className="mt-1 text-body text-muted italic">
                      &ldquo;{selected.adjudication_note}&rdquo;
                    </p>
                  )}
                  <p className="mt-2 text-body text-muted">
                    {LIABILITY_WHO[selected.liability_effective]}. A ruling
                    writes an audit record naming what it replaced; there is no
                    accept shortcut, so confirming the proposal is itself a
                    decision.
                  </p>
                  <input
                    id="delay-note-input"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Why (recorded on the delay and in the audit trail)…"
                    disabled={classify.isPending}
                    className="mt-2 w-full rounded-sm bg-raised border border-hair px-3 py-2 font-mono text-body text-fg focus:outline-none focus:border-accent transition-colors"
                  />
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {LIABILITIES.map((liability) => (
                      <Button
                        key={liability}
                        /* The four outcomes also render as tags on every queue
                           row, so the control needs an identity of its own —
                           for a test, and for anything else addressing it. */
                        id={`rule-${liability}`}
                        variant={
                          liability === selected.liability_proposed
                            ? 'primary'
                            : 'secondary'
                        }
                        size="sm"
                        disabled={classify.isPending}
                        onClick={() =>
                          classify.mutate({
                            id: selected.id,
                            liability,
                            note,
                          })
                        }
                      >
                        {LIABILITY_LABEL[liability]}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* ── Notice ── */}
                <div className="border-t border-hair pt-3">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-muted" />
                    <span className="text-label uppercase tracking-[0.05em] text-muted">
                      Record a notice given
                    </span>
                  </div>
                  <p className="mt-1 text-body text-muted">
                    The date notice was given, not the date it is entered here.
                    A date after the deadline is recorded and flagged, never
                    refused.
                  </p>
                  <div className="mt-2 flex gap-2 flex-wrap items-center">
                    <input
                      id="delay-notice-date"
                      type="date"
                      aria-label="Date notice was given"
                      value={noticeDate}
                      onChange={(e) => setNoticeDate(e.target.value)}
                      disabled={recordNotice.isPending}
                      className="rounded-sm bg-raised border border-hair px-3 py-2 font-mono text-body text-fg focus:outline-none focus:border-accent transition-colors"
                    />
                    <input
                      id="delay-notice-ref"
                      type="text"
                      aria-label="Notice reference"
                      value={noticeRef}
                      onChange={(e) => setNoticeRef(e.target.value)}
                      placeholder="Letter reference…"
                      disabled={recordNotice.isPending}
                      className="flex-1 min-w-[12rem] rounded-sm bg-raised border border-hair px-3 py-2 font-mono text-body text-fg focus:outline-none focus:border-accent transition-colors"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!noticeDate || recordNotice.isPending}
                      onClick={() => {
                        if (!noticeDate) {
                          setActionError('A date is required to record a notice.');
                          return;
                        }
                        recordNotice.mutate({
                          id: selected.id,
                          served_on: noticeDate,
                          reference: noticeRef,
                        });
                      }}
                    >
                      Record notice
                    </Button>
                  </div>
                </div>

                {actionError && (
                  <p className="text-body text-danger">{actionError}</p>
                )}
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
