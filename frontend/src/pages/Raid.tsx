/**
 * The RAID register, and the adjudication step that fills it.
 *
 * The register existed, the detector existed, and the executive Exposure
 * screen read `GET /raid` — but nothing in the product ever wrote to it.
 * `GET /raid/candidates` proposed entries from the audit trail and every one
 * of them stayed `committed: false` for ever, because there was no screen on
 * which a Project Manager could accept one. `lib/role.ts` already listed
 * `/raid` among the planner's routes; only the nav entry and the page were
 * missing. So Exposure showed an empty register with copy explaining that
 * candidates wait for a planner, and the planner had no way to be that person.
 *
 * This is the same rule as D-009 for dates: the system proposes, a person
 * commits. That rule needs both halves to exist.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Clock } from 'lucide-react';

import { api } from '../lib/api';
import { usePageHeader } from '../hooks/usePageHeader';
import type { RaidCandidate, RaidItem } from '../types';
import {
  Button,
  EmptyState,
  ErrorState,
  Panel,
  SkeletonRows,
} from '../components/ui';

const KIND_LABEL: Record<string, string> = {
  risk: 'Risk',
  issue: 'Issue',
  action: 'Action',
  decision: 'Decision',
};

function KindTag({ kind }: { kind: string }) {
  return (
    <span className="px-2 py-0.5 border border-hair rounded-full text-label uppercase tracking-[0.05em] text-muted shrink-0">
      {KIND_LABEL[kind] ?? kind}
    </span>
  );
}

function candidateKey(c: RaidCandidate): string {
  return `${c.source_kind ?? ''}:${c.source_id ?? ''}:${c.title}`;
}

function CandidateRow({
  candidate,
  onAccept,
  busy,
}: {
  candidate: RaidCandidate;
  onAccept: (c: RaidCandidate) => void;
  busy: boolean;
}) {
  return (
    <div className="px-4 py-3 border-b border-hair last:border-0 flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <KindTag kind={candidate.kind} />
          <span className="text-lead font-medium text-heading">{candidate.title}</span>
        </div>
        <p className="mt-1 text-body text-muted">{candidate.description}</p>
        <div className="mt-1 flex items-center gap-3 flex-wrap text-label font-mono uppercase text-muted">
          {/* "report", matching the Memory panel and the API's own wording:
              one occurrence is one field report naming this cause for one
              activity, not one audit row. See server/raid.py:delay_evidence. */}
          {candidate.occurrences !== null && (
            <span>
              {candidate.occurrences} report
              {candidate.occurrences === 1 ? '' : 's'}
            </span>
          )}
          {candidate.days_lost !== null && <span>{candidate.days_lost}d lost</span>}
          {candidate.linked_activity_ids.map((id) => (
            <span key={id}>{id}</span>
          ))}
        </div>
        {/* The API's own words about what this is. Not paraphrased here: it is
            the thing that stops a proposal reading as a finding. */}
        {candidate.source_note && (
          <p className="mt-1 text-label text-muted italic">{candidate.source_note}</p>
        )}
      </div>
      <Button
        variant="primary"
        onClick={() => onAccept(candidate)}
        disabled={busy}
      >
        Accept into register
      </Button>
    </div>
  );
}

function RegisterRow({
  item,
  onClose,
  busy,
}: {
  item: RaidItem;
  onClose: (item: RaidItem) => void;
  busy: boolean;
}) {
  const closed = item.status === 'closed';
  return (
    <div className="px-4 py-3 border-b border-hair last:border-0 flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <KindTag kind={item.kind} />
          <span className="text-lead font-medium text-heading">{item.title}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-label uppercase tracking-[0.05em] ${
              closed
                ? 'border border-hair text-muted'
                : 'border border-accent text-accent'
            }`}
          >
            {item.status}
          </span>
        </div>
        {item.description && (
          <p className="mt-1 text-body text-muted">{item.description}</p>
        )}
        <div className="mt-1 flex items-center gap-3 flex-wrap text-label font-mono uppercase text-muted">
          {item.owner && <span>owner {item.owner}</span>}
          {item.impact_days !== null && <span>{item.impact_days}d impact</span>}
          {item.probability !== null && (
            <span>p {(item.probability * 100).toFixed(0)}%</span>
          )}
          {/* Computed server-side, never in the browser. */}
          {item.exposure !== null && <span>exposure {item.exposure}d</span>}
          {item.linked_activity_ids.map((id) => (
            <span key={id}>{id}</span>
          ))}
        </div>
      </div>
      {!closed && (
        <Button variant="secondary" onClick={() => onClose(item)} disabled={busy}>
          Close
        </Button>
      )}
    </div>
  );
}

export default function Raid() {
  usePageHeader(
    'Exposure register',
    'Risks, issues, actions and decisions this project has accepted.',
    '/raid'
  );

  const qc = useQueryClient();
  const [acting, setActing] = useState<string | null>(null);

  const register = useQuery({ queryKey: ['raid'], queryFn: () => api.getRaid() });
  const candidates = useQuery({
    queryKey: ['raidCandidates'],
    queryFn: () => api.getRaidCandidates(),
  });

  const accept = useMutation({
    mutationFn: (c: RaidCandidate) =>
      api.createRaidItem({
        kind: c.kind,
        title: c.title,
        description: c.description,
        category: c.category,
        linked_activity_ids: c.linked_activity_ids,
        // Only a risk is scored. `server/raid.py` refuses probability and
        // impact_days on an issue, an action or a decision rather than
        // dropping them silently — scoring something that already happened is
        // a category error, and every detected candidate is an `issue`. The
        // days the detector measured are already stated in its description.
        // Probability is never sent at all: the detector counts history, it
        // does not forecast, and a made-up probability makes a made-up
        // exposure.
        ...(c.kind === 'risk' && c.days_lost !== null
          ? { impact_days: c.days_lost }
          : {}),
        source_kind: c.source_kind,
        source_id: c.source_id,
        source_note: c.source_note,
      }),
    onSettled: () => {
      setActing(null);
      qc.invalidateQueries({ queryKey: ['raid'] });
      qc.invalidateQueries({ queryKey: ['raidCandidates'] });
    },
  });

  const close = useMutation({
    mutationFn: (item: RaidItem) =>
      api.updateRaidItem(item.id, {
        status: 'closed',
        date_closed: new Date().toISOString().slice(0, 10),
      }),
    onSettled: () => {
      setActing(null);
      qc.invalidateQueries({ queryKey: ['raid'] });
    },
  });

  const items = register.data ?? [];
  const proposals = candidates.data ?? [];
  // A candidate already accepted should not be offered again. The API flags
  // its own, and the title is the fallback for a register row created before
  // source ids were carried.
  const acceptedTitles = new Set(items.map((i) => i.title));
  const open = proposals.filter((c) => !c.committed && !acceptedTitles.has(c.title));

  return (
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-4">
      <Panel
        title="Detected candidates"
        badge={open.length}
        action={
          <span className="text-label font-mono uppercase text-muted">
            proposals · not in the register
          </span>
        }
      >
        <div className="px-4 py-2 flex items-start gap-2 text-body text-muted border-b border-hair">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Derived from the audit trail — recurring causes the system has
            already seen. Nothing here counts until you accept it, and
            accepting is the only way a row reaches the register.
          </span>
        </div>
        {candidates.isLoading ? (
          <SkeletonRows rows={3} />
        ) : candidates.error ? (
          <ErrorState error={candidates.error} mode="bare" className="px-4 py-4" />
        ) : open.length === 0 ? (
          <EmptyState icon={Check} title="Nothing outstanding">
            Every candidate the system has detected has been adjudicated.
          </EmptyState>
        ) : (
          open.map((c) => (
            <CandidateRow
              key={candidateKey(c)}
              candidate={c}
              busy={acting === candidateKey(c)}
              onAccept={(cand) => {
                setActing(candidateKey(cand));
                accept.mutate(cand);
              }}
            />
          ))
        )}
        {accept.error && (
          <ErrorState error={accept.error} mode="bare" className="px-4 py-3" />
        )}
      </Panel>

      <Panel title="Register" badge={items.length}>
        {register.isLoading ? (
          <SkeletonRows rows={3} />
        ) : register.error ? (
          <ErrorState error={register.error} mode="bare" className="px-4 py-4" />
        ) : items.length === 0 ? (
          <EmptyState icon={Clock} title="The register is empty">
            Accept a candidate above. Nothing is added automatically — that is
            the design, not a gap.
          </EmptyState>
        ) : (
          items.map((item) => (
            <RegisterRow
              key={item.id}
              item={item}
              busy={acting === item.id}
              onClose={(i) => {
                setActing(i.id);
                close.mutate(i);
              }}
            />
          ))
        )}
        {close.error && (
          <ErrorState error={close.error} mode="bare" className="px-4 py-3" />
        )}
      </Panel>
    </div>
  );
}
