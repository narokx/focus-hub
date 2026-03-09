import React, { useState } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Trash2, Layers, GripVertical, ChevronDown, ChevronRight, Eraser } from 'lucide-react';
import { Routine, QuickTask, generateDefaultTimeSlots } from '@/types';
import { TimelineView } from './TimelineView';
import { TaskPickerModal } from './TaskPickerModal';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface RoutinesPanelProps {
  routines: Routine[];
  onAddRoutine: (name: string) => void;
  onUpdateRoutine: (id: string, updates: Partial<Routine>) => void;
  onDeleteRoutine: (id: string) => void;
  onRemoveTaskFromRoutine: (routineId: string, taskId: string) => void;
  onAddRoutineTimeSlot: (routineId: string) => void;
  onDeleteRoutineTimeSlot: (routineId: string, slotId: string) => void;
  onUpdateRoutineSlotTime: (routineId: string, slotId: string, field: 'startTime' | 'endTime', value: string) => void;
  onMoveRoutineSlotToUnassigned: (routineId: string, slotId: string) => void;
  onUpdateRoutineSlotTaskName?: (routineId: string, slotId: string, name: string) => void;
  availableTasks?: QuickTask[];
  onAssignTaskToRoutineSlot?: (routineId: string, slotId: string, task: { name: string; color: string; taskId: string }) => void;
  onReorderRoutines?: (fromIndex: number, toIndex: number) => void;
  onClearRoutineTimeline?: (routineId: string) => void;
}

// Shared inner content for a routine item
function RoutineItemContent({
  routine,
  onUpdateRoutine,
  onDeleteRoutine,
  onRemoveTaskFromRoutine,
  onAddRoutineTimeSlot,
  onDeleteRoutineTimeSlot,
  onUpdateRoutineSlotTime,
  onMoveRoutineSlotToUnassigned,
  onUpdateRoutineSlotTaskName,
  availableTasks,
  onAssignTaskToRoutineSlot,
  onClearRoutineTimeline,
  isOver,
  isDragging,
  dragHandleRef,
  dragHandleProps,
  dropRef,
  style,
}: {
  routine: Routine;
  onUpdateRoutine: (id: string, updates: Partial<Routine>) => void;
  onDeleteRoutine: (id: string) => void;
  onRemoveTaskFromRoutine: (routineId: string, taskId: string) => void;
  onAddRoutineTimeSlot: (routineId: string) => void;
  onDeleteRoutineTimeSlot: (routineId: string, slotId: string) => void;
  onUpdateRoutineSlotTime: (routineId: string, slotId: string, field: 'startTime' | 'endTime', value: string) => void;
  onMoveRoutineSlotToUnassigned: (routineId: string, slotId: string) => void;
  onUpdateRoutineSlotTaskName?: (routineId: string, slotId: string, name: string) => void;
  availableTasks?: QuickTask[];
  onAssignTaskToRoutineSlot?: (routineId: string, slotId: string, task: { name: string; color: string; taskId: string }) => void;
  onClearRoutineTimeline?: (routineId: string) => void;
  isOver: boolean;
  isDragging: boolean;
  dragHandleRef: (node: HTMLElement | null) => void;
  dragHandleProps: Record<string, any>;
  dropRef: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
}) {
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(routine.name);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleNameSubmit = () => {
    setIsEditing(false);
    if (editName.trim() && editName !== routine.name) {
      onUpdateRoutine(routine.id, { name: editName.trim() });
    }
  };

  const totalTasks = routine.tasks.length + (routine.timeSlots || []).filter(s => s.task).length;

  return (
    <div
      style={style}
      className={cn(
        'border border-border/50 rounded-lg overflow-hidden transition-colors',
        isOver && 'border-primary bg-accent/30',
        isDragging && 'opacity-50'
      )}
    >
      <div className="flex items-center gap-2 p-2 bg-secondary/30">
        <div
          ref={dragHandleRef}
          className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-secondary rounded transition-colors"
          {...dragHandleProps}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>

        <button onClick={() => setIsExpanded(!isExpanded)} className="p-0.5 hover:bg-secondary rounded transition-colors">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSubmit();
              if (e.key === 'Escape') { setIsEditing(false); setEditName(routine.name); }
            }}
            className="flex-1 px-1 py-0.5 text-sm font-medium bg-background border border-input rounded focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
        ) : (
          <span
            className="flex-1 text-sm font-medium cursor-pointer hover:text-primary transition-colors"
            onDoubleClick={() => setIsEditing(true)}
          >
            {routine.name}
          </span>
        )}

        <span className="text-xs text-muted-foreground">{totalTasks} tasks</span>
        {onClearRoutineTimeline && isExpanded && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
            title="Clear timeline"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={() => onDeleteRoutine(routine.id)} className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {isExpanded && (
        <div ref={dropRef} className={cn('p-2 transition-colors overflow-auto scrollbar-thin max-h-[400px]', isOver && 'bg-accent/20')}>
          <TimelineView
            timeSlots={routine.timeSlots || generateDefaultTimeSlots()}
            unassignedTasks={routine.tasks}
            droppablePrefix={`routine-${routine.id}`}
            showCompleted={false}
            onAddTimeSlot={() => onAddRoutineTimeSlot(routine.id)}
            onDeleteTimeSlot={(slotId) => onDeleteRoutineTimeSlot(routine.id, slotId)}
            onUpdateSlotTime={(slotId, field, value) => onUpdateRoutineSlotTime(routine.id, slotId, field, value)}
            onRemoveTaskFromSlot={(slotId) => onMoveRoutineSlotToUnassigned(routine.id, slotId)}
            onRemoveUnassigned={(taskId) => onRemoveTaskFromRoutine(routine.id, taskId)}
            onUpdateSlotTaskName={onUpdateRoutineSlotTaskName ? (slotId, name) => onUpdateRoutineSlotTaskName(routine.id, slotId, name) : undefined}
            onEmptySlotClick={availableTasks && onAssignTaskToRoutineSlot ? (slotId) => setPickerSlotId(slotId) : undefined}
          />
          {pickerSlotId && availableTasks && onAssignTaskToRoutineSlot && (
            <TaskPickerModal
              tasks={availableTasks}
              onSelect={(task) => {
                onAssignTaskToRoutineSlot(routine.id, pickerSlotId, { name: task.name, color: task.color, taskId: task.id });
                setPickerSlotId(null);
              }}
              onClose={() => setPickerSlotId(null)}
            />
          )}
        </div>
      )}

      {showClearConfirm && (
        <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Routine Timeline</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove all task assignments from time slots in "{routine.name}". Unassigned tasks will remain. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (onClearRoutineTimeline) {
                    onClearRoutineTimeline(routine.id);
                  }
                  setShowClearConfirm(false);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Clear Timeline
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// Mobile: uses useDraggable (drag routine to calendar)
function DraggableRoutineItem(props: {
  routine: Routine;
  onUpdateRoutine: (id: string, updates: Partial<Routine>) => void;
  onDeleteRoutine: (id: string) => void;
  onRemoveTaskFromRoutine: (routineId: string, taskId: string) => void;
  onAddRoutineTimeSlot: (routineId: string) => void;
  onDeleteRoutineTimeSlot: (routineId: string, slotId: string) => void;
  onUpdateRoutineSlotTime: (routineId: string, slotId: string, field: 'startTime' | 'endTime', value: string) => void;
  onMoveRoutineSlotToUnassigned: (routineId: string, slotId: string) => void;
  onUpdateRoutineSlotTaskName?: (routineId: string, slotId: string, name: string) => void;
  availableTasks?: QuickTask[];
  onAssignTaskToRoutineSlot?: (routineId: string, slotId: string, task: { name: string; color: string; taskId: string }) => void;
  onClearRoutineTimeline?: (routineId: string) => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `routine-drop-${props.routine.id}`,
    data: { type: 'routine-drop', routineId: props.routine.id },
  });

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `routine-${props.routine.id}`,
    data: { type: 'routine', routine: props.routine },
  });

  const dragStyle = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <RoutineItemContent
      {...props}
      isOver={isOver}
      isDragging={isDragging}
      dragHandleRef={setDragRef}
      dragHandleProps={{ ...attributes, ...listeners }}
      dropRef={setDropRef}
      style={dragStyle}
    />
  );
}

// Desktop: uses useSortable (reorder) + also acts as draggable for calendar drops
function SortableRoutineItem(props: {
  routine: Routine;
  onUpdateRoutine: (id: string, updates: Partial<Routine>) => void;
  onDeleteRoutine: (id: string) => void;
  onRemoveTaskFromRoutine: (routineId: string, taskId: string) => void;
  onAddRoutineTimeSlot: (routineId: string) => void;
  onDeleteRoutineTimeSlot: (routineId: string, slotId: string) => void;
  onUpdateRoutineSlotTime: (routineId: string, slotId: string, field: 'startTime' | 'endTime', value: string) => void;
  onMoveRoutineSlotToUnassigned: (routineId: string, slotId: string) => void;
  onUpdateRoutineSlotTaskName?: (routineId: string, slotId: string, name: string) => void;
  availableTasks?: QuickTask[];
  onAssignTaskToRoutineSlot?: (routineId: string, slotId: string, task: { name: string; color: string; taskId: string }) => void;
  onClearRoutineTimeline?: (routineId: string) => void;
}) {
  const { setNodeRef: setDropRef, isOver: isDropOver } = useDroppable({
    id: `routine-drop-${props.routine.id}`,
    data: { type: 'routine-drop', routineId: props.routine.id },
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `sortable-routine-${props.routine.id}`,
    data: { type: 'routine', routine: props.routine, source: 'routine-list' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <RoutineItemContent
        {...props}
        isOver={isDropOver}
        isDragging={isDragging}
        dragHandleRef={() => {}}
        dragHandleProps={{ ...attributes, ...listeners }}
        dropRef={setDropRef}
      />
    </div>
  );
}

export function RoutinesPanel({
  routines,
  onAddRoutine,
  onUpdateRoutine,
  onDeleteRoutine,
  onRemoveTaskFromRoutine,
  onAddRoutineTimeSlot,
  onDeleteRoutineTimeSlot,
  onUpdateRoutineSlotTime,
  onMoveRoutineSlotToUnassigned,
  onUpdateRoutineSlotTaskName,
  availableTasks,
  onAssignTaskToRoutineSlot,
  onReorderRoutines,
  onClearRoutineTimeline,
}: RoutinesPanelProps) {
  const isMobile = useIsMobile();
  const [isAdding, setIsAdding] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState('');

  const handleAddRoutine = () => {
    if (newRoutineName.trim()) {
      onAddRoutine(newRoutineName.trim());
      setNewRoutineName('');
      setIsAdding(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Routines</span>
        </div>
        <button onClick={() => setIsAdding(true)} className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {isAdding && (
        <div className="mb-4 p-3 bg-secondary/50 rounded-lg animate-scale-in">
          <input
            type="text"
            value={newRoutineName}
            onChange={(e) => setNewRoutineName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddRoutine();
              if (e.key === 'Escape') { setIsAdding(false); setNewRoutineName(''); }
            }}
            placeholder="Routine name (e.g. Productive Monday)..."
            className="w-full px-2 py-1.5 text-sm bg-background rounded border border-input focus:outline-none focus:ring-2 focus:ring-ring mb-3"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={handleAddRoutine} disabled={!newRoutineName.trim()} className="flex-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50">
              Create Routine
            </button>
            <button onClick={() => { setIsAdding(false); setNewRoutineName(''); }} className="px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-md hover:opacity-80 transition-opacity">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col gap-3 overflow-auto scrollbar-thin">
        {routines.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-4">No routines yet. Create a day template!</p>
        ) : isMobile ? (
          routines.map(routine => (
            <DraggableRoutineItem
              key={routine.id}
              routine={routine}
              onUpdateRoutine={onUpdateRoutine}
              onDeleteRoutine={onDeleteRoutine}
              onRemoveTaskFromRoutine={onRemoveTaskFromRoutine}
              onAddRoutineTimeSlot={onAddRoutineTimeSlot}
              onDeleteRoutineTimeSlot={onDeleteRoutineTimeSlot}
              onUpdateRoutineSlotTime={onUpdateRoutineSlotTime}
              onMoveRoutineSlotToUnassigned={onMoveRoutineSlotToUnassigned}
              onUpdateRoutineSlotTaskName={onUpdateRoutineSlotTaskName}
              availableTasks={availableTasks}
              onAssignTaskToRoutineSlot={onAssignTaskToRoutineSlot}
              onClearRoutineTimeline={onClearRoutineTimeline}
            />
          ))
        ) : (
          <SortableContext items={routines.map(r => `sortable-routine-${r.id}`)} strategy={verticalListSortingStrategy}>
            {routines.map(routine => (
              <SortableRoutineItem
                key={routine.id}
                routine={routine}
                onUpdateRoutine={onUpdateRoutine}
                onDeleteRoutine={onDeleteRoutine}
                onRemoveTaskFromRoutine={onRemoveTaskFromRoutine}
                onAddRoutineTimeSlot={onAddRoutineTimeSlot}
                onDeleteRoutineTimeSlot={onDeleteRoutineTimeSlot}
                onUpdateRoutineSlotTime={onUpdateRoutineSlotTime}
                onMoveRoutineSlotToUnassigned={onMoveRoutineSlotToUnassigned}
                onUpdateRoutineSlotTaskName={onUpdateRoutineSlotTaskName}
                availableTasks={availableTasks}
                onAssignTaskToRoutineSlot={onAssignTaskToRoutineSlot}
                onClearRoutineTimeline={onClearRoutineTimeline}
              />
            ))}
          </SortableContext>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-border/50">
        <p className="text-xs text-muted-foreground text-center">Use grip handle to drag routines to calendar</p>
      </div>
    </div>
  );
}
