import { useMemo, useState } from 'react';
import { Eraser, Pause, Play, Plus, X } from 'lucide-react';
import { useTimeTracker } from '@/hooks/useTimeTracker';
import { TaskPickerModal } from '@/components/TaskPickerModal';
import { FloatingWindow } from '@/components/FloatingWindow';
import type { QuickTask } from '@/types';

type StopclockPanelProps = {
  tasks?: QuickTask[];
  taskNameById?: Record<string, string>;
  onClose?: () => void;
};

type PickerMode = 'start' | 'next';

const POSITION_KEY = 'stopclock-window-position';
const SIZE_KEY = 'stopclock-window-size';

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function getStoredPosition() {
  const fallback = { x: 24, y: 90 };
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(POSITION_KEY);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as { x: number; y: number };
    if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return parsed;
    return fallback;
  } catch {
    return fallback;
  }
}

function getStoredSize() {
  const fallback = { width: 440, height: 700 };
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(SIZE_KEY);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as { width: number; height: number };
    if (Number.isFinite(parsed.width) && Number.isFinite(parsed.height)) return parsed;
    return fallback;
  } catch {
    return fallback;
  }
}

export function StopclockPanel({ tasks = [], taskNameById = {}, onClose }: StopclockPanelProps) {
  const {
    unfinishedLogs,
    finishedLogs,
    currentLog,
    mostRecentLog,
    activeLog,
    totalSecondsToday,
    loading,
    pauseLog,
    resumeLog,
    createNewBlock,
    finishLog,
    resetAll,
  } = useTimeTracker();

  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);

  const position = useMemo(() => getStoredPosition(), []);
  const size = useMemo(() => getStoredSize(), []);

  const handlePrimaryButton = async () => {
    if (!mostRecentLog) {
      setPickerMode('start');
      return;
    }

    if (!currentLog) return;

    if (currentLog.is_running) {
      await pauseLog(currentLog.id);
      return;
    }

    await resumeLog(currentLog.id);
  };

  const handleNext = async () => {
    if (currentLog) {
      await finishLog(currentLog.id);
    }

    setPickerMode('next');
  };

  return (
    <FloatingWindow
      title="Stopclock"
      defaultPosition={position}
      defaultSize={size}
      minWidth={360}
      minHeight={450}
      maxWidth={760}
      maxHeight={900}
      onPositionChange={(next) => window.localStorage.setItem(POSITION_KEY, JSON.stringify(next))}
      onSizeChange={(next) => window.localStorage.setItem(SIZE_KEY, JSON.stringify(next))}
      headerActions={
        onClose ? (
          <button
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="no-drag rounded p-1 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            title="Close Stopclock"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null
      }
      className="bg-card/95 backdrop-blur-md"
    >
      <div className="space-y-4 px-4 py-4">
        <div className="rounded-xl border border-border bg-background/70 p-6 text-center">
          <p className="font-mono text-5xl font-bold tracking-wider text-primary md:text-6xl">
            {formatDuration(totalSecondsToday)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Total tracked today</p>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => void handlePrimaryButton()}
            disabled={loading}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-opacity hover:opacity-90 disabled:opacity-50"
            title={activeLog ? 'Stop current task' : 'Play / resume current task'}
          >
            {activeLog ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </button>

          <button
            onClick={() => void handleNext()}
            disabled={loading}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-secondary/40 text-foreground transition-colors hover:bg-secondary"
            title="Finish current task and start a new one"
          >
            <Plus className="h-6 w-6" />
          </button>

          <button
            onClick={() => void resetAll()}
            disabled={loading}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
            title="Erase all tracked tasks and time"
          >
            <Eraser className="h-6 w-6" />
          </button>
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-auto pr-1">
          {loading && <p className="text-sm text-muted-foreground">Loading logs...</p>}
          {!loading && unfinishedLogs.length === 0 && finishedLogs.length === 0 && (
            <p className="text-sm text-muted-foreground">No tracked sessions yet.</p>
          )}

          {currentLog && (
            <div className="rounded-lg border border-primary/70 bg-background/70 px-3 py-2 text-sm shadow-[0_0_16px_rgba(255,255,255,0.2)]">
              <span className="font-medium text-foreground">
                {(currentLog.task_id && taskNameById[currentLog.task_id]) || 'Unassigned'}
              </span>{' '}
              <span className="text-muted-foreground">-</span>{' '}
              <span className="font-mono text-foreground">{formatDuration(currentLog.durationSeconds)}</span>
              {currentLog.is_running ? (
                <span className="ml-2 text-xs font-medium uppercase text-primary">Live</span>
              ) : (
                <span className="ml-2 text-xs font-medium uppercase text-muted-foreground">Paused</span>
              )}
            </div>
          )}

          {finishedLogs.map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-sm opacity-65"
            >
              <span className="font-medium text-foreground">
                {(log.task_id && taskNameById[log.task_id]) || 'Unassigned'}
              </span>{' '}
              <span className="text-muted-foreground">-</span>{' '}
              <span className="font-mono text-foreground">{formatDuration(log.durationSeconds)}</span>
            </div>
          ))}
        </div>
      </div>

      {pickerMode && (
        <TaskPickerModal
          tasks={tasks}
          includeUnassigned
          title={pickerMode === 'start' ? 'Start timer for...' : 'Select next task'}
          onClose={() => setPickerMode(null)}
          onSelect={(task) => {
            void createNewBlock({ taskId: task?.id, isUnassigned: !task });
            setPickerMode(null);
          }}
        />
      )}
    </FloatingWindow>
  );
}
