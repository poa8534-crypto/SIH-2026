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
  /* No `name` here on purpose. The project name is whatever GET /schedule
     returns, and every screen reads it from there — a second copy in config
     is exactly how a sidebar and a profile card end up naming two projects. */
  code: 'OIL-WSD-2026',
  location: 'Well Pad 04 · Sector A',
  /** The project's data date. Relative dates resolve against this, not today. */
  dataDate: '2026-09-15',
  timezone: 'Asia/Kolkata',
} as const;

/**
 * The two roles this product has, and nothing about any individual.
 *
 * There is no authentication, no user table and no profile endpoint, so the
 * app cannot know who is looking at it. Rendering a person's name would be
 * inventing one. Role labels are defined once here so no two screens can
 * disagree about what to call the people on either side of a report.
 */
export const FIELD_ROLE = 'Field Supervisor';
export const PLANNER_ROLE = 'Planning Engineer';

export const SUPERVISOR = {
  role: FIELD_ROLE,
  shift: 'Day · 07:00–17:00',
  /** Default discipline for this supervisor's work front. */
  discipline: 'piping' as Discipline,
} as const;

export const PLANNER = {
  role: PLANNER_ROLE,
} as const;

/**
 * The six disciplines this system has. There is no seventh: the "STR" tag in
 * the Stitch mockups is not a value the schedule, the extractor or the
 * matcher ever produces, and `Discipline` in types.ts has no such member.
 *
 * Typed as a Record over the union, so the compiler rejects both a missing
 * discipline and an invented one. Every legend, filter, colour map and chart
 * axis reads from here rather than keeping its own copy — six private copies
 * is how a screen ends up one discipline short.
 */
const DISCIPLINE_META: Record<Discipline, { label: string; short: string; axis: string }> = {
  civil: { label: 'Civil', short: 'CIV', axis: 'Civil' },
  piping: { label: 'Piping', short: 'PIP', axis: 'Piping' },
  static_equipment: {
    label: 'Static Equipment',
    short: 'SEQ',
    axis: 'Static Equip.',
  },
  electrical: { label: 'Electrical', short: 'ELE', axis: 'Electrical' },
  instrumentation: {
    label: 'Instrumentation',
    short: 'INS',
    axis: 'Instrum.',
  },
  hse: { label: 'HSE', short: 'HSE', axis: 'HSE' },
};

/** Render order, shared by every list so screens agree on sequence too. */
export const DISCIPLINE_ORDER: Discipline[] = [
  'civil',
  'piping',
  'static_equipment',
  'electrical',
  'instrumentation',
  'hse',
];

/** `{ value, label, short, axis }` for every discipline, in render order. */
export const DISCIPLINES = DISCIPLINE_ORDER.map((value) => ({
  value,
  ...DISCIPLINE_META[value],
}));

export const DISCIPLINE_LABEL: Record<Discipline, string> = Object.fromEntries(
  DISCIPLINE_ORDER.map((d) => [d, DISCIPLINE_META[d].label])
) as Record<Discipline, string>;

export const DISCIPLINE_SHORT: Record<Discipline, string> = Object.fromEntries(
  DISCIPLINE_ORDER.map((d) => [d, DISCIPLINE_META[d].short])
) as Record<Discipline, string>;

export const DISCIPLINE_AXIS: Record<Discipline, string> = Object.fromEntries(
  DISCIPLINE_ORDER.map((d) => [d, DISCIPLINE_META[d].axis])
) as Record<Discipline, string>;

/** True only for the six. Anything else is data this system did not produce. */
export function isDiscipline(value: string | null | undefined): value is Discipline {
  return value !== null && value !== undefined && value in DISCIPLINE_META;
}

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

/** The structured context sent with every agent turn.
 *
 *  `discipline` is OPTIONAL and is omitted when the supervisor has not chosen
 *  one. The reporting form used to default to the first discipline in the
 *  list — Civil — so every report from an electrician arrived tagged civil
 *  until someone noticed, and "I love pizza" came back carrying a discipline
 *  the system had no reason to believe. A field the user did not fill is not
 *  context; it is a guess. See D-095. */
export function agentContext(location: string, discipline?: Discipline | null) {
  return {
    project_code: PROJECT.code,
    location,
    ...(discipline ? { discipline } : {}),
    data_date: PROJECT.dataDate,
    timezone: PROJECT.timezone,
  };
}

const DISCIPLINE_KEY = 'navis.discipline';

/** The discipline this supervisor last reported under, if any.
 *
 *  A remembered choice is a legitimate default — the same person usually
 *  reports on the same trade — but it is the ONLY legitimate one. Absent a
 *  saved preference the form opens on "Select discipline" rather than
 *  choosing for them.
 *
 *  Storage is wrapped for the same reason `lib/role.ts` wraps it: a private
 *  window or blocked site data makes `localStorage` throw on access. */
export function savedDiscipline(): Discipline | null {
  try {
    const v = window.localStorage.getItem(DISCIPLINE_KEY);
    return isDiscipline(v) ? v : null;
  } catch {
    return null;
  }
}

export function rememberDiscipline(discipline: Discipline): void {
  try {
    window.localStorage.setItem(DISCIPLINE_KEY, discipline);
  } catch {
    /* Still works for this session; it just will not be remembered. */
  }
}
