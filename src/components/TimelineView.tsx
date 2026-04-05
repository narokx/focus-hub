import React, { useState, useRef, useCallback } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { Plus, Trash2, X, Pencil, FileText, Star, Layers, Clock3, Lock, Unlock } from 'lucide-react';
import { QuickTask, SubtaskData, TimeSlot, TaskColor, getColorValue, parseTimeTo24h } from '@/types';
import { TaskChip } from './TaskChip';
import { TaskNotesModal } from './TaskNotesModal';
import { useTaskNote } from '@/hooks/useTaskNote';
import { TaskDetailsModal } from './TaskDetailsModal';
import { TaskPickerModal } from './TaskPickerModal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toTaskNoteKey } from '@/lib/taskNoteKey';
import { cn, getContrastColor } from '@/lib/utils';
import { useEscapeStack } from '@/hooks/useEscapeStack';

function getSlotDurationMinutes(startTime: string, endTime: string): number {
  const s = parseTimeTo24h(startTime);
  const e = parseTimeTo24h(endTime);
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60; // handle overnight
  return diff;
}

function getDurationScale(minutes: number): number {
  const heightPercent = Math.max(100, Math.min(250, 100 + ((minutes - 30) / 150) * 150));
  return heightPercent / 100;
}

const PICKER_HOURS = Array.from({ length: 24 }, (_, idx) => idx.toString().padStart(2, '0'));
const PICKER_MINUTES = Array.from({ length: 60 }, (_, idx) => idx.toString().padStart(2, '0'));

function TimeRangePickerField({
  startValue,
  endValue,
  onChange,
}: {
  startValue: string;
  endValue: string;
  onChange: (field: 'startTime' | 'endTime', value: string) => void;
}) {
  const normalizedStart = parseTimeTo24h(startValue);
  const normalizedEnd = parseTimeTo24h(endValue);
  const [open, setOpen] = useState(false);
  const [activeField, setActiveField] = useState<'startTime' | 'endTime'>('startTime');

  const activeValue = activeField === 'startTime' ? normalizedStart : normalizedEnd;
  const [hour, minute] = activeValue.split(':');

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setActiveField('startTime');
    }
  };

  useEscapeStack(open, () => setOpen(false));

  const updatePart = (part: 'hour' | 'minute', value: string) => {
    const [currentHour, currentMinute] = activeValue.split(':');
    const nextHour = part === 'hour' ? value : currentHour;
    const nextMinute = part === 'minute' ? value : currentMinute;
    const nextTime = `${nextHour}:${nextMinute}`;

    onChange(activeField, nextTime);

    if (activeField === 'startTime') {
      setActiveField('endTime');
    } else {
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 text-[10px] text-muted-foreground bg-transparent border border-transparent hover:border-input focus:border-input rounded px-1 py-0 focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="Open time range picker"
        >
          <span>{normalizedStart} - {normalizedEnd}</span>
          <Clock3 className="w-2.5 h-2.5 text-muted-foreground/70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2 space-y-2">
        <div className="flex gap-1">
          <button
            type="button"
            className={cn(
              'px-2 py-1 rounded text-xs border',
              activeField === 'startTime' ? 'bg-accent border-primary text-foreground' : 'border-input text-muted-foreground'
            )}
            onClick={() => setActiveField('startTime')}
          >
            Start
          </button>
          <button
            type="button"
            className={cn(
              'px-2 py-1 rounded text-xs border',
              activeField === 'endTime' ? 'bg-accent border-primary text-foreground' : 'border-input text-muted-foreground'
            )}
            onClick={() => setActiveField('endTime')}
          >
            End
          </button>
        </div>

        <div className="flex gap-2">
          <select
            className="h-28 w-14 bg-background border border-input rounded text-xs"
            value={hour}
            onChange={(e) => updatePart('hour', e.target.value)}
            size={6}
          >
            {PICKER_HOURS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <select
            className="h-28 w-14 bg-background border border-input rounded text-xs"
            value={minute}
            onChange={(e) => updatePart('minute', e.target.value)}
            size={6}
          >
            {PICKER_MINUTES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </PopoverContent>
    </Popover>
  );
}


interface TimelineViewProps {
  timeSlots: TimeSlot[];
  unassignedTasks: Array<{ id: string; taskId?: string; name: string; color: TaskColor; completed?: boolean }>;
  droppablePrefix: string;
  showCompleted?: boolean;
  onAddTimeSlot: () => void;
  onDeleteTimeSlot: (slotId: string) => void;
  onUpdateSlotTime: (slotId: string, field: 'startTime' | 'endTime', value: string) => void;
  onToggleSlotLock?: (slotId: string) => void;
  onRemoveTaskFromSlot: (slotId: string) => void;
  onToggleSlotTask?: (slotId: string) => void;
  onToggleUnassigned?: (taskId: string) => void;
  onRemoveUnassigned: (taskId: string) => void;
  onUpdateUnassignedName?: (taskId: string, name: string) => void;
  onUpdateSlotTaskName?: (slotId: string, name: string) => void;
  availableTasks?: QuickTask[];
  onAddSubtask?: (slotId: string, task: QuickTask) => void;
  onRemoveSubtask?: (slotId: string, subtaskIdToRemove: string) => Promise<void> | void;
  onUpdateSubtaskPercentages?: (slotId: string, updatedSubtasks: SubtaskData[]) => Promise<void> | void;
  timeColumnWidth?: number;
  onTimeColumnWidthChange?: (width: number) => void;
  onEmptySlotClick?: (slotId: string) => void;
}

function DraggableSlotTask({
  slot,
  droppablePrefix,
  showCompleted,
  onRemoveTaskFromSlot,
  onToggleSlotTask,
  onUpdateSlotTaskName,
  availableTasks,
  onAddSubtask,
  onRemoveSubtask,
  onUpdateSubtaskPercentages,
}: {
  slot: TimeSlot;
  droppablePrefix: string;
  showCompleted?: boolean;
  onRemoveTaskFromSlot: (slotId: string) => void;
  onToggleSlotTask?: (slotId: string) => void;
  onUpdateSlotTaskName?: (slotId: string, name: string) => void;
  availableTasks?: QuickTask[];
  onAddSubtask?: (slotId: string, task: QuickTask) => void;
  onRemoveSubtask?: (slotId: string, subtaskIdToRemove: string) => Promise<void> | void;
  onUpdateSubtaskPercentages?: (slotId: string, updatedSubtasks: SubtaskData[]) => Promise<void> | void;
}) {
  const task = slot.task!;
  const [isEditing, setIsEditing] = React.useState(false);
  const [editName, setEditName] = React.useState(task.name);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [isPickerOpen, setIsPickerOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const noteId = toTaskNoteKey(task.taskId || task.id) || `${slot.id}-${task.taskId || task.id}`;
  const { note } = useTaskNote(noteId);
  const hasNotes = !!note?.trim();

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${droppablePrefix}-slottask-${slot.id}`,
    data: {
      type: 'task',
      name: task.name,
      color: task.color,
      taskId: task.taskId,
      source: 'timeslot',
      sourcePrefix: droppablePrefix,
      sourceSlotId: slot.id,
    },
    disabled: isEditing,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const textColor = getContrastColor(task.color);
  const bgColor = getColorValue(task.color);
  const slotDurationMinutes = getSlotDurationMinutes(slot.startTime, slot.endTime);
  const subtasks = task.subtasks || [];
  const subtotal = subtasks.reduce((sum, st) => sum + Math.max(0, Math.min(100, st.percentage || 0)), 0);
  const parentPercentage = Math.max(0, 100 - Math.min(100, subtotal));
  const gradientSegments: string[] = [];
  let currentStop = 0;

  if (parentPercentage > 0) {
    gradientSegments.push(`${bgColor} ${currentStop}% ${currentStop + parentPercentage}%`);
    currentStop += parentPercentage;
  }

  subtasks.forEach((subtask, index) => {
    const normalizedPercentage = Math.max(0, Math.min(100, subtask.percentage || 0));
    const isLast = index === subtasks.length - 1;
    const nextStop = isLast ? 100 : Math.min(100, currentStop + normalizedPercentage);
    if (nextStop > currentStop) {
      gradientSegments.push(`${getColorValue(subtask.color)} ${currentStop}% ${nextStop}%`);
      currentStop = nextStop;
    }
  });

  const slotBackground = gradientSegments.length > 0 ? `linear-gradient(90deg, ${gradientSegments.join(', ')})` : bgColor;
  const isTempSlot = typeof slot.id === 'string' && slot.id.startsWith('ts-');
  const showActions = !isEditing && (hovered || isTouchDevice || isPickerOpen) && !isTempSlot;

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (editName.trim() && editName !== task.name && onUpdateSlotTaskName) {
      onUpdateSlotTaskName(slot.id, editName.trim());
    }
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={{ ...style, background: slotBackground, color: textColor }}
        className={cn(
          'flex items-center gap-2 w-full px-2 py-1 rounded text-sm font-medium cursor-grab active:cursor-grabbing',
          isDragging && 'opacity-50',
          isTempSlot && 'animate-pulse opacity-80'
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          if (isDragging || isEditing || isTempSlot) return;
          if ((e.target as HTMLElement).closest('button, input, [role="menuitem"]')) return;
          if (onRemoveSubtask && onUpdateSubtaskPercentages) setDetailsOpen(true);
        }}
        {...attributes}
        {...listeners}
      >
        {/* Star indicator */}
        {hasNotes && (
          <Star className="w-3 h-3 flex-shrink-0 fill-current opacity-80" />
        )}

        {showCompleted && onToggleSlotTask && !isTempSlot && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSlotTask(slot.id); }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'w-4 h-4 rounded border-2 flex-shrink-0 transition-colors',
              textColor === '#ffffff' ? 'border-white/70' : 'border-black/40',
              task.completed && (textColor === '#ffffff' ? 'bg-white/30' : 'bg-black/20')
            )}
          >
            {task.completed && (
              <svg viewBox="0 0 12 12" className="w-full h-full">
                <path d="M2.5 6L5 8.5L9.5 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleBlur();
              if (e.key === 'Escape') { setIsEditing(false); setEditName(task.name); }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent min-w-0 text-inherit outline-none"
            style={{ color: 'inherit' }}
          />
        ) : (
          <span
            className={cn(
              'flex-1 truncate',
              task.completed && 'line-through opacity-60'
            )}
          >
            {task.subtasks && task.subtasks.length > 0
              ? `${task.name} / ${task.subtasks.map(st => st.name).join(' / ')}`
              : task.name}
          </span>
        )}

        {/* Pencil edit icon */}
        {showActions && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
              setEditName(task.name);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'w-4 h-4 flex items-center justify-center rounded-full opacity-70 hover:opacity-100 transition-opacity flex-shrink-0',
              textColor === '#ffffff' ? 'hover:bg-white/20' : 'hover:bg-black/10'
            )}
            title="Rename task"
          >
            <Pencil className="w-2.5 h-2.5" />
          </button>
        )}

        {/* Notes icon */}
        {showActions && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setNotesOpen(true);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'w-4 h-4 flex items-center justify-center rounded-full opacity-70 hover:opacity-100 transition-opacity flex-shrink-0',
              textColor === '#ffffff' ? 'hover:bg-white/20' : 'hover:bg-black/10'
            )}
            title="Notes"
          >
            <FileText className="w-2.5 h-2.5" />
          </button>
        )}

        {showActions && onAddSubtask && (
          <button
            onClick={(e) => { e.stopPropagation(); setIsPickerOpen(true); }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'w-4 h-4 flex items-center justify-center rounded-full opacity-70 hover:opacity-100 transition-opacity flex-shrink-0',
              textColor === '#ffffff' ? 'hover:bg-white/20' : 'hover:bg-black/10'
            )}
            title="Add subtask"
          >
            <Layers className="w-2.5 h-2.5" />
          </button>
        )}

        {!isTempSlot && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveTaskFromSlot(slot.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            'w-4 h-4 flex items-center justify-center rounded-full opacity-60 hover:opacity-100 transition-opacity flex-shrink-0',
            textColor === '#ffffff' ? 'hover:bg-white/20' : 'hover:bg-black/10'
          )}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {detailsOpen && onRemoveSubtask && onUpdateSubtaskPercentages && (
        <TaskDetailsModal
          task={task}
          slotId={slot.id}
          slotDurationMinutes={slotDurationMinutes}
          onRemoveSubtask={onRemoveSubtask}
          onUpdateSubtaskPercentages={onUpdateSubtaskPercentages}
          onClose={() => setDetailsOpen(false)}
        />
      )}

      {isPickerOpen && availableTasks && onAddSubtask && (
        <TaskPickerModal
          tasks={availableTasks}
          onSelect={(task) => {
            if (!task) return;
            onAddSubtask(slot.id, task);
            setIsPickerOpen(false);
          }}
          onClose={() => setIsPickerOpen(false)}
        />
      )}

      {notesOpen && (
        <TaskNotesModal
          taskId={noteId}
          taskName={task.name}
          taskColor={bgColor}
          onClose={() => setNotesOpen(false)}
        />
      )}
    </>
  );
}

function TimeSlotRow({
  slot,
  droppablePrefix,
  showCompleted,
  onDeleteTimeSlot,
  onUpdateSlotTime,
  onToggleSlotLock,
  onRemoveTaskFromSlot,
  onToggleSlotTask,
  onUpdateSlotTaskName,
  availableTasks,
  onAddSubtask,
  onRemoveSubtask,
  onUpdateSubtaskPercentages,
  timeColumnWidth,
  onEmptySlotClick,
  slotIndex,
}: {
  slot: TimeSlot;
  droppablePrefix: string;
  showCompleted?: boolean;
  onDeleteTimeSlot: (slotId: string) => void;
  onUpdateSlotTime: (slotId: string, field: 'startTime' | 'endTime', value: string) => void;
  onToggleSlotLock?: (slotId: string) => void;
  onRemoveTaskFromSlot: (slotId: string) => void;
  onToggleSlotTask?: (slotId: string) => void;
  onUpdateSlotTaskName?: (slotId: string, name: string) => void;
  availableTasks?: QuickTask[];
  onAddSubtask?: (slotId: string, task: QuickTask) => void;
  onRemoveSubtask?: (slotId: string, subtaskIdToRemove: string) => Promise<void> | void;
  onUpdateSubtaskPercentages?: (slotId: string, updatedSubtasks: SubtaskData[]) => Promise<void> | void;
  timeColumnWidth: number;
  onEmptySlotClick?: (slotId: string) => void;
  slotIndex: number;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${droppablePrefix}-slot-${slot.id}`,
    data: { type: 'timeslot', prefix: droppablePrefix, slotId: slot.id },
  });

  const durationMin = getSlotDurationMinutes(slot.startTime, slot.endTime);
  const scale = slot.task ? getDurationScale(durationMin) : 1;
  const baseHeight = 32; // px, standard min-height
  const scaledHeight = Math.round(baseHeight * scale);

  return (
    <div className="flex items-stretch gap-1 group">
      <div
        className="flex items-center gap-1 flex-shrink-0 min-w-0"
        style={{ width: timeColumnWidth, minWidth: timeColumnWidth }}
      >
        <div className="flex items-center justify-end text-[10px] leading-none text-muted-foreground/80 w-7 min-w-7 pr-0.5">
          #{slotIndex + 1}
        </div>
        <button
          type="button"
          onClick={() => onToggleSlotLock?.(slot.id)}
          className="p-0.5 text-muted-foreground hover:text-foreground rounded flex items-center justify-center"
          title={slot.locked ? 'Unlock slot (auto-sort by time)' : 'Lock slot position'}
          aria-label={slot.locked ? 'Unlock slot' : 'Lock slot'}
        >
          {slot.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </button>
        <div className="flex flex-col min-w-0 w-full">
          <TimeRangePickerField
            startValue={slot.startTime}
            endValue={slot.endTime}
            onChange={(field, value) => onUpdateSlotTime(slot.id, field, value)}
          />
        </div>
      </div>

      <div
        ref={setNodeRef}
        style={{ minHeight: `${scaledHeight}px` }}
        className={cn(
          'flex-1 rounded-md border border-dashed border-border/50 flex items-stretch px-2 transition-all',
          isOver && 'border-primary bg-accent/40 scale-[1.02]',
          slot.task && 'border-transparent p-0'
        )}
      >
        {slot.task ? (
          <DraggableSlotTask
            slot={slot}
            droppablePrefix={droppablePrefix}
            showCompleted={showCompleted}
            onRemoveTaskFromSlot={onRemoveTaskFromSlot}
            onToggleSlotTask={onToggleSlotTask}
            onUpdateSlotTaskName={onUpdateSlotTaskName}
            availableTasks={availableTasks}
            onAddSubtask={onAddSubtask}
            onRemoveSubtask={onRemoveSubtask}
            onUpdateSubtaskPercentages={onUpdateSubtaskPercentages}
          />
        ) : (
          <span
            className="text-[10px] text-muted-foreground/50 italic cursor-pointer w-full flex items-center"
            onClick={() => onEmptySlotClick?.(slot.id)}
          >
            {onEmptySlotClick ? 'Tap to assign or drop task' : 'Drop task here'}
          </span>
        )}
      </div>

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
          'flex flex-wrap gap-1.5 min-h-[36px] p-2 rounded-lg border-2 border-dashed border-border/60 bg-muted/30 transition-all',
          isOver && 'border-primary bg-accent/40'
        )}
      >
        {tasks.length === 0 ? (
          <span className="text-[10px] text-muted-foreground/50 italic w-full text-center py-1">
            Drop tasks here or drag to a time slot
          </span>
        ) : (
          tasks.map(task => (
            <div key={task.id} onClick={(e) => e.stopPropagation()}>
              <TaskChip
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
                noteId={toTaskNoteKey(task.id) || `task-${task.id}`}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const DEFAULT_TIME_COL = 108;

export function TimelineView({
  timeSlots,
  unassignedTasks,
  droppablePrefix,
  showCompleted = false,
  onAddTimeSlot,
  onDeleteTimeSlot,
  onUpdateSlotTime,
  onToggleSlotLock,
  onRemoveTaskFromSlot,
  onToggleSlotTask,
  onToggleUnassigned,
  onRemoveUnassigned,
  onUpdateUnassignedName,
  onUpdateSlotTaskName,
  availableTasks,
  onAddSubtask,
  onRemoveSubtask,
  onUpdateSubtaskPercentages,
  onEmptySlotClick,
}: TimelineViewProps) {
  const timeColWidth = DEFAULT_TIME_COL;

  return (
    <div className="flex flex-col gap-1.5 h-full">
      <div className="flex flex-col gap-1 flex-1 overflow-auto scrollbar-thin min-h-0">
        {timeSlots.map((slot, index) => (
          <TimeSlotRow
            key={slot.id}
            slot={slot}
            slotIndex={index}
            droppablePrefix={droppablePrefix}
            showCompleted={showCompleted}
            onDeleteTimeSlot={onDeleteTimeSlot}
            onUpdateSlotTime={onUpdateSlotTime}
            onToggleSlotLock={onToggleSlotLock}
            onRemoveTaskFromSlot={onRemoveTaskFromSlot}
            onToggleSlotTask={onToggleSlotTask}
            onUpdateSlotTaskName={onUpdateSlotTaskName}
            timeColumnWidth={timeColWidth}
            onEmptySlotClick={onEmptySlotClick}
            availableTasks={availableTasks}
            onAddSubtask={onAddSubtask}
            onRemoveSubtask={onRemoveSubtask}
            onUpdateSubtaskPercentages={onUpdateSubtaskPercentages}
          />
        ))}
      </div>

      <button
        onClick={onAddTimeSlot}
        className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded transition-colors mt-1"
      >
        <Plus className="w-3 h-3" />
        <span>Add time slot</span>
      </button>

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
