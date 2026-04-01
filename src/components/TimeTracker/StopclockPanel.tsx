import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eraser, Pause, PictureInPicture2, Play, Plus, X } from 'lucide-react';
import { useTimeTracker } from '@/hooks/useTimeTracker';
import { TaskPickerModal } from '@/components/TaskPickerModal';
import { FloatingWindow } from '@/components/FloatingWindow';
import {
  getCloudWindowPositions,
  getStoredPosition,
  getStoredSize,
  savePosition,
  saveSize,
  shouldApplyCloudValue,
  subscribeToCloudWindowPositions,
  syncToCloud,
} from '@/lib/windowPersistence';
import { useAuth } from '@/contexts/AuthContext';
import type { QuickTask } from '@/types';

type StopclockPanelProps = {
  tasks?: QuickTask[];
  taskNameById?: Record<string, string>;
  onClose?: () => void;
};

type PickerMode = 'start' | 'next';

const POSITION_KEY = 'stopclock-position';
const SIZE_KEY = 'stopclock-size';
const PIP_DEFAULT_SIZE = { width: 420, height: 360 };
const DEFAULT_POSITION = { x: 24, y: 90 };
const DEFAULT_SIZE = { width: 440, height: 700 };

type DocumentPictureInPictureApi = {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
};

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPictureApi;
  }
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

export function StopclockPanel({ tasks = [], taskNameById = {}, onClose }: StopclockPanelProps) {
  const { user } = useAuth();
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
  const [miniMode, setMiniMode] = useState(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pipContainer, setPipContainer] = useState<HTMLElement | null>(null);
  const pipCloseListenerRef = useRef<(() => void) | null>(null);

  const [position, setPosition] = useState(() => {
    return getStoredPosition(POSITION_KEY, DEFAULT_POSITION);
  });
  const [size, setSize] = useState(() => getStoredSize(SIZE_KEY, DEFAULT_SIZE));
  const supportsDocumentPiP = typeof window !== 'undefined' && 'documentPictureInPicture' in window;
  const formattedTime = formatDuration(totalSecondsToday);

  useEffect(() => {
    if (!user) return;

    const applyStopclockLayout = (cloudPositions: Record<string, unknown>) => {
      const positionValue = cloudPositions[POSITION_KEY] as { x?: number; y?: number } | undefined;
      if (positionValue && Number.isFinite(positionValue.x) && Number.isFinite(positionValue.y)) {
        const nextPosition = { x: Number(positionValue.x), y: Number(positionValue.y) };
        if (shouldApplyCloudValue(user.id, POSITION_KEY, nextPosition)) {
          savePosition(POSITION_KEY, nextPosition);
          setPosition(nextPosition);
        }
      }

      const sizeValue = cloudPositions[SIZE_KEY] as { width?: number; height?: number } | undefined;
      if (sizeValue && Number.isFinite(sizeValue.width) && Number.isFinite(sizeValue.height)) {
        const nextSize = { width: Number(sizeValue.width), height: Number(sizeValue.height) };
        if (shouldApplyCloudValue(user.id, SIZE_KEY, nextSize)) {
          saveSize(SIZE_KEY, nextSize);
          setSize(nextSize);
        }
      }
    };

    void getCloudWindowPositions(user.id).then(applyStopclockLayout);
    const unsubscribe = subscribeToCloudWindowPositions(user.id, applyStopclockLayout);

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    return () => {
      if (pipCloseListenerRef.current && pipWindow) {
        pipWindow.removeEventListener('pagehide', pipCloseListenerRef.current);
        pipCloseListenerRef.current = null;
      }
      pipWindow?.close();
    };
  }, [pipWindow]);

  const copyStylesToWindow = (targetWindow: Window) => {
    const targetDocument = targetWindow.document;
    Array.from(document.styleSheets).forEach((styleSheet) => {
      try {
        const rules = styleSheet.cssRules;
        const style = targetDocument.createElement('style');
        style.textContent = Array.from(rules).map((rule) => rule.cssText).join('\n');
        targetDocument.head.appendChild(style);
      } catch {
        if ((styleSheet as CSSStyleSheet).href) {
          const link = targetDocument.createElement('link');
          link.rel = 'stylesheet';
          link.href = (styleSheet as CSSStyleSheet).href as string;
          targetDocument.head.appendChild(link);
        }
      }
    });
  };

  const closePiP = () => {
    pipWindow?.close();
    setPipContainer(null);
    setPipWindow(null);
  };

  const handlePiPToggle = async () => {
    if (!supportsDocumentPiP) {
      setMiniMode((prev) => !prev);
      return;
    }

    if (pipWindow) {
      closePiP();
      return;
    }

    const nextPiPWindow = await window.documentPictureInPicture?.requestWindow(PIP_DEFAULT_SIZE);
    if (!nextPiPWindow) return;

    nextPiPWindow.document.body.innerHTML = '';
    nextPiPWindow.document.body.className = 'm-0 p-0 bg-background text-foreground';
    copyStylesToWindow(nextPiPWindow);

    const container = nextPiPWindow.document.createElement('div');
    container.id = 'stopclock-pip-root';
    nextPiPWindow.document.body.appendChild(container);

    const handleClose = () => {
      setPipContainer(null);
      setPipWindow(null);
    };

    pipCloseListenerRef.current = handleClose;
    nextPiPWindow.addEventListener('pagehide', handleClose, { once: true });

    setPipWindow(nextPiPWindow);
    setPipContainer(container);
  };

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

  const panelBody = (
    <div className={`space-y-4 px-4 py-4 ${miniMode ? 'max-h-[220px]' : ''}`}>
      <div className="overflow-hidden rounded-xl border border-border bg-background/70 p-4 text-center sm:p-6">
        <div className="w-full h-full flex items-center justify-center overflow-hidden">
          <svg viewBox="0 0 220 50" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
            <text
              x="50%"
              y="50%"
              dominantBaseline="central"
              textAnchor="middle"
              className="fill-current font-mono font-bold text-foreground"
              fontSize="44"
            >
              {formattedTime}
            </text>
          </svg>
        </div>
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

      {!miniMode && (
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
      )}
    </div>
  );

  const floatingPanel = (
    <FloatingWindow
      key={miniMode ? 'mini-mode' : 'full-mode'}
      title="Stopclock"
      position={position}
      size={miniMode ? { width: 320, height: 250 } : size}
      minWidth={320}
      minHeight={miniMode ? 220 : 450}
      maxWidth={760}
      maxHeight={900}
      onPositionChange={(next) => {
        setPosition(next);
        savePosition(POSITION_KEY, next);
        if (user) syncToCloud(user.id, POSITION_KEY, next);
      }}
      onSizeChange={(next) => {
        setSize(next);
        saveSize(SIZE_KEY, next);
        if (user) syncToCloud(user.id, SIZE_KEY, next);
      }}
      headerActions={
        <>
          <button
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              void handlePiPToggle();
            }}
            className="no-drag rounded p-1 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            title={
              supportsDocumentPiP
                ? pipWindow
                  ? 'Exit Picture-in-Picture'
                  : 'Open Picture-in-Picture'
                : miniMode
                  ? 'Exit Mini Mode'
                  : 'Open Mini Mode'
            }
          >
            <PictureInPicture2 className="h-3.5 w-3.5" />
          </button>
          {onClose ? (
            <>
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
          </>
          ) : null}
        </>
      }
      className="bg-card/95 backdrop-blur-md"
    >
      {panelBody}

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

  const pipPanel =
    pipContainer && pipWindow
      ? createPortal(
          <div className="h-screen overflow-auto bg-card/95 backdrop-blur-md">
            {panelBody}
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
          </div>,
          pipContainer,
        )
      : null;

  return (
    <>
      {!pipWindow && floatingPanel}
      {pipPanel}
    </>
  );
}
