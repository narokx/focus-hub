import { useState } from 'react';
import { Play, Plus, Square, X } from 'lucide-react';
import { useTimeTracker } from '@/hooks/useTimeTracker';
import { TaskPickerModal } from '@/components/TaskPickerModal';
import type { QuickTask } from '@/types';

type StopclockPanelProps = {
  tasks?: QuickTask[];
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

export function StopclockPanel({ tasks = [], taskNameById = {}, onClose }: StopclockPanelProps) {
  const { logsWithDuration, activeLog, mostRecentLog, totalSecondsToday, loading, toggleTimer, createNewBlock, assignTask } = useTimeTracker();
  const [pickerLogId, setPickerLogId] = useState<string | null>(null);

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
          onClick={mostRecentLog ? () => void toggleTimer(mostRecentLog.id) : () => void createNewBlock()}
          disabled={loading}
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
                  {(log.task_id && taskNameById[log.task_id]) || 'Unassigned'}
                </span>{' '}
                <span className="text-muted-foreground">-</span>{' '}
                <span className="font-mono text-foreground">{formatDuration(log.durationSeconds)}</span>
                {log.id === activeLog?.id && (
                  <span className="ml-2 text-xs font-medium uppercase text-primary">Live</span>
                )}
                {!log.task_id && (
                  <button
                    onClick={() => setPickerLogId(log.id)}
                    className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    title="Assign task"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
        </div>

        <button
          onClick={() => void createNewBlock()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          <Plus className="h-4 w-4" />
          New Block
        </button>
      </div>

      {pickerLogId && (
        <TaskPickerModal
          tasks={tasks}
          onClose={() => setPickerLogId(null)}
          onSelect={(task) => {
            void assignTask(pickerLogId, task.id);
            setPickerLogId(null);
          }}
        />
      )}
    </div>
  );
}
