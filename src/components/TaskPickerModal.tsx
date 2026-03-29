import React, { useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import { QuickTask, getColorValue } from '@/types';

interface TaskPickerModalProps {
  tasks: QuickTask[];
  onSelect: (task: QuickTask | null) => void;
  onClose: () => void;
  title?: string;
  includeUnassigned?: boolean;
}

export function TaskPickerModal({
  tasks,
  onSelect,
  onClose,
  title = 'Select Task',
  includeUnassigned = false,
}: TaskPickerModalProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return normalized ? tasks.filter((t) => t.name.toLowerCase().includes(normalized)) : tasks;
  }, [search, tasks]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative z-10 mx-4 w-full max-w-sm rounded-xl border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[320px] space-y-1 overflow-y-auto px-2 pb-3">
          {includeUnassigned && (
            <button
              onClick={() => onSelect(null)}
              className="w-full rounded-lg border border-border bg-secondary/20 px-3 py-2 text-left text-sm font-semibold text-foreground transition-colors hover:bg-secondary/60"
            >
              Unassigned
            </button>
          )}

          {filtered.length === 0 ? (
            <p className="py-4 text-center text-xs italic text-muted-foreground">
              {tasks.length === 0 ? 'No tasks available. Create tasks first.' : 'No matching tasks.'}
            </p>
          ) : (
            filtered.map((task) => (
              <button
                key={task.id}
                onClick={() => onSelect(task)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/60"
              >
                <div
                  className="h-4 w-4 flex-shrink-0 rounded-sm border border-border/30"
                  style={{ backgroundColor: getColorValue(task.color) }}
                />
                <span className="truncate text-sm">{task.name}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
