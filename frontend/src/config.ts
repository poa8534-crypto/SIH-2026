/**
 * Project and user identity, in one place.
 *
 * There is no authentication in scope and no profile API, so the seeded
 * context lives here rather than being retyped in every component. One module
 * means the Profile screen, the agent's request context and the shell header
 * cannot drift apart.
 */

import { Discipline } from './types';

export const PROJECT = {
  name: 'OIL Well-Site Duliajan',
  code: 'OIL-WSD-2026',
  location: 'Sector A · Digboi Well #4',
  /** The project's data date. Relative dates resolve against this, not today. */
  dataDate: '2026-09-15',
  timezone: 'Asia/Kolkata',
} as const;

export const SUPERVISOR = {
  name: 'Rajesh Kumar',
  initials: 'RK',
  role: 'Field Supervisor',
  /** Static project context, not user data: there is no auth and no user
   *  table, and the Profile screen in design/ shows both. */
  employeeId: 'OIL-FS-014',
  shift: 'Day · 07:00–17:00',
  /** Default discipline for this supervisor's work front. */
  discipline: 'piping' as Discipline,
} as const;

export const PLANNER = {
  name: 'Priya Das',
  role: 'Planning Engineer',
} as const;

export const LANGUAGES = [
  { code: 'en-IN', short: 'EN', label: 'English' },
  { code: 'hi-IN', short: 'हि', label: 'Hindi' },
  { code: 'as-IN', short: 'অস', label: 'Assamese' },
] as const;

/** Work fronts the supervisor can report against. */
export const WORK_FRONTS = [
  PROJECT.location,
  'Sector B · Pipeline Route',
] as const;

/** The structured context sent with every agent turn. */
export function agentContext(location: string, discipline: Discipline) {
  return {
    project_code: PROJECT.code,
    location,
    discipline,
    data_date: PROJECT.dataDate,
    timezone: PROJECT.timezone,
  };
}
