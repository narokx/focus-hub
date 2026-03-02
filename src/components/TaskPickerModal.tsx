import React, { useState } from 'react';
import { X, Search } from 'lucide-react';
import { QuickTask, getColorValue, getContrastColor } from '@/types';
import { cn } from '@/lib/utils';

interface TaskPickerModalProps {
  tasks: QuickTask[];
  onSelect: (task: QuickTask) => void;
  onClose: () => void;
}

export function TaskPickerModal({ tasks, onSelect, onClose }: TaskPickerModalProps) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? tasks.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : tasks;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative z-10 w-full max-w-xs mx-4 bg-popover border border-border rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Assign Task</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-background rounded-md border border-input focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[240px] overflow-y-auto px-2 pb-3">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4 italic">
              {tasks.length === 0 ? 'No tasks available. Create tasks first.' : 'No matching tasks.'}
            </p>
          ) : (
            filtered.map(task => {
              const bg = getColorValue(task.color);
              const text = getContrastColor(task.color);
              return (
                <button
                  key={task.id}
                  onClick={() => onSelect(task)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-accent/60 transition-colors"
                >
                  <div
                    className="w-4 h-4 rounded-sm flex-shrink-0 border border-border/30"
                    style={{ backgroundColor: bg }}
                  />
                  <span className="text-sm truncate">{task.name}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
