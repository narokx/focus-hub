import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  pointerWithin,
  useSensors,
  useSensor,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { BarChart3, Calendar, Layers, List, NotebookPen, StickyNote, Wrench, Undo2, Redo2, X } from 'lucide-react';
import { FloatingWindow } from '@/components/FloatingWindow';
import { HeatmapCalendar } from '@/components/HeatmapCalendar';
import { QuickTasksPanel } from '@/components/QuickTasksPanel';
import { RoutinesPanel } from '@/components/RoutinesPanel';
import { RoutineApplicationModal } from '@/components/RoutineApplicationModal';
import { SettingsModal } from '@/components/SettingsModal';
import { WeeklyStatsPanel } from '@/components/WeeklyStatsPanel';
import { WeeklyNotesPanel } from '@/components/WeeklyNotesPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useAppState } from '@/hooks/useAppState';
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks';
import { useSupabaseRoutines } from '@/hooks/useSupabaseRoutines';
import { useSupabaseCalendar } from '@/hooks/useSupabaseCalendar';
import { useSupabaseNotes } from '@/hooks/useSupabaseNotes';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTheme } from '@/hooks/useTheme';
import { useHistory } from '@/hooks/useHistory';
import { syncCalendarForHistoryTransition } from '@/lib/supabaseCalendarHistorySync';
import { QuickTask, TaskColor, getColorValue, getContrastColor, Routine } from '@/types';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type MobileTab = 'calendar' | 'routines' | 'tasks' | 'stats';
type WindowKey = 'calendar' | 'routines' | 'quickTasks' | 'stats' | 'weeklyNotes';

export default function Index() {
  const { user } = useAuth();

  const {
    tasks: supabaseTasks,
    loading: tasksLoading,
    addTask: addQuickTask,
    updateTask: updateQuickTask,
    deleteTask: deleteQuickTask,
    reorderTasks: reorderQuickTasks,
    fetchTasks,
  } = useSupabaseTasks();

  const {
    routines: supabaseRoutines,
    loading: routinesLoading,
    addRoutine,
    updateRoutine,
    deleteRoutine,
    addTaskToRoutine,
    removeTaskFromRoutine,
    assignTaskToRoutineSlot,
    addSubtaskToRoutineSlot,
    removeSubtask: removeSubtaskFromRoutineSlot,
    updateSubtaskPercentages: updateRoutineSubtaskPercentages,
    removeTaskFromRoutineSlot,
    moveRoutineSlotToUnassigned,
    addRoutineTimeSlot,
    deleteRoutineTimeSlot,
    updateRoutineSlotTime,
    updateRoutineSlotTaskName,
    clearRoutineTimeline,
    fetchRoutines,
    reorderRoutines,
  } = useSupabaseRoutines();

  const {
    calendar: supabaseCalendar,
    loading: calendarLoading,
    addTaskToDay,
    toggleDayTask,
    updateDayTask,
    removeDayTask,
    assignTaskToDaySlot,
    addSubtaskToDaySlot,
    removeSubtask: removeSubtaskFromDaySlot,
    updateSubtaskPercentages: updateDaySubtaskPercentages,
    toggleDaySlotTask,
    moveDaySlotToUnassigned,
    addDayTimeSlot,
    deleteDayTimeSlot,
    updateDaySlotTime,
    updateDaySlotTaskName,
    moveSlotToSlot: moveCalendarSlotToSlot,
    applyRoutineToDay: applyRoutineToDayCloud,
    batchApplyRoutine,
    clearDayTimeline,
    fetchCalendar,
    updateDayColor,
  } = useSupabaseCalendar();

  const {
    content: weeklyNoteContent,
    loading: notesLoading,
    updateNote,
    refresh: refreshNotes,
  } = useSupabaseNotes();

  const {
    state,
    moveSlotToSlot,
    applyRoutineToDay,
    updateWindowPosition, updateWindowTitle,
    restoreState,
  } = useAppState(supabaseTasks, supabaseRoutines, supabaseCalendar);

  // Initialize theme on mount (reads persisted preference)
  useTheme();

  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<MobileTab>('calendar');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragData, setActiveDragData] = useState<{
    type: string;
    name?: string;
    color?: TaskColor;
    routine?: typeof state.routines[0];
  } | null>(null);

  const sensors = useSensors(
    // Desktop/Mouse: Activates after 5px of movement
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    // Mobile/Touch: Activates only after a 250ms hold
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5, // Allows 5px of jitter during the 250ms hold
      },
    }),
    useSensor(KeyboardSensor)
  );

  // State for routine application modal
  const [routineModalOpen, setRoutineModalOpen] = useState(false);
  const [pendingRoutineDrop, setPendingRoutineDrop] = useState<{
    routine: Routine;
    targetDate: string;
  } | null>(null);
  const [isApplyingRoutine, setIsApplyingRoutine] = useState(false);
  const [pendingDaySlotAssignment, setPendingDaySlotAssignment] = useState<{
    date: string;
    slotId: string;
    task: QuickTask;
    source?: { type: 'timeslot'; sourcePrefix: string; sourceSlotId: string };
  } | null>(null);
  const [isNotesOpen, setIsNotesOpen] = useState(false);

  // History for undo/redo
  const history = useHistory(state);

  // Serialize undo/redo DB sync to avoid interleaving mutations
  const undoRedoQueueRef = React.useRef<Promise<void>>(Promise.resolve());

  // Push state to history whenever state changes
  const prevStateRef = React.useRef(state);
  useEffect(() => {
    if (prevStateRef.current !== state) {
      history.push(state);
      prevStateRef.current = state;
    }
  }, [state]);

  const enqueueCalendarHistorySync = useCallback((fromState: typeof state, toState: typeof state) => {
    if (!user) return;

    undoRedoQueueRef.current = undoRedoQueueRef.current.then(async () => {
      try {
        await syncCalendarForHistoryTransition({
          userId: user.id,
          fromCalendar: fromState.calendar,
          toCalendar: toState.calendar,
        });
      } catch (e) {
        console.error('Undo/redo calendar DB sync failed:', e);
      } finally {
        // Ensure the supabase calendar hook is aligned after any direct DB mutations.
        await fetchCalendar();
      }
    });
  }, [user, fetchCalendar]);

  const handleUndo = useCallback(() => {
    const from = state;
    const prev = history.undo();
    if (!prev) return;

    // We will restore state (skip is handled by history.undo()), then fetchCalendar() will normalize ids.
    // Skip that follow-up push so we don't kill the redo stack.
    history.skipNextPushes(1);

    restoreState(prev);
    enqueueCalendarHistorySync(from, prev);
  }, [state, history, restoreState, enqueueCalendarHistorySync]);

  const handleRedo = useCallback(() => {
    const from = state;
    const next = history.redo();
    if (!next) return;

    history.skipNextPushes(1);

    restoreState(next);
    enqueueCalendarHistorySync(from, next);
  }, [state, history, restoreState, enqueueCalendarHistorySync]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          handleUndo();
        } else if ((key === 'z' && e.shiftKey) || key === 'y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Minimized state for each window
  const [minimized, setMinimized] = useState<Record<WindowKey, boolean>>({
    calendar: false,
    routines: false,
    quickTasks: false,
    stats: true, // Stats starts minimized
    weeklyNotes: false,
  });

  const toggleMinimize = (key: WindowKey) => {
    setMinimized(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setActiveDragData(event.active.data.current as any);
  };

  const resolveDaySlotTarget = (prefix: string, slotId: string) => {
    if (!prefix.startsWith('day-')) return null;
    const date = prefix.substring(4);
    const existingSlot = state.calendar[date]?.timeSlots.find(s => s.id === slotId);
    return { date, existingSlot };
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveDragData(null);

    if (!over) return;

    const activeData = active.data.current as any;
    const overData = over.data.current as any;

    if (overData?.type === 'timeslot') {
      const target = resolveDaySlotTarget(overData.prefix, overData.slotId);
      const targetHasTask = !!target?.existingSlot?.task;
      const movingFromSameSlot =
        activeData?.source === 'timeslot' &&
        activeData?.sourcePrefix === overData.prefix &&
        activeData?.sourceSlotId === overData.slotId;

      const canPromptForAssignment = activeData?.type === 'task' && !!activeData?.name && !!activeData?.color;

      if (targetHasTask && !movingFromSameSlot && canPromptForAssignment && target) {
        setPendingDaySlotAssignment({
          date: target.date,
          slotId: overData.slotId,
          task: {
            id: activeData.taskId || (active.id as string),
            name: activeData.name,
            color: activeData.color,
          },
          source: activeData?.source === 'timeslot'
            ? {
                type: 'timeslot',
                sourcePrefix: activeData.sourcePrefix,
                sourceSlotId: activeData.sourceSlotId,
              }
            : undefined,
        });
        return;
      }
    }

    // Handle sortable reorder within Quick Tasks
    if (activeData?.type === 'task' && activeData?.source === 'quick-tasks' && overData?.type === 'task' && overData?.source === 'quick-tasks') {
      const activeTaskId = (active.id as string).replace('quick-', '');
      const overTaskId = (over.id as string).replace('quick-', '');
      const fromIndex = state.quickTasks.findIndex(t => t.id === activeTaskId);
      const toIndex = state.quickTasks.findIndex(t => t.id === overTaskId);
      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        reorderQuickTasks(fromIndex, toIndex);
      }
      return;
    }

    // Handle sortable reorder within Routines (desktop only)
    if (activeData?.type === 'routine' && activeData?.source === 'routine-list' && overData?.type === 'routine' && overData?.source === 'routine-list') {
      const activeRoutineId = (active.id as string).replace('sortable-routine-', '');
      const overRoutineId = (over.id as string).replace('sortable-routine-', '');
      const fromIndex = state.routines.findIndex(r => r.id === activeRoutineId);
      const toIndex = state.routines.findIndex(r => r.id === overRoutineId);
      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        reorderRoutines(fromIndex, toIndex);
      }
      return;
    }

    // Handle routine drag to calendar cell - show modal for selection
    if (activeData?.type === 'routine' && overData?.type === 'day') {
      setPendingRoutineDrop({
        routine: activeData.routine,
        targetDate: overData.date,
      });
      setRoutineModalOpen(true);
      return;
    }

    // Handle slot-to-slot drag (task moving between time slots)
    if (activeData?.type === 'task' && activeData?.source === 'timeslot' && overData?.type === 'timeslot') {
      const { sourcePrefix, sourceSlotId } = activeData;
      const { prefix: targetPrefix, slotId: targetSlotId } = overData;
      if (sourcePrefix === targetPrefix && sourceSlotId === targetSlotId) return;

      // Use cloud handler for day-to-day moves, local for routine-involved moves
      if (sourcePrefix.startsWith('day-') && targetPrefix.startsWith('day-')) {
        moveCalendarSlotToSlot(sourcePrefix, sourceSlotId, targetPrefix, targetSlotId);
      } else {
        moveSlotToSlot(sourcePrefix, sourceSlotId, targetPrefix, targetSlotId);
      }
      return;
    }

    // Handle task drag to time slot
    if (activeData?.type === 'task' && overData?.type === 'timeslot') {
      const { prefix, slotId } = overData;
      const task = { name: activeData.name, color: activeData.color, taskId: activeData.taskId };

      if (prefix.startsWith('day-')) {
        const date = prefix.substring(4);
        assignTaskToDaySlot(date, slotId, task);
        if (activeData.source === 'unassigned' && activeData.sourcePrefix === prefix) {
          removeDayTask(date, activeData.unassignedTaskId);
        }
        if (activeData.source === 'unassigned' && activeData.sourcePrefix?.startsWith('routine-')) {
          const routineId = activeData.sourcePrefix.substring(8);
          removeTaskFromRoutine(routineId, activeData.unassignedTaskId);
        }
        setSelectedDate(date);
      } else if (prefix.startsWith('routine-')) {
        const routineId = prefix.substring(8);
        assignTaskToRoutineSlot(routineId, slotId, task);
        if (activeData.source === 'unassigned' && activeData.sourcePrefix === prefix) {
          removeTaskFromRoutine(routineId, activeData.unassignedTaskId);
        }
      }
      return;
    }

    // Handle task drag to unassigned zone
    if (activeData?.type === 'task' && overData?.type === 'unassigned-zone') {
      const { prefix } = overData;

      if (activeData.source === 'unassigned' && activeData.sourcePrefix === prefix) {
        return;
      }

      if (activeData.source === 'timeslot') {
        if (prefix === activeData.sourcePrefix) {
          if (prefix.startsWith('day-')) {
            moveDaySlotToUnassigned(prefix.substring(4), activeData.sourceSlotId);
          } else if (prefix.startsWith('routine-')) {
            moveRoutineSlotToUnassigned(prefix.substring(8), activeData.sourceSlotId);
          }
          return;
        }
      }

      if (prefix.startsWith('day-')) {
        const date = prefix.substring(4);
        addTaskToDay(date, { name: activeData.name, color: activeData.color, taskId: activeData.taskId });
        if (activeData.source === 'unassigned' && activeData.sourcePrefix) {
          if (activeData.sourcePrefix.startsWith('day-')) {
            removeDayTask(activeData.sourcePrefix.substring(4), activeData.unassignedTaskId);
          } else if (activeData.sourcePrefix.startsWith('routine-')) {
            removeTaskFromRoutine(activeData.sourcePrefix.substring(8), activeData.unassignedTaskId);
          }
        }
        setSelectedDate(date);
      } else if (prefix.startsWith('routine-')) {
        const routineId = prefix.substring(8);
        addTaskToRoutine(routineId, { id: activeData.taskId || (active.id as string), name: activeData.name, color: activeData.color } as any);
        if (activeData.source === 'unassigned' && activeData.sourcePrefix) {
          if (activeData.sourcePrefix.startsWith('day-')) {
            removeDayTask(activeData.sourcePrefix.substring(4), activeData.unassignedTaskId);
          } else if (activeData.sourcePrefix.startsWith('routine-')) {
            removeTaskFromRoutine(activeData.sourcePrefix.substring(8), activeData.unassignedTaskId);
          }
        }
      }
      return;
    }

    // Handle task drag to calendar day cell (goes to unassigned)
    if (activeData?.type === 'task' && overData?.type === 'day') {
      const date = overData.date;
      addTaskToDay(date, { name: activeData.name, color: activeData.color, taskId: activeData.taskId });
      if (activeData.source === 'unassigned' && activeData.sourcePrefix) {
        if (activeData.sourcePrefix.startsWith('day-')) {
          removeDayTask(activeData.sourcePrefix.substring(4), activeData.unassignedTaskId);
        } else if (activeData.sourcePrefix.startsWith('routine-')) {
          removeTaskFromRoutine(activeData.sourcePrefix.substring(8), activeData.unassignedTaskId);
        }
      }
      setSelectedDate(date);
      return;
    }

    // Handle task drag to routine drop zone (goes to unassigned)
    if (activeData?.type === 'task' && overData?.type === 'routine-drop') {
      const routineId = overData.routineId;
      addTaskToRoutine(routineId, { id: activeData.taskId || (active.id as string), name: activeData.name, color: activeData.color } as any);
      return;
    }
  };


  const clearSourceTimelineSlot = useCallback(async (
    source?: { type: 'timeslot'; sourcePrefix: string; sourceSlotId: string }
  ) => {
    if (!source || source.type !== 'timeslot') return;
    if (!source.sourcePrefix.startsWith('day-')) return;

    await moveDaySlotToUnassigned(
      source.sourcePrefix.substring(4),
      source.sourceSlotId,
    );
  }, [moveDaySlotToUnassigned]);

  const handlePendingSlotReplace = useCallback(async () => {
    if (!pendingDaySlotAssignment) return;

    await assignTaskToDaySlot(
      pendingDaySlotAssignment.date,
      pendingDaySlotAssignment.slotId,
      {
        name: pendingDaySlotAssignment.task.name,
        color: pendingDaySlotAssignment.task.color,
        taskId: pendingDaySlotAssignment.task.id,
      }
    );

    await clearSourceTimelineSlot(pendingDaySlotAssignment.source);
    setPendingDaySlotAssignment(null);
  }, [pendingDaySlotAssignment, assignTaskToDaySlot, clearSourceTimelineSlot]);

  const handlePendingSlotAddSubtask = useCallback(async () => {
    if (!pendingDaySlotAssignment) return;

    await addSubtaskToDaySlot(
      pendingDaySlotAssignment.date,
      pendingDaySlotAssignment.slotId,
      pendingDaySlotAssignment.task,
    );

    await clearSourceTimelineSlot(pendingDaySlotAssignment.source);
    setPendingDaySlotAssignment(null);
  }, [pendingDaySlotAssignment, addSubtaskToDaySlot, clearSourceTimelineSlot]);

  const renderPendingDaySlotAssignmentDialog = () => (
    <AlertDialog open={!!pendingDaySlotAssignment} onOpenChange={(open) => { if (!open) setPendingDaySlotAssignment(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Task already exists in this slot</AlertDialogTitle>
          <AlertDialogDescription>
            Choose whether to replace the existing task or add the dropped task as a subtask.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handlePendingSlotReplace}>
            Replace
          </AlertDialogAction>
          <AlertDialogAction onClick={handlePendingSlotAddSubtask}>
            Add as Subtask
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // ── Mobile Layout ──────────────────────────────────────────────
  if (isMobile) {
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={cn("flex flex-col h-screen bg-background", isApplyingRoutine && "pointer-events-none")}>
          {/* Mobile header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
            <div>
              <h1 className="text-base font-bold text-foreground/80 tracking-tight">Productivity Heatmap</h1>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleUndo}
                disabled={!history.canUndo}
                className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleRedo}
                disabled={!history.canRedo}
                className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="w-4 h-4" />
              </button>
              <button onClick={() => setIsNotesOpen(!isNotesOpen)} className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"><StickyNote className="w-4 h-4" /></button>
              <SettingsModal
                onImportComplete={async () => { await fetchTasks(); await fetchRoutines(); await fetchCalendar(); }}
                refreshNotes={refreshNotes}
              />
            </div>
          </div>

          {/* Mobile content */}
          <div className="flex-1 overflow-auto p-4">
            {mobileTab === 'calendar' && (
              <HeatmapCalendar
                calendar={state.calendar}
                routines={state.routines}
                onDayClick={setSelectedDate}
                selectedDate={selectedDate}
                onCloseDay={() => setSelectedDate(null)}
                onToggleDayTask={toggleDayTask}
                onUpdateDayTask={(date, taskId, name) => updateDayTask(date, taskId, { name })}
                onRemoveDayTask={removeDayTask}
                onAddDayTimeSlot={addDayTimeSlot}
                onDeleteDayTimeSlot={deleteDayTimeSlot}
                onUpdateDaySlotTime={updateDaySlotTime}
                onMoveDaySlotToUnassigned={moveDaySlotToUnassigned}
                onToggleDaySlotTask={toggleDaySlotTask}
                onUpdateDaySlotTaskName={async (date, slotId, name) => { await updateDaySlotTaskName(date, slotId, name); fetchTasks(); }}
                availableTasks={state.quickTasks}
                onAssignTaskToSlot={assignTaskToDaySlot}
            onAddSubtaskToSlot={addSubtaskToDaySlot}
                onRemoveSubtaskFromSlot={removeSubtaskFromDaySlot}
                onUpdateSubtaskPercentagesForSlot={updateDaySubtaskPercentages}
                onApplyRoutine={(date, routine) => {
                  setPendingRoutineDrop({ routine, targetDate: date });
                  setRoutineModalOpen(true);
                }}
                onClearDayTimeline={clearDayTimeline}
                onUpdateDayColor={(date, color) => updateDayColor(date, color, true)}
              />
            )}
            {mobileTab === 'routines' && (
              <RoutinesPanel
                routines={state.routines}
                onAddRoutine={addRoutine}
                onUpdateRoutine={updateRoutine}
                onDeleteRoutine={deleteRoutine}
                onRemoveTaskFromRoutine={removeTaskFromRoutine}
                onAddRoutineTimeSlot={addRoutineTimeSlot}
                onDeleteRoutineTimeSlot={deleteRoutineTimeSlot}
                onUpdateRoutineSlotTime={updateRoutineSlotTime}
                onMoveRoutineSlotToUnassigned={moveRoutineSlotToUnassigned}
                onUpdateRoutineSlotTaskName={async (routineId, slotId, name) => { await updateRoutineSlotTaskName(routineId, slotId, name); fetchTasks(); }}
                availableTasks={state.quickTasks}
                onAssignTaskToRoutineSlot={assignTaskToRoutineSlot}
                onAddSubtaskToRoutineSlot={addSubtaskToRoutineSlot}
                onRemoveSubtaskFromRoutineSlot={removeSubtaskFromRoutineSlot}
                onUpdateRoutineSubtaskPercentages={updateRoutineSubtaskPercentages}
                onClearRoutineTimeline={clearRoutineTimeline}
              />
            )}
            {mobileTab === 'tasks' && (
              <QuickTasksPanel
                tasks={state.quickTasks}
                onAddTask={addQuickTask}
                onUpdateTask={updateQuickTask}
                onDeleteTask={deleteQuickTask}
              />
            )}
            {mobileTab === 'stats' && (
              <WeeklyStatsPanel calendar={state.calendar} routines={state.routines} />
            )}
          </div>

          {/* Mobile bottom nav */}
          <div className="flex border-t border-border bg-card">
            {([
              { key: 'calendar', icon: <Calendar className="w-5 h-5" />, label: 'Calendar' },
              { key: 'routines', icon: <Layers className="w-5 h-5" />, label: 'Routines' },
              { key: 'tasks', icon: <List className="w-5 h-5" />, label: 'Tasks' },
              { key: 'stats', icon: <BarChart3 className="w-5 h-5" />, label: 'Stats' },
            ] as { key: MobileTab; icon: React.ReactNode; label: string }[]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setMobileTab(tab.key)}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors',
                  mobileTab === tab.key
                    ? 'text-primary border-t-2 border-primary -mt-px'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Routine Application Modal */}
          <RoutineApplicationModal
            isOpen={routineModalOpen}
            onClose={() => {
              setRoutineModalOpen(false);
              setPendingRoutineDrop(null);
            }}
            routine={pendingRoutineDrop?.routine || null}
            targetDate={pendingRoutineDrop?.targetDate || null}
          onApply={async (dates) => {
            if (!pendingRoutineDrop) return;
            const routine = pendingRoutineDrop.routine;
            const targetDate = pendingRoutineDrop.targetDate;
            setIsApplyingRoutine(true);
            try {
              if (dates.length === 1) {
                await applyRoutineToDayCloud(dates[0], routine);
              } else {
                await batchApplyRoutine(dates, routine);
              }
              setSelectedDate(targetDate);
            } finally {
              setIsApplyingRoutine(false);
            }
          }}
        />

        {/* Loading overlay during batch operations */}
        {isApplyingRoutine && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 p-8 bg-card rounded-lg border shadow-lg">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-foreground">Syncing routine data...</p>
              <p className="text-xs text-muted-foreground">Please wait while we apply your routine</p>
            </div>
          </div>
        )}

        {isNotesOpen && (
          <div className="fixed inset-0 z-[999] bg-card flex flex-col animate-in slide-in-from-bottom-full duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
              <div className="flex items-center gap-2"><NotebookPen className="w-4 h-4 text-muted-foreground"/><span className="font-semibold text-sm">Weekly Notes</span></div>
              <button onClick={() => setIsNotesOpen(false)} className="p-1 rounded-md hover:bg-secondary text-muted-foreground"><X className="w-5 h-5"/></button>
            </div>
            <div className="flex-1 overflow-auto">
              <WeeklyNotesPanel content={weeklyNoteContent} onUpdateNote={updateNote} isLoading={notesLoading} />
            </div>
          </div>
        )}

        {renderPendingDaySlotAssignmentDialog()}
      </div>
    </DndContext>
  );
  }
  // ── Desktop Layout ─────────────────────────────────────────────
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={cn("min-h-screen bg-background p-4 overflow-hidden relative", isApplyingRoutine && "pointer-events-none")}>
        <div className="absolute top-4 left-4 z-0 flex items-center gap-2">
          <div>
            <h1 className="text-xl font-bold text-foreground/80 tracking-tight">Productivity Heatmap</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Track your daily habits</p>
          </div>
          {/* Undo/Redo */}
          <div className="ml-2 flex items-center gap-2">
            <button
              onClick={handleUndo}
              disabled={!history.canUndo}
              className="p-1.5 rounded-md hover:bg-card transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={!history.canRedo}
              className="p-1.5 rounded-md hover:bg-card transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsNotesOpen(!isNotesOpen)}
              className="p-1.5 rounded-md hover:bg-card transition-colors text-muted-foreground hover:text-foreground"
              title="Toggle Weekly Notes"
            >
              <StickyNote className="w-4 h-4" />
            </button>
            <SettingsModal
              onImportComplete={async () => { await fetchTasks(); await fetchRoutines(); await fetchCalendar(); }}
              refreshNotes={refreshNotes}
            />
          </div>
        </div>

        {/* Routines Window */}
        <FloatingWindow
          title={state.windowTitles.routines}
          icon={<Layers className="w-4 h-4 text-muted-foreground" />}
          defaultPosition={{ x: state.windowPositions.routines.x, y: state.windowPositions.routines.y }}
          defaultSize={{ width: state.windowPositions.routines.width, height: state.windowPositions.routines.height }}
          minWidth={300}
          minHeight={200}
          onPositionChange={(pos) => updateWindowPosition('routines', pos)}
          onSizeChange={(size) => updateWindowPosition('routines', size)}
          onTitleChange={(title) => updateWindowTitle('routines', title)}
          minimized={minimized.routines}
          onMinimizeChange={() => toggleMinimize('routines')}
        >
          <RoutinesPanel
            routines={state.routines}
            onAddRoutine={addRoutine}
            onUpdateRoutine={updateRoutine}
            onDeleteRoutine={deleteRoutine}
            onRemoveTaskFromRoutine={removeTaskFromRoutine}
            onAddRoutineTimeSlot={addRoutineTimeSlot}
            onDeleteRoutineTimeSlot={deleteRoutineTimeSlot}
            onUpdateRoutineSlotTime={updateRoutineSlotTime}
            onMoveRoutineSlotToUnassigned={moveRoutineSlotToUnassigned}
            onUpdateRoutineSlotTaskName={async (routineId, slotId, name) => { await updateRoutineSlotTaskName(routineId, slotId, name); fetchTasks(); }}
            availableTasks={state.quickTasks}
            onAssignTaskToRoutineSlot={assignTaskToRoutineSlot}
            onAddSubtaskToRoutineSlot={addSubtaskToRoutineSlot}
            onRemoveSubtaskFromRoutineSlot={removeSubtaskFromRoutineSlot}
            onUpdateRoutineSubtaskPercentages={updateRoutineSubtaskPercentages}
            onReorderRoutines={reorderRoutines}
            onClearRoutineTimeline={clearRoutineTimeline}
          />
        </FloatingWindow>

        {/* Quick Tasks Window */}
        <FloatingWindow
          title={state.windowTitles.quickTasks}
          icon={<List className="w-4 h-4 text-muted-foreground" />}
          defaultPosition={{ x: state.windowPositions.quickTasks.x, y: state.windowPositions.quickTasks.y }}
          defaultSize={{ width: state.windowPositions.quickTasks.width, height: state.windowPositions.quickTasks.height }}
          minWidth={250}
          minHeight={200}
          onPositionChange={(pos) => updateWindowPosition('quickTasks', pos)}
          onSizeChange={(size) => updateWindowPosition('quickTasks', size)}
          onTitleChange={(title) => updateWindowTitle('quickTasks', title)}
          minimized={minimized.quickTasks}
          onMinimizeChange={() => toggleMinimize('quickTasks')}
        >
          <QuickTasksPanel
            tasks={state.quickTasks}
            onAddTask={addQuickTask}
            onUpdateTask={updateQuickTask}
            onDeleteTask={deleteQuickTask}
          />
        </FloatingWindow>

        {/* Calendar Window */}
        <FloatingWindow
          title={state.windowTitles.calendar}
          icon={<Calendar className="w-4 h-4 text-muted-foreground" />}
          defaultPosition={{ x: state.windowPositions.calendar.x, y: state.windowPositions.calendar.y }}
          defaultSize={{ width: state.windowPositions.calendar.width, height: state.windowPositions.calendar.height }}
          minWidth={400}
          minHeight={400}
          onPositionChange={(pos) => updateWindowPosition('calendar', pos)}
          onSizeChange={(size) => updateWindowPosition('calendar', size)}
          onTitleChange={(title) => updateWindowTitle('calendar', title)}
          minimized={minimized.calendar}
          onMinimizeChange={() => toggleMinimize('calendar')}
        >
          <HeatmapCalendar
            calendar={state.calendar}
            routines={state.routines}
            onDayClick={setSelectedDate}
            selectedDate={selectedDate}
            onCloseDay={() => setSelectedDate(null)}
            onToggleDayTask={toggleDayTask}
            onUpdateDayTask={(date, taskId, name) => updateDayTask(date, taskId, { name })}
            onRemoveDayTask={removeDayTask}
            onAddDayTimeSlot={addDayTimeSlot}
            onDeleteDayTimeSlot={deleteDayTimeSlot}
            onUpdateDaySlotTime={updateDaySlotTime}
            onMoveDaySlotToUnassigned={moveDaySlotToUnassigned}
            onToggleDaySlotTask={toggleDaySlotTask}
            onUpdateDaySlotTaskName={async (date, slotId, name) => { await updateDaySlotTaskName(date, slotId, name); fetchTasks(); }}
            availableTasks={state.quickTasks}
            onAssignTaskToSlot={assignTaskToDaySlot}
            onAddSubtaskToSlot={addSubtaskToDaySlot}
            onRemoveSubtaskFromSlot={removeSubtaskFromDaySlot}
            onUpdateSubtaskPercentagesForSlot={updateDaySubtaskPercentages}
            onApplyRoutine={(date, routine) => {
              setPendingRoutineDrop({ routine, targetDate: date });
              setRoutineModalOpen(true);
            }}
            onClearDayTimeline={clearDayTimeline}
            onUpdateDayColor={(date, color) => updateDayColor(date, color, true)}
          />
        </FloatingWindow>

        {isNotesOpen && (
          <FloatingWindow
            title={state.windowTitles.weeklyNotes}
            icon={<NotebookPen className="w-4 h-4 text-muted-foreground" />}
            defaultPosition={{ x: state.windowPositions.weeklyNotes.x, y: state.windowPositions.weeklyNotes.y }}
            defaultSize={{ width: state.windowPositions.weeklyNotes.width, height: state.windowPositions.weeklyNotes.height }}
            minWidth={250}
            minHeight={220}
            onPositionChange={(pos) => updateWindowPosition('weeklyNotes', pos)}
            onSizeChange={(size) => updateWindowPosition('weeklyNotes', size)}
            onTitleChange={(title) => updateWindowTitle('weeklyNotes', title)}
            minimized={minimized.weeklyNotes}
            onMinimizeChange={() => toggleMinimize('weeklyNotes')}
            headerActions={
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setIsNotesOpen(false); }}
                className="no-drag p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            }
          >
            <WeeklyNotesPanel
              content={weeklyNoteContent}
              onUpdateNote={updateNote}
              isLoading={notesLoading}
            />
          </FloatingWindow>
        )}

        {/* Tools Window (formerly Stats) */}
        <FloatingWindow
          title="Tools"
          icon={<Wrench className="w-4 h-4 text-muted-foreground" />}
          defaultPosition={{ x: state.windowPositions.routines.x, y: state.windowPositions.routines.y + state.windowPositions.routines.height + 20 }}
          defaultSize={{ width: 320, height: 420 }}
          minWidth={260}
          minHeight={200}
          minimized={minimized.stats}
          onMinimizeChange={() => toggleMinimize('stats')}
        >
          <WeeklyStatsPanel calendar={state.calendar} routines={state.routines} />
        </FloatingWindow>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeId && activeDragData?.type === 'task' && (
            <div
              className="px-3 py-1.5 rounded-md text-sm font-medium shadow-lg"
              style={{
                backgroundColor: getColorValue(activeDragData.color!),
                color: getContrastColor(activeDragData.color!),
              }}
            >
              {activeDragData.name}
            </div>
          )}
          {activeId && activeDragData?.type === 'routine' && (
            <div className="px-3 py-2 bg-card border border-border rounded-lg shadow-lg">
              <span className="text-sm font-medium">{activeDragData.routine?.name}</span>
              <span className="text-xs text-muted-foreground ml-2">
                ({(activeDragData.routine?.tasks.length || 0) + ((activeDragData.routine?.timeSlots || []).filter(s => s.task).length || 0)} tasks)
              </span>
            </div>
          )}
        </DragOverlay>

        {/* Routine Application Modal */}
        <RoutineApplicationModal
          isOpen={routineModalOpen}
          onClose={() => {
            setRoutineModalOpen(false);
            setPendingRoutineDrop(null);
          }}
          routine={pendingRoutineDrop?.routine || null}
          targetDate={pendingRoutineDrop?.targetDate || null}
          onApply={async (dates) => {
            if (!pendingRoutineDrop) return;
            const routine = pendingRoutineDrop.routine;
            const targetDate = pendingRoutineDrop.targetDate;
            setIsApplyingRoutine(true);
            try {
              if (dates.length === 1) {
                await applyRoutineToDayCloud(dates[0], routine);
              } else {
                await batchApplyRoutine(dates, routine);
              }
              setSelectedDate(targetDate);
            } finally {
              setIsApplyingRoutine(false);
            }
          }}
        />

        {/* Loading overlay during batch operations */}
        {isApplyingRoutine && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 p-8 bg-card rounded-lg border shadow-lg">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium text-foreground">Syncing routine data...</p>
              <p className="text-xs text-muted-foreground">Please wait while we apply your routine</p>
            </div>
          </div>
        )}

        {renderPendingDaySlotAssignmentDialog()}
      </div>
    </DndContext>
  );
}
