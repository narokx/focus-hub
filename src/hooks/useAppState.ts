import { useState, useEffect, useCallback } from 'react';
import { AppState, QuickTask, Routine, DayData, DayTask, TimeSlot, TASK_COLORS, generateDefaultTimeSlots } from '@/types';

const STORAGE_KEY = 'productivity-heatmap-state';

const defaultQuickTasks: QuickTask[] = [
  { id: '1', name: 'Gym', color: 'coral' },
  { id: '2', name: 'Read 30min', color: 'blue' },
  { id: '3', name: 'Deep Work', color: 'violet' },
  { id: '4', name: 'Meditation', color: 'teal' },
  { id: '5', name: 'Journal', color: 'amber' },
  { id: '6', name: 'Walk', color: 'emerald' },
];

const defaultWindowPositions = {
  calendar: { x: 340, y: 40, width: 700, height: 600 },
  routines: { x: 20, y: 40, width: 300, height: 350 },
  quickTasks: { x: 20, y: 410, width: 300, height: 350 },
};

const defaultWindowTitles = {
  calendar: 'Calendar',
  routines: 'Routines',
  quickTasks: 'Quick Tasks',
};

const getDefaultState = (): AppState => ({
  quickTasks: defaultQuickTasks,
  routines: [
    {
      id: 'r1',
      name: 'Productive Monday',
      tasks: [
        { id: 'rt1', taskId: '1', name: 'Gym', color: 'coral' },
        { id: 'rt2', taskId: '3', name: 'Deep Work', color: 'violet' },
        { id: 'rt3', taskId: '2', name: 'Read 30min', color: 'blue' },
      ],
      timeSlots: generateDefaultTimeSlots(),
    },
  ],
  calendar: {},
  windowPositions: defaultWindowPositions,
  windowTitles: defaultWindowTitles,
});

// Helper to ensure DayData has timeSlots
function ensureDayData(date: string, existing?: Partial<DayData>): DayData {
  return {
    date,
    tasks: existing?.tasks || [],
    timeSlots: existing?.timeSlots || generateDefaultTimeSlots(),
  };
}

// Helper to ensure Routine has timeSlots
function ensureRoutine(r: any): Routine {
  return {
    ...r,
    timeSlots: r.timeSlots || generateDefaultTimeSlots(),
  };
}

export function useAppState() {
  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migrate: ensure all routines have timeSlots
        const routines = (parsed.routines || []).map(ensureRoutine);
        // Migrate: ensure all calendar entries have timeSlots
        const calendar: Record<string, DayData> = {};
        if (parsed.calendar) {
          for (const [date, data] of Object.entries(parsed.calendar)) {
            calendar[date] = ensureDayData(date, data as any);
          }
        }
        return {
          ...getDefaultState(),
          ...parsed,
          routines,
          calendar,
          windowPositions: {
            ...defaultWindowPositions,
            ...parsed.windowPositions,
          },
          windowTitles: {
            ...defaultWindowTitles,
            ...parsed.windowTitles,
          },
        };
      }
    } catch (e) {
      console.error('Failed to load state:', e);
    }
    return getDefaultState();
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }, [state]);

  // Quick Tasks
  const addQuickTask = useCallback((name: string, color: typeof TASK_COLORS[number]) => {
    setState(prev => ({
      ...prev,
      quickTasks: [...prev.quickTasks, { id: `qt-${Date.now()}`, name, color }],
    }));
  }, []);

  const updateQuickTask = useCallback((id: string, updates: Partial<QuickTask>) => {
    setState(prev => ({
      ...prev,
      quickTasks: prev.quickTasks.map(t => t.id === id ? { ...t, ...updates } : t),
    }));
  }, []);

  const deleteQuickTask = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      quickTasks: prev.quickTasks.filter(t => t.id !== id),
    }));
  }, []);

  // Routines
  const addRoutine = useCallback((name: string) => {
    setState(prev => ({
      ...prev,
      routines: [...prev.routines, { id: `r-${Date.now()}`, name, tasks: [], timeSlots: generateDefaultTimeSlots() }],
    }));
  }, []);

  const updateRoutine = useCallback((id: string, updates: Partial<Routine>) => {
    setState(prev => ({
      ...prev,
      routines: prev.routines.map(r => r.id === id ? { ...r, ...updates } : r),
    }));
  }, []);

  const deleteRoutine = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      routines: prev.routines.filter(r => r.id !== id),
    }));
  }, []);

  const addTaskToRoutine = useCallback((routineId: string, task: QuickTask) => {
    setState(prev => ({
      ...prev,
      routines: prev.routines.map(r =>
        r.id === routineId
          ? { ...r, tasks: [...r.tasks, { id: `rt-${Date.now()}`, taskId: task.id, name: task.name, color: task.color }] }
          : r
      ),
    }));
  }, []);

  const removeTaskFromRoutine = useCallback((routineId: string, taskId: string) => {
    setState(prev => ({
      ...prev,
      routines: prev.routines.map(r =>
        r.id === routineId ? { ...r, tasks: r.tasks.filter(t => t.id !== taskId) } : r
      ),
    }));
  }, []);

  // Routine Time Slots
  const assignTaskToRoutineSlot = useCallback((routineId: string, slotId: string, task: { name: string; color: typeof TASK_COLORS[number]; taskId?: string }) => {
    setState(prev => ({
      ...prev,
      routines: prev.routines.map(r =>
        r.id === routineId
          ? {
              ...r,
              timeSlots: r.timeSlots.map(s =>
                s.id === slotId
                  ? { ...s, task: { id: `rst-${Date.now()}`, taskId: task.taskId || '', name: task.name, color: task.color } }
                  : s
              ),
            }
          : r
      ),
    }));
  }, []);

  const removeTaskFromRoutineSlot = useCallback((routineId: string, slotId: string) => {
    setState(prev => ({
      ...prev,
      routines: prev.routines.map(r =>
        r.id === routineId
          ? { ...r, timeSlots: r.timeSlots.map(s => s.id === slotId ? { ...s, task: null } : s) }
          : r
      ),
    }));
  }, []);

  const moveRoutineSlotToUnassigned = useCallback((routineId: string, slotId: string) => {
    setState(prev => {
      const routine = prev.routines.find(r => r.id === routineId);
      if (!routine) return prev;
      const slot = routine.timeSlots.find(s => s.id === slotId);
      if (!slot?.task) return prev;
      const task = slot.task;
      return {
        ...prev,
        routines: prev.routines.map(r =>
          r.id === routineId
            ? {
                ...r,
                tasks: [...r.tasks, { id: task.id, taskId: task.taskId, name: task.name, color: task.color }],
                timeSlots: r.timeSlots.map(s => s.id === slotId ? { ...s, task: null } : s),
              }
            : r
        ),
      };
    });
  }, []);

  const addRoutineTimeSlot = useCallback((routineId: string) => {
    setState(prev => ({
      ...prev,
      routines: prev.routines.map(r =>
        r.id === routineId
          ? {
              ...r,
              timeSlots: [...r.timeSlots, {
                id: `ts-${Date.now()}`,
                startTime: '12:00 PM',
                endTime: '01:00 PM',
                task: null,
              }],
            }
          : r
      ),
    }));
  }, []);

  const deleteRoutineTimeSlot = useCallback((routineId: string, slotId: string) => {
    setState(prev => ({
      ...prev,
      routines: prev.routines.map(r =>
        r.id === routineId
          ? { ...r, timeSlots: r.timeSlots.filter(s => s.id !== slotId) }
          : r
      ),
    }));
  }, []);

  const updateRoutineSlotTime = useCallback((routineId: string, slotId: string, field: 'startTime' | 'endTime', value: string) => {
    setState(prev => ({
      ...prev,
      routines: prev.routines.map(r =>
        r.id === routineId
          ? { ...r, timeSlots: r.timeSlots.map(s => s.id === slotId ? { ...s, [field]: value } : s) }
          : r
      ),
    }));
  }, []);

  // Calendar
  const getDayData = useCallback((date: string): DayData => {
    return state.calendar[date] || ensureDayData(date);
  }, [state.calendar]);

  const addTaskToDay = useCallback((date: string, task: { name: string; color: typeof TASK_COLORS[number]; taskId?: string }) => {
    setState(prev => {
      const dayData = ensureDayData(date, prev.calendar[date]);
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          [date]: {
            ...dayData,
            tasks: [...dayData.tasks, {
              id: `dt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              taskId: task.taskId || '',
              name: task.name,
              color: task.color,
              completed: false,
            }],
          },
        },
      };
    });
  }, []);

  const toggleDayTask = useCallback((date: string, taskId: string) => {
    setState(prev => {
      const dayData = prev.calendar[date];
      if (!dayData) return prev;
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          [date]: { ...dayData, tasks: dayData.tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t) },
        },
      };
    });
  }, []);

  const updateDayTask = useCallback((date: string, taskId: string, updates: Partial<DayTask>) => {
    setState(prev => {
      const dayData = prev.calendar[date];
      if (!dayData) return prev;
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          [date]: { ...dayData, tasks: dayData.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t) },
        },
      };
    });
  }, []);

  const removeDayTask = useCallback((date: string, taskId: string) => {
    setState(prev => {
      const dayData = prev.calendar[date];
      if (!dayData) return prev;
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          [date]: { ...dayData, tasks: dayData.tasks.filter(t => t.id !== taskId) },
        },
      };
    });
  }, []);

  // Day Time Slots
  const assignTaskToDaySlot = useCallback((date: string, slotId: string, task: { name: string; color: typeof TASK_COLORS[number]; taskId?: string }) => {
    setState(prev => {
      const dayData = ensureDayData(date, prev.calendar[date]);
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          [date]: {
            ...dayData,
            timeSlots: dayData.timeSlots.map(s =>
              s.id === slotId
                ? { ...s, task: { id: `dst-${Date.now()}`, taskId: task.taskId || '', name: task.name, color: task.color, completed: false } }
                : s
            ),
          },
        },
      };
    });
  }, []);

  const toggleDaySlotTask = useCallback((date: string, slotId: string) => {
    setState(prev => {
      const dayData = prev.calendar[date];
      if (!dayData) return prev;
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          [date]: {
            ...dayData,
            timeSlots: dayData.timeSlots.map(s =>
              s.id === slotId && s.task ? { ...s, task: { ...s.task, completed: !s.task.completed } } : s
            ),
          },
        },
      };
    });
  }, []);

  const moveDaySlotToUnassigned = useCallback((date: string, slotId: string) => {
    setState(prev => {
      const dayData = prev.calendar[date];
      if (!dayData) return prev;
      const slot = dayData.timeSlots.find(s => s.id === slotId);
      if (!slot?.task) return prev;
      const task = slot.task;
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          [date]: {
            ...dayData,
            tasks: [...dayData.tasks, { id: task.id, taskId: task.taskId, name: task.name, color: task.color, completed: task.completed || false }],
            timeSlots: dayData.timeSlots.map(s => s.id === slotId ? { ...s, task: null } : s),
          },
        },
      };
    });
  }, []);

  const addDayTimeSlot = useCallback((date: string) => {
    setState(prev => {
      const dayData = ensureDayData(date, prev.calendar[date]);
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          [date]: {
            ...dayData,
            timeSlots: [...dayData.timeSlots, { id: `ts-${Date.now()}`, startTime: '12:00 PM', endTime: '01:00 PM', task: null }],
          },
        },
      };
    });
  }, []);

  const deleteDayTimeSlot = useCallback((date: string, slotId: string) => {
    setState(prev => {
      const dayData = prev.calendar[date];
      if (!dayData) return prev;
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          [date]: { ...dayData, timeSlots: dayData.timeSlots.filter(s => s.id !== slotId) },
        },
      };
    });
  }, []);

  const updateDaySlotTime = useCallback((date: string, slotId: string, field: 'startTime' | 'endTime', value: string) => {
    setState(prev => {
      const dayData = prev.calendar[date];
      if (!dayData) return prev;
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          [date]: { ...dayData, timeSlots: dayData.timeSlots.map(s => s.id === slotId ? { ...s, [field]: value } : s) },
        },
      };
    });
  }, []);

  const applyRoutineToDay = useCallback((date: string, routine: Routine) => {
    setState(prev => {
      const dayData = ensureDayData(date, prev.calendar[date]);
      // Copy routine unassigned tasks
      const newUnassigned = routine.tasks.map(t => ({
        id: `dt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        taskId: t.taskId,
        name: t.name,
        color: t.color,
        completed: false,
      }));
      // Copy routine time slot tasks to matching slots
      const newTimeSlots = [...dayData.timeSlots];
      routine.timeSlots.forEach((rSlot, i) => {
        if (rSlot.task && i < newTimeSlots.length && !newTimeSlots[i].task) {
          newTimeSlots[i] = {
            ...newTimeSlots[i],
            startTime: rSlot.startTime,
            endTime: rSlot.endTime,
            task: {
              id: `dst-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              taskId: rSlot.task.taskId,
              name: rSlot.task.name,
              color: rSlot.task.color,
              completed: false,
            },
          };
        }
      });
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          [date]: { ...dayData, tasks: [...dayData.tasks, ...newUnassigned], timeSlots: newTimeSlots },
        },
      };
    });
  }, []);

  // Window positions & titles
  const updateWindowPosition = useCallback((
    window: keyof AppState['windowPositions'],
    position: Partial<AppState['windowPositions']['calendar']>
  ) => {
    setState(prev => ({
      ...prev,
      windowPositions: { ...prev.windowPositions, [window]: { ...prev.windowPositions[window], ...position } },
    }));
  }, []);

  const updateWindowTitle = useCallback((window: keyof AppState['windowTitles'], title: string) => {
    setState(prev => ({
      ...prev,
      windowTitles: { ...prev.windowTitles, [window]: title },
    }));
  }, []);

  return {
    state,
    addQuickTask, updateQuickTask, deleteQuickTask,
    addRoutine, updateRoutine, deleteRoutine,
    addTaskToRoutine, removeTaskFromRoutine,
    assignTaskToRoutineSlot, removeTaskFromRoutineSlot, moveRoutineSlotToUnassigned,
    addRoutineTimeSlot, deleteRoutineTimeSlot, updateRoutineSlotTime,
    getDayData, addTaskToDay, toggleDayTask, updateDayTask, removeDayTask,
    assignTaskToDaySlot, toggleDaySlotTask, moveDaySlotToUnassigned,
    addDayTimeSlot, deleteDayTimeSlot, updateDaySlotTime,
    applyRoutineToDay,
    updateWindowPosition, updateWindowTitle,
  };
}
