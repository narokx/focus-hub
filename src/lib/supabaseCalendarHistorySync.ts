import { supabase } from '@/integrations/supabase/client';
import type { DayData } from '@/types';

type CalendarState = Record<string, DayData>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined | null): value is string {
  return !!value && UUID_RE.test(value);
}

function daySignature(day?: DayData): string {
  const tasks = day?.tasks ?? [];
  const bufferSig = tasks
    .map(t => `${t.taskId || ''}:${t.completed ? 1 : 0}`)
    .join('|');

  const slots = day?.timeSlots ?? [];
  const events = slots
    .filter(s => !!s.task)
    .map(s => `${s.startTime}-${s.endTime}:${s.task?.taskId || ''}:${s.task?.completed ? 1 : 0}`)
    // Order independent
    .sort();

  return `${bufferSig}##${events.join('|')}`;
}

function getAffectedDates(fromCalendar: CalendarState, toCalendar: CalendarState): string[] {
  const dates = new Set<string>([...Object.keys(fromCalendar || {}), ...Object.keys(toCalendar || {})]);
  const affected: string[] = [];

  for (const date of dates) {
    if (daySignature(fromCalendar?.[date]) !== daySignature(toCalendar?.[date])) {
      affected.push(date);
    }
  }

  return affected;
}

async function replaceDateInSupabase(args: {
  userId: string;
  date: string;
  targetDay?: DayData;
}) {
  const { userId, date, targetDay } = args;

  // 1) Clear rows for that date (guarantees no ghosts)
  const [bufDel, evDel] = await Promise.all([
    supabase.from('daily_task_buffer').delete().eq('user_id', userId).eq('date', date),
    supabase.from('calendar_events').delete().eq('user_id', userId).eq('date', date),
  ]);

  if (bufDel.error) throw bufDel.error;
  if (evDel.error) throw evDel.error;

  // 2) Re-insert desired buffer rows
  const bufferRows = (targetDay?.tasks ?? []).map((t, i) => {
    const row: Record<string, any> = {
      user_id: userId,
      date,
      task_id: t.taskId || null,
      completed: !!t.completed,
      order_index: i,
    };

    // Preserve DB ids when available (important for stable history snapshots)
    if (isUuid(t.id)) row.id = t.id;
    return row;
  });

  if (bufferRows.length > 0) {
    const ins = await supabase.from('daily_task_buffer').insert(bufferRows);
    if (ins.error) throw ins.error;
  }

  // 3) Re-insert desired calendar events (only slots with task)
  const eventRows = (targetDay?.timeSlots ?? [])
    .filter(s => !!s.task)
    .map(s => {
      const row: Record<string, any> = {
        user_id: userId,
        date,
        task_id: s.task?.taskId || null,
        start_time: s.startTime,
        end_time: s.endTime,
        completed: !!s.task?.completed,
      };

      // Preserve DB ids when available; if this is a default slot id (ts-*) we let DB generate one.
      if (!s.id.startsWith('ts-') && isUuid(s.id)) row.id = s.id;
      return row;
    });

  if (eventRows.length > 0) {
    const ins = await supabase.from('calendar_events').insert(eventRows);
    if (ins.error) throw ins.error;
  }
}

/**
 * DB-synchronized transition used by history undo/redo.
 *
 * Guarantees that after transitioning UI from `fromCalendar` -> `toCalendar`,
 * Supabase tables (daily_task_buffer, calendar_events) match `toCalendar` exactly.
 */
export async function syncCalendarForHistoryTransition(args: {
  userId: string;
  fromCalendar: CalendarState;
  toCalendar: CalendarState;
}) {
  const { userId, fromCalendar, toCalendar } = args;

  const affectedDates = getAffectedDates(fromCalendar || {}, toCalendar || {});
  if (affectedDates.length === 0) return;

  // Execute sequentially to reduce race conditions / row-level conflicts.
  for (const date of affectedDates) {
    await replaceDateInSupabase({ userId, date, targetDay: toCalendar[date] });
  }
}
