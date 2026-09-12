import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, ApiError, getBaseUrl } from '../lib/api';
import { readStored, writeStored } from '../lib/storage';
import { generateUUID } from '../lib/uuid';
import {
  flushOutbox,
  onOutboxChange,
  outboxBytes,
  pendingOutbox,
  rejectedOutbox,
  type OutboxItem,
} from '../lib/outbox';
import type { LinkBand, LinkMode } from '../types';

/**
 * The bandwidth system, client side.
 *
 * WHAT THIS REPLACES
 * ------------------
 * `FieldWorkspaceShell` carried an `isOffline` `useState(false)` and a button
 * that toggled it. It changed a label and nothing else: the app behaved
 * identically online and "offline", and a submission attempted with no link
 * simply failed. This measures the link, decides what the app may attempt over
 * it, queues what it cannot send, and tells the server what it did.
 *
 * THE LADDER, AND WHO DECIDES IT
 * ------------------------------
 *   rich     voice capture and the optional model are both in play
 *   lean     text only — no audio upload, no model round-trip
 *   offline  nothing leaves the device; submissions queue locally
 *
 * The CLIENT decides, and reports its decision to the server, because the
 * client is the only party that knows what it actually did with the link. The
 * supervisor can also PIN a rung: choosing lean deliberately on a good link to
 * save data is a real and common thing to want, and a pinned choice always
 * beats the measurement. The one thing a pin cannot do is claim `rich` while
 * the link is down — reality wins in that direction only.
 *
 * CAPTURE, NEVER CORRECTNESS
 * --------------------------
 * Dropping to lean removes an assist, not a guarantee. D-005 already makes the
 * LLM optional and off by default, so a lean-mode report is a COMPLETE report.
 * Nothing here lowers a confidence score, weakens a match, or annotates a
 * submission as lesser because the link was bad.
 *
 * WHAT IS MEASURED, AND WHAT IS ONLY ESTIMATED
 * --------------------------------------------
 * Round-trip time is measured directly: a timed `GET /health`. That number is
 * real.
 *
 * Throughput is NOT measured. Probing it honestly would mean pushing enough
 * bytes to saturate the link, which is precisely the wrong thing to do on the
 * link this feature exists to protect. `navigator.connection.downlink` is used
 * where the browser offers it (Chromium; absent on Safari and Firefox) and is
 * `null` otherwise — never a guess dressed as a measurement. The server's
 * `classify_link` already bands on RTT alone when throughput is absent.
 */

const DEVICE_KEY = 'navis.device.id';
const PIN_KEY = 'navis.link.pin';

/** How often to probe and report. */
const HEARTBEAT_MS = 20_000;
/** A probe slower than this is treated as a failed one. */
const PROBE_TIMEOUT_MS = 8_000;
/**
 * Floor between two heartbeats. A mode change (offline ⇄ online) bypasses it:
 * that transition is worth a packet the moment it happens, and it is rare.
 */
const MIN_HEARTBEAT_GAP_MS = 10_000;

export interface ConnectivityState {
  deviceId: string;
  /** The rung the app is actually operating on. */
  mode: LinkMode;
  /** What the supervisor pinned, if anything. */
  pinned: LinkMode | null;
  band: LinkBand;
  rttMs: number | null;
  /** Browser-reported, not measured. `null` on Safari and Firefox. */
  downlinkKbps: number | null;
  online: boolean;
  pending: OutboxItem[];
  rejected: OutboxItem[];
  queuedBytes: number;
  lastProbeAt: string | null;
  lastFlush: { sent: number; kept: number; rejected: number } | null;
  flushing: boolean;
  setPinned: (mode: LinkMode | null) => void;
  /** Probe, then attempt the queue. Safe to call from a button. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<ConnectivityState | null>(null);

function readPin(): LinkMode | null {
  const v = readStored(PIN_KEY);
  return v === 'rich' || v === 'lean' || v === 'offline' ? v : null;
}

function deviceId(): string {
  const existing = readStored(DEVICE_KEY);
  if (existing) return existing;
  const fresh = generateUUID();
  writeStored(DEVICE_KEY, fresh);
  return fresh;
}

/** The same bands the server applies, so the two cannot disagree on screen. */
function bandFor(kbps: number | null, rtt: number | null): LinkBand {
  if (kbps === null && rtt === null) return 'unknown';
  if (kbps !== null) {
    if (kbps >= 256) return 'good';
    if (kbps >= 64) return 'weak';
    return 'poor';
  }
  if (rtt === null) return 'unknown';
  if (rtt <= 300) return 'good';
  if (rtt <= 1200) return 'weak';
  return 'poor';
}

function browserDownlinkKbps(): number | null {
  const conn = (
    navigator as Navigator & { connection?: { downlink?: number } }
  ).connection;
  if (!conn || typeof conn.downlink !== 'number') return null;
  // `downlink` is Mbps, rounded to 25 kbps steps by the spec.
  return Math.round(conn.downlink * 1000);
}

/** A refusal is the server saying no. Anything else is the link saying no. */
function isRefusal(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

async function probe(): Promise<{ rtt: number | null; reachable: boolean }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = performance.now();
  try {
    const res = await fetch(`${getBaseUrl()}/health`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return { rtt: null, reachable: false };
    return { rtt: Math.round(performance.now() - started), reachable: true };
  } catch {
    return { rtt: null, reachable: false };
  } finally {
    window.clearTimeout(timer);
  }
}

export function ConnectivityProvider({
  children,
  role,
}: {
  children: React.ReactNode;
  role: string;
}) {
  const id = useMemo(deviceId, []);
  const [pinned, setPinnedState] = useState<LinkMode | null>(readPin);
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [reachable, setReachable] = useState(true);
  const [lastProbeAt, setLastProbeAt] = useState<string | null>(null);
  const [pending, setPending] = useState<OutboxItem[]>(() => pendingOutbox());
  const [rejected, setRejected] = useState<OutboxItem[]>(() => rejectedOutbox());
  const [queuedBytes, setQueuedBytes] = useState(() => outboxBytes());
  const [lastFlush, setLastFlush] =
    useState<{ sent: number; kept: number; rejected: number } | null>(null);
  const [flushing, setFlushing] = useState(false);
  // Guards against two flushes overlapping — a heartbeat and a manual retry
  // firing together would send every queued item twice.
  const flushLock = useRef(false);

  const downlinkKbps = browserDownlinkKbps();

  const browserOnline =
    typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  const online = browserOnline && reachable;

  const band: LinkBand = online ? bandFor(downlinkKbps, rttMs) : 'unknown';

  // The rung. Reality can veto a pin downward but never upward: a supervisor
  // who pinned `rich` on a dead link is still offline, and pretending
  // otherwise would let the UI offer a voice capture that cannot be sent.
  const mode: LinkMode = !online
    ? 'offline'
    : pinned ?? (band === 'poor' ? 'lean' : 'rich');

  const syncQueue = useCallback(() => {
    setPending(pendingOutbox());
    setRejected(rejectedOutbox());
    setQueuedBytes(outboxBytes());
  }, []);

  useEffect(() => onOutboxChange(syncQueue), [syncQueue]);

  const send = useCallback(async (item: OutboxItem) => {
    if (item.kind === 'attendance') {
      await api.markAttendance(item.body as Parameters<typeof api.markAttendance>[0]);
      return;
    }
    if (item.kind === 'assignment_request') {
      await api.proposeAssignment(
        item.body as Parameters<typeof api.proposeAssignment>[0]
      );
      return;
    }
    // An unknown kind is a version skew: this build does not know how to send
    // what an older one queued. Treated as a refusal so it surfaces to the
    // supervisor instead of retrying forever against a handler that will
    // never exist.
    throw new ApiError(422, `This version cannot send a queued "${item.kind}".`);
  }, []);

  const refresh = useCallback(async () => {
    const result = await probe();
    setRttMs(result.rtt);
    setReachable(result.reachable);
    setLastProbeAt(new Date().toISOString());

    if (!result.reachable || flushLock.current) return;
    if (!pendingOutbox().length) return;

    flushLock.current = true;
    setFlushing(true);
    try {
      const outcome = await flushOutbox(send, isRefusal);
      setLastFlush(outcome);
    } finally {
      flushLock.current = false;
      setFlushing(false);
      syncQueue();
    }
  }, [send, syncQueue]);

  // Probe on mount, on an interval, and whenever the browser says the network
  // came back — the last one is what makes a reconnect feel immediate rather
  // than up to HEARTBEAT_MS late.
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), HEARTBEAT_MS);
    const onOnline = () => void refresh();
    const onOffline = () => setReachable(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh]);

  // Tell the server what this device is doing. Deliberately fire-and-forget:
  // a failed heartbeat IS the signal, and surfacing an error for it would put
  // a scary toast in front of a supervisor for something the app has already
  // handled by queueing.
  // Report to the server — but only when there is something new to say.
  //
  // Naively this was an effect keyed on every measured value, and it produced
  // a burst of eight heartbeats on a single mount: React StrictMode
  // double-invokes effects in development, an HMR update remounts, and each
  // probe writes three pieces of state. Chattering telemetry is a poor bug
  // anywhere and an absurd one HERE, in the feature whose entire purpose is
  // to be careful with a metered link at a well-site.
  //
  // So two gates. The SIGNATURE gate drops a heartbeat that would say exactly
  // what the last one said. The MIN_HEARTBEAT_GAP_MS gate rate-limits the
  // rest, except when the mode changed — going offline, or coming back, is
  // the one transition worth reporting the instant it happens.
  const lastBeat = useRef<{ signature: string; at: number; mode: LinkMode } | null>(
    null
  );
  useEffect(() => {
    if (!online) return;
    const signature = [mode, downlinkKbps, rttMs, pending.length, queuedBytes].join('|');
    const now = Date.now();
    const previous = lastBeat.current;
    const modeChanged = previous !== null && previous.mode !== mode;
    if (previous && previous.signature === signature) return;
    if (previous && !modeChanged && now - previous.at < MIN_HEARTBEAT_GAP_MS) return;
    lastBeat.current = { signature, at: now, mode };

    // try/catch as well as .catch(): a missing or stubbed `sendHeartbeat`
    // throws SYNCHRONOUSLY, and a synchronous throw inside an effect unmounts
    // the entire field shell. Telemetry is the least important thing on this
    // screen and must never be able to take the screen down with it.
    try {
      void api
        .sendHeartbeat?.({
          device_id: id,
          role,
          mode,
          measured_kbps: downlinkKbps,
          rtt_ms: rttMs,
          queue_depth: pending.length,
          queue_bytes: queuedBytes,
          label: role,
        })
        ?.catch(() => undefined);
    } catch {
      /* No heartbeat this tick. The board shows the device as stale, which is
         the honest reading of a client that could not report. */
    }
  }, [id, role, mode, downlinkKbps, rttMs, pending.length, queuedBytes, online]);

  const setPinned = useCallback((next: LinkMode | null) => {
    setPinnedState(next);
    writeStored(PIN_KEY, next ?? '');
  }, []);

  const value: ConnectivityState = {
    deviceId: id,
    mode,
    pinned,
    band,
    rttMs,
    downlinkKbps,
    online,
    pending,
    rejected,
    queuedBytes,
    lastProbeAt,
    lastFlush,
    flushing,
    setPinned,
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Connectivity for the current surface.
 *
 * Returns a safe, online-looking default outside a provider rather than
 * throwing: the planner and executive shells do not mount one, and a hook
 * that threw would turn "this screen has no bandwidth panel" into a white
 * screen.
 */
export function useConnectivity(): ConnectivityState {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return {
    deviceId: '',
    mode: 'rich',
    pinned: null,
    band: 'unknown',
    rttMs: null,
    downlinkKbps: null,
    online: true,
    pending: [],
    rejected: [],
    queuedBytes: 0,
    lastProbeAt: null,
    lastFlush: null,
    flushing: false,
    setPinned: () => undefined,
    refresh: async () => undefined,
  };
}
