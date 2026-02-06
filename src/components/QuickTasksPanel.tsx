import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus, Trash2, List } from 'lucide-react';
import { QuickTask, TaskColor, TASK_COLORS, TASK_COLOR_MAP } from '@/types';
import { TaskChip } from './TaskChip';
import { cn } from '@/lib/utils';

interface QuickTasksPanelProps {
  tasks: QuickTask[];
  onAddTask: (name: string, color: TaskColor) => void;
  onUpdateTask: (id: string, updates: Partial<QuickTask>) => void;
  onDeleteTask: (id: string) => void;
}

export function QuickTasksPanel({
  tasks,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
}: QuickTasksPanelProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskColor, setNewTaskColor] = useState<TaskColor>('blue');

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

      {/* Add new task form */}
      {isAdding && (
        <div className="mb-4 p-3 bg-secondary/50 rounded-lg animate-scale-in">
          <input
            type="text"
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Task name..."
            className="w-full px-2 py-1.5 text-sm bg-background rounded border border-input focus:outline-none focus:ring-2 focus:ring-ring mb-3"
            autoFocus
          />
          
          {/* Color picker */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {TASK_COLORS.map(color => (
              <button
                key={color}
                onClick={() => setNewTaskColor(color)}
                className={cn(
                  'w-6 h-6 rounded-md transition-all',
                  newTaskColor === color && 'ring-2 ring-primary ring-offset-2'
                )}
                style={{ backgroundColor: TASK_COLOR_MAP[color] }}
              />
            ))}
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
              onClick={() => {
                setIsAdding(false);
                setNewTaskName('');
              }}
              className="px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-md hover:opacity-80 transition-opacity"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div 
        className={cn(
          'flex-1 flex flex-wrap content-start gap-2',
          isOver && 'bg-accent/30 rounded-lg'
        )}
      >
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground italic w-full text-center py-4">
            No tasks yet. Add your first task!
          </p>
        ) : (
          tasks.map(task => (
            <div key={task.id} className="group relative">
              <TaskChip
                id={`quick-${task.id}`}
                name={task.name}
                color={task.color}
                dragData={{ taskId: task.id, source: 'quick-tasks' }}
                editable
                onNameChange={(name) => onUpdateTask(task.id, { name })}
              />
              <button
                onClick={() => onDeleteTask(task.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Instructions */}
      <div className="mt-4 pt-3 border-t border-border/50">
        <p className="text-xs text-muted-foreground text-center">
          Drag tasks to calendar or routines
        </p>
      </div>
    </div>
  );
}
