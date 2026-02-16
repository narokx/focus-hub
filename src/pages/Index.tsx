import React, { useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, pointerWithin } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Calendar, Layers, List } from 'lucide-react';
import { FloatingWindow } from '@/components/FloatingWindow';
import { HeatmapCalendar } from '@/components/HeatmapCalendar';
import { QuickTasksPanel } from '@/components/QuickTasksPanel';
import { RoutinesPanel } from '@/components/RoutinesPanel';
import { SettingsModal } from '@/components/SettingsModal';
import { useAppState } from '@/hooks/useAppState';
import { TaskColor, getColorValue, getContrastColor } from '@/types';

export default function Index() {
  const {
    state,
    addQuickTask, updateQuickTask, deleteQuickTask, reorderQuickTasks,
    addRoutine, updateRoutine, deleteRoutine,
    addTaskToRoutine, removeTaskFromRoutine,
    assignTaskToRoutineSlot, moveRoutineSlotToUnassigned,
    addRoutineTimeSlot, deleteRoutineTimeSlot, updateRoutineSlotTime, updateRoutineSlotTaskName,
    addTaskToDay, toggleDayTask, updateDayTask, removeDayTask,
    assignTaskToDaySlot, toggleDaySlotTask, moveDaySlotToUnassigned,
    addDayTimeSlot, deleteDayTimeSlot, updateDaySlotTime, updateDaySlotTaskName,
    moveSlotToSlot,
    applyRoutineToDay,
    updateWindowPosition, updateWindowTitle,
  } = useAppState();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragData, setActiveDragData] = useState<{
    type: string;
    name?: string;
    color?: TaskColor;
    routine?: typeof state.routines[0];
  } | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setActiveDragData(event.active.data.current as any);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveDragData(null);

    if (!over) return;

    const activeData = active.data.current as any;
    const overData = over.data.current as any;

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

    // Handle routine drag to calendar cell
    if (activeData?.type === 'routine' && overData?.type === 'day') {
      applyRoutineToDay(overData.date, activeData.routine);
      setSelectedDate(overData.date);
      return;
    }

    // Handle slot-to-slot drag (task moving between time slots)
    if (activeData?.type === 'task' && activeData?.source === 'timeslot' && overData?.type === 'timeslot') {
      const { sourcePrefix, sourceSlotId } = activeData;
      const { prefix: targetPrefix, slotId: targetSlotId } = overData;
      // Don't move to same slot
      if (sourcePrefix === targetPrefix && sourceSlotId === targetSlotId) return;
      moveSlotToSlot(sourcePrefix, sourceSlotId, targetPrefix, targetSlotId);
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

      // If source is a timeslot, move it to unassigned (clear slot)
      if (activeData.source === 'timeslot') {
        if (prefix === activeData.sourcePrefix) {
          // Same context: move slot to unassigned
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
      // If from a timeslot, clear the source slot
      if (activeData.source === 'timeslot' && activeData.sourcePrefix && activeData.sourceSlotId) {
        if (activeData.sourcePrefix.startsWith('day-')) {
          const srcDate = activeData.sourcePrefix.substring(4);
          // We need to clear the slot and add to the new day
          // The task was already added above via addTaskToDay
          // Clear source slot
          assignTaskToDaySlot(srcDate, activeData.sourceSlotId, { name: '', color: '' }); // Hmm, need a clear function
          // Actually let's use moveDaySlotToUnassigned then move
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

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="min-h-screen bg-background p-4 overflow-hidden relative">
        <div className="absolute top-4 left-4 z-0 flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground/80 tracking-tight">Productivity Heatmap</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Track your daily habits</p>
          </div>
          <SettingsModal />
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
            onUpdateRoutineSlotTaskName={updateRoutineSlotTaskName}
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
        >
          <HeatmapCalendar
            calendar={state.calendar}
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
            onUpdateDaySlotTaskName={updateDaySlotTaskName}
          />
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
      </div>
    </DndContext>
  );
}
