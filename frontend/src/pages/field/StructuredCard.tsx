import React from 'react';
import { AlertCircle, Cpu, Pencil } from 'lucide-react';
import { SlotState } from '../../types';
import { Button, PanelHeader } from '../../components/ui';
import { CardRow, STATUS_LABEL, longDate } from './shared';
import { useTranslation } from '../../lib/i18n';

/**
 * The agent's proposal, as a set of labelled slots the supervisor can correct.
 *
 * Every row is its own tap target; a correction goes back through the agent as
 * another turn rather than editing a schedule field directly.
 */
export function StructuredCard({
  slots,
  confidence,
  outcome,
  onEdit,
  onSubmit,
  onCancel,
  submitting,
}: {
  slots: SlotState;
  confidence: number;
  outcome: string | null;
  onEdit: (key: CardRow['key']) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const { lang, t, tVal } = useTranslation();

  // Whatever MatchingEngine returned, never a hardcoded id. The two
  // no-result cases are named differently because they mean different things:
  // the matcher found nothing, versus it has not run to completion.
  const activity = slots.activity_id
    ? `${slots.activity_id}${
        slots.activity_description ? ` · ${slots.activity_description}` : ''
      }`
    : outcome
      ? (lang === 'en-IN' ? 'No matching activity — flagged for Planning Engineer' : t('no_match_flagged', 'No matching activity — flagged for Planning Engineer'))
      : (lang === 'en-IN' ? 'Awaiting Planning Engineer confirmation' : t('awaiting_planner', 'Awaiting Planning Engineer confirmation'));

  const quantity =
    slots.quantity !== null
      ? `${slots.quantity}${
          slots.planned_quantity !== null ? ` of ${slots.planned_quantity}` : ''
        }${slots.uom ? ` ${slots.uom}` : ''}`
      : t('not_stated', 'Not stated');

  const displayLabels: Record<string, string> = {
    activity: t('chip_activity', 'ACTIVITY'),
    status: t('chip_status', 'STATUS'),
    date: t('chip_date', 'DATE'),
    quantity: t('chip_quantity', 'QUANTITY'),
  };

  const rows: CardRow[] = [
    // Editable as the supervisor's own interpretation of what happened. The
    // validated schedule id underneath is not his to change, and there is no
    // activity picker anywhere in this screen.
    { key: 'activity', label: 'ACTIVITY', value: activity },
    { key: 'status', label: 'STATUS', value: STATUS_LABEL[slots.status ?? ''] ? tVal(STATUS_LABEL[slots.status ?? '']) : '—' },
    { key: 'date', label: 'DATE', value: longDate(slots.date) },
    { key: 'quantity', label: 'QUANTITY', value: quantity },
  ];

  return (
    <section className="border border-hair bg-raised rounded-lg overflow-hidden">
      <PanelHeader
        title={
          <>
            <Cpu size={18} className="text-accent shrink-0" />
            {lang === 'en-IN' ? (
              'STRUCTURED UPDATE'
            ) : (
              <>
                <span className="sr-only">STRUCTURED UPDATE</span>
                <span>{t('structured_update', 'STRUCTURED UPDATE')}</span>
              </>
            )}
          </>
        }
      />

      {/* One labelled row per extracted slot. Each is its own tap target for
          a correction, which goes back through the agent as another turn. */}
      <div className="flex flex-col">
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex justify-between items-start gap-4 px-4 py-4 border-b border-hair"
          >
            <div className="flex flex-col gap-2 min-w-0">
              <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
                {lang === 'en-IN' ? (
                  r.label
                ) : (
                  <>
                    <span className="sr-only">{r.label}</span>
                    <span>{displayLabels[r.key] || r.label}</span>
                  </>
                )}
              </span>
              <span className="text-lead leading-6 text-fg break-words">{r.value}</span>
            </div>
            <Button
              variant="icon"
              tone="accent"
              onClick={() => onEdit(r.key)}
              aria-label={`Correct ${r.label.toLowerCase()}`}
            >
              <Pencil size={16} />
            </Button>
          </div>
        ))}

        {slots.quantity_over_planned && (
          <div className="px-4 py-4 border-b border-hair flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-warn" />
            <span className="text-body leading-5 text-warn">
              {t('qty_over_planned_warn', 'Completed exceeds the planned total — the Planning Engineer will check this')}
            </span>
          </div>
        )}

        {/* No pencil: confidence is computed by the matching engine and is not
            the supervisor's to change. */}
        <div className="flex justify-between items-start gap-4 px-4 py-4">
          <div className="flex flex-col gap-2">
            <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
              {lang === 'en-IN' ? (
                'Confidence'
              ) : (
                <>
                  <span className="sr-only">Confidence</span>
                  <span>{t('confidence', 'Confidence')}</span>
                </>
              )}
            </span>
            <span className="text-lead leading-6 font-mono text-accent">
              {(confidence * 100).toFixed(1)}%
            </span>
          </div>
          <span className="text-label font-medium uppercase tracking-[0.05em] text-muted mt-1 shrink-0">
            {outcome === 'AUTO_LINK' ? t('strong_match', 'strong match') : t('planner_confirms', 'planner confirms')}
          </span>
        </div>
      </div>

      <div className="px-4 py-5 border-t border-hair bg-surface flex flex-col gap-3">
        <Button variant="primary" block onClick={onSubmit} disabled={submitting}>
          {submitting ? (
            t('submitting', 'Submitting…')
          ) : lang === 'en-IN' ? (
            'CONFIRM & SUBMIT'
          ) : (
            <>
              <span className="sr-only">CONFIRM & SUBMIT</span>
              <span>{t('confirm_submit', 'CONFIRM & SUBMIT')}</span>
            </>
          )}
        </Button>
        <Button variant="ghost" block onClick={onCancel} disabled={submitting}>
          {lang === 'en-IN' ? (
            'Cancel'
          ) : (
            <>
              <span className="sr-only">Cancel</span>
              <span>{t('cancel', 'Cancel')}</span>
            </>
          )}
        </Button>
        <p className="text-label text-muted leading-relaxed text-center">
          {t('submit_disclaimer', 'Submitting confirms the report information only. The Planning Engineer must review it before any project data changes.')}
        </p>
      </div>
    </section>
  );
}
