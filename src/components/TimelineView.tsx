import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { Plus, Trash2, X, Pencil, FileText, Star } from 'lucide-react';
import { TimeSlot, TaskColor, getColorValue, getContrastColor, parseTimeTo24h } from '@/types';
import { TaskChip } from './TaskChip';
import { TaskNotesModal, useTaskNote } from './TaskNotesModal';
import { cn } from '@/lib/utils';

function formatTimeDisplay(time24: string): string {
  const normalized = parseTimeTo24h(time24);
  const [hStr, mStr] = normalized.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h.toString().padStart(2, '0')}:${m} ${ampm}`;
}

function getSlotDurationMinutes(startTime: string, endTime: string): number {
  const s = parseTimeTo24h(startTime);
  const e = parseTimeTo24h(endTime);
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

function getDurationScale(minutes: number): number {
  const heightPercent = Math.max(100, Math.min(250, 100 + ((minutes - 30) / 150) * 150));
  return heightPercent / 100;
}

const DRAG_THRESHOLD = 10;

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
  onUpdateSlotTaskName?: (slotId: string, name: string) => void;
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
  isExpanded,
  onExpand,
}: {
  slot: TimeSlot;
  droppablePrefix: string;
  showCompleted?: boolean;
  onRemoveTaskFromSlot: (slotId: string) => void;
  onToggleSlotTask?: (slotId: string) => void;
  onUpdateSlotTaskName?: (slotId: string, name: string) => void;
  isExpanded: boolean;
  onExpand: () => void;
}) {
  const task = slot.task!;
  const [isEditing, setIsEditing] = React.useState(false);
  const [editName, setEditName] = React.useState(task.name);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const [isPressed, setIsPressed] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const pointerStartRef = React.useRef<{ x: number; y: number } | null>(null);

  const noteId = `${slot.id}-${task.taskId || task.id}`;
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
  const showActions = isExpanded && !isEditing;

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

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    setIsPressed(true);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsPressed(false);
    if (!pointerStartRef.current || isDragging) {
      pointerStartRef.current = null;
      return;
    }

    const dx = Math.abs(e.clientX - pointerStartRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartRef.current.y);
    pointerStartRef.current = null;

    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) return;

    if (!isEditing) {
      onExpand();
    }
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={{
          ...style,
          backgroundColor: bgColor,
          color: textColor,
          willChange: isExpanded ? 'width' : 'auto',
        }}
        className={cn(
          'flex items-center gap-2 w-full px-2 py-1 rounded text-sm font-medium cursor-grab active:cursor-grabbing overflow-hidden',
          'transition-[width,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          isDragging && 'opacity-50',
          isPressed && !isDragging && 'scale-[0.98]'
        )}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { setIsPressed(false); pointerStartRef.current = null; }}
        {...attributes}
        {...listeners}
      >
        {hasNotes && (
          <Star className="w-3 h-3 flex-shrink-0 fill-current opacity-80" />
        )}

        {showCompleted && onToggleSlotTask && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSlotTask(slot.id); }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'w-4 h-4 rounded border-2 flex-shrink-0 transition-colors',
              textColor === 'white' ? 'border-white/70' : 'border-black/40',
              task.completed && (textColor === 'white' ? 'bg-white/30' : 'bg-black/20')
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
            {task.name}
          </span>
        )}

        {/* Action icons with animated reveal */}
        <div
          className={cn(
            'flex items-center gap-0.5 overflow-hidden transition-[width,opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            showActions ? 'opacity-100 scale-100' : 'opacity-0 scale-75 w-0'
          )}
          style={{ width: showActions ? '60px' : 0 }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
              setEditName(task.name);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'w-4 h-4 flex items-center justify-center rounded-full opacity-70 hover:opacity-100 transition-opacity flex-shrink-0',
              textColor === 'white' ? 'hover:bg-white/20' : 'hover:bg-black/10'
            )}
            title="Rename task"
          >
            <Pencil className="w-2.5 h-2.5" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setNotesOpen(true);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'w-4 h-4 flex items-center justify-center rounded-full opacity-70 hover:opacity-100 transition-opacity flex-shrink-0',
              textColor === 'white' ? 'hover:bg-white/20' : 'hover:bg-black/10'
            )}
            title="Notes"
          >
            <FileText className="w-2.5 h-2.5" />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); onRemoveTaskFromSlot(slot.id); }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'w-4 h-4 flex items-center justify-center rounded-full opacity-60 hover:opacity-100 transition-opacity flex-shrink-0',
              textColor === 'white' ? 'hover:bg-white/20' : 'hover:bg-black/10'
            )}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

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
  onRemoveTaskFromSlot,
  onToggleSlotTask,
  onUpdateSlotTaskName,
  timeColumnWidth,
  onEmptySlotClick,
  expandedTaskId,
  onExpandTask,
}: {
  slot: TimeSlot;
  droppablePrefix: string;
  showCompleted?: boolean;
  onDeleteTimeSlot: (slotId: string) => void;
  onUpdateSlotTime: (slotId: string, field: 'startTime' | 'endTime', value: string) => void;
  onRemoveTaskFromSlot: (slotId: string) => void;
  onToggleSlotTask?: (slotId: string) => void;
  onUpdateSlotTaskName?: (slotId: string, name: string) => void;
  timeColumnWidth: number;
  onEmptySlotClick?: (slotId: string) => void;
  expandedTaskId: string | null;
  onExpandTask: (taskId: string | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${droppablePrefix}-slot-${slot.id}`,
    data: { type: 'timeslot', prefix: droppablePrefix, slotId: slot.id },
  });

  const durationMin = getSlotDurationMinutes(slot.startTime, slot.endTime);
  const scale = slot.task ? getDurationScale(durationMin) : 1;
  const baseHeight = 32;
  const scaledHeight = Math.round(baseHeight * scale);

  const slotTaskId = slot.task ? `slot-${slot.id}` : null;
  const isExpanded = slotTaskId !== null && expandedTaskId === slotTaskId;

  return (
    <div className="flex items-stretch gap-1">
      <div
        className="flex items-center gap-0.5 flex-shrink-0 overflow-hidden"
        style={{ width: timeColumnWidth }}
      >
        <div className="flex flex-col min-w-0">
          <input
            type="text"
            value={formatTimeDisplay(slot.startTime)}
            onChange={(e) => onUpdateSlotTime(slot.id, 'startTime', e.target.value)}
            className="w-full text-[10px] text-muted-foreground bg-transparent border border-transparent hover:border-input focus:border-input rounded px-1 py-0 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            type="text"
            value={formatTimeDisplay(slot.endTime)}
            onChange={(e) => onUpdateSlotTime(slot.id, 'endTime', e.target.value)}
            className="w-full text-[10px] text-muted-foreground bg-transparent border border-transparent hover:border-input focus:border-input rounded px-1 py-0 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div
        ref={setNodeRef}
        style={{ minHeight: `${scaledHeight}px` }}
        className={cn(
          'flex-1 rounded-md border border-dashed border-border/50 flex items-stretch px-2 transition-[border-color,background-color,transform] duration-200',
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
            isExpanded={isExpanded}
            onExpand={() => onExpandTask(isExpanded ? null : slotTaskId)}
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
  expandedTaskId,
  onExpandTask,
}: {
  tasks: Array<{ id: string; taskId?: string; name: string; color: TaskColor; completed?: boolean }>;
  droppablePrefix: string;
  showCompleted?: boolean;
  onToggle?: (taskId: string) => void;
  onRemove: (taskId: string) => void;
  onUpdateName?: (taskId: string, name: string) => void;
  expandedTaskId: string | null;
  onExpandTask: (taskId: string | null) => void;
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
          tasks.map(task => {
            const unassignedTaskId = `unassigned-${task.id}`;
            const isExpanded = expandedTaskId === unassignedTaskId;
            return (
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
                  noteId={`unassigned-${task.id}`}
                  isExpanded={isExpanded}
                  onExpand={() => onExpandTask(isExpanded ? null : unassignedTaskId)}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const DEFAULT_TIME_COL = 148;

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
  onUpdateSlotTaskName,
  onEmptySlotClick,
}: TimelineViewProps) {
  const timeColWidth = DEFAULT_TIME_COL;
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Outside click handler to collapse expanded task
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (!expandedTaskId) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpandedTaskId(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [expandedTaskId]);

  const handleExpandTask = useCallback((taskId: string | null) => {
    setExpandedTaskId(taskId);
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col gap-1.5 h-full">
      <div className="flex flex-col gap-1 flex-1 overflow-auto scrollbar-thin min-h-0">
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
            onUpdateSlotTaskName={onUpdateSlotTaskName}
            timeColumnWidth={timeColWidth}
            onEmptySlotClick={onEmptySlotClick}
            expandedTaskId={expandedTaskId}
            onExpandTask={handleExpandTask}
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
        expandedTaskId={expandedTaskId}
        onExpandTask={handleExpandTask}
      />
    </div>
  );
}
