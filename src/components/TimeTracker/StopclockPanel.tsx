import { useEffect, useMemo, useState } from 'react';
import { Play, Square, X } from 'lucide-react';
import { useTimeTracker } from '@/hooks/useTimeTracker';

type StopclockPanelProps = {
  taskNameById?: Record<string, string>;
  onClose?: () => void;
};

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

export function StopclockPanel({ taskNameById = {}, onClose }: StopclockPanelProps) {
  const { logs, activeLog, totalSecondsToday, loading, startTimer, stopTimer } = useTimeTracker();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!activeLog) return;

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeLog]);

  const logsWithDuration = useMemo(() => {
    return logs.map((log) => {
      const startMs = Date.parse(log.start_time);
      const endMs = log.end_time ? Date.parse(log.end_time) : nowMs;

      let durationSeconds = 0;
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
        durationSeconds = Math.floor((endMs - startMs) / 1000);
      }

      return {
        ...log,
        durationSeconds,
      };
    });
  }, [logs, nowMs]);

  return (
    <div className="fixed right-6 top-20 z-[950] w-[min(92vw,440px)] rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Time Tracker</p>
          <h2 className="text-sm font-semibold text-foreground">Stopclock</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Close Stopclock"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="rounded-xl border border-border bg-background/70 p-4 text-center">
          <p className="font-mono text-4xl font-bold tracking-wider text-primary md:text-5xl">
            {formatDuration(totalSecondsToday)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Total tracked today</p>
        </div>

        <button
          onClick={activeLog ? () => void stopTimer() : () => void startTimer()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {activeLog ? (
            <>
              <Square className="h-4 w-4" />
              Stop
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Play
            </>
          )}
        </button>

        <div className="max-h-[42vh] space-y-2 overflow-auto pr-1">
          {loading && <p className="text-sm text-muted-foreground">Loading logs...</p>}
          {!loading && logsWithDuration.length === 0 && (
            <p className="text-sm text-muted-foreground">No tracked sessions yet today.</p>
          )}

          {!loading &&
            logsWithDuration.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border border-border/80 bg-background/70 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">
                  {taskNameById[log.task_id ?? ''] ?? 'Unassigned'}
                </span>{' '}
                <span className="text-muted-foreground">-</span>{' '}
                <span className="font-mono text-foreground">{formatDuration(log.durationSeconds)}</span>
                {log.id === activeLog?.id && (
                  <span className="ml-2 text-xs font-medium uppercase text-primary">Live</span>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
