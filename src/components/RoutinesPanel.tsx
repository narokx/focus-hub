import React, { useState } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Trash2, Layers, GripVertical, ChevronDown, ChevronRight } from 'lucide-react';
import { Routine, TASK_COLOR_MAP, getContrastColor, generateDefaultTimeSlots } from '@/types';
import { TimelineView } from './TimelineView';
import { cn } from '@/lib/utils';

interface RoutinesPanelProps {
  routines: Routine[];
  onAddRoutine: (name: string) => void;
  onUpdateRoutine: (id: string, updates: Partial<Routine>) => void;
  onDeleteRoutine: (id: string) => void;
  onRemoveTaskFromRoutine: (routineId: string, taskId: string) => void;
  // Time slot operations
  onAddRoutineTimeSlot: (routineId: string) => void;
  onDeleteRoutineTimeSlot: (routineId: string, slotId: string) => void;
  onUpdateRoutineSlotTime: (routineId: string, slotId: string, field: 'startTime' | 'endTime', value: string) => void;
  onMoveRoutineSlotToUnassigned: (routineId: string, slotId: string) => void;
}

function DraggableRoutine({ routine }: { routine: Routine }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `routine-${routine.id}`,
    data: { type: 'routine', routine },
  });

  const style = transform ? { transform: CSS.Transform.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-1 px-2 py-1 bg-secondary/50 rounded cursor-grab active:cursor-grabbing transition-opacity',
        isDragging && 'opacity-50'
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="w-3 h-3 text-muted-foreground" />
      <span className="text-xs font-medium">Drag to calendar</span>
    </div>
  );
}

function RoutineItem({
  routine,
  onUpdateRoutine,
  onDeleteRoutine,
  onRemoveTaskFromRoutine,
  onAddRoutineTimeSlot,
  onDeleteRoutineTimeSlot,
  onUpdateRoutineSlotTime,
  onMoveRoutineSlotToUnassigned,
}: {
  routine: Routine;
  onUpdateRoutine: (id: string, updates: Partial<Routine>) => void;
  onDeleteRoutine: (id: string) => void;
  onRemoveTaskFromRoutine: (routineId: string, taskId: string) => void;
  onAddRoutineTimeSlot: (routineId: string) => void;
  onDeleteRoutineTimeSlot: (routineId: string, slotId: string) => void;
  onUpdateRoutineSlotTime: (routineId: string, slotId: string, field: 'startTime' | 'endTime', value: string) => void;
  onMoveRoutineSlotToUnassigned: (routineId: string, slotId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(routine.name);

  const { setNodeRef, isOver } = useDroppable({
    id: `routine-drop-${routine.id}`,
    data: { type: 'routine-drop', routineId: routine.id },
  });

  const handleNameSubmit = () => {
    setIsEditing(false);
    if (editName.trim() && editName !== routine.name) {
      onUpdateRoutine(routine.id, { name: editName.trim() });
    }
  };

  const totalTasks = routine.tasks.length + (routine.timeSlots || []).filter(s => s.task).length;

  return (
    <div
      className={cn(
        'border border-border/50 rounded-lg overflow-hidden transition-colors',
        isOver && 'border-primary bg-accent/30'
      )}
    >
      {/* Routine header */}
      <div className="flex items-center gap-2 p-2 bg-secondary/30">
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
        <button onClick={() => onDeleteRoutine(routine.id)} className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Routine timeline */}
      {isExpanded && (
        <div ref={setNodeRef} className={cn('p-2 transition-colors', isOver && 'bg-accent/20')}>
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
          />
          <div className="mt-2">
            <DraggableRoutine routine={routine} />
          </div>
        </div>
      )}
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
}: RoutinesPanelProps) {
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
        ) : (
          routines.map(routine => (
            <RoutineItem
              key={routine.id}
              routine={routine}
              onUpdateRoutine={onUpdateRoutine}
              onDeleteRoutine={onDeleteRoutine}
              onRemoveTaskFromRoutine={onRemoveTaskFromRoutine}
              onAddRoutineTimeSlot={onAddRoutineTimeSlot}
              onDeleteRoutineTimeSlot={onDeleteRoutineTimeSlot}
              onUpdateRoutineSlotTime={onUpdateRoutineSlotTime}
              onMoveRoutineSlotToUnassigned={onMoveRoutineSlotToUnassigned}
            />
          ))
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-border/50">
        <p className="text-xs text-muted-foreground text-center">Drag tasks here, then drag routines to calendar</p>
      </div>
    </div>
  );
}
