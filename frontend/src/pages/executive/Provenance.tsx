import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Info } from 'lucide-react';
import { api } from '../../lib/api';
import { ErrorState, Panel, SkeletonRows } from '../../components/ui';
import { usePageHeader } from '../../hooks/usePageHeader';
import type { CorpusCaveat } from '../../types';

/**
 * Where the data came from.
 *
 * Every other screen in this product asserts something about a project. This
 * one asserts something about the product: that the corpus behind it is real,
 * sourced, and checked — and says exactly where it is thin.
 *
 * The caveats are rendered from the API's own `caveats` array rather than
 * written into this component. That is deliberate: a limitation that lives in
 * the frontend can be quietly deleted by a frontend change, and the honest
 * numbers on this page are worth more than the flattering ones.
 */

function bytesToGb(n: number): string {
  return `${(n / 1_000_000_000).toFixed(2)} GB`;
}

function labelise(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function caveatText(c: CorpusCaveat): string {
  return c.statement ?? c.text ?? c.detail ?? c.id;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-hair bg-raised rounded-lg p-5 flex flex-col gap-1">
      <span className="font-mono text-label uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="text-h1 font-semibold leading-none text-fg tabular-nums">
        {value}
      </span>
    </div>
  );
}

export default function ExecutiveProvenance() {
  usePageHeader(
    'Data provenance',
    'What the corpus behind these numbers actually contains.',
    '/executive/provenance'
  );

  const corpus = useQuery({
    queryKey: ['evidence-corpus'],
    queryFn: api.getEvidenceCorpus,
  });

  if (corpus.error) return <ErrorState error={corpus.error} />;
  if (corpus.isLoading || !corpus.data) {
    return (
      <div className="max-w-[1280px] w-full mx-auto">
        <SkeletonRows rows={8} />
      </div>
    );
  }

  const d = corpus.data;
  const sources = Object.entries(d.artifacts.by_source).sort((a, b) => b[1] - a[1]);
  const records = Object.entries(d.records).sort((a, b) => b[1] - a[1]);

  return (
    <div className="max-w-[1280px] w-full mx-auto flex flex-col gap-4">
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat label="Verified artifacts" value={d.artifacts.count} />
        <Stat label="Corpus size" value={bytesToGb(d.artifacts.bytes)} />
        <Stat label="Validation checks" value={d.validation.checks_run.toLocaleString()} />
        <Stat
          label="Errors / warnings"
          value={`${d.validation.errors} / ${d.validation.warnings}`}
        />
      </section>

      {d.validation.passed && (
        <div className="border border-hair bg-raised rounded-lg px-4 py-3 flex items-start gap-2">
          <CheckCircle2 size={14} className="text-ok mt-0.5 shrink-0" />
          <p className="text-body text-muted leading-relaxed">
            <span className="text-fg">
              All {d.validation.checks_run.toLocaleString()} validation checks
              passed
            </span>{' '}
            with zero errors and zero warnings. Every derived record is marked{' '}
            <span className="font-mono text-label">data_origin={d.data_origin}</span>{' '}
            and every original carries an adjacent provenance sidecar.
          </p>
        </div>
      )}

      {/* The caveats come from the API. They are the reason this page is
          credible rather than promotional. */}
      {d.caveats?.length > 0 && (
        <Panel title="What this corpus does not establish">
          <div className="flex flex-col">
            {d.caveats.map((c) => (
              <p
                key={c.id}
                className="px-4 py-3 border-b border-hair last:border-0 text-body text-muted leading-relaxed flex items-start gap-2"
              >
                <Info size={12} className="text-warn mt-1 shrink-0" />
                <span>{caveatText(c)}</span>
              </p>
            ))}
          </div>
        </Panel>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Records by dataset">
          <div className="flex flex-col">
            {records.map(([k, v]) => (
              <div
                key={k}
                className="px-4 py-2.5 border-b border-hair last:border-0 flex items-center justify-between gap-4"
              >
                <span className="text-body text-fg min-w-0">{labelise(k)}</span>
                <span className="font-mono text-body text-muted tabular-nums shrink-0">
                  {v.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Artifacts by source">
          <div className="flex flex-col">
            {sources.map(([k, v]) => (
              <div
                key={k}
                className="px-4 py-2.5 border-b border-hair last:border-0 flex items-center justify-between gap-4"
              >
                <span className="font-mono text-body text-fg min-w-0">{k}</span>
                <span className="font-mono text-body text-muted tabular-nums shrink-0">
                  {v}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <Panel title="OCR coverage">
        <p className="px-4 py-3 text-body text-muted leading-relaxed">
          {d.ocr.pages} pages read, {d.ocr.lines.toLocaleString()} lines
          extracted, {d.ocr.activity_mentions} activity mentions found.{' '}
          <span className={d.ocr.verified ? 'text-ok' : 'text-warn'}>
            {d.ocr.verified
              ? 'Matches verified.'
              : 'These matches are unverified and are labelled as such.'}
          </span>
        </p>
      </Panel>
    </div>
  );
}
