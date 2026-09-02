import { HardHat, ClipboardCheck, LineChart, ArrowRight } from 'lucide-react';
import { ROLE_PROFILES, ROLES, type Role } from '../lib/role';

/**
 * Sign in by choosing who you are.
 *
 * This is a role picker, not a credential check. It says so on the screen,
 * because a login box that accepts anything is worse than an honest one: a
 * judge who types a password and gets in learns the wrong thing about the
 * system. ROADMAP §14 rules out real auth for a three-role prototype.
 *
 * The three cards are the product's argument in miniature — the same event
 * seen by the person who reports it, the person accountable for it, and the
 * person who answers for it upward.
 */

const ICONS: Record<Role, typeof HardHat> = {
  field: HardHat,
  planner: ClipboardCheck,
  executive: LineChart,
};

export default function Login({ onPick }: { onPick: (role: Role) => void }) {
  return (
    <div className="h-screen w-full bg-surface text-muted font-sans overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[880px] flex flex-col gap-8">
          <header className="flex flex-col gap-2">
            <h1 className="text-h1 font-semibold leading-tight text-heading">
              NAVIS
            </h1>
            <p className="text-lead text-muted max-w-[60ch]">
              Intelligent data capture and schedule-linking for infrastructure
              projects. Choose the role you want to see the project as.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ROLES.map((id) => {
              const profile = ROLE_PROFILES[id];
              const Icon = ICONS[id];
              return (
                <button
                  key={id}
                  onClick={() => onPick(id)}
                  className="group text-left border border-hair bg-raised rounded-lg p-5 flex flex-col gap-3 hover:border-accent hover:bg-selected transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <Icon size={20} className="text-accent shrink-0" />
                    <span className="text-h3 font-semibold text-heading leading-tight">
                      {profile.title}
                    </span>
                  </span>
                  <span className="text-body text-muted leading-relaxed flex-1">
                    {profile.purpose}
                  </span>
                  <span className="font-mono text-label uppercase tracking-wider text-accent flex items-center gap-1">
                    Enter
                    <ArrowRight
                      size={12}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Said plainly. A demo that implies security it does not have is
              the one thing a reviewer will remember for the wrong reason. */}
          <p className="text-label text-muted border-t border-hair pt-4 max-w-[80ch] leading-relaxed">
            <span className="text-fg">There is no authentication here.</span>{' '}
            This screen selects a role so each person sees the screens built for
            them; it does not check a credential and it does not restrict data.
            Every API endpoint stays reachable to anyone who can reach the
            server. Single sign-on and real permission enforcement are
            production work, deliberately out of scope for the prototype.
          </p>
        </div>
      </div>
    </div>
  );
}
