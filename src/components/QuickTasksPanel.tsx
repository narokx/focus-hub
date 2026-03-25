import React, { useState, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Trash2, List, Pencil, FileText, Star } from 'lucide-react';
import { QuickTask, TaskColor, getColorValue, getContrastColor, PRESET_COLORS } from '@/types';
import { AutocompleteInput } from './AutocompleteInput';
import { TaskNotesModal } from './TaskNotesModal';
import { useTaskNote } from '@/hooks/useTaskNote';
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
  const [editColor, setEditColor] = useState(task.color);
  const [isExpanded, setIsExpanded] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);

  const noteId = `quick-${task.id}`;
  const { note } = useTaskNote(noteId);
  const hasNotes = !!note?.trim();

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

  const displayColor = isEditing ? editColor : task.color;
  const textColor = getContrastColor(displayColor);
  const bgColor = isEditing ? editColor : getColorValue(task.color);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isExpanded) return;
    const handler = (e: PointerEvent) => {
      if (chipRef.current && !chipRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [isExpanded]);

  const handleSaveEdit = () => {
    setIsEditing(false);
    const updates: Partial<QuickTask> = {};
    if (editName.trim() && editName !== task.name) updates.name = editName.trim();
    if (editColor !== task.color) updates.color = editColor;
    if (Object.keys(updates).length > 0) onUpdateTask(task.id, updates);
  };

  const handleChipClick = (e: React.MouseEvent) => {
    if (isEditing) return;
    e.stopPropagation();
    setIsExpanded(prev => !prev);
  };

  const setRefs = (node: HTMLElement | null) => {
    setNodeRef(node);
    (chipRef as React.MutableRefObject<HTMLDivElement | null>).current = node as HTMLDivElement | null;
  };

  return (
    <>
      <div className="relative">
        <div
          ref={setRefs}
          style={{ ...style, backgroundColor: bgColor, color: textColor }}
          className={cn(
            'task-chip relative inline-flex items-center gap-1.5 no-drag cursor-grab active:cursor-grabbing',
            isDragging && 'opacity-50 scale-95 z-50'
          )}
          {...attributes}
          {...listeners}
          onClick={handleChipClick}
        >
          {hasNotes && (
            <Star className="w-3 h-3 flex-shrink-0 fill-current opacity-80" />
          )}

          {isEditing ? (
            <div className="flex flex-col gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
              <input
                ref={inputRef}
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit();
                  if (e.key === 'Escape') { setIsEditing(false); setEditName(task.name); setEditColor(task.color); }
                }}
                className="editable-text bg-transparent min-w-[60px] text-inherit"
                style={{ color: 'inherit' }}
              />
              <div className="flex flex-wrap gap-1">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => setEditColor(c.value)}
                    className={cn(
                      'w-4 h-4 rounded-full border-2 transition-transform',
                      editColor === c.value ? 'border-white scale-125' : 'border-transparent hover:scale-110'
                    )}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
              <button
                onClick={handleSaveEdit}
                className={cn(
                  'text-xs px-2 py-0.5 rounded',
                  textColor === 'white' ? 'bg-white/20 hover:bg-white/30' : 'bg-black/10 hover:bg-black/20'
                )}
              >
                Done
              </button>
            </div>
          ) : (
            <span>{task.name}</span>
          )}

          {isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
                setEditName(task.name);
                setEditColor(task.color);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                'w-3.5 h-3.5 flex items-center justify-center rounded-full transition-opacity flex-shrink-0',
                textColor === 'white' ? 'hover:bg-white/20' : 'hover:bg-black/10'
              )}
              title="Rename"
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>
          )}

          {isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setNotesOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                'w-3.5 h-3.5 flex items-center justify-center rounded-full transition-opacity flex-shrink-0',
                textColor === 'white' ? 'hover:bg-white/20' : 'hover:bg-black/10'
              )}
              title="Notes"
            >
              <FileText className="w-2.5 h-2.5" />
            </button>
          )}

          {isExpanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteTask(task.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                'w-4 h-4 flex items-center justify-center rounded-full transition-colors ml-0.5',
                textColor === 'white' ? 'hover:bg-white/20' : 'hover:bg-black/10'
              )}
              title="Delete"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          )}
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
