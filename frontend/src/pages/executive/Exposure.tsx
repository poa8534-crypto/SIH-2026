import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { api } from '../../lib/api';
import { EmptyState, ErrorState, Panel, SkeletonRows } from '../../components/ui';
import { usePageHeader } from '../../hooks/usePageHeader';

/**
 * What is going to hurt us, and who is doing something about it.
 *
 * Two registers, deliberately distinct:
 *
 *   RAID   — risks, issues, actions and decisions a Project Manager has
 *            accepted into the register. Governance artefacts are never
 *            auto-committed (ROADMAP §6), so an empty register means nobody
 *            has adjudicated one yet, not that nothing was detected.
 *
 *   Source — two field sources disagreeing about the same field on the same
 *   conflicts activity. These are detections, not defects: the system found a
 *            contradiction that a spreadsheet would have silently overwritten.
 *
 * Read-only, per ROADMAP §3.3. An executive escalates and acknowledges; they
 * do not close a risk, because that would bypass the accountable owner.
 */

const KIND_TONE: Record<string, string> = {
  risk: 'text-warn',
  issue: 'text-danger',
  action: 'text-accent',
  decision: 'text-muted',
};

export default function ExecutiveExposure() {
  usePageHeader(
    'Exposure',
    'Top risks, open issues and unresolved source conflicts.',
    '/executive/exposure'
  );

  const raid = useQuery({ queryKey: ['raid'], queryFn: () => api.getRaid() });
  const conflicts = useQuery({
    queryKey: ['conflicts'],
    queryFn: () => api.getConflicts(50),
  });

  const items = raid.data ?? [];
  const ranked = [...items].sort((a, b) => (b.exposure ?? 0) - (a.exposure ?? 0));

  return (
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-4">
      <Panel title="RAID register" badge={items.length}>
        {raid.isLoading ? (
          <SkeletonRows rows={5} />
        ) : raid.error ? (
          <ErrorState error={raid.error} mode="bare" className="px-4 py-4" />
        ) : ranked.length === 0 ? (
          /* An empty register is a real state with a real meaning, and saying
             so is more useful than an empty box. */
          <EmptyState>
            No risks, issues, actions or decisions have been accepted into the
            register yet. Candidates detected from field reports stay proposals
            until a Project Manager adjudicates them.
          </EmptyState>
        ) : (
          <div className="flex flex-col">
            {ranked.map((r) => (
              <div
                key={r.id}
                className="px-4 py-3 border-b border-hair last:border-0 flex items-start gap-3"
              >
                <span
                  className={`font-mono text-label uppercase w-16 shrink-0 ${
                    KIND_TONE[r.kind] ?? 'text-muted'
                  }`}
                >
                  {r.kind}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-body text-fg">{r.title}</span>
                  {r.owner && (
                    <span className="block font-mono text-label text-muted">
                      {r.owner}
                      {r.due_date ? ` · due ${r.due_date}` : ''}
                    </span>
                  )}
                </span>
                {typeof r.exposure === 'number' && (
                  <span className="font-mono text-body text-fg tabular-nums shrink-0">
                    {r.exposure.toFixed(1)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Source conflicts" badge={conflicts.data?.length}>
        {conflicts.isLoading ? (
          <SkeletonRows rows={5} />
        ) : conflicts.error ? (
          <ErrorState error={conflicts.error} mode="bare" className="px-4 py-4" />
        ) : (conflicts.data?.length ?? 0) === 0 ? (
          <EmptyState>No source disagreements outstanding.</EmptyState>
        ) : (
          <>
            <p className="px-4 py-3 text-label text-muted leading-relaxed border-b border-hair flex items-start gap-2">
              <ShieldAlert size={12} className="text-warn mt-0.5 shrink-0" />
              <span>
                Each row is one activity where two sources reported different
                values for the same field. These are detections — a spreadsheet
                would have kept whichever arrived last and shown no conflict at
                all.
              </span>
            </p>
            <div className="flex flex-col">
              {(conflicts.data ?? []).slice(0, 25).map((c, i) => (
                <div
                  key={`${c.activity_id}-${c.field}-${i}`}
                  className="px-4 py-3 border-b border-hair last:border-0 flex items-start gap-3"
                >
                  <span className="font-mono text-label text-muted w-32 shrink-0">
                    {c.activity_id}
                  </span>
                  <span className="flex-1 min-w-0 text-body text-fg">
                    {c.field}
                  </span>
                  <span className="font-mono text-label text-muted shrink-0 tabular-nums">
                    {String(c.stored_value ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
