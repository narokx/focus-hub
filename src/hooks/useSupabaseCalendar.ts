import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DayData, DayTask, TimeSlot, generateDefaultTimeSlots } from '@/types';

const LOCAL_STORAGE_KEY = 'productivity-heatmap-state';

export function useSupabaseCalendar() {
  const { user } = useAuth();
  const [calendar, setCalendar] = useState<Record<string, DayData>>({});
  const [loading, setLoading] = useState(true);
  const syncedRef = useRef(false);

  // Fetch calendar data from Supabase for all dates
  const fetchCalendar = useCallback(async () => {
    if (!user) return;

    const [bufferRes, eventsRes] = await Promise.all([
      supabase
        .from('daily_task_buffer')
        .select('id, date, task_id, completed, order_index, tasks(id, name, color)')
        .eq('user_id', user.id)
        .order('order_index', { ascending: true }),
      supabase
        .from('calendar_events')
        .select('id, date, start_time, end_time, task_id, completed, tasks(id, name, color)')
        .eq('user_id', user.id)
        .order('start_time', { ascending: true }),
    ]);

    if (bufferRes.error) {
      console.error('Failed to fetch daily_task_buffer:', bufferRes.error);
      return;
    }
    if (eventsRes.error) {
      console.error('Failed to fetch calendar_events:', eventsRes.error);
      return;
    }

    const bufferData = bufferRes.data || [];
    const eventsData = eventsRes.data || [];

    // Collect all dates
    const allDates = new Set<string>();
    bufferData.forEach(b => allDates.add(b.date));
    eventsData.forEach(e => allDates.add(e.date));

    const cal: Record<string, DayData> = {};

    for (const date of allDates) {
      const dayBuffer = bufferData.filter(b => b.date === date);
      const dayEvents = eventsData.filter(e => e.date === date);

      const tasks: DayTask[] = dayBuffer.map(b => {
        const task = b.tasks as any;
        return {
          id: b.id,
          taskId: task?.id || b.task_id || '',
          name: task?.name || '',
          color: task?.color || '#3B82F6',
          completed: b.completed || false,
        };
      });

      // Build time slots from DB events overlaid on defaults
      const defaultSlots = generateDefaultTimeSlots();
      let timeSlots: TimeSlot[];

      if (dayEvents.length > 0) {
        // Create slots from events (assigned tasks)
        const eventSlots: TimeSlot[] = dayEvents.map(e => {
          const task = e.tasks as any;
          return {
            id: e.id,
            startTime: e.start_time,
            endTime: e.end_time,
            task: task ? {
              id: `dst-${e.id}`,
              taskId: task.id,
              name: task.name,
              color: task.color || '#3B82F6',
              completed: e.completed || false,
            } : null,
          };
        });

        // Merge: use event slots for matching times, defaults for the rest
        timeSlots = defaultSlots.map(ds => {
          const match = eventSlots.find(es => es.startTime === ds.startTime && es.endTime === ds.endTime);
          return match || ds;
        });

        // Add any event slots that don't match default times
        const defaultTimeKeys = new Set(defaultSlots.map(s => `${s.startTime}-${s.endTime}`));
        const extraSlots = eventSlots.filter(es => !defaultTimeKeys.has(`${es.startTime}-${es.endTime}`));
        timeSlots = [...timeSlots, ...extraSlots];
      } else {
        timeSlots = defaultSlots;
      }

      cal[date] = { date, tasks, timeSlots };
    }

    setCalendar(cal);
    return cal;
  }, [user]);

  // Silent one-time sync from localStorage
  const silentSync = useCallback(async (cloudCalendar: Record<string, DayData>) => {
    if (!user || syncedRef.current) return;
    syncedRef.current = true;

    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      const localCalendar: Record<string, any> = parsed.calendar || {};
      const localDates = Object.keys(localCalendar);
      if (localDates.length === 0) return;

      // Fetch existing tasks for reconciliation
      const { data: existingTasks } = await supabase
        .from('tasks')
        .select('id, name')
        .eq('user_id', user.id);
      const taskNameMap = new Map<string, string>();
      (existingTasks || []).forEach(t => taskNameMap.set(t.name.toLowerCase(), t.id));

      const cloudDates = new Set(Object.keys(cloudCalendar));

      for (const date of localDates) {
        if (cloudDates.has(date)) continue; // Skip dates already in cloud
        const dayData = localCalendar[date];
        if (!dayData) continue;

        // Sync buffer tasks
        const localTasks: any[] = dayData.tasks || [];
        const bufferRows = [];
        for (let i = 0; i < localTasks.length; i++) {
          const t = localTasks[i];
          const resolvedTaskId = await reconcileTaskId(t.name, t.color, user.id, taskNameMap);
          if (resolvedTaskId) {
            bufferRows.push({
              user_id: user.id,
              date,
              task_id: resolvedTaskId,
              completed: t.completed || false,
              order_index: i,
            });
          }
        }
        if (bufferRows.length > 0) {
          await supabase.from('daily_task_buffer').insert(bufferRows);
        }

        // Sync time slots (only those with tasks)
        const localSlots: any[] = dayData.timeSlots || [];
        const eventRows = [];
        for (const slot of localSlots) {
          if (!slot.task) continue;
          const resolvedTaskId = await reconcileTaskId(slot.task.name, slot.task.color, user.id, taskNameMap);
          if (resolvedTaskId) {
            eventRows.push({
              user_id: user.id,
              date,
              task_id: resolvedTaskId,
              start_time: slot.startTime,
              end_time: slot.endTime,
              completed: slot.task.completed || false,
            });
          }
        }
        if (eventRows.length > 0) {
          await supabase.from('calendar_events').insert(eventRows);
        }
      }

      await fetchCalendar();
    } catch (e) {
      console.error('Calendar silent sync error:', e);
    }
  }, [user, fetchCalendar]);

  // Initial load
  useEffect(() => {
    if (!user) {
      setCalendar({});
      setLoading(false);
      syncedRef.current = false;
      return;
    }

    setLoading(true);
    fetchCalendar().then(cloudCal => {
      setLoading(false);
      if (cloudCal) {
        silentSync(cloudCal);
      }
    });
  }, [user, fetchCalendar, silentSync]);

  // CRUD with optimistic updates

  const addTaskToDay = useCallback(async (date: string, task: { name: string; color: string; taskId?: string }) => {
    if (!user) return;
    const tempId = `temp-dt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const optimistic: DayTask = {
      id: tempId,
      taskId: task.taskId || '',
      name: task.name,
      color: task.color,
      completed: false,
    };

    setCalendar(prev => {
      const dayData = prev[date] || { date, tasks: [], timeSlots: generateDefaultTimeSlots() };
      return { ...prev, [date]: { ...dayData, tasks: [...dayData.tasks, optimistic] } };
    });

    // Get order_index
    const existing = calendar[date]?.tasks || [];
    const orderIndex = existing.length;

    const { data, error } = await supabase
      .from('daily_task_buffer')
      .insert({
        user_id: user.id,
        date,
        task_id: task.taskId || null,
        completed: false,
        order_index: orderIndex,
      })
      .select('id')
      .maybeSingle();

    if (error || !data) {
      console.error('Failed to add task to day:', error);
      setCalendar(prev => {
        const dayData = prev[date];
        if (!dayData) return prev;
        return { ...prev, [date]: { ...dayData, tasks: dayData.tasks.filter(t => t.id !== tempId) } };
      });
      return;
    }

    setCalendar(prev => {
      const dayData = prev[date];
      if (!dayData) return prev;
      return {
        ...prev,
        [date]: { ...dayData, tasks: dayData.tasks.map(t => t.id === tempId ? { ...t, id: data.id } : t) },
      };
    });
  }, [user, calendar]);

  const toggleDayTask = useCallback(async (date: string, taskId: string) => {
    let newCompleted = false;
    setCalendar(prev => {
      const dayData = prev[date];
      if (!dayData) return prev;
      return {
        ...prev,
        [date]: {
          ...dayData,
          tasks: dayData.tasks.map(t => {
            if (t.id === taskId) {
              newCompleted = !t.completed;
              return { ...t, completed: newCompleted };
            }
            return t;
          }),
        },
      };
    });

    const { error } = await supabase.from('daily_task_buffer').update({ completed: newCompleted }).eq('id', taskId);
    if (error) {
      console.error('Failed to toggle day task:', error);
      fetchCalendar();
    }
  }, [fetchCalendar]);

  const updateDayTask = useCallback(async (date: string, taskId: string, updates: Partial<DayTask>) => {
    setCalendar(prev => {
      const dayData = prev[date];
      if (!dayData) return prev;
      return { ...prev, [date]: { ...dayData, tasks: dayData.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t) } };
    });
    // If name changed, update the tasks table
    if (updates.name !== undefined) {
      const dayData = calendar[date];
      const task = dayData?.tasks.find(t => t.id === taskId);
      if (task?.taskId) {
        await supabase.from('tasks').update({ name: updates.name }).eq('id', task.taskId);
      }
    }
  }, [calendar]);

  const removeDayTask = useCallback(async (date: string, taskId: string) => {
    setCalendar(prev => {
      const dayData = prev[date];
      if (!dayData) return prev;
      return { ...prev, [date]: { ...dayData, tasks: dayData.tasks.filter(t => t.id !== taskId) } };
    });

    const { error } = await supabase.from('daily_task_buffer').delete().eq('id', taskId);
    if (error) {
      console.error('Failed to remove day task:', error);
      fetchCalendar();
    }
  }, [fetchCalendar]);

  const assignTaskToDaySlot = useCallback(async (date: string, slotId: string, task: { name: string; color: string; taskId?: string }) => {
    if (!user) return;

    setCalendar(prev => {
      const dayData = prev[date] || { date, tasks: [], timeSlots: generateDefaultTimeSlots() };
      return {
        ...prev,
        [date]: {
          ...dayData,
          timeSlots: dayData.timeSlots.map(s =>
            s.id === slotId
              ? { ...s, task: { id: `dst-${Date.now()}`, taskId: task.taskId || '', name: task.name, color: task.color, completed: false } }
              : s
          ),
        },
      };
    });

    // Find the slot to get start/end time
    const dayData = calendar[date] || { date, tasks: [], timeSlots: generateDefaultTimeSlots() };
    const slot = dayData.timeSlots.find(s => s.id === slotId);
    if (!slot) return;

    // Check if this is an existing calendar_event (slotId is a DB id) or a default slot
    const isDbSlot = !slotId.startsWith('ts-');

    if (isDbSlot) {
      // Update existing event
      const { error } = await supabase.from('calendar_events').update({
        task_id: task.taskId || null,
        completed: false,
      }).eq('id', slotId);
      if (error) {
        console.error('Failed to update calendar event:', error);
        fetchCalendar();
      }
    } else {
      // Insert new event
      const { data, error } = await supabase.from('calendar_events').insert({
        user_id: user.id,
        date,
        task_id: task.taskId || null,
        start_time: slot.startTime,
        end_time: slot.endTime,
        completed: false,
      }).select('id').maybeSingle();

      if (error || !data) {
        console.error('Failed to insert calendar event:', error);
        fetchCalendar();
        return;
      }

      // Update the slot ID to the DB id
      setCalendar(prev => {
        const dd = prev[date];
        if (!dd) return prev;
        return {
          ...prev,
          [date]: {
            ...dd,
            timeSlots: dd.timeSlots.map(s =>
              s.id === slotId ? { ...s, id: data.id } : s
            ),
          },
        };
      });
    }
  }, [user, calendar, fetchCalendar]);

  const toggleDaySlotTask = useCallback(async (date: string, slotId: string) => {
    let newCompleted = false;
    setCalendar(prev => {
      const dayData = prev[date];
      if (!dayData) return prev;
      return {
        ...prev,
        [date]: {
          ...dayData,
          timeSlots: dayData.timeSlots.map(s => {
            if (s.id === slotId && s.task) {
              newCompleted = !s.task.completed;
              return { ...s, task: { ...s.task, completed: newCompleted } };
            }
            return s;
          }),
        },
      };
    });

    const isDbSlot = !slotId.startsWith('ts-');
    if (isDbSlot) {
      const { error } = await supabase.from('calendar_events').update({ completed: newCompleted }).eq('id', slotId);
      if (error) {
        console.error('Failed to toggle slot task:', error);
        fetchCalendar();
      }
    }
  }, [fetchCalendar]);

  const moveDaySlotToUnassigned = useCallback(async (date: string, slotId: string) => {
    if (!user) return;
    const dayData = calendar[date];
    if (!dayData) return;
    const slot = dayData.timeSlots.find(s => s.id === slotId);
    if (!slot?.task) return;
    const task = slot.task;

    // Optimistic update
    setCalendar(prev => {
      const dd = prev[date];
      if (!dd) return prev;
      const newTask: DayTask = {
        id: `temp-dt-${Date.now()}`,
        taskId: task.taskId,
        name: task.name,
        color: task.color,
        completed: task.completed || false,
      };
      return {
        ...prev,
        [date]: {
          ...dd,
          tasks: [...dd.tasks, newTask],
          timeSlots: dd.timeSlots.map(s => s.id === slotId ? { ...s, task: null } : s),
        },
      };
    });

    // DB: clear the event task (or delete it)
    const isDbSlot = !slotId.startsWith('ts-');
    if (isDbSlot) {
      await supabase.from('calendar_events').delete().eq('id', slotId);
    }

    // Add to buffer
    if (task.taskId) {
      await supabase.from('daily_task_buffer').insert({
        user_id: user.id,
        date,
        task_id: task.taskId,
        completed: task.completed || false,
        order_index: (dayData.tasks || []).length,
      });
    }

    fetchCalendar();
  }, [user, calendar, fetchCalendar]);

  const addDayTimeSlot = useCallback(async (date: string) => {
    // Only add to local state - empty slots are not stored in DB
    setCalendar(prev => {
      const dayData = prev[date] || { date, tasks: [], timeSlots: generateDefaultTimeSlots() };
      return {
        ...prev,
        [date]: {
          ...dayData,
          timeSlots: [...dayData.timeSlots, { id: `ts-${Date.now()}`, startTime: '12:00', endTime: '13:00', task: null }],
        },
      };
    });
  }, []);

  const deleteDayTimeSlot = useCallback(async (date: string, slotId: string) => {
    setCalendar(prev => {
      const dayData = prev[date];
      if (!dayData) return prev;
      return { ...prev, [date]: { ...dayData, timeSlots: dayData.timeSlots.filter(s => s.id !== slotId) } };
    });

    const isDbSlot = !slotId.startsWith('ts-');
    if (isDbSlot) {
      const { error } = await supabase.from('calendar_events').delete().eq('id', slotId);
      if (error) {
        console.error('Failed to delete calendar event:', error);
        fetchCalendar();
      }
    }
  }, [fetchCalendar]);

  const updateDaySlotTime = useCallback(async (date: string, slotId: string, field: 'startTime' | 'endTime', value: string) => {
    setCalendar(prev => {
      const dayData = prev[date];
      if (!dayData) return prev;
      return {
        ...prev,
        [date]: { ...dayData, timeSlots: dayData.timeSlots.map(s => s.id === slotId ? { ...s, [field]: value } : s) },
      };
    });

    const isDbSlot = !slotId.startsWith('ts-');
    if (isDbSlot) {
      const dbField = field === 'startTime' ? 'start_time' : 'end_time';
      const { error } = await supabase.from('calendar_events').update({ [dbField]: value }).eq('id', slotId);
      if (error) {
        console.error('Failed to update slot time:', error);
        fetchCalendar();
      }
    }
  }, [fetchCalendar]);

  const updateDaySlotTaskName = useCallback(async (date: string, slotId: string, name: string) => {
    setCalendar(prev => {
      const dayData = prev[date];
      if (!dayData) return prev;
      return {
        ...prev,
        [date]: {
          ...dayData,
          timeSlots: dayData.timeSlots.map(s =>
            s.id === slotId && s.task ? { ...s, task: { ...s.task, name } } : s
          ),
        },
      };
    });

    // Update the tasks table
    const dayData = calendar[date];
    const slot = dayData?.timeSlots.find(s => s.id === slotId);
    if (slot?.task?.taskId) {
      await supabase.from('tasks').update({ name }).eq('id', slot.task.taskId);
    }
  }, [calendar]);

  const moveSlotToSlot = useCallback(async (
    sourcePrefix: string, sourceSlotId: string,
    targetPrefix: string, targetSlotId: string
  ) => {
    if (!user) return;
    // Only handle day-to-day slot moves here
    if (!sourcePrefix.startsWith('day-') || !targetPrefix.startsWith('day-')) return;

    const sourceDate = sourcePrefix.substring(4);
    const targetDate = targetPrefix.substring(4);
    const sourceDayData = calendar[sourceDate];
    if (!sourceDayData) return;
    const sourceSlot = sourceDayData.timeSlots.find(s => s.id === sourceSlotId);
    if (!sourceSlot?.task) return;
    const task = sourceSlot.task;

    // Optimistic update
    setCalendar(prev => {
      let newState = { ...prev };

      // Clear source
      const srcDay = newState[sourceDate] || { date: sourceDate, tasks: [], timeSlots: generateDefaultTimeSlots() };
      newState[sourceDate] = {
        ...srcDay,
        timeSlots: srcDay.timeSlots.map(s => s.id === sourceSlotId ? { ...s, task: null } : s),
      };

      // Set target
      const tgtDay = newState[targetDate] || { date: targetDate, tasks: [], timeSlots: generateDefaultTimeSlots() };
      const newTask = { ...task, id: `dst-${Date.now()}` };
      newState[targetDate] = {
        ...tgtDay,
        timeSlots: tgtDay.timeSlots.map(s => s.id === targetSlotId ? { ...s, task: newTask } : s),
      };

      return newState;
    });

    // DB: delete source event, insert target event
    const isSourceDb = !sourceSlotId.startsWith('ts-');
    if (isSourceDb) {
      await supabase.from('calendar_events').delete().eq('id', sourceSlotId);
    }

    const targetDay = calendar[targetDate] || { date: targetDate, tasks: [], timeSlots: generateDefaultTimeSlots() };
    const targetSlot = targetDay.timeSlots.find(s => s.id === targetSlotId);
    if (targetSlot && task.taskId) {
      const isTargetDb = !targetSlotId.startsWith('ts-');
      if (isTargetDb) {
        await supabase.from('calendar_events').update({
          task_id: task.taskId,
          completed: task.completed || false,
        }).eq('id', targetSlotId);
      } else {
        await supabase.from('calendar_events').insert({
          user_id: user.id,
          date: targetDate,
          task_id: task.taskId,
          start_time: targetSlot.startTime,
          end_time: targetSlot.endTime,
          completed: task.completed || false,
        });
      }
    }

    fetchCalendar();
  }, [user, calendar, fetchCalendar]);

  const applyRoutineToDay = useCallback(async (date: string, routine: { tasks: any[]; timeSlots: TimeSlot[] }) => {
    if (!user) return;

    // Optimistic update
    setCalendar(prev => {
      const dayData = prev[date] || { date, tasks: [], timeSlots: generateDefaultTimeSlots() };
      const newUnassigned: DayTask[] = routine.tasks.map(t => ({
        id: `temp-dt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        taskId: t.taskId,
        name: t.name,
        color: t.color,
        completed: false,
      }));

      const newTimeSlots = [...dayData.timeSlots];
      routine.timeSlots.forEach((rSlot, i) => {
        if (rSlot.task && i < newTimeSlots.length && !newTimeSlots[i].task) {
          newTimeSlots[i] = {
            ...newTimeSlots[i],
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
        [date]: { ...dayData, tasks: [...dayData.tasks, ...newUnassigned], timeSlots: newTimeSlots },
      };
    });

    // DB: Insert buffer tasks
    const bufferRows = routine.tasks
      .filter(t => t.taskId)
      .map((t, i) => ({
        user_id: user.id,
        date,
        task_id: t.taskId,
        completed: false,
        order_index: (calendar[date]?.tasks || []).length + i,
      }));

    if (bufferRows.length > 0) {
      await supabase.from('daily_task_buffer').insert(bufferRows);
    }

    // DB: Insert time slot events (only with tasks)
    const dayData = calendar[date] || { date, tasks: [], timeSlots: generateDefaultTimeSlots() };
    const eventRows: any[] = [];
    routine.timeSlots.forEach((rSlot, i) => {
      if (rSlot.task?.taskId && i < dayData.timeSlots.length && !dayData.timeSlots[i].task) {
        eventRows.push({
          user_id: user.id,
          date,
          task_id: rSlot.task.taskId,
          start_time: rSlot.startTime,
          end_time: rSlot.endTime,
          completed: false,
        });
      }
    });

    if (eventRows.length > 0) {
      await supabase.from('calendar_events').insert(eventRows);
    }

    fetchCalendar();
  }, [user, calendar, fetchCalendar]);

  return {
    calendar,
    loading,
    addTaskToDay,
    toggleDayTask,
    updateDayTask,
    removeDayTask,
    assignTaskToDaySlot,
    toggleDaySlotTask,
    moveDaySlotToUnassigned,
    addDayTimeSlot,
    deleteDayTimeSlot,
    updateDaySlotTime,
    updateDaySlotTaskName,
    moveSlotToSlot,
    applyRoutineToDay,
    fetchCalendar,
  };
}

// Reconcile a task name to a UUID
async function reconcileTaskId(
  name: string,
  color: string,
  userId: string,
  taskNameMap: Map<string, string>
): Promise<string | null> {
  const key = name.toLowerCase();
  const existing = taskNameMap.get(key);
  if (existing) return existing;

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
