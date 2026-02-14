import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus, Trash2, X } from 'lucide-react';
import { TimeSlot, TaskColor, TASK_COLOR_MAP, getContrastColor } from '@/types';
import { TaskChip } from './TaskChip';
import { cn } from '@/lib/utils';

interface TimelineViewProps {
  timeSlots: TimeSlot[];
  unassignedTasks: Array<{ id: string; taskId?: string; name: string; color: TaskColor; completed?: boolean }>;
  droppablePrefix: string;
  showCompleted?: boolean;
  onAddTimeSlot: () => void;
  onDeleteTimeSlot: (slotId: string) => void;
  onUpdateSlotTime: (slotId: string, field: 'startTime' | 'endTime', value: string) => void;
  onRemoveTaskFromSlot: (slotId: string) => void;
  onToggleSlotTask?: (slotId: string) => void;
  onToggleUnassigned?: (taskId: string) => void;
  onRemoveUnassigned: (taskId: string) => void;
  onUpdateUnassignedName?: (taskId: string, name: string) => void;
}

function TimeSlotRow({
  slot,
  droppablePrefix,
  showCompleted,
  onDeleteTimeSlot,
  onUpdateSlotTime,
  onRemoveTaskFromSlot,
  onToggleSlotTask,
}: {
  slot: TimeSlot;
  droppablePrefix: string;
  showCompleted?: boolean;
  onDeleteTimeSlot: (slotId: string) => void;
  onUpdateSlotTime: (slotId: string, field: 'startTime' | 'endTime', value: string) => void;
  onRemoveTaskFromSlot: (slotId: string) => void;
  onToggleSlotTask?: (slotId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${droppablePrefix}-slot-${slot.id}`,
    data: { type: 'timeslot', prefix: droppablePrefix, slotId: slot.id },
  });

  const textColor = slot.task ? getContrastColor(slot.task.color) : undefined;

  return (
    <div className="flex items-center gap-1 group">
      {/* Time labels */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <input
          type="text"
          value={slot.startTime}
          onChange={(e) => onUpdateSlotTime(slot.id, 'startTime', e.target.value)}
          className="w-[72px] text-[10px] text-muted-foreground bg-transparent border border-transparent hover:border-input focus:border-input rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-[10px] text-muted-foreground">–</span>
        <input
          type="text"
          value={slot.endTime}
          onChange={(e) => onUpdateSlotTime(slot.id, 'endTime', e.target.value)}
          className="w-[72px] text-[10px] text-muted-foreground bg-transparent border border-transparent hover:border-input focus:border-input rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Drop zone for task */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 min-h-[32px] rounded-md border border-dashed border-border/50 flex items-center px-2 transition-all',
          isOver && 'border-primary bg-accent/40 scale-[1.02]',
          slot.task && 'border-transparent'
        )}
      >
        {slot.task ? (
          <div
            className="flex items-center gap-2 w-full px-2 py-1 rounded text-sm font-medium"
            style={{
              backgroundColor: TASK_COLOR_MAP[slot.task.color],
              color: textColor,
            }}
          >
            {showCompleted && onToggleSlotTask && (
              <button
                onClick={() => onToggleSlotTask(slot.id)}
                className={cn(
                  'w-4 h-4 rounded border-2 flex-shrink-0 transition-colors',
                  textColor === 'white' ? 'border-white/70' : 'border-black/40',
                  slot.task.completed && (textColor === 'white' ? 'bg-white/30' : 'bg-black/20')
                )}
              >
                {slot.task.completed && (
                  <svg viewBox="0 0 12 12" className="w-full h-full">
                    <path d="M2.5 6L5 8.5L9.5 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )}
            <span className={cn('flex-1 truncate', slot.task.completed && 'line-through opacity-60')}>
              {slot.task.name}
            </span>
            <button
              onClick={() => onRemoveTaskFromSlot(slot.id)}
              className={cn(
                'w-4 h-4 flex items-center justify-center rounded-full opacity-60 hover:opacity-100 transition-opacity',
                textColor === 'white' ? 'hover:bg-white/20' : 'hover:bg-black/10'
              )}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/50 italic">Drop task here</span>
        )}
      </div>

      {/* Delete row */}
      <button
        onClick={() => onDeleteTimeSlot(slot.id)}
        className="p-0.5 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function UnassignedZone({
  tasks,
  droppablePrefix,
  showCompleted,
  onToggle,
  onRemove,
  onUpdateName,
}: {
  tasks: Array<{ id: string; taskId?: string; name: string; color: TaskColor; completed?: boolean }>;
  droppablePrefix: string;
  showCompleted?: boolean;
  onToggle?: (taskId: string) => void;
  onRemove: (taskId: string) => void;
  onUpdateName?: (taskId: string, name: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${droppablePrefix}-unassigned`,
    data: { type: 'unassigned-zone', prefix: droppablePrefix },
  });

  return (
    <div className="border-t border-border/50 pt-3 mt-3">
      <h4 className="text-xs font-medium text-muted-foreground mb-2">Unassigned Tasks</h4>
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-wrap gap-1.5 min-h-[36px] p-2 rounded-lg border border-dashed border-border/40 transition-all',
          isOver && 'border-primary bg-accent/30'
        )}
      >
        {tasks.length === 0 ? (
          <span className="text-[10px] text-muted-foreground/50 italic w-full text-center py-1">
            Drop tasks here or drag to a time slot
          </span>
        ) : (
          tasks.map(task => (
            <TaskChip
              key={task.id}
              id={`${droppablePrefix}-unassigned-${task.id}`}
              name={task.name}
              color={task.color}
              draggable={true}
              dragData={{
                taskId: task.taskId || task.id,
                source: 'unassigned',
                sourcePrefix: droppablePrefix,
                unassignedTaskId: task.id,
              }}
              editable={!!onUpdateName}
              onNameChange={onUpdateName ? (name) => onUpdateName(task.id, name) : undefined}
              completed={task.completed}
              onToggleComplete={showCompleted && onToggle ? () => onToggle(task.id) : undefined}
              onDelete={() => onRemove(task.id)}
              showDelete
            />
          ))
        )}
      </div>
    </div>
  );
}

export function TimelineView({
  timeSlots,
  unassignedTasks,
  droppablePrefix,
  showCompleted = false,
  onAddTimeSlot,
  onDeleteTimeSlot,
  onUpdateSlotTime,
  onRemoveTaskFromSlot,
  onToggleSlotTask,
  onToggleUnassigned,
  onRemoveUnassigned,
  onUpdateUnassignedName,
}: TimelineViewProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* Timeline slots */}
      <div className="flex flex-col gap-1">
        {timeSlots.map(slot => (
          <TimeSlotRow
            key={slot.id}
            slot={slot}
            droppablePrefix={droppablePrefix}
            showCompleted={showCompleted}
            onDeleteTimeSlot={onDeleteTimeSlot}
            onUpdateSlotTime={onUpdateSlotTime}
            onRemoveTaskFromSlot={onRemoveTaskFromSlot}
            onToggleSlotTask={onToggleSlotTask}
          />
        ))}
      </div>

      {/* Add row button */}
      <button
        onClick={onAddTimeSlot}
        className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-colors w-fit"
      >
        <Plus className="w-3 h-3" />
        <span>Add time slot</span>
      </button>

      {/* Unassigned buffer zone */}
      <UnassignedZone
        tasks={unassignedTasks}
        droppablePrefix={droppablePrefix}
        showCompleted={showCompleted}
        onToggle={onToggleUnassigned}
        onRemove={onRemoveUnassigned}
        onUpdateName={onUpdateUnassignedName}
      />
    </div>
  );
}
