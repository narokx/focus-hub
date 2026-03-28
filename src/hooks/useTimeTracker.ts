import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type TimeLog = Tables<'time_logs'>;

function getLocalDayBounds(now = new Date()): { start: string; end: string } {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  return {
    start: startOfDay.toISOString(),
    end: endOfDay.toISOString(),
  };
}

function getLogDurationSeconds(log: TimeLog, nowMs: number): number {
  const startMs = Date.parse(log.start_time);
  const endMs = log.end_time ? Date.parse(log.end_time) : nowMs;

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return 0;
  }

  return Math.floor((endMs - startMs) / 1000);
}

export function useTimeTracker() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const fetchTodayLogs = useCallback(async () => {
    if (!user) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { start, end } = getLocalDayBounds();
    const { data, error } = await supabase
      .from('time_logs')
      .select('id, user_id, task_id, start_time, end_time')
      .eq('user_id', user.id)
      .gte('start_time', start)
      .lt('start_time', end)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Failed to fetch time logs:', error);
      setLoading(false);
      return;
    }

    setLogs(data ?? []);
    setLoading(false);
  }, [user]);

  const activeLog = useMemo(
    () => logs.find((log) => log.end_time === null) ?? null,
    [logs]
  );

  const totalSecondsToday = useMemo(() => {
    return logs.reduce((sum, log) => sum + getLogDurationSeconds(log, nowMs), 0);
  }, [logs, nowMs]);

  const startTimer = useCallback(
    async (taskId?: string) => {
      if (!user) return;
      if (activeLog) return;

      const { error } = await supabase.from('time_logs').insert({
        user_id: user.id,
        task_id: taskId ?? null,
        start_time: new Date().toISOString(),
        end_time: null,
      });

      if (error) {
        console.error('Failed to start timer:', error);
        return;
      }

      await fetchTodayLogs();
    },
    [user, activeLog, fetchTodayLogs]
  );

  const stopTimer = useCallback(async () => {
    if (!activeLog) return;

    const { error } = await supabase
      .from('time_logs')
      .update({ end_time: new Date().toISOString() })
      .eq('id', activeLog.id);

    if (error) {
      console.error('Failed to stop timer:', error);
      return;
    }

    await fetchTodayLogs();
  }, [activeLog, fetchTodayLogs]);

  useEffect(() => {
    void fetchTodayLogs();
  }, [fetchTodayLogs]);

  useEffect(() => {
    if (!activeLog) return;

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeLog]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`time-logs-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_logs',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void fetchTodayLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchTodayLogs]);

  return {
    logs,
    activeLog,
    totalSecondsToday,
    loading,
    startTimer,
    stopTimer,
    refresh: fetchTodayLogs,
  };
}
