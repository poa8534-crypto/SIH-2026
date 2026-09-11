/**
 * NAVIS Real-time Live Synchronization Layer.
 *
 * Provides instant inter-component and cross-tab/cross-window event broadcasting
 * when field reports are confirmed or schedule progress is recorded.
 */

export interface ScheduleUpdatePayload {
  activityId: string;
  activityDescription?: string;
  message: string;
  source?: string;
  timestamp: number;
  percentComplete?: number | null;
  varianceDays?: number | null;
}

const EVENT_NAME = 'navis:schedule-updated';
const CHANNEL_NAME = 'navis_live_schedule';

type Listener = (payload: ScheduleUpdatePayload) => void;
const listeners = new Set<Listener>();

// Set up BroadcastChannel if supported in browser environment
let channel: BroadcastChannel | null = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (e: MessageEvent<ScheduleUpdatePayload>) => {
      if (e.data && e.data.activityId) {
        dispatchLocal(e.data);
      }
    };
  }
} catch {
  // BroadcastChannel unavailable in test / restricted environments
}

function dispatchLocal(payload: ScheduleUpdatePayload) {
  listeners.forEach((fn) => {
    try {
      fn(payload);
    } catch (err) {
      console.error('Error in live sync listener:', err);
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: payload,
      })
    );
  }
}

/**
 * Broadcast a confirmed schedule update to all active components, tabs, and windows.
 */
export function notifyScheduleUpdate(
  data: Omit<ScheduleUpdatePayload, 'timestamp'>
): void {
  const payload: ScheduleUpdatePayload = {
    ...data,
    timestamp: Date.now(),
  };

  // Broadcast to other tabs/windows
  if (channel) {
    try {
      channel.postMessage(payload);
    } catch {
      // Channel write error fallback
    }
  }

  // Dispatch locally in current window
  dispatchLocal(payload);
}

/**
 * Subscribe to real-time schedule updates. Returns unsubscribe function.
 */
export function subscribeToScheduleUpdates(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
