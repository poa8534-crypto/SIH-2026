/**
 * The offline outbox: work that happened at the work front but has not reached
 * the server yet.
 *
 * WHY THIS EXISTS
 * ---------------
 * The field lane runs on a phone at a well-site. Losing signal between two
 * work fronts is routine, not exceptional, and until now the app's answer was
 * a `useState(false)` in the shell header that a supervisor could toggle by
 * hand — a label, not a mechanism. A submission attempted with no link simply
 * failed.
 *
 * An outbox changes what a lost link COSTS. The muster is taken once, at the
 * face, while the gang is standing there; whether the packet leaves now or in
 * forty minutes when the supervisor walks past the site office is not the
 * supervisor's problem to manage.
 *
 * WHAT IT DELIBERATELY IS NOT
 * ---------------------------
 * It is not a sync engine and it does not merge. Every queued item is a
 * CREATE against an append-only or proposal-shaped endpoint — a muster, or a
 * manpower request — so replaying one late can duplicate but can never
 * clobber. Nothing that edits or commits is ever queued: `POST
 * /review/{id}/resolve` and `POST /workforce/assignments/{id}/decide` are the
 * Project Manager's, they happen on a desk with a link, and replaying one
 * blind days later could overwrite a decision made in between.
 *
 * DUPLICATES ARE PREFERRED TO LOSSES, AND SAID OUT LOUD
 * ----------------------------------------------------
 * A flush that gets a network failure keeps the item and retries. A flush that
 * gets a 4xx has been REFUSED by the server — the crew no longer exists, the
 * activity id is unknown — and retrying forever would wedge the queue behind a
 * poison item, so it is moved to `rejected` and surfaced to the supervisor
 * rather than dropped. The one thing that never happens is a silent discard.
 */

import { readStored, writeStored } from './storage';
import { generateUUID } from './uuid';

const KEY = 'navis.outbox.v1';

/** The only endpoints allowed in the queue. See the module docstring. */
export type OutboxKind = 'attendance' | 'assignment_request';

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  /** The request body, exactly as the live call would have sent it. */
  body: unknown;
  /** When the supervisor did the thing, not when it was sent. */
  queuedAt: string;
  attempts: number;
  /** Populated once the server has refused it for good. */
  rejected?: { at: string; detail: string };
}

function read(): OutboxItem[] {
  const raw = readStored(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxItem[]) : [];
  } catch {
    // A corrupt blob is dropped rather than crashing the app on every read.
    // Nothing here is a source of truth: anything that mattered was either
    // already delivered or is about to be re-entered by the supervisor.
    return [];
  }
}

function write(items: OutboxItem[]): void {
  writeStored(KEY, JSON.stringify(items));
}

export function listOutbox(): OutboxItem[] {
  return read();
}

/** Items still waiting to be sent — a rejection is not pending. */
export function pendingOutbox(): OutboxItem[] {
  return read().filter((i) => !i.rejected);
}

export function rejectedOutbox(): OutboxItem[] {
  return read().filter((i) => Boolean(i.rejected));
}

export function enqueue(kind: OutboxKind, body: unknown): OutboxItem {
  const item: OutboxItem = {
    id: generateUUID(),
    kind,
    body,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  write([...read(), item]);
  notify();
  return item;
}

export function removeItem(id: string): void {
  write(read().filter((i) => i.id !== id));
  notify();
}

/** Approximate wire size of the queue, for the bandwidth panel. */
export function outboxBytes(): number {
  const pending = pendingOutbox();
  if (!pending.length) return 0;
  try {
    return new TextEncoder().encode(JSON.stringify(pending.map((i) => i.body)))
      .length;
  } catch {
    return 0;
  }
}

// ── Change notification ─────────────────────────────────────────────────────
//
// A plain event, not a store: the queue changes from a handful of call sites
// and is read by two components. Anything heavier would be ceremony.

const EVENT = 'navis:outbox-changed';

function notify(): void {
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* Non-browser runtime (tests, SSR). Nothing is listening there. */
  }
}

export function onOutboxChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

/**
 * Try to deliver everything queued, oldest first.
 *
 * Oldest first because a muster and the manpower request that followed it were
 * entered in an order that means something, and arriving reversed would put a
 * request against a crew whose register entry has not landed.
 *
 * Returns what happened, so the caller can tell the supervisor rather than
 * flushing invisibly.
 */
export async function flushOutbox(
  send: (item: OutboxItem) => Promise<void>,
  isRefusal: (error: unknown) => boolean
): Promise<{ sent: number; kept: number; rejected: number }> {
  const items = read()
    .filter((i) => !i.rejected)
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));

  let sent = 0;
  let kept = 0;
  let rejected = 0;

  for (const item of items) {
    try {
      await send(item);
      removeItem(item.id);
      sent += 1;
    } catch (error) {
      const current = read();
      const idx = current.findIndex((i) => i.id === item.id);
      if (idx === -1) continue;
      current[idx] = {
        ...current[idx],
        attempts: current[idx].attempts + 1,
        ...(isRefusal(error)
          ? {
              rejected: {
                at: new Date().toISOString(),
                detail:
                  error instanceof Error ? error.message : 'Refused by the server',
              },
            }
          : {}),
      };
      write(current);
      if (isRefusal(error)) {
        rejected += 1;
      } else {
        kept += 1;
        // A network failure will fail for every remaining item too. Stopping
        // here avoids burning the whole queue's retry budget against a link
        // that is plainly down.
        break;
      }
    }
  }

  notify();
  return { sent, kept, rejected };
}
