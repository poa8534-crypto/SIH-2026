import { createContext, useContext } from 'react';
import type { Role } from '../lib/role';

/**
 * Who is signed in, and how to stop being them.
 *
 * `App` owns the role in state, so a child that clears `localStorage` directly
 * would not re-render the app — it would still be showing the old role's
 * screens against a cleared session. Sign-out therefore has to go back through
 * `App`, and the field lane's routes are nested inside `<Routes>` rather than
 * being direct children, so a prop cannot reach them. This context is that
 * path, and it is deliberately the whole of it: there is no auth here (see
 * `lib/role.ts`), so there is nothing else a session needs to carry.
 */
export interface Session {
  role: Role;
  /** Clear the role and return to the picker. */
  signOut: () => void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const value = useContext(SessionContext);
  if (!value) {
    // A component rendered outside the provider is a wiring mistake, not a
    // signed-out user: the provider wraps everything the router can reach.
    throw new Error('useSession must be used inside the app session provider');
  }
  return value;
}
