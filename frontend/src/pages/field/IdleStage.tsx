import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Mic,
  ShieldCheck,
  MessageSquare,
  Wrench,
  Truck,
  AlertTriangle,
  ClipboardCheck,
  Camera,
  Paperclip,
  X,
  ArrowRight,
  Send,
  Loader2,
  Check,
} from 'lucide-react';
import { api } from '../../lib/api';
import { NeedsYourResponse, RecentUpdates } from '../../components/FieldContextBlocks';
import { Discipline } from '../../types';
import { DISCIPLINES } from '../../config';
import { useTranslation } from '../../lib/i18n';

export function IdleStage({
  fallback,
  onStart,
  composerValue,
  onComposerChange,
  onSend,
  onOpenSubmissionFlow,
  submitting = false,
  attachments = [],
  onAddAttachment,
  onRemoveAttachment,
  serverError,
  contextBlock,
  discipline = 'piping',
  isOffline = false,
  offlineMessage,
  selectedPreset = null,
  onSelectPreset,
}: {
  fallback: React.ReactNode;
  onStart: () => void;
  composerValue: string;
  onComposerChange: (v: string) => void;
  onSend: () => void;
  onOpenSubmissionFlow?: () => void;
  submitting?: boolean;
  attachments?: string[];
  onAddAttachment?: (name: string) => void;
  onRemoveAttachment?: (index: number) => void;
  serverError: React.ReactNode;
  contextBlock: React.ReactNode;
  discipline?: Discipline;
  isOffline?: boolean;
  offlineMessage?: string | null;
  selectedPreset?: 'progress' | 'material' | 'delay' | 'inspection' | null;
  onSelectPreset?: (preset: 'progress' | 'material' | 'delay' | 'inspection' | null) => void;
}) {
  const { t } = useTranslation();
  const { data: clarifications } = useQuery({
    queryKey: ['clarifications', 'unanswered'],
    queryFn: () => api.getClarifications(true),
  });
  const unanswered = clarifications?.length ?? 2;
  const latestClarification = clarifications?.[0]?.question ?? 'Confirm whether hydrotest P-101 was completed on 4 Sep.';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [presetPlaceholder, setPresetPlaceholder] = useState<string | null>(null);

  const disciplineLabel = DISCIPLINES.find((d) => d.value === discipline)?.label ?? 'Piping';

  const handleApplyPreset = (type: 'progress' | 'material' | 'delay' | 'inspection') => {
    let tag = '';
    let placeholder = '';
    switch (type) {
      case 'progress':
        tag = `[${disciplineLabel} · Work Progress] `;
        placeholder = 'Describe work completed, line/spool number, quantity installed, and crew size…';
        break;
      case 'material':
        tag = `[${disciplineLabel} · Material Delivery] `;
        placeholder = 'Describe material received, PO/challan reference, quantity, and storage laydown…';
        break;
      case 'delay':
        tag = `[${disciplineLabel} · Delay / Constraint] `;
        placeholder = 'Describe delay cause, impacted activity, idle equipment, and expected downtime…';
        break;
      case 'inspection':
        tag = `[${disciplineLabel} · Inspection] `;
        placeholder = 'Describe inspection type (hydrotest, NDT, weld clearance), item tag, and pass/hold status…';
        break;
    }

    setPresetPlaceholder(placeholder);
    onSelectPreset?.(type);

    if (onComposerChange) {
      if (!composerValue || composerValue.startsWith('[')) {
        onComposerChange(tag);
      } else if (!composerValue.includes(tag)) {
        onComposerChange(`${tag}${composerValue}`);
      }
    }
    textareaRef.current?.focus();
  };

  const handlePhotoClick = () => {
    if (photoInputRef.current) {
      photoInputRef.current.click();
    }
  };

  const handleAttachClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>, fallbackName: string) => {
    const file = e.target.files?.[0];
    const name = file ? file.name : fallbackName;
    if (onAddAttachment) {
      onAddAttachment(name);
    }
    e.target.value = '';
  };

  const defaultPlaceholder =
    presetPlaceholder ??
    t(
      'composer_placeholder',
      "Tell NAVIS what happened on site... or type your update (e.g. 'Poured 40 m3 on the raft at Pad-04' or 'Delayed by rain')"
    );

  return (
    <div className="flex w-full flex-col gap-5 lg:gap-6">
      {/* Top Heading: Clean, tightened, no redundant location badge */}
      <div className="flex flex-col">
        <h1 className="text-h2 font-semibold text-heading tracking-[-0.03em] leading-tight lg:text-h1">
          {t('home_title', 'What happened on site today?')}
        </h1>
        <p className="mt-2 text-body leading-6 text-muted">
          {t('home_subtitle', 'Record work progress, material arrivals, site constraints, and inspections.')}
        </p>
      </div>

      {offlineMessage && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
          <Check size={16} className="shrink-0" />
          <span>{offlineMessage}</span>
        </div>
      )}

      {isOffline && !offlineMessage && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-medium">
          <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
          <span>
            {t('offline_desc', 'Offline Mode active. Updates will be cached safely on device and synced when signal returns.')}
          </span>
        </div>
      )}

      {fallback}

      {/* ── Integrated Composer (Voice & Text Equal) ── */}
      <div className="rounded-2xl p-4 bg-raised shadow-[0_8px_28px_rgba(15,23,42,0.08)] ring-1 ring-hair flex flex-col gap-3">
        {/* Multi-line Composer Textarea */}
        <textarea
          ref={textareaRef}
          value={composerValue}
          onChange={(e) => onComposerChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && composerValue.trim() && !submitting) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={4}
          placeholder={defaultPlaceholder}
          aria-label="What happened on site or type your update"
          className="w-full rounded-xl border border-hair bg-surface p-3.5 text-lead text-heading placeholder:text-muted transition-colors resize-none leading-6"
        />

        {/* Attachment preview chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {attachments.map((file, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface border border-hair text-xs font-mono text-heading shadow-xs"
              >
                {file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.png') ? (
                  <Camera size={12} className="text-accent shrink-0" />
                ) : (
                  <Paperclip size={12} className="text-accent shrink-0" />
                )}
                <span className="truncate max-w-[180px]">{file}</span>
                {onRemoveAttachment && (
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(idx)}
                    className="text-muted hover:text-danger ml-0.5 cursor-pointer"
                    title="Remove attachment"
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Hidden inputs for actual files or mock defaults */}
        <input
          type="file"
          ref={photoInputRef}
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileChosen(e, 'weld_joint_p104.jpg')}
        />
        <input
          type="file"
          ref={fileInputRef}
          accept=".pdf,.doc,.docx,.csv,.xlsx,.txt"
          className="hidden"
          onChange={(e) => handleFileChosen(e, 'hydrotest_chart.pdf')}
        />

        {/* Integrated Composer Toolbar */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-hair/60">
          <div className="contents">
            {/* Sized 150-180px Voice Pill Button */}
            {!fallback && (
              <button
                type="button"
                onClick={onStart}
                title="Record Voice · Tap & Speak"
                className="min-h-11 rounded-xl bg-heading text-raised text-label font-semibold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer"
              >
                <Mic size={17} />
                <span>{t('record_voice', 'Voice')}</span>
                <span className="sr-only">Tap &amp; Speak</span>
                <span className="sr-only">Describe what happened on site</span>
              </button>
            )}

            {/* Photo Attachment Button */}
            <button
              type="button"
              onClick={handlePhotoClick}
              className="min-h-11 rounded-xl bg-secondary hover:bg-selected text-heading text-label font-semibold transition-colors flex flex-col items-center justify-center gap-1 cursor-pointer"
              title="Add photo"
            >
              <Camera size={14} className="text-muted" />
              <span>{t('photo', 'Photo')}</span>
            </button>

            {/* File Attachment Button */}
            <button
              type="button"
              onClick={handleAttachClick}
              className="min-h-11 rounded-xl bg-secondary hover:bg-selected text-heading text-label font-semibold transition-colors flex flex-col items-center justify-center gap-1 cursor-pointer"
              title="Attach document or test record"
            >
              <Paperclip size={14} className="text-muted" />
              <span>{t('attach', 'Attach')}</span>
            </button>
          </div>

          {/* Obvious Send / Submit Button (no confusing robot icon) */}
          <button
            type="button"
            disabled={!composerValue.trim() || submitting}
            onClick={() => {
              if (onOpenSubmissionFlow) {
                onOpenSubmissionFlow();
              } else {
                onSend();
              }
            }}
            className="col-span-3 min-h-12 rounded-xl bg-accent hover:bg-accent-hover text-accent-fg text-body font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Sending…</span>
              </>
            ) : (
              <>
                <span>{t('send_update', 'Send Update')}</span>
                <Send size={13} />
              </>
            )}
          </button>
        </div>
      </div>

      {serverError}

      {/* ── Quick Presets (Prompt templates guiding the composer) ── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-label text-muted px-1">
          <span>{t('quick_presets', 'Quick Presets')}</span>
          <span>{t('prefills_format', 'Prefills scope & format')}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
          <button
            type="button"
            onClick={() => handleApplyPreset('progress')}
            className="min-h-[64px] p-3 rounded-xl bg-raised ring-1 ring-hair hover:bg-selected transition-colors flex items-center gap-2 text-left group cursor-pointer"
          >
            <div className="h-7 w-7 rounded-lg bg-surface border border-hair text-heading flex items-center justify-center shrink-0">
              <Wrench size={13} />
            </div>
            <div className="min-w-0">
              <span className="text-label font-semibold text-heading block leading-4">{t('preset_progress', 'Work Progress')}</span>
              <span className="text-label text-muted block leading-4">{t('preset_progress_sub', 'Erection & fit-up')}</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleApplyPreset('material')}
            className="min-h-[64px] p-3 rounded-xl bg-raised ring-1 ring-hair hover:bg-selected transition-colors flex items-center gap-2 text-left group cursor-pointer"
          >
            <div className="h-7 w-7 rounded-lg bg-surface border border-hair text-heading flex items-center justify-center shrink-0">
              <Truck size={13} />
            </div>
            <div className="min-w-0">
              <span className="text-label font-semibold text-heading block leading-4">{t('preset_material', 'Material Delivery')}</span>
              <span className="text-label text-muted block leading-4">{t('preset_material_sub', 'Spools & valves')}</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleApplyPreset('delay')}
            className="min-h-[64px] p-3 rounded-xl bg-raised ring-1 ring-hair hover:bg-selected transition-colors flex items-center gap-2 text-left group cursor-pointer"
          >
            <div className="h-7 w-7 rounded-lg bg-surface border border-hair text-heading flex items-center justify-center shrink-0">
              <AlertTriangle size={13} />
            </div>
            <div className="min-w-0">
              <span className="text-label font-semibold text-heading block leading-4">{t('preset_delay', 'Delay / Constraint')}</span>
              <span className="text-label text-muted block leading-4">{t('preset_delay_sub', 'Weather & access')}</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleApplyPreset('inspection')}
            className="min-h-[64px] p-3 rounded-xl bg-raised ring-1 ring-hair hover:bg-selected transition-colors flex items-center gap-2 text-left group cursor-pointer"
          >
            <div className="h-7 w-7 rounded-lg bg-surface border border-hair text-heading flex items-center justify-center shrink-0">
              <ClipboardCheck size={13} />
            </div>
            <div className="min-w-0">
              <span className="text-label font-semibold text-heading block leading-4">{t('preset_inspection', 'Inspection')}</span>
              <span className="text-label text-muted block leading-4">{t('preset_inspection_sub', 'Hydrotest & NDT')}</span>
            </div>
          </button>
        </div>
      </div>

      {/* ── Rephrased Requests from Planning Card ── */}
      <NeedsYourResponse />

      {/* Quick-Editable Current Context (Workfront, Discipline, Shift) */}
      {contextBlock}

      {/* Recent Updates */}
      <RecentUpdates />

      {/* Clean Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-hair text-[11px] text-muted">
        <p className="flex items-center gap-1.5">
          <ShieldCheck size={13} className="text-fg shrink-0" />
          <span>Every submitted update requires Planning Engineer review before schedule changes.</span>
        </p>

        <div className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-ok">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          Field Update Assistant · Online
        </div>
      </div>
    </div>
  );
}
