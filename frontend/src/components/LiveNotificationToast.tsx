import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart2, CheckCircle2, X } from 'lucide-react';
import { ScheduleUpdatePayload, subscribeToScheduleUpdates } from '../lib/liveSync';

interface ActiveNotification extends ScheduleUpdatePayload {
  id: string;
}

export function LiveNotificationToast() {
  const [notifications, setNotifications] = useState<ActiveNotification[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = subscribeToScheduleUpdates((payload) => {
      const id = `${payload.activityId}-${Date.now()}`;
      setNotifications((prev) => [...prev, { ...payload, id }]);

      // Auto-dismiss after 10s
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, 10000);
    });

    return unsubscribe;
  }, []);

  const dismiss = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleNavigateToGantt = (activityId: string, notifId: string) => {
    dismiss(notifId);
    navigate(`/schedule?view=gantt&activity=${encodeURIComponent(activityId)}&highlight=${Date.now()}`);
  };

  if (notifications.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm sm:max-w-md w-full pointer-events-none px-4 sm:px-0"
    >
      {notifications.map((notif) => (
        <div
          key={notif.id}
          className="pointer-events-auto bg-slate-900/95 dark:bg-slate-950/95 text-slate-100 border-2 border-emerald-500/60 rounded-xl p-4 shadow-2xl backdrop-blur-md flex flex-col gap-2.5 animate-in fade-in slide-in-from-bottom-5 duration-200 transition-all"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="font-mono text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 size={12} className="text-emerald-400" />
                Live Schedule Sync
              </span>
            </div>
            <button
              onClick={() => dismiss(notif.id)}
              className="text-slate-400 hover:text-slate-200 p-1 rounded transition-colors cursor-pointer"
              title="Dismiss"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/30 shrink-0">
                {notif.activityId}
              </span>
              {notif.activityDescription && (
                <span className="text-xs font-semibold text-slate-200 truncate" title={notif.activityDescription}>
                  {notif.activityDescription}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 leading-snug">
              {notif.message}
            </p>
          </div>

          {/* Action Button: Directly auto-redirects to Gantt Bar */}
          <button
            type="button"
            onClick={() => handleNavigateToGantt(notif.activityId, notif.id)}
            className="w-full mt-1 flex items-center justify-between px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold shadow-md transition-all cursor-pointer group"
          >
            <span className="flex items-center gap-2">
              <BarChart2 size={14} className="text-white" />
              <span>View Updated Bar in Gantt</span>
            </span>
            <ArrowRight size={14} className="text-white group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      ))}
    </div>
  );
}
