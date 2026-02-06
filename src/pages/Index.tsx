import React, { useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, pointerWithin } from '@dnd-kit/core';
import { Calendar, Layers, List } from 'lucide-react';
import { FloatingWindow } from '@/components/FloatingWindow';
import { HeatmapCalendar } from '@/components/HeatmapCalendar';
import { QuickTasksPanel } from '@/components/QuickTasksPanel';
import { RoutinesPanel } from '@/components/RoutinesPanel';
import { TaskChip } from '@/components/TaskChip';
import { useAppState } from '@/hooks/useAppState';
import { TaskColor, TASK_COLOR_MAP, getContrastColor } from '@/types';

export default function Index() {
  const {
    state,
    addQuickTask,
    updateQuickTask,
    deleteQuickTask,
    addRoutine,
    updateRoutine,
    deleteRoutine,
    addTaskToRoutine,
    removeTaskFromRoutine,
    getDayData,
    addTaskToDay,
    toggleDayTask,
    updateDayTask,
    removeDayTask,
    applyRoutineToDay,
    updateWindowPosition,
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

    // Handle routine drag to calendar
    if (activeData?.type === 'routine' && overData?.type === 'day') {
      const routine = activeData.routine;
      const date = overData.date;
      applyRoutineToDay(date, routine);
      setSelectedDate(date);
      return;
    }

    // Handle task drag to calendar day
    if (activeData?.type === 'task' && overData?.type === 'day') {
      const date = overData.date;
      addTaskToDay(date, {
        name: activeData.name,
        color: activeData.color,
        taskId: activeData.taskId,
      });
      setSelectedDate(date);
      return;
    }

    // Handle task drag to routine
    if (activeData?.type === 'task' && overData?.type === 'routine-drop') {
      const routineId = overData.routineId;
      const task = {
        id: activeData.taskId || active.id,
        name: activeData.name,
        color: activeData.color,
      };
      addTaskToRoutine(routineId, task as any);
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
        {/* App title */}
        <div className="absolute top-4 left-4 z-0">
          <h1 className="text-xl font-bold text-foreground/80 tracking-tight">
            Productivity Heatmap
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track your daily habits
          </p>
        </div>

        {/* Floating Windows */}
        <FloatingWindow
          title="Routines"
          icon={<Layers className="w-4 h-4 text-muted-foreground" />}
          defaultPosition={{ x: state.windowPositions.routines.x, y: state.windowPositions.routines.y }}
          defaultSize={{ width: state.windowPositions.routines.width, height: state.windowPositions.routines.height }}
          minWidth={250}
          minHeight={200}
          onPositionChange={(pos) => updateWindowPosition('routines', pos)}
          onSizeChange={(size) => updateWindowPosition('routines', size)}
        >
          <RoutinesPanel
            routines={state.routines}
            onAddRoutine={addRoutine}
            onUpdateRoutine={updateRoutine}
            onDeleteRoutine={deleteRoutine}
            onRemoveTaskFromRoutine={removeTaskFromRoutine}
          />
        </FloatingWindow>

        <FloatingWindow
          title="Quick Tasks"
          icon={<List className="w-4 h-4 text-muted-foreground" />}
          defaultPosition={{ x: state.windowPositions.quickTasks.x, y: state.windowPositions.quickTasks.y }}
          defaultSize={{ width: state.windowPositions.quickTasks.width, height: state.windowPositions.quickTasks.height }}
          minWidth={250}
          minHeight={200}
          onPositionChange={(pos) => updateWindowPosition('quickTasks', pos)}
          onSizeChange={(size) => updateWindowPosition('quickTasks', size)}
        >
          <QuickTasksPanel
            tasks={state.quickTasks}
            onAddTask={addQuickTask}
            onUpdateTask={updateQuickTask}
            onDeleteTask={deleteQuickTask}
          />
        </FloatingWindow>

        <FloatingWindow
          title="Calendar"
          icon={<Calendar className="w-4 h-4 text-muted-foreground" />}
          defaultPosition={{ x: state.windowPositions.calendar.x, y: state.windowPositions.calendar.y }}
          defaultSize={{ width: state.windowPositions.calendar.width, height: state.windowPositions.calendar.height }}
          minWidth={400}
          minHeight={400}
          onPositionChange={(pos) => updateWindowPosition('calendar', pos)}
          onSizeChange={(size) => updateWindowPosition('calendar', size)}
        >
          <HeatmapCalendar
            calendar={state.calendar}
            onDayClick={setSelectedDate}
            onToggleTask={toggleDayTask}
            onUpdateTask={(date, taskId, name) => updateDayTask(date, taskId, { name })}
            onRemoveTask={removeDayTask}
            selectedDate={selectedDate}
            onCloseDay={() => setSelectedDate(null)}
          />
        </FloatingWindow>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeId && activeDragData?.type === 'task' && (
            <div
              className="px-3 py-1.5 rounded-md text-sm font-medium shadow-lg"
              style={{
                backgroundColor: TASK_COLOR_MAP[activeDragData.color!],
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
                ({activeDragData.routine?.tasks.length} tasks)
              </span>
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
