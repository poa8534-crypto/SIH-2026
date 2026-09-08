import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileText, PlusCircle, ShieldCheck } from 'lucide-react';
import { NeedsYourResponse, RecentUpdates } from '../../components/FieldContextBlocks';
import type { AgentTurnResponse } from '../../types';
import { useTranslation } from '../../lib/i18n';

/**
 * Structured post-submit state:
 * Gives a structured summary of what NAVIS understood, clear review status,
 * and next action buttons (Submit Another Update / View in My Updates).
 */
export function SubmittedStage({
  reference,
  turn,
  onReturn,
}: {
  reference: string | null;
  turn?: AgentTurnResponse | null;
  onReturn: () => void;
}) {
  const { lang, t } = useTranslation();
  const slots = turn?.slots;
  const trackingId = reference || (turn?.review_item_id ?? turn?.linked_event_id ?? 'FU-1042');

  const discipline = turn?.discipline_label || (slots?.discipline ? String(slots.discipline).toUpperCase() : 'Piping');
  const work = turn?.activity_description || slots?.activity_id || 'Spool erection & fit-up';
  const quantity = slots?.quantity !== null && slots?.quantity !== undefined
    ? `${slots.quantity} ${slots?.uom ?? 'units'}${slots?.planned_quantity ? ` / ${slots.planned_quantity} cumulative` : ''}`
    : 'Progress captured';
  const equipment = slots?.tags && slots.tags.length > 0
    ? slots.tags.join(', ')
    : 'Assigned Site Plant / Rig';
  const status = turn?.status_label || (slots?.status ? String(slots.status) : 'Completed today');

  return (
    <div className="w-full max-w-[780px] mx-auto flex flex-col gap-5 py-2">
      {/* Main Confirmation Card */}
      <div className="border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 rounded-2xl p-6 sm:p-7 shadow-xs flex flex-col gap-5 text-left">
        {/* Header with checkmark */}
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              {t('update_captured', '✓ UPDATE CAPTURED')}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-heading">
              {lang === 'en-IN' ? (
                'Update submitted'
              ) : (
                <>
                  <span className="sr-only">Update submitted</span>
                  <span>{t('update_submitted_title', 'Update submitted')}</span>
                </>
              )}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {t('sent_for_review', 'Sent for Planning Engineer review.')}
            </p>
            <p className="text-xs text-muted">
              {t('schedule_unchanged', 'The project schedule has not been changed.')}
            </p>
          </div>
        </div>

        {/* Structured Understanding Grid */}
        <div className="rounded-xl border border-hair bg-surface p-4 flex flex-col gap-3">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted pb-2 border-b border-hair/60 flex items-center justify-between">
            <span>{t('extraction_summary', 'NAVIS Extraction Summary')}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{t('verified', 'Verified')}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted block text-[10px] uppercase tracking-wider">{t('discipline', 'Discipline')}</span>
              <span className="font-semibold text-heading text-sm">{discipline}</span>
            </div>
            <div>
              <span className="text-muted block text-[10px] uppercase tracking-wider">{t('work_activity', 'Work / Activity')}</span>
              <span className="font-semibold text-heading text-sm">{work}</span>
            </div>
            <div>
              <span className="text-muted block text-[10px] uppercase tracking-wider">{t('chip_quantity', 'Quantity')}</span>
              <span className="font-semibold text-heading">{quantity}</span>
            </div>
            <div>
              <span className="text-muted block text-[10px] uppercase tracking-wider">{t('equipment_tag', 'Equipment / Tag')}</span>
              <span className="font-semibold text-heading">{equipment}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-muted block text-[10px] uppercase tracking-wider">{t('chip_status', 'Status')}</span>
              <span className="font-semibold text-heading">{status}</span>
            </div>
          </div>
        </div>

        {/* Reference & PM Review Badge */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-hair bg-raised text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-heading">
              {t('report_reference', 'Report reference')}: {trackingId}
            </span>
            <span>·</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-medium text-[11px]">
              {t('ready_for_review', 'Ready for PM Review')}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted">
            <ShieldCheck size={13} className="text-fg shrink-0" />
            <span>{t('schedule_unchanged_confirmed', 'Schedule unchanged until confirmed')}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onReturn}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-fg hover:opacity-90 active:opacity-95 text-surface font-semibold text-xs shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <PlusCircle size={15} />
            <span>{t('submit_another', 'Submit Another Update')}</span>
          </button>
          <Link
            to="/field/reports"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-hair bg-surface hover:bg-selected text-heading font-semibold text-xs transition-colors flex items-center justify-center gap-2 text-center"
          >
            <FileText size={15} />
            <span>{t('view_in_my_updates', 'View in My Updates')}</span>
          </Link>
          <button
            type="button"
            onClick={onReturn}
            className="text-xs text-muted hover:text-heading px-2 py-1"
          >
            {lang === 'en-IN' ? 'Return Home' : t('back_home', 'Return Home')}
          </button>
        </div>
      </div>

      <NeedsYourResponse />
      <RecentUpdates />
    </div>
  );
}

