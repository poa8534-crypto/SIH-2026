import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LANGUAGES, PROJECT, SUPERVISOR } from '../config';
import { useQuery } from '@tanstack/react-query';
import { api, errorDetail } from '../lib/api';
import { useSession } from '../hooks/useSession';
import { useSpeech } from '../hooks/useSpeech';
import { Button, PanelHeader } from '../components/ui';

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
    <div className="px-4 py-4 border-b border-hair last:border-0 flex flex-col gap-2">
      <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
        {label}
      </span>
      <span className="text-lead leading-6 text-fg">{children}</span>
    </div>
  );
}

export default function FieldProfile() {
  const navigate = useNavigate();
  const { signOut } = useSession();
  const speech = useSpeech();

  // Project name and data date are the server's, off the same query key the
  // shells use. They were previously constants in config, which is how this
  // screen could have shown a data date the schedule had already moved past.
  const { data: schedule, isLoading, error } = useQuery({
    queryKey: ['schedule', 'header'],
    queryFn: () => api.getSchedule(undefined, false),
    retry: false,
  });

  const fromServer = (value: string | undefined) =>
    error ? 'Unavailable' : isLoading ? '…' : (value ?? '—');

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
      {/* The role this surface serves and the work front it reports on.
          There is no authentication and no profile endpoint in this system,
          so there is no person to name here and none is invented. */}
      <section className="border border-hair bg-raised rounded-lg p-4 flex flex-col gap-2">
        <div
          className={`text-h3 font-semibold ${
            error ? 'text-danger' : 'text-heading'
          }`}
          title={error ? errorDetail(error) : undefined}
        >
          {fromServer(schedule?.project)}
        </div>
        <div className="text-lead text-muted">{SUPERVISOR.role}</div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-selected text-accent px-3 py-1 text-label font-medium">
            {PROJECT.location}
          </span>
        </div>
      </section>

      <section className="border border-hair bg-raised rounded-lg overflow-hidden">
        <PanelHeader title="Current assignment" />
        <Row label="Project">{fromServer(schedule?.project)}</Row>
        <Row label="Project code">
          <span className="font-mono">{PROJECT.code}</span>
        </Row>
        <Row label="Work front">{PROJECT.location}</Row>
        <Row label="Data date">
          <span className="font-mono">{fromServer(schedule?.data_date)}</span>
        </Row>
        <Row label="Details">Shift: {SUPERVISOR.shift}</Row>
      </section>

      <section className="border border-hair bg-raised rounded-lg overflow-hidden">
        <PanelHeader title={<>Language &amp; input</>} />
        <div className="px-4 py-4 flex flex-col gap-3">
          <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
            Preferred language for voice
          </span>
          <div className="flex gap-2">
            {LANGUAGES.map((l) => (
              <Button
                key={l.code}
                variant="secondary"
                shape="pill"
                active={speech.lang === l.code}
                className="flex-1"
                onClick={() => speech.setLang(l.code)}
              >
                {l.label}
              </Button>
            ))}
          </div>
          <span className="text-label text-muted leading-relaxed">
            Speech recognition runs in the browser. Nothing is recorded or sent
            to a speech service.
          </span>
          <span className="text-label font-medium uppercase tracking-[0.05em] text-muted">
            Preferred languages: {LANGUAGES.map((l) => l.label).join(', ')}
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        {/* This said "Return to role selection" and called setOverride
            ('desktop'), which only swapped the shell — it never cleared the
            role. For the Field Supervisor the router keeps the mobile lane
            regardless, so the button did nothing at all. Now it does what it
            says: clears `navis.role` and shows the picker. */}
        <Button variant="primary" block onClick={signOut}>
          Return to role selection
        </Button>
        <Button variant="secondary" block onClick={() => navigate('/field')}>
          Back to home
        </Button>
      </section>
    </div>
  );
}
