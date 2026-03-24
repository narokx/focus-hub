import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { SubtaskData, TimeSlotTask } from '@/types';
import { formatMinutes } from '@/lib/utils';
import { FloatingWindow } from '@/components/FloatingWindow';

interface TaskDetailsModalProps {
  task: TimeSlotTask;
  slotId: string;
  slotDurationMinutes: number;
  onClose: () => void;
  onRemoveSubtask: (slotId: string, subtaskIdToRemove: string) => Promise<void> | void;
  onUpdateSubtaskPercentages: (slotId: string, updatedSubtasks: SubtaskData[]) => Promise<void> | void;
}


export function TaskDetailsModal({
  task,
  slotId,
  slotDurationMinutes,
  onClose,
  onRemoveSubtask,
  onUpdateSubtaskPercentages,
}: TaskDetailsModalProps) {
  const [draftSubtasks, setDraftSubtasks] = useState<SubtaskData[]>(task.subtasks || []);
  const defaultPosition = {
    x: Math.max(40, window.innerWidth / 2 - 250),
    y: Math.max(40, window.innerHeight / 2 - 250),
  };

  useEffect(() => {
    setDraftSubtasks(task.subtasks || []);
  }, [task]);

  const totalPercentage = useMemo(
    () => draftSubtasks.reduce((sum, subtask) => sum + (subtask.percentage || 0), 0),
    [draftSubtasks]
  );
  const mainTaskPercentage = Math.max(0, 100 - totalPercentage);

  const getPercentageMinutes = (percentage: number) => (slotDurationMinutes * Math.max(0, percentage)) / 100;

  const updatePercentage = (subtaskId: string, nextValue: number) => {
    setDraftSubtasks((prev) => {
      const otherSubtasks = prev.filter((st) => st.taskId !== subtaskId);
      const usedByOthers = otherSubtasks.reduce((sum, st) => sum + (st.percentage || 0), 0);
      const maxAllowed = Math.max(0, 100 - usedByOthers);
      const safeValue = Math.max(0, Math.min(100, nextValue));
      const cappedValue = Math.min(safeValue, maxAllowed);

      return prev.map((st) => (st.taskId === subtaskId ? { ...st, percentage: cappedValue } : st));
    });
  };

  const handleSave = async () => {
    await onUpdateSubtaskPercentages(slotId, draftSubtasks);
    onClose();
  };

  return (
    <FloatingWindow
      title="Task Details"
      defaultPosition={defaultPosition}
      defaultSize={{ width: 500, height: 500 }}
      className="z-[1000]"
      headerActions={
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
          className="no-drag p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      }
    >
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs text-muted-foreground truncate">{task.name}</p>
        </div>

        <div className="flex-1 space-y-3 px-4 py-3">
          <div className="border border-border p-3 space-y-2 bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">Main Task</p>
              <span className="text-xs text-muted-foreground">
                {task.name} - {mainTaskPercentage}% ({formatMinutes(getPercentageMinutes(mainTaskPercentage) / 60)})
              </span>
            </div>
          </div>

          {draftSubtasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subtasks available for this task.</p>
          ) : (
            draftSubtasks.map((subtask) => {
              return (
                <div key={subtask.taskId} className="border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{subtask.name}</p>
                    <button
                      onClick={async () => {
                        await onRemoveSubtask(slotId, subtask.taskId);
                        setDraftSubtasks((prev) => prev.filter((st) => st.taskId !== subtask.taskId));
                      }}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Remove subtask"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Percentage</span>
                      <span>{subtask.percentage}% ({formatMinutes(getPercentageMinutes(subtask.percentage || 0) / 60)})</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={subtask.percentage}
                      onChange={(e) => updatePercentage(subtask.taskId, Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">Total: {totalPercentage}% / 100%</p>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm font-medium rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            disabled={totalPercentage > 100}
          >
            Save
          </button>
        </div>
      </div>
    </FloatingWindow>
  );
}
