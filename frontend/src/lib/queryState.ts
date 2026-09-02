/**
 * How a query result becomes one of three renderable states.
 *
 * The bug this exists to prevent: with the API unreachable, Home rendered
 * "Queue clear — every extracted event has been matched or resolved" and "No
 * two field sources have contradicted each other", while 134 items were
 * pending and 18 conflicts existed. It was not a flicker; it was stable.
 *
 * Two properties of TanStack Query combined to cause it:
 *
 *   - `isLoading` is `isPending && isFetching`, not `isPending`. Between the
 *     attempts driven by our 3s `refetchInterval`, a failing query is pending
 *     but NOT fetching, so `isLoading` is false.
 *   - `error` is only populated once the query reaches `status === 'error'`.
 *     While it is still pending-and-retrying, `error` is null.
 *
 * So there is a window — in practice a persistent one — where `isLoading` is
 * false and `error` is null and `data` is undefined. A render written as
 * `error ? … : isLoading ? … : <List items={data ?? []} />` falls through to
 * the last branch and presents "no data yet" as "nothing to report".
 *
 * For a progress-tracking system that is the worst possible failure: it does
 * not look broken, it looks like good news. `status` is exhaustive and has no
 * such gap, so classify on `status` and never on `isLoading`.
 *
 * `failureReason` carries the error of the most recent failed attempt while the
 * query is still retrying. Using it means an unreachable API says so
 * immediately, instead of showing a skeleton until the retries are exhausted.
 */

export type QueryView<E> =
  | { kind: 'error'; error: E }
  | { kind: 'pending' }
  | { kind: 'ready' };

interface QueryLike<E> {
  status: 'pending' | 'error' | 'success';
  error: E | null;
  failureReason?: E | null;
}

export function queryView<E>(query: QueryLike<E>): QueryView<E> {
  // An attempt that has already failed is reported even while retries continue.
  const failure = query.error ?? query.failureReason ?? null;
  if (failure !== null) return { kind: 'error', error: failure };
  if (query.status === 'pending') return { kind: 'pending' };
  return { kind: 'ready' };
}

/** True when the query has nothing trustworthy to show yet. */
export function isUnresolved<E>(query: QueryLike<E>): boolean {
  return queryView(query).kind !== 'ready';
}
