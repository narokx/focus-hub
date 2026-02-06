import { useState, useEffect, useCallback } from 'react';
import { AppState, QuickTask, Routine, DayData, DayTask, TASK_COLORS } from '@/types';

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
  calendar: { x: 340, y: 40, width: 700, height: 520 },
  routines: { x: 20, y: 40, width: 300, height: 350 },
  quickTasks: { x: 20, y: 410, width: 300, height: 350 },
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
    },
  ],
  calendar: {},
  windowPositions: defaultWindowPositions,
});

export function useAppState() {
  const [state, setState] = useState<AppState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...getDefaultState(),
          ...parsed,
          windowPositions: {
            ...defaultWindowPositions,
            ...parsed.windowPositions,
          },
        };
      }
    } catch (e) {
      console.error('Failed to load state:', e);
    }
    return getDefaultState();
  });

  // Persist to localStorage
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
      quickTasks: [
        ...prev.quickTasks,
        { id: `qt-${Date.now()}`, name, color },
      ],
    }));
  }, []);

  const updateQuickTask = useCallback((id: string, updates: Partial<QuickTask>) => {
    setState(prev => ({
      ...prev,
      quickTasks: prev.quickTasks.map(t =>
        t.id === id ? { ...t, ...updates } : t
      ),
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
      routines: [
        ...prev.routines,
        { id: `r-${Date.now()}`, name, tasks: [] },
      ],
    }));
  }, []);

  const updateRoutine = useCallback((id: string, updates: Partial<Routine>) => {
    setState(prev => ({
      ...prev,
      routines: prev.routines.map(r =>
        r.id === id ? { ...r, ...updates } : r
      ),
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
          ? {
              ...r,
              tasks: [
                ...r.tasks,
                {
                  id: `rt-${Date.now()}`,
                  taskId: task.id,
                  name: task.name,
                  color: task.color,
                },
              ],
            }
          : r
      ),
    }));
  }, []);

  const removeTaskFromRoutine = useCallback((routineId: string, taskId: string) => {
    setState(prev => ({
      ...prev,
      routines: prev.routines.map(r =>
        r.id === routineId
          ? { ...r, tasks: r.tasks.filter(t => t.id !== taskId) }
          : r
      ),
    }));
  }, []);

  // Calendar
  const getDayData = useCallback((date: string): DayData => {
    return state.calendar[date] || { date, tasks: [] };
  }, [state.calendar]);

  const addTaskToDay = useCallback((date: string, task: { name: string; color: typeof TASK_COLORS[number]; taskId?: string }) => {
    setState(prev => {
      const dayData = prev.calendar[date] || { date, tasks: [] };
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          [date]: {
            ...dayData,
            tasks: [
              ...dayData.tasks,
              {
                id: `dt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                taskId: task.taskId || '',
                name: task.name,
                color: task.color,
                completed: false,
              },
            ],
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
          [date]: {
            ...dayData,
            tasks: dayData.tasks.map(t =>
              t.id === taskId ? { ...t, completed: !t.completed } : t
            ),
          },
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
          [date]: {
            ...dayData,
            tasks: dayData.tasks.map(t =>
              t.id === taskId ? { ...t, ...updates } : t
            ),
          },
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
          [date]: {
            ...dayData,
            tasks: dayData.tasks.filter(t => t.id !== taskId),
          },
        },
      };
    });
  }, []);

  const applyRoutineToDay = useCallback((date: string, routine: Routine) => {
    setState(prev => {
      const dayData = prev.calendar[date] || { date, tasks: [] };
      const newTasks = routine.tasks.map(t => ({
        id: `dt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        taskId: t.taskId,
        name: t.name,
        color: t.color,
        completed: false,
      }));
      return {
        ...prev,
        calendar: {
          ...prev.calendar,
          [date]: {
            ...dayData,
            tasks: [...dayData.tasks, ...newTasks],
          },
        },
      };
    });
  }, []);

  // Window positions
  const updateWindowPosition = useCallback((
    window: keyof AppState['windowPositions'],
    position: Partial<AppState['windowPositions']['calendar']>
  ) => {
    setState(prev => ({
      ...prev,
      windowPositions: {
        ...prev.windowPositions,
        [window]: {
          ...prev.windowPositions[window],
          ...position,
        },
      },
    }));
  }, []);

  return {
    state,
    // Quick tasks
    addQuickTask,
    updateQuickTask,
    deleteQuickTask,
    // Routines
    addRoutine,
    updateRoutine,
    deleteRoutine,
    addTaskToRoutine,
    removeTaskFromRoutine,
    // Calendar
    getDayData,
    addTaskToDay,
    toggleDayTask,
    updateDayTask,
    removeDayTask,
    applyRoutineToDay,
    // Window
    updateWindowPosition,
  };
}
