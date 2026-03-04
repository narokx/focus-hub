import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Routine, QuickTask, TimeSlot, generateDefaultTimeSlots } from '@/types';

const LOCAL_STORAGE_KEY = 'productivity-heatmap-state';

export function useSupabaseRoutines() {
  const { user } = useAuth();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const syncedRef = useRef(false);

  // Fetch routines with joined children from Supabase
  const fetchRoutines = useCallback(async () => {
    if (!user) return;

    // Fetch all three tables in parallel
    const [routinesRes, tasksRes, slotsRes] = await Promise.all([
      supabase.from('routines').select('id, name').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('routine_tasks').select('id, routine_id, task_id, order_index, tasks(id, name, color)').order('order_index', { ascending: true }),
      supabase.from('routine_time_slots').select('id, routine_id, start_time, end_time, task_id, tasks(id, name, color)').order('start_time', { ascending: true }),
    ]);

    if (routinesRes.error) {
      console.error('Failed to fetch routines:', routinesRes.error);
      return;
    }

    const routineTasksData = tasksRes.data || [];
    const routineSlotsData = slotsRes.data || [];

    const mapped: Routine[] = (routinesRes.data || []).map(r => {
      // Build unassigned buffer
      const bufferTasks = routineTasksData
        .filter(rt => rt.routine_id === r.id)
        .map(rt => {
          const task = rt.tasks as any;
          return {
            id: rt.id,
            taskId: task?.id || rt.task_id || '',
            name: task?.name || '',
            color: task?.color || '#3B82F6',
          };
        });

      // Build time slots - start with defaults and overlay DB slots
      const defaultSlots = generateDefaultTimeSlots();
      const dbSlots = routineSlotsData.filter(s => s.routine_id === r.id);

      let timeSlots: TimeSlot[];
      if (dbSlots.length > 0) {
        timeSlots = dbSlots.map(s => {
          const task = s.tasks as any;
          return {
            id: s.id,
            startTime: s.start_time,
            endTime: s.end_time,
            task: s.task_id && task ? {
              id: `rst-${s.id}`,
              taskId: task.id,
              name: task.name,
              color: task.color || '#3B82F6',
            } : null,
          };
        });
      } else {
        timeSlots = defaultSlots;
      }

      return { id: r.id, name: r.name, tasks: bufferTasks, timeSlots };
    });

    setRoutines(mapped);
    return mapped;
  }, [user]);

  // Silent one-time sync from localStorage
  const silentSync = useCallback(async (cloudRoutines: Routine[]) => {
    if (!user || syncedRef.current) return;
    syncedRef.current = true;

    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      const localRoutines: Routine[] = parsed.routines || [];
      if (localRoutines.length === 0) return;

      const cloudNames = new Set(cloudRoutines.map(r => r.name.toLowerCase()));
      const toSync = localRoutines.filter(r => !cloudNames.has(r.name.toLowerCase()));
      if (toSync.length === 0) return;

      // Fetch existing tasks for name lookups
      const { data: existingTasks } = await supabase
        .from('tasks')
        .select('id, name')
        .eq('user_id', user.id);
      const taskNameMap = new Map<string, string>();
      (existingTasks || []).forEach(t => taskNameMap.set(t.name.toLowerCase(), t.id));

      for (const routine of toSync) {
        await importSingleRoutine(routine, user.id, taskNameMap);
      }

      await fetchRoutines();
    } catch (e) {
      console.error('Routine silent sync error:', e);
    }
  }, [user, fetchRoutines]);

  // Helper: import a single routine with task reconciliation
  async function importSingleRoutine(
    routine: Routine,
    userId: string,
    taskNameMap: Map<string, string>
  ) {
    // Insert parent routine
    const { data: routineRow, error: routineErr } = await supabase
      .from('routines')
      .insert({ name: routine.name, user_id: userId })
      .select('id')
      .maybeSingle();

    if (routineErr || !routineRow) {
      console.error('Failed to insert routine:', routineErr);
      return;
    }

    const routineId = routineRow.id;

    // Reconcile task IDs for buffer tasks
    const bufferRows = [];
    for (let i = 0; i < routine.tasks.length; i++) {
      const t = routine.tasks[i];
      const resolvedTaskId = await reconcileTaskId(t.name, t.color, userId, taskNameMap);
      if (resolvedTaskId) {
        bufferRows.push({
          routine_id: routineId,
          task_id: resolvedTaskId,
          order_index: i,
        });
      }
    }

    if (bufferRows.length > 0) {
      const { error } = await supabase.from('routine_tasks').insert(bufferRows);
      if (error) console.error('Failed to insert routine_tasks:', error);
    }

    // Reconcile task IDs for time slots (only slots with tasks)
    const slotRows = [];
    for (const slot of routine.timeSlots) {
      let taskId: string | null = null;
      if (slot.task) {
        taskId = await reconcileTaskId(slot.task.name, slot.task.color, userId, taskNameMap);
      }
      slotRows.push({
        routine_id: routineId,
        start_time: slot.startTime,
        end_time: slot.endTime,
        task_id: taskId,
      });
    }

    if (slotRows.length > 0) {
      const { error } = await supabase.from('routine_time_slots').insert(slotRows);
      if (error) console.error('Failed to insert routine_time_slots:', error);
    }
  }

  // Reconcile a task name to a UUID, creating if needed
  async function reconcileTaskId(
    name: string,
    color: string,
    userId: string,
    taskNameMap: Map<string, string>
  ): Promise<string | null> {
    const key = name.toLowerCase();
    const existing = taskNameMap.get(key);
    if (existing) return existing;

    // Insert new task
    const { data, error } = await supabase
      .from('tasks')
      .insert({ name, color: color || '#3B82F6', user_id: userId })
      .select('id')
      .maybeSingle();

    if (error || !data) {
      console.error('Failed to create task during reconciliation:', error);
      return null;
    }

    taskNameMap.set(key, data.id);
    return data.id;
  }

  // Initial load
  useEffect(() => {
    if (!user) {
      setRoutines([]);
      setLoading(false);
      syncedRef.current = false;
      return;
    }

    setLoading(true);
    fetchRoutines().then(cloudRoutines => {
      setLoading(false);
      if (cloudRoutines) {
        silentSync(cloudRoutines);
      }
    });
  }, [user, fetchRoutines, silentSync]);

  // CRUD with optimistic updates

  const addRoutine = useCallback(async (name: string) => {
    if (!user) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic: Routine = { id: tempId, name, tasks: [], timeSlots: generateDefaultTimeSlots() };
    setRoutines(prev => [...prev, optimistic]);

    const { data, error } = await supabase
      .from('routines')
      .insert({ name, user_id: user.id })
      .select('id')
      .maybeSingle();

    if (error || !data) {
      console.error('Failed to add routine:', error);
      setRoutines(prev => prev.filter(r => r.id !== tempId));
      return;
    }

    // Insert default time slots for the new routine
    const defaultSlots = generateDefaultTimeSlots();
    const slotRows = defaultSlots.map(s => ({
      routine_id: data.id,
      start_time: s.startTime,
      end_time: s.endTime,
      task_id: null,
    }));
    await supabase.from('routine_time_slots').insert(slotRows);

    // Refetch to get proper IDs
    await fetchRoutines();
  }, [user, fetchRoutines]);

  const updateRoutine = useCallback(async (id: string, updates: Partial<Routine>) => {
    setRoutines(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));

    if (updates.name !== undefined) {
      const { error } = await supabase.from('routines').update({ name: updates.name }).eq('id', id);
      if (error) {
        console.error('Failed to update routine:', error);
        fetchRoutines();
      }
    }
  }, [fetchRoutines]);

  const deleteRoutine = useCallback(async (id: string) => {
    const prev = routines;
    setRoutines(r => r.filter(x => x.id !== id));

    // Children cascade via FK or we delete explicitly
    await supabase.from('routine_tasks').delete().eq('routine_id', id);
    await supabase.from('routine_time_slots').delete().eq('routine_id', id);
    const { error } = await supabase.from('routines').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete routine:', error);
      setRoutines(prev);
    }
  }, [routines]);

  const addTaskToRoutine = useCallback(async (routineId: string, task: QuickTask) => {
    const tempId = `temp-rt-${Date.now()}`;
    setRoutines(prev => prev.map(r =>
      r.id === routineId
        ? { ...r, tasks: [...r.tasks, { id: tempId, taskId: task.id, name: task.name, color: task.color }] }
        : r
    ));

    const routine = routines.find(r => r.id === routineId);
    const orderIndex = routine ? routine.tasks.length : 0;

    const { error } = await supabase.from('routine_tasks').insert({
      routine_id: routineId,
      task_id: task.id,
      order_index: orderIndex,
    });

    if (error) {
      console.error('Failed to add task to routine:', error);
    }
    // Refetch for correct IDs
    fetchRoutines();
  }, [routines, fetchRoutines]);

  const removeTaskFromRoutine = useCallback(async (routineId: string, routineTaskId: string) => {
    setRoutines(prev => prev.map(r =>
      r.id === routineId ? { ...r, tasks: r.tasks.filter(t => t.id !== routineTaskId) } : r
    ));

    const { error } = await supabase.from('routine_tasks').delete().eq('id', routineTaskId);
    if (error) {
      console.error('Failed to remove task from routine:', error);
      fetchRoutines();
    }
  }, [fetchRoutines]);

  const assignTaskToRoutineSlot = useCallback(async (routineId: string, slotId: string, task: { name: string; color: string; taskId?: string }) => {
    setRoutines(prev => prev.map(r =>
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
    ));

    if (task.taskId) {
      const { error } = await supabase.from('routine_time_slots').update({ task_id: task.taskId }).eq('id', slotId);
      if (error) {
        console.error('Failed to assign task to routine slot:', error);
        fetchRoutines();
      }
    }
  }, [fetchRoutines]);

  const removeTaskFromRoutineSlot = useCallback(async (routineId: string, slotId: string) => {
    setRoutines(prev => prev.map(r =>
      r.id === routineId
        ? { ...r, timeSlots: r.timeSlots.map(s => s.id === slotId ? { ...s, task: null } : s) }
        : r
    ));

    const { error } = await supabase.from('routine_time_slots').update({ task_id: null }).eq('id', slotId);
    if (error) {
      console.error('Failed to remove task from routine slot:', error);
      fetchRoutines();
    }
  }, [fetchRoutines]);

  const moveRoutineSlotToUnassigned = useCallback(async (routineId: string, slotId: string) => {
    const routine = routines.find(r => r.id === routineId);
    if (!routine) return;
    const slot = routine.timeSlots.find(s => s.id === slotId);
    if (!slot?.task) return;
    const task = slot.task;

    // Optimistic: move task to buffer and clear slot
    setRoutines(prev => prev.map(r =>
      r.id === routineId
        ? {
            ...r,
            tasks: [...r.tasks, { id: `temp-rt-${Date.now()}`, taskId: task.taskId, name: task.name, color: task.color }],
            timeSlots: r.timeSlots.map(s => s.id === slotId ? { ...s, task: null } : s),
          }
        : r
    ));

    // Clear slot in DB
    await supabase.from('routine_time_slots').update({ task_id: null }).eq('id', slotId);

    // Add to routine_tasks buffer
    if (task.taskId) {
      await supabase.from('routine_tasks').insert({
        routine_id: routineId,
        task_id: task.taskId,
        order_index: routine.tasks.length,
      });
    }

    fetchRoutines();
  }, [routines, fetchRoutines]);

  const addRoutineTimeSlot = useCallback(async (routineId: string) => {
    const tempId = `temp-ts-${Date.now()}`;
    setRoutines(prev => prev.map(r =>
      r.id === routineId
        ? { ...r, timeSlots: [...r.timeSlots, { id: tempId, startTime: '12:00', endTime: '13:00', task: null }] }
        : r
    ));

    const { error } = await supabase.from('routine_time_slots').insert({
      routine_id: routineId,
      start_time: '12:00',
      end_time: '13:00',
      task_id: null,
    });

    if (error) {
      console.error('Failed to add routine time slot:', error);
    }
    fetchRoutines();
  }, [fetchRoutines]);

  const deleteRoutineTimeSlot = useCallback(async (routineId: string, slotId: string) => {
    setRoutines(prev => prev.map(r =>
      r.id === routineId
        ? { ...r, timeSlots: r.timeSlots.filter(s => s.id !== slotId) }
        : r
    ));

    const { error } = await supabase.from('routine_time_slots').delete().eq('id', slotId);
    if (error) {
      console.error('Failed to delete routine time slot:', error);
      fetchRoutines();
    }
  }, [fetchRoutines]);

  const updateRoutineSlotTime = useCallback(async (routineId: string, slotId: string, field: 'startTime' | 'endTime', value: string) => {
    setRoutines(prev => prev.map(r =>
      r.id === routineId
        ? { ...r, timeSlots: r.timeSlots.map(s => s.id === slotId ? { ...s, [field]: value } : s) }
        : r
    ));

    const dbField = field === 'startTime' ? 'start_time' : 'end_time';
    const { error } = await supabase.from('routine_time_slots').update({ [dbField]: value }).eq('id', slotId);
    if (error) {
      console.error('Failed to update routine slot time:', error);
      fetchRoutines();
    }
  }, [fetchRoutines]);

  const updateRoutineSlotTaskName = useCallback(async (routineId: string, slotId: string, name: string) => {
    setRoutines(prev => prev.map(r =>
      r.id === routineId
        ? { ...r, timeSlots: r.timeSlots.map(s => s.id === slotId && s.task ? { ...s, task: { ...s.task, name } } : s) }
        : r
    ));
    // Task name updates go to the tasks table, not routine_time_slots
    // Find the task_id for this slot
    const routine = routines.find(r => r.id === routineId);
    const slot = routine?.timeSlots.find(s => s.id === slotId);
    if (slot?.task?.taskId) {
      await supabase.from('tasks').update({ name }).eq('id', slot.task.taskId);
    }
  }, [routines]);

  return {
    routines,
    loading,
    addRoutine,
    updateRoutine,
    deleteRoutine,
    addTaskToRoutine,
    removeTaskFromRoutine,
    assignTaskToRoutineSlot,
    removeTaskFromRoutineSlot,
    moveRoutineSlotToUnassigned,
    addRoutineTimeSlot,
    deleteRoutineTimeSlot,
    updateRoutineSlotTime,
    updateRoutineSlotTaskName,
    fetchRoutines,
    // Exposed for import
    importSingleRoutine: async (routine: Routine, taskNameMap: Map<string, string>) => {
      if (!user) return;
      await importSingleRoutine(routine, user.id, taskNameMap);
    },
  };
}
