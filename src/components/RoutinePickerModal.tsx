import React from 'react';
import { Routine } from '@/types';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoutinePickerModalProps {
  routines: Routine[];
  onSelect: (routine: Routine) => void;
  onClose: () => void;
}

export function RoutinePickerModal({ routines, onSelect, onClose }: RoutinePickerModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-sm mx-4 animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Select a routine</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[400px] overflow-auto scrollbar-thin">
          {routines.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No routines available</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {routines.map(routine => {
                const totalTasks = routine.tasks.length + (routine.timeSlots || []).filter(s => s.task).length;
                return (
                  <button
                    key={routine.id}
                    onClick={() => {
                      onSelect(routine);
                      onClose();
                    }}
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-secondary/50 transition-colors flex items-center justify-between'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{routine.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
