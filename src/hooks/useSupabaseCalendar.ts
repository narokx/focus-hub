import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DayData, DayTask, QuickTask, SubtaskData, TimeSlot, generateDefaultTimeSlots, parseTimeTo24h } from '@/types';
import { resolveTaskId } from '@/lib/resolveTaskId';
import { timeToMinutes } from '@/lib/utils';
import { normalizeSlotLock, sortTimeSlotsRespectingLocks } from '@/lib/timeSlotOrder';
import { enrichRowsWithTasks } from '@/lib/enrichRowsWithTasks';

const LOCAL_STORAGE_KEY = 'productivity-heatmap-state';
const DEBUG_CALENDAR = true; // Set to false to silence logs globally


const TIMELINE_DEBUG_KEY = 'focushub:timeline-debug';

type SlotOrigin = 'persisted-db-event' | 'synthesized-placeholder' | 'inferred-gap-fill' | 'optimistic-local-state' | 'normalization-split-pass';

function timelineDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(TIMELINE_DEBUG_KEY) === '1';
}

function logTimelineSlotOrigin(context: string, slot: TimeSlot, origin: SlotOrigin, extra: Record<string, any> = {}) {
  if (!timelineDebugEnabled()) return;
  console.debug('[timeline-origin]', { context, origin, slotId: slot.id, start: slot.startTime, end: slot.endTime, locked: !!slot.locked, hasTask: !!slot.task, ...extra });
}

function logTimelineTelemetry(safeBase: TimeSlot[], safeEvents: TimeSlot[], finalTimeline: TimeSlot[]) {
  if (!DEBUG_CALENDAR) return;
  
  console.group("🧠 TIMELINE DATASTREAM TELEMETRY");
  console.log("1. Synthesized Base Slots Count:", safeBase.length);
  console.log("2. Raw DB Events Received Count:", safeEvents.length);
  console.log("3. Raw DB Payload:", safeEvents.map(e => ({ id: e.id, start: e.startTime, end: e.endTime, hasTask: !!e.task })));
  console.log("4. Final Reconstructed Timeline Count:", finalTimeline.length);
  console.log("5. Final Render Payload:", finalTimeline.map(t => ({
    id: t.id,
    start: t.startTime,
    end: t.endTime,
    hasTask: !!t.task,
    taskName: t.task?.name || 'EMPTY'
  })));
  console.groupEnd();
}

function splitEventsAndGapFill(slots: TimeSlot[]): { events: TimeSlot[]; placeholders: TimeSlot[] } {
  const events: TimeSlot[] = [];
  const placeholders: TimeSlot[] = [];
  for (const slot of slots) {
    if (slot.task) {
      events.push(slot);
    } else {
      placeholders.push(slot);
    }
  }
  return { events, placeholders };
}


function isMissingLockedColumnError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const combined = `${message} ${details} ${hint}`;
  return combined.includes('locked') && (
    combined.includes('column') ||
    combined.includes('schema cache') ||
    combined.includes('could not find')
  );
}

async function fetchCalendarEventsWithLegacyFallback(userId: string) {
  const withLockedJoin = await supabase
    .from('calendar_events')
    .select('id, date, start_time, end_time, task_id, completed, subtasks, locked, tasks(id, name, color)')
    .eq('user_id', userId)
    .order('start_time', { ascending: true });

  if (!withLockedJoin.error) return { data: withLockedJoin.data || [] };

  const withoutLockedJoin = isMissingLockedColumnError(withLockedJoin.error)
    ? await supabase
        .from('calendar_events')
        .select('id, date, start_time, end_time, task_id, completed, subtasks, tasks(id, name, color)')
        .eq('user_id', userId)
        .order('start_time', { ascending: true })
    : null;

  if (withoutLockedJoin && !withoutLockedJoin.error) return { data: withoutLockedJoin.data || [] };

  const withLockedNoJoin = await supabase
    .from('calendar_events')
    .select('id, date, start_time, end_time, task_id, completed, subtasks, locked')
    .eq('user_id', userId)
    .order('start_time', { ascending: true });

  if (!withLockedNoJoin.error) {
    const enrichmentResult = await enrichRowsWithTasks(withLockedNoJoin.data || []);
    if (enrichmentResult.error) return { data: null, error: enrichmentResult.error };
    return { data: enrichmentResult.data || [] };
  }

  if (!isMissingLockedColumnError(withLockedNoJoin.error)) {
    return { error: withLockedNoJoin.error, data: null };
  }

  const withoutLockedNoJoin = await supabase
    .from('calendar_events')
    .select('id, date, start_time, end_time, task_id, completed, subtasks')
    .eq('user_id', userId)
    .order('start_time', { ascending: true });

  if (withoutLockedNoJoin.error) return { error: withoutLockedNoJoin.error, data: null };

  const enrichmentResult = await enrichRowsWithTasks(withoutLockedNoJoin.data || []);
  if (enrichmentResult.error) return { data: null, error: enrichmentResult.error };
  return { data: enrichmentResult.data || [] };
}

async function insertCalendarEventsWithLegacyFallback(rows: any[]) {
  if (rows.length === 0) return { error: null as any };
  const withLocked = await supabase.from('calendar_events').insert(rows);
  if (!withLocked.error || !isMissingLockedColumnError(withLocked.error)) return withLocked;
  const legacyRows = rows.map(({ locked, ...rest }) => rest);
  return supabase.from('calendar_events').insert(legacyRows);
}

async function clearCalendarEventTaskPreservingSlot(eventId: string) {
  const updateRes = await supabase
    .from('calendar_events')
    .update({ task_id: null, completed: false, subtasks: [] as any })
    .eq('id', eventId);
  return updateRes;
}

function mergeEventsIntoTimeline(defaultSlots: TimeSlot[] = [], eventSlots: TimeSlot[] = []): TimeSlot[] {
  const safeBase = Array.isArray(defaultSlots) ? defaultSlots : [];
  const safeEvents = Array.isArray(eventSlots) ? eventSlots : [];
  const { events, placeholders } = splitEventsAndGapFill(safeEvents);
  const sortedEvents = [...events, ...placeholders].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const hasAnyActiveTasks = sortedEvents.some(
    (slot) => slot.task !== null && slot.task !== undefined
  );
  if (!hasAnyActiveTasks) {
    const synthesized = [...safeBase].sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    );
    synthesized.forEach((slot) =>
      logTimelineSlotOrigin('rebuild/no-active-tasks', slot, 'synthesized-placeholder')
    );
    return synthesized;
  }

  if (sortedEvents.length === 0) {
    const synthesized = [...safeBase].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    synthesized.forEach((slot) => logTimelineSlotOrigin('rebuild/no-events', slot, 'synthesized-placeholder'));
    return synthesized;
  }

  // Persisted DB events are the source of truth; placeholders are volatile UI scaffolding only.
  sortedEvents.forEach((slot) => {
    const origin: SlotOrigin = slot.task ? 'persisted-db-event' : 'inferred-gap-fill';
    logTimelineSlotOrigin('rebuild/events-present', slot, origin);
  });

  const finalTimeline = sortedEvents;
  logTimelineTelemetry(safeBase, safeEvents, finalTimeline);
  return finalTimeline;
}

export function useSupabaseCalendar() {
  const { user } = useAuth();
  const [calendar, setCalendar] = useState<Record<string, DayData>>({});
  const [loading, setLoading] = useState(true);
  const syncedRef = useRef(false);

  // Fetch calendar data from Supabase for all dates
  const fetchCalendar = useCallback(async () => {
    if (!user) return;
    try {

    const [bufferRes, eventsRes] = await Promise.all([
      supabase
        .from('daily_task_buffer')
        .select('id, date, task_id, completed, order_index, day_color, is_custom_color, tasks(id, name, color)')
        .eq('user_id', user.id)
        .order('order_index', { ascending: true }),
      fetchCalendarEventsWithLegacyFallback(user.id),
    ]);

    if (bufferRes.error) {
      console.error('Failed to fetch daily_task_buffer:', bufferRes.error);
      return;
    }
    const eventsError = (eventsRes as any).error;
    if (eventsError) {
      console.error('Failed to fetch calendar_events:', eventsError);
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

      const tasks: DayTask[] = dayBuffer
        .filter(b => b.task_id) // ignore sentinel rows used only for day-level color
        .map(b => {
        const task = b.tasks as any;
        return {
          id: b.id,
          taskId: task?.id || b.task_id || '',
          name: task?.name || '',
          color: task?.color || '#3B82F6',
          completed: b.completed || false,
        };
      });

      const colorSource = dayBuffer.find(b => b.is_custom_color) || dayBuffer[0];
      const dayColor = colorSource?.day_color || undefined;
      const isCustomColor = !!colorSource?.is_custom_color;

      // Build time slots from DB events overlaid on defaults
      const defaultSlots = generateDefaultTimeSlots();
      const eventSlots: TimeSlot[] = (dayEvents || []).map(e => {
        const task = e.tasks as any;
        return {
          id: e.id,
          startTime: parseTimeTo24h(e.start_time),
          endTime: parseTimeTo24h(e.end_time),
          locked: !!(e as any).locked,
          task: task ? {
            id: `dst-${e.id}`,
            taskId: task.id,
            name: task.name,
            color: task.color || '#3B82F6',
            completed: e.completed || false,
            subtasks: Array.isArray((e as any).subtasks) ? ((e as any).subtasks as SubtaskData[]) : undefined,
          } : null,
        };
      });
      eventSlots.forEach(slot => logTimelineSlotOrigin('fetch/db-map', slot, slot.task ? 'persisted-db-event' : 'inferred-gap-fill'));
      const timeSlots = mergeEventsIntoTimeline(defaultSlots, eventSlots);

      cal[date] = { date, tasks, timeSlots: timeSlots.map(normalizeSlotLock), dayColor, isCustomColor };
    }

      setCalendar(cal);
      return cal;
    } catch (error) {
      console.error('Failed to fetch calendar data:', error);
      setCalendar(prev => {
        const fallback = { ...prev };
        const today = new Date().toISOString().slice(0, 10);
        if (!fallback[today]) {
          fallback[today] = { date: today, tasks: [], timeSlots: generateDefaultTimeSlots() };
        }
        return fallback;
      });
      return undefined;
    }
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
              start_time: parseTimeTo24h(slot.startTime),
              end_time: parseTimeTo24h(slot.endTime),
              completed: slot.task.completed || false,
              locked: !!slot.locked,
            });
          }
        }
        if (eventRows.length > 0) {
          await insertCalendarEventsWithLegacyFallback(eventRows);
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

    if (!taskId || taskId.startsWith('temp-dt-')) return;
    const { error } = await supabase.from('daily_task_buffer').delete().eq('id', taskId);
    if (error) {
      console.error('Failed to remove day task:', error);
      fetchCalendar();
    }
  }, [fetchCalendar]);

  const addSubtaskToDaySlot = useCallback(async (date: string, slotId: string, subTask: QuickTask) => {
    if (!user || !date || !slotId || !subTask?.id) return;

    const dayData = calendar[date];
    const slot = dayData?.timeSlots.find(s => s.id === slotId);
    if (!slot?.task) return;

    const originalSubtasks = slot.task.subtasks;
    const existingSubtasks = originalSubtasks || [];
    if (existingSubtasks.length >= 4) return;

    const newSubtask: SubtaskData = {
      taskId: subTask.id,
      name: subTask.name,
      color: subTask.color,
      percentage: 25,
    };

    const updatedSubtasks = [...existingSubtasks, newSubtask];

    setCalendar(prev => {
      const currentDay = prev[date];
      if (!currentDay) return prev;
      return {
        ...prev,
        [date]: {
          ...currentDay,
          timeSlots: currentDay.timeSlots.map(s =>
            s.id === slotId && s.task
              ? { ...s, task: { ...s.task, subtasks: updatedSubtasks } }
              : s
          ),
        },
      };
    });

    const { error } = await supabase
      .from('calendar_events')
      .update({ subtasks: updatedSubtasks as any })
      .eq('id', slotId);

    if (error) {
      console.error('Failed to add subtask to day slot:', error);
      // Revert optimistic update on error
      setCalendar(prev => {
        const currentDay = prev[date];
        if (!currentDay) return prev;
        return {
          ...prev,
          [date]: {
            ...currentDay,
            timeSlots: currentDay.timeSlots.map(s =>
              s.id === slotId && s.task
                ? { ...s, task: { ...s.task, subtasks: originalSubtasks } }
                : s
            ),
          },
        };
      });
    }
  }, [user, calendar]);

  const removeSubtask = useCallback(async (date: string, slotId: string, subtaskIdToRemove: string) => {
    if (!user || !date || !slotId || !subtaskIdToRemove) return;

    const dayData = calendar[date];
    const slot = dayData?.timeSlots.find(s => s.id === slotId);
    if (!slot?.task) return;

    const originalSubtasks = slot.task.subtasks || [];
    const updatedSubtasks = originalSubtasks.filter(st => st.taskId !== subtaskIdToRemove);

    setCalendar(prev => {
      const currentDay = prev[date];
      if (!currentDay) return prev;
      return {
        ...prev,
        [date]: {
          ...currentDay,
          timeSlots: currentDay.timeSlots.map(s =>
            s.id === slotId && s.task
              ? { ...s, task: { ...s.task, subtasks: updatedSubtasks } }
              : s
          ),
        },
      };
    });

    const { error } = await supabase
      .from('calendar_events')
      .update({ subtasks: updatedSubtasks as any })
      .eq('id', slotId);

    if (error) {
      console.error('Failed to remove subtask from day slot:', error);
      setCalendar(prev => {
        const currentDay = prev[date];
        if (!currentDay) return prev;
        return {
          ...prev,
          [date]: {
            ...currentDay,
            timeSlots: currentDay.timeSlots.map(s =>
              s.id === slotId && s.task
                ? { ...s, task: { ...s.task, subtasks: originalSubtasks } }
                : s
            ),
          },
        };
      });
    }
  }, [user, calendar]);

  const updateSubtaskPercentages = useCallback(async (date: string, slotId: string, updatedSubtasks: SubtaskData[]) => {
    if (!user || !date || !slotId) return;

    const dayData = calendar[date];
    const slot = dayData?.timeSlots.find(s => s.id === slotId);
    if (!slot?.task) return;

    const originalSubtasks = slot.task.subtasks || [];

    setCalendar(prev => {
      const currentDay = prev[date];
      if (!currentDay) return prev;
      return {
        ...prev,
        [date]: {
          ...currentDay,
          timeSlots: currentDay.timeSlots.map(s =>
            s.id === slotId && s.task
              ? { ...s, task: { ...s.task, subtasks: updatedSubtasks } }
              : s
          ),
        },
      };
    });

    const { error } = await supabase
      .from('calendar_events')
      .update({ subtasks: updatedSubtasks as any })
      .eq('id', slotId);

    if (error) {
      console.error('Failed to update subtask percentages for day slot:', error);
      setCalendar(prev => {
        const currentDay = prev[date];
        if (!currentDay) return prev;
        return {
          ...prev,
          [date]: {
            ...currentDay,
            timeSlots: currentDay.timeSlots.map(s =>
              s.id === slotId && s.task
                ? { ...s, task: { ...s.task, subtasks: originalSubtasks } }
                : s
            ),
          },
        };
      });
    }
  }, [user, calendar]);


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
      let insertRes = await supabase.from('calendar_events').insert({
        user_id: user.id,
        date,
        task_id: task.taskId || null,
        start_time: parseTimeTo24h(slot.startTime),
        end_time: parseTimeTo24h(slot.endTime),
        completed: false,
        locked: !!slot.locked,
      }).select('id').maybeSingle();
      if (insertRes.error && isMissingLockedColumnError(insertRes.error)) {
        insertRes = await supabase.from('calendar_events').insert({
          user_id: user.id,
          date,
          task_id: task.taskId || null,
          start_time: parseTimeTo24h(slot.startTime),
          end_time: parseTimeTo24h(slot.endTime),
          completed: false,
        }).select('id').maybeSingle();
      }

      const { data, error } = insertRes;

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

    // DB: clear the event task while preserving the slot boundaries
    const isDbSlot = !slotId.startsWith('ts-');
    if (isDbSlot) {
      const clearRes = await clearCalendarEventTaskPreservingSlot(slotId);
      if (clearRes.error) {
        console.error('Failed to clear calendar event task:', clearRes.error);
      }
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
          timeSlots: [...dayData.timeSlots, { id: `ts-${Date.now()}`, startTime: '12:00', endTime: '13:00', locked: true, task: null }],
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

      const updatedSlots = sortTimeSlotsRespectingLocks(
        dayData.timeSlots.map(s => s.id === slotId ? { ...s, [field]: parseTimeTo24h(value) } : s)
      );

      return {
        ...prev,
        [date]: { ...dayData, timeSlots: updatedSlots },
      };
    });

    const isDbSlot = !slotId.startsWith('ts-');
    if (isDbSlot) {
      const dbField = field === 'startTime' ? 'start_time' : 'end_time';
      const { error } = await supabase.from('calendar_events').update({ [dbField]: parseTimeTo24h(value) }).eq('id', slotId);
      if (error) {
        console.error('Failed to update slot time:', error);
        fetchCalendar();
      }
    }
  }, [fetchCalendar]);

  const toggleDaySlotLock = useCallback(async (date: string, slotId: string) => {
    let nextLocked = false;

    setCalendar(prev => {
      const dayData = prev[date];
      if (!dayData) return prev;

      const updated = dayData.timeSlots.map((slot) => {
        if (slot.id !== slotId) return slot;
        nextLocked = !slot.locked;
        return { ...slot, locked: nextLocked };
      });

      const nextSlots = nextLocked ? updated : sortTimeSlotsRespectingLocks(updated);
      return { ...prev, [date]: { ...dayData, timeSlots: nextSlots } };
    });

    const isDbSlot = !slotId.startsWith('ts-');
    if (isDbSlot) {
      const { error } = await supabase.from('calendar_events').update({ locked: nextLocked }).eq('id', slotId);
      if (error && !isMissingLockedColumnError(error)) {
        console.error('Failed to toggle slot lock:', error);
        fetchCalendar();
      }
    }
  }, [fetchCalendar]);

  const updateDaySlotTaskName = useCallback(async (date: string, slotId: string, name: string) => {
    if (!user) return;

    // Find the original slot to get color for potential new task
    const dayData = calendar[date];
    const slot = dayData?.timeSlots.find(s => s.id === slotId);
    const originalColor = slot?.task?.color || '#3B82F6';

    // Optimistic UI update
    setCalendar(prev => {
      const dd = prev[date];
      if (!dd) return prev;
      return {
        ...prev,
        [date]: {
          ...dd,
          timeSlots: dd.timeSlots.map(s =>
            s.id === slotId && s.task ? { ...s, task: { ...s.task, name } } : s
          ),
        },
      };
    });

    // Non-destructive: find or create task by name, then reassign pointer
    const resolvedId = await resolveTaskId(name, originalColor, user.id);
    if (!resolvedId) return;

    // Update optimistic state with resolved taskId
    setCalendar(prev => {
      const dd = prev[date];
      if (!dd) return prev;
      return {
        ...prev,
        [date]: {
          ...dd,
          timeSlots: dd.timeSlots.map(s =>
            s.id === slotId && s.task ? { ...s, task: { ...s.task, taskId: resolvedId } } : s
          ),
        },
      };
    });

    // Reassign the calendar_events row to point to the resolved task
    const isDbSlot = !slotId.startsWith('ts-');
    if (isDbSlot) {
      const { error } = await supabase.from('calendar_events').update({ task_id: resolvedId }).eq('id', slotId);
      if (error) {
        console.error('Failed to reassign calendar event task:', error);
        fetchCalendar();
      }
    }

    return resolvedId;
  }, [user, calendar, fetchCalendar]);

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

    // DB: clear source event task, then assign target
    const isSourceDb = !sourceSlotId.startsWith('ts-');
    if (isSourceDb) {
      const clearRes = await clearCalendarEventTaskPreservingSlot(sourceSlotId);
      if (clearRes.error) {
        console.error('Failed to clear source calendar event task:', clearRes.error);
      }
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
        await insertCalendarEventsWithLegacyFallback([{
          user_id: user.id,
          date: targetDate,
          task_id: task.taskId,
          start_time: parseTimeTo24h(targetSlot.startTime),
          end_time: parseTimeTo24h(targetSlot.endTime),
          completed: task.completed || false,
          locked: !!targetSlot.locked,
        }]);
      }
    }

    fetchCalendar();
  }, [user, calendar, fetchCalendar]);

  const updateDayColor = useCallback(
    async (date: string, color: string, isCustom: boolean = true) => {
      if (!user) return;

      // Optimistic local update
      setCalendar(prev => {
        const existing = prev[date] || { date, tasks: [], timeSlots: generateDefaultTimeSlots() };
        return {
          ...prev,
          [date]: {
            ...existing,
            dayColor: color,
            isCustomColor: isCustom,
          },
        };
      });

      if (isCustom) {
        // Manual override: always set day_color and flag as custom
        const { data } = await supabase
          .from('daily_task_buffer')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', date)
          .limit(1)
          .maybeSingle();

        if (data) {
          await supabase
            .from('daily_task_buffer')
            .update({ day_color: color, is_custom_color: true })
            .eq('user_id', user.id)
            .eq('date', date);
        } else {
          await supabase.from('daily_task_buffer').insert({
            user_id: user.id,
            date,
            task_id: null,
            completed: false,
            order_index: 0,
            day_color: color,
            is_custom_color: true,
          } as any);
        }
      } else {
        // Routine-applied color: respect existing manual overrides
        const { data, error } = await supabase
          .from('daily_task_buffer')
          .select('id, is_custom_color')
          .eq('user_id', user.id)
          .eq('date', date)
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('Failed to read day color metadata:', error);
          return;
        }

        if (data?.is_custom_color) {
          // Manual color already set; do not overwrite
          return;
        }

        if (data) {
          await supabase
            .from('daily_task_buffer')
            .update({ day_color: color, is_custom_color: false })
            .eq('user_id', user.id)
            .eq('date', date);
        } else {
          await supabase.from('daily_task_buffer').insert({
            user_id: user.id,
            date,
            task_id: null,
            completed: false,
            order_index: 0,
            day_color: color,
            is_custom_color: false,
          } as any);
        }
      }
    },
    [user]
  );


  // Helper to calculate the sorting weight of a time string 'HH:mm'
  const getTimeWeight = (timeStr: string) => {
    const [hour, minute] = timeStr.split(':').map(Number);
    // 04:00 AM is the absolute start; anything earlier is treated as "next day"
    const adjustedHour = hour < 4 ? hour + 24 : hour;
    return adjustedHour * 60 + minute;
  };

  const applyRoutineToDay = useCallback(async (date: string, routine: { tasks: any[]; timeSlots: TimeSlot[]; color?: string }) => {
    if (!user) return;
    try {

    const routineTaskSlots = (routine.timeSlots || []).filter(s => s.task);

    // Apply routine color as day color if there is no manual override
    if (routine.color) {
      await updateDayColor(date, routine.color, false);
    }

    // If the routine has no timed tasks, only refresh the unassigned buffer for this date
    if (routineTaskSlots.length === 0) {
      const { error } = await supabase
        .from('daily_task_buffer')
        .delete()
        .eq('user_id', user.id)
        .eq('date', date);

      if (error) {
        console.error('Failed to clear daily_task_buffer for date:', date, error);
        return;
      }

      const bufferRowsNoSlots = routine.tasks
        .filter((t: any) => t.taskId)
        .map((t: any, i: number) => ({
          user_id: user.id,
          date,
          task_id: t.taskId,
          completed: false,
          order_index: i,
        }));

      if (bufferRowsNoSlots.length > 0) {
        const insertRes = await supabase.from('daily_task_buffer').insert(bufferRowsNoSlots);
        if (insertRes.error) {
          console.error('Failed to insert buffer tasks:', insertRes.error);
        }
      }

      setCalendar(prev => {
        const dayData = prev[date] || { date, tasks: [], timeSlots: generateDefaultTimeSlots() };
        const newUnassigned: DayTask[] = routine.tasks.map((t: any) => ({
          id: `temp-dt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          taskId: t.taskId,
          name: t.name,
          color: t.color,
          completed: false,
        }));
        return {
          ...prev,
          [date]: {
            ...dayData,
            tasks: newUnassigned,
          },
        };
      });
      await fetchCalendar();
      return;
    }

    const routineStartMinutes = Math.min(...routineTaskSlots.map(s => timeToMinutes(s.startTime)));
    const routineEndMinutes = Math.max(...routineTaskSlots.map(s => timeToMinutes(s.endTime)));

    // Step 1: Atomic DELETE for this date:
    // - Buffer rows are fully replaced
    // - Calendar events are deleted only within the routine's active time window
    const [bufferDeleteResult] = await Promise.all([
      supabase.from('daily_task_buffer').delete().eq('user_id', user.id).eq('date', date),
    ]);

    if (bufferDeleteResult.error) {
      console.error('Failed to clear daily_task_buffer for date:', date, bufferDeleteResult.error);
      return;
    }

    const dayDataForDeletion = calendar[date];
    const eventIdsToDelete: string[] = [];
    if (dayDataForDeletion) {
      for (const slot of dayDataForDeletion.timeSlots || []) {
        if (!slot.task) continue;
        if (typeof slot.id !== 'string' || slot.id.startsWith('ts-')) continue;
        const sStart = timeToMinutes(slot.startTime);
        const sEnd = timeToMinutes(slot.endTime);
        const overlaps = sStart < routineEndMinutes && sEnd > routineStartMinutes;
        if (overlaps) {
          eventIdsToDelete.push(slot.id);
        }
      }
    }

    if (eventIdsToDelete.length > 0) {
      const eventsDeleteResult = await supabase
        .from('calendar_events')
        .delete()
        .eq('user_id', user.id)
        .eq('date', date)
        .in('id', eventIdsToDelete);

      if (eventsDeleteResult.error) {
        console.error('Failed to clear calendar_events for date/time range:', date, eventsDeleteResult.error);
        return;
      }
    }

    // Step 2: Build new buffer and local timeline with boundary-preserving rules
    const newUnassigned: DayTask[] = routine.tasks.map((t: any) => ({
      id: `temp-dt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId: t.taskId,
      name: t.name,
      color: t.color,
      completed: false,
    }));

    setCalendar(prev => {
      const existing = prev[date] || { date, tasks: [], timeSlots: generateDefaultTimeSlots() };
      // Inject routine's time slots as new calendar slots
      const routineSlotsAsDaySlots: TimeSlot[] = routineTaskSlots.map(s => ({
        id: `ts-routine-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        startTime: s.startTime,
        endTime: s.endTime,
        task: {
          id: `dst-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          taskId: s.task!.taskId,
          name: s.task!.name,
          color: s.task!.color,
          completed: false,
        },
      }));

      routineSlotsAsDaySlots.forEach(slot => logTimelineSlotOrigin('apply-routine/optimistic', slot, 'optimistic-local-state'))

      const mergedSlots = mergeEventsIntoTimeline(existing.timeSlots || [], routineSlotsAsDaySlots).sort(
        (a, b) => getTimeWeight(a.startTime) - getTimeWeight(b.startTime),
      );

      mergedSlots.forEach(slot => logTimelineSlotOrigin('apply-routine/normalized', slot, 'normalization-split-pass'));

      return {
        ...prev,
        [date]: {
          ...existing,
          tasks: newUnassigned,
          timeSlots: mergedSlots,
        },
      };
    });

    // Step 3: INSERT new buffer tasks for this date
    const bufferRows = routine.tasks
      .filter(t => t.taskId)
      .map((t, i) => ({
        user_id: user.id,
        date,
        task_id: t.taskId,
        completed: false,
        order_index: i,
      }));

    if (bufferRows.length > 0) {
      const bufferInsert = await supabase.from('daily_task_buffer').insert(bufferRows);
      if (bufferInsert.error) {
        console.error('Failed to insert buffer tasks:', bufferInsert.error);
        return;
      }
    }

    // Step 4: INSERT new calendar events strictly scoped to this drop date
    const eventRows: any[] = [];
    routine.timeSlots.forEach(rSlot => {
      if (rSlot.task?.taskId) {
        eventRows.push({
          user_id: user.id,
          date,
          task_id: rSlot.task.taskId,
          start_time: parseTimeTo24h(rSlot.startTime),
          end_time: parseTimeTo24h(rSlot.endTime),
          completed: false,
          locked: !!rSlot.locked,
        });
      }
    });

    if (eventRows.length > 0) {
      const eventsInsert = await insertCalendarEventsWithLegacyFallback(eventRows);
      if (eventsInsert.error) {
        console.error('Failed to insert calendar events:', eventsInsert.error);
        return;
      }
    }
    await fetchCalendar();
    } catch (error) {
      console.error('applyRoutineToDay failed:', error);
      setCalendar(prev => ({
        ...prev,
        [date]: prev[date] || { date, tasks: [], timeSlots: generateDefaultTimeSlots() },
      }));
    }
  }, [user, calendar, updateDayColor, fetchCalendar]);

  // Batch apply routine to multiple dates with atomic DELETE/INSERT for each
  const batchApplyRoutine = useCallback(async (dates: string[], routine: { tasks: any[]; timeSlots: TimeSlot[]; color?: string }) => {
    if (!user || dates.length === 0) return;

    // Process each date sequentially to avoid overwhelming the database
    for (const date of dates) {
      // Step 1: Apply routine color for this date if allowed
      if (routine.color) {
        await updateDayColor(date, routine.color, false);
      }

      // Step 2: Atomic DELETE for this date
      const [bufferDeleteResult, eventsDeleteResult] = await Promise.all([
        supabase.from('daily_task_buffer').delete().eq('user_id', user.id).eq('date', date),
        supabase.from('calendar_events').delete().eq('user_id', user.id).eq('date', date),
      ]);

      if (bufferDeleteResult.error) {
        console.error('Failed to clear daily_task_buffer for date:', date, bufferDeleteResult.error);
        continue; // Skip this date but continue with others
      }
      if (eventsDeleteResult.error) {
        console.error('Failed to clear calendar_events for date:', date, eventsDeleteResult.error);
        continue;
      }

      // Step 3: INSERT new buffer tasks
      const bufferRows = routine.tasks
        .filter(t => t.taskId)
        .map((t, i) => ({
          user_id: user.id,
          date,
          task_id: t.taskId,
          completed: false,
          order_index: i,
        }));

      if (bufferRows.length > 0) {
        const bufferInsert = await supabase.from('daily_task_buffer').insert(bufferRows);
        if (bufferInsert.error) {
          console.error('Failed to insert buffer tasks for date:', date, bufferInsert.error);
          continue;
        }
      }

      // Step 4: INSERT new time slot events
      const eventRows: any[] = [];
      routine.timeSlots.forEach(rSlot => {
        if (rSlot.task?.taskId) {
          eventRows.push({
            user_id: user.id,
            date,
            task_id: rSlot.task.taskId,
            start_time: parseTimeTo24h(rSlot.startTime),
            end_time: parseTimeTo24h(rSlot.endTime),
            completed: false,
            locked: !!rSlot.locked,
          });
        }
      });

      if (eventRows.length > 0) {
        const eventsInsert = await insertCalendarEventsWithLegacyFallback(eventRows);
        if (eventsInsert.error) {
          console.error('Failed to insert calendar events for date:', date, eventsInsert.error);
          continue;
        }
      }
    }

    // Clear local state for all affected dates
    setCalendar(prev => {
      const newCalendar = { ...prev };
      dates.forEach(date => {
        delete newCalendar[date];
      });
      return newCalendar;
    });

    // Final sync to ensure UI matches DB for all dates
    await fetchCalendar();
  }, [user, fetchCalendar, updateDayColor]);

  const clearDayTimeline = useCallback(async (date: string) => {
    if (!user) return;

    // Delete all calendar_events and daily_task_buffer for this specific date
    const [bufferDeleteResult, eventsDeleteResult] = await Promise.all([
      supabase.from('daily_task_buffer').delete().eq('user_id', user.id).eq('date', date),
      supabase.from('calendar_events').delete().eq('user_id', user.id).eq('date', date),
    ]);

    if (bufferDeleteResult.error) {
      console.error('Failed to clear daily_task_buffer for date:', date, bufferDeleteResult.error);
      return;
    }
    if (eventsDeleteResult.error) {
      console.error('Failed to clear calendar_events for date:', date, eventsDeleteResult.error);
      return;
    }

    // Clear local state for this date
    setCalendar(prev => {
      const newCalendar = { ...prev };
      delete newCalendar[date];
      return newCalendar;
    });
  }, [user]);

  return {
    calendar,
    loading,
    addTaskToDay,
    toggleDayTask,
    updateDayTask,
    removeDayTask,
    assignTaskToDaySlot,
    addSubtaskToDaySlot,
    removeSubtask,
    updateSubtaskPercentages,
    toggleDaySlotTask,
    moveDaySlotToUnassigned,
    addDayTimeSlot,
    deleteDayTimeSlot,
    updateDaySlotTime,
    toggleDaySlotLock,
    updateDaySlotTaskName,
    moveSlotToSlot,
    applyRoutineToDay,
    batchApplyRoutine,
    clearDayTimeline,
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
