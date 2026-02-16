import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Trash2, List } from 'lucide-react';
import { QuickTask, TaskColor, getColorValue, getContrastColor } from '@/types';
import { AutocompleteInput } from './AutocompleteInput';
import { cn } from '@/lib/utils';

interface QuickTasksPanelProps {
  tasks: QuickTask[];
  onAddTask: (name: string, color: TaskColor) => void;
  onUpdateTask: (id: string, updates: Partial<QuickTask>) => void;
  onDeleteTask: (id: string) => void;
}

function SortableTaskChip({ task, onUpdateTask, onDeleteTask }: {
  task: QuickTask;
  onUpdateTask: (id: string, updates: Partial<QuickTask>) => void;
  onDeleteTask: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(task.name);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `quick-${task.id}`,
    data: { type: 'task', name: task.name, color: task.color, taskId: task.id, source: 'quick-tasks' },
    disabled: isEditing,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const textColor = getContrastColor(task.color);
  const bgColor = getColorValue(task.color);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (editName.trim() && editName !== task.name) {
      onUpdateTask(task.id, { name: editName.trim() });
    }
  };

  return (
    <div className="group relative">
      <div
        ref={setNodeRef}
        style={{ ...style, backgroundColor: bgColor, color: textColor }}
        className={cn(
          'task-chip relative inline-flex items-center gap-2 no-drag cursor-grab active:cursor-grabbing',
          isDragging && 'opacity-50 scale-95 z-50'
        )}
        {...attributes}
        {...listeners}
        onDoubleClick={() => { setIsEditing(true); setEditName(task.name); }}
      >
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
            className="editable-text bg-transparent min-w-[60px] text-inherit"
            style={{ color: 'inherit' }}
          />
        ) : (
          <span>{task.name}</span>
        )}
      </div>
      <button
        onClick={() => onDeleteTask(task.id)}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

export function QuickTasksPanel({
  tasks,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
}: QuickTasksPanelProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskColor, setNewTaskColor] = useState<string>('#3B82F6');

  const { setNodeRef, isOver } = useDroppable({
    id: 'quick-tasks-panel',
    data: { type: 'quick-tasks' },
  });

  const handleAddTask = () => {
    if (newTaskName.trim()) {
      onAddTask(newTaskName.trim(), newTaskColor);
      setNewTaskName('');
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddTask();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewTaskName('');
    }
  };

  const handleAutocompleteSelect = (task: QuickTask) => {
    setNewTaskName(task.name);
    setNewTaskColor(getColorValue(task.color));
  };

  const sortableIds = tasks.map(t => `quick-${t.id}`);

  return (
    <div ref={setNodeRef} className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <List className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Task Library</span>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {isAdding && (
        <div className="mb-4 p-3 bg-secondary/50 rounded-lg animate-scale-in">
          <AutocompleteInput
            value={newTaskName}
            onChange={setNewTaskName}
            onSelect={handleAutocompleteSelect}
            suggestions={tasks}
            placeholder="Task name..."
            autoFocus
            onKeyDown={handleKeyDown}
            className="mb-3"
          />

          {/* Color picker */}
          <div className="flex items-center gap-3 mb-3">
            <label className="text-xs text-muted-foreground">Color:</label>
            <input
              type="color"
              value={newTaskColor}
              onChange={(e) => setNewTaskColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-input"
            />
            <div
              className="flex-1 h-8 rounded-md border border-border"
              style={{ backgroundColor: newTaskColor }}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAddTask}
              disabled={!newTaskName.trim()}
              className="flex-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Add Task
            </button>
            <button
              onClick={() => { setIsAdding(false); setNewTaskName(''); }}
              className="px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-md hover:opacity-80 transition-opacity"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
        <div className={cn('flex-1 flex flex-wrap content-start gap-2', isOver && 'bg-accent/30 rounded-lg')}>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground italic w-full text-center py-4">No tasks yet. Add your first task!</p>
          ) : (
            tasks.map(task => (
              <SortableTaskChip
                key={task.id}
                task={task}
                onUpdateTask={onUpdateTask}
                onDeleteTask={onDeleteTask}
              />
            ))
          )}
        </div>
      </SortableContext>

      <div className="mt-4 pt-3 border-t border-border/50">
        <p className="text-xs text-muted-foreground text-center">Drag tasks to calendar or routines</p>
      </div>
    </div>
  );
}
