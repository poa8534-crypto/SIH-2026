import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LANGUAGES, PROJECT, SUPERVISOR } from '../config';
import { useDevice } from '../hooks/useDevice';
import { useSpeech } from '../hooks/useSpeech';

/**
 * Who is reporting, and on what.
 *
 * Identity comes from `src/config.ts` rather than being retyped here, so the
 * Profile screen, the shell header and the agent's request context cannot
 * disagree. There is no crew, no worker count, and nothing about offline
 * storage or sync — none of that exists in this system.
 */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5 border-b border-hair last:border-0 flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
        {label}
      </span>
      <span className="text-[12px] text-fg">{children}</span>
    </div>
  );
}

export default function FieldProfile() {
  const navigate = useNavigate();
  const { setOverride } = useDevice();
  const speech = useSpeech();

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
      {/* Identity */}
      <div className="flex items-center gap-3">
        <span className="w-12 h-12 border border-hair bg-raised text-fg flex items-center justify-center font-mono text-[14px]">
          {SUPERVISOR.initials}
        </span>
        <div>
          <div className="text-[16px] text-fg">{SUPERVISOR.name}</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
            {SUPERVISOR.role}
          </div>
        </div>
      </div>

      <section className="border border-hair bg-raised">
        <div className="px-3 py-2 border-b border-hair font-mono text-[9px] uppercase tracking-wider text-muted">
          Current assignment
        </div>
        <Row label="Project">{PROJECT.name}</Row>
        <Row label="Project code">
          <span className="font-mono">{PROJECT.code}</span>
        </Row>
        <Row label="Work front">{PROJECT.location}</Row>
        <Row label="Data date">
          <span className="font-mono">{PROJECT.dataDate}</span>
        </Row>
      </section>

      <section className="border border-hair bg-raised">
        <div className="px-3 py-2 border-b border-hair font-mono text-[9px] uppercase tracking-wider text-muted">
          Language &amp; input
        </div>
        <div className="px-3 py-2.5 flex flex-col gap-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
            Preferred language for voice
          </span>
          <div className="flex gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => speech.setLang(l.code)}
                className={`flex-1 border px-2 py-2 text-[11px] ${
                  speech.lang === l.code
                    ? 'border-accent text-accent bg-selected'
                    : 'border-hair text-muted hover:text-fg'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted leading-relaxed">
            Speech recognition runs in the browser. Nothing is recorded or sent
            to a speech service.
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <button
          onClick={() => setOverride('desktop')}
          className="w-full border border-hair text-fg font-mono text-[10px] uppercase tracking-wider py-3 hover:border-strong"
        >
          Return to role selection
        </button>
        <button
          onClick={() => navigate('/field')}
          className="w-full border border-hair text-muted font-mono text-[10px] uppercase tracking-wider py-3 hover:text-fg hover:border-strong"
        >
          Back to home
        </button>
      </section>
    </div>
  );
}
