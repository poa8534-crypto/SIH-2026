/**
 * Who is looking at the app.
 *
 * There is no authentication in this product and none is planned for the
 * prototype: the login screen is a role picker, not a credential check, and
 * this module is the whole of the "session". ROADMAP.md §14 is explicit that
 * three roles do not justify auth complexity — "a role selector is sufficient
 * for a prototype; say SSO in production and move on".
 *
 * Because of that, **nothing here is a security boundary**. Route guards built
 * on this keep each role's screens coherent; they do not protect data. Every
 * endpoint remains reachable to anyone who can reach the API, which is stated
 * plainly on the login screen rather than implied away.
 *
 * The three roles and what each is FOR (ROADMAP §3):
 *
 *   field      — reports what happened at the work front. Sees their own
 *                submissions and outcomes. Cannot approve anything.
 *   planner    — the Project Manager. Owns the schedule, sees the full
 *                evidence chain, and is the ONLY role that commits a change.
 *   executive  — Senior Management. Aggregates, exceptions and trend only.
 *                Never a review queue, never transaction detail, read-only.
 */

export type Role = 'field' | 'planner' | 'executive';

export const ROLES: Role[] = ['field', 'planner', 'executive'];

export interface RoleProfile {
  id: Role;
  /** What this person is called on screen. */
  title: string;
  /** The one sentence that says what they are accountable for. */
  purpose: string;
  /** Where this role lands after signing in. */
  home: string;
  /** Route prefixes this role is allowed to open. */
  allows: string[];
}

export const ROLE_PROFILES: Record<Role, RoleProfile> = {
  field: {
    id: 'field',
    title: 'Field Supervisor',
    purpose:
      'Reports what the crews actually did today. Submits progress by voice, ' +
      'chat or file. Cannot approve anything.',
    home: '/field',
    allows: ['/field'],
  },
  planner: {
    id: 'planner',
    title: 'Project Manager',
    purpose:
      'Owns the schedule. Reads every field report against the evidence and ' +
      'decides what is true. The only role that changes the plan.',
    home: '/home',
    allows: ['/home', '/reconcile', '/schedule', '/ingest', '/memory', '/raid', '/delay'],
  },
  executive: {
    id: 'executive',
    title: 'Senior Management',
    purpose:
      'Governance across the project. Trend, exception and forecast — never ' +
      'the review queue, and nothing to approve.',
    home: '/executive',
    allows: ['/executive'],
  },
};

const STORAGE_KEY = 'navis.role';

/**
 * Read the signed-in role.
 *
 * Storage access is wrapped because a private window, cleared site data, or a
 * browser configured to block storage makes `localStorage` throw on access
 * rather than return null — and a thrown getter here would white-screen the
 * whole app before the router mounts.
 */
export function readRole(): Role | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && (ROLES as string[]).includes(v) ? (v as Role) : null;
  } catch {
    return null;
  }
}

export function writeRole(role: Role): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, role);
  } catch {
    /* A viewer who cannot persist still gets a working session in memory. */
  }
}

export function clearRole(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Nothing to clear if it could never be written. */
  }
}

/** True when `path` is one this role is meant to open. */
export function roleAllows(role: Role, path: string): boolean {
  return ROLE_PROFILES[role].allows.some(
    (prefix) => path === prefix || path.startsWith(prefix + '/')
  );
}
