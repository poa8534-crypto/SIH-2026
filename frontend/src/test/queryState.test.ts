/**
 * The false all-clear.
 *
 * With the API unreachable, Home rendered "Queue clear — every extracted event
 * has been matched or resolved" and "No two field sources have contradicted
 * each other" while 134 items were pending and 18 conflicts existed. Measured
 * over 14 samples in a real browser, it was stable, not a flicker.
 *
 * The cause is the gap between two TanStack Query flags:
 *   - `isLoading` is `isPending && isFetching` — false between retry attempts;
 *   - `error` stays null until the query reaches `status === 'error'`.
 * A render written `error ? … : isLoading ? … : <List items={data ?? []} />`
 * therefore falls through to the success branch and shows "no data yet" as
 * "nothing to report".
 *
 * For a progress-tracking system that is the worst failure available: it does
 * not look broken, it looks like good news.
 */

import { describe, it, expect } from 'vitest';
import { queryView, isUnresolved } from '../lib/queryState';

describe('queryView', () => {
  it('the exact state that produced the false all-clear is NOT ready', () => {
    // Pending, not fetching, no error yet, no data: isLoading === false and
    // error === null, which is what let the success branch render.
    const stuck = { status: 'pending' as const, error: null, failureReason: null };
    expect(queryView(stuck).kind).not.toBe('ready');
    expect(isUnresolved(stuck)).toBe(true);
  });

  it('a failed attempt is reported while retries are still in flight', () => {
    // failureReason carries the last failure before status flips to 'error'.
    // Without this the panel shows a skeleton until retries exhaust, saying
    // nothing about an API that is plainly unreachable.
    const retrying = {
      status: 'pending' as const,
      error: null,
      failureReason: new Error('Failed to fetch'),
    };
    const view = queryView(retrying);
    expect(view.kind).toBe('error');
    if (view.kind === 'error') expect(view.error.message).toBe('Failed to fetch');
  });

  it('an exhausted query is an error', () => {
    const failed = { status: 'error' as const, error: new Error('boom'), failureReason: null };
    expect(queryView(failed).kind).toBe('error');
  });

  it('a genuine empty result is still ready — an empty list is real data', () => {
    // The fix must not turn "there are honestly zero conflicts" into an error.
    const empty = { status: 'success' as const, error: null, failureReason: null };
    expect(queryView(empty).kind).toBe('ready');
    expect(isUnresolved(empty)).toBe(false);
  });

  it('a first load with nothing yet is pending, not ready', () => {
    expect(queryView({ status: 'pending' as const, error: null }).kind).toBe('pending');
  });

  it('an error outranks pending, so a stale retry never renders as data', () => {
    const both = {
      status: 'pending' as const,
      error: new Error('primary'),
      failureReason: new Error('secondary'),
    };
    const view = queryView(both);
    expect(view.kind).toBe('error');
    if (view.kind === 'error') expect(view.error.message).toBe('primary');
  });
});
