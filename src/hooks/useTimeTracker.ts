import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type TimeLog = Tables<'time_logs'>;
type TimeLogWithDuration = TimeLog & { durationSeconds: number };

function getLogDurationSeconds(log: TimeLog, nowMs: number): number {
  const baseSeconds = Math.max(0, log.accumulated_seconds ?? 0);

  if (!log.is_running || !log.last_started_at) {
    return baseSeconds;
  }

  const startedAtMs = Date.parse(log.last_started_at);
  if (Number.isNaN(startedAtMs) || nowMs <= startedAtMs) {
    return baseSeconds;
  }

  return baseSeconds + Math.floor((nowMs - startedAtMs) / 1000);
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

    const { data, error } = await supabase
      .from('time_logs')
      .select('id, user_id, task_id, last_started_at, accumulated_seconds, is_running')
      .eq('user_id', user.id)
      .order('last_started_at', { ascending: true, nullsFirst: true });

    if (error) {
      console.error('Failed to fetch time logs:', error);
      setLoading(false);
      return;
    }

    setLogs(data ?? []);
    setLoading(false);
  }, [user]);

  const activeLog = useMemo(
    () => logs.find((log) => log.is_running) ?? null,
    [logs]
  );

  const mostRecentLog = useMemo(() => {
    if (logs.length === 0) return null;

    return [...logs].sort((a, b) => {
      const aMs = a.last_started_at ? Date.parse(a.last_started_at) : 0;
      const bMs = b.last_started_at ? Date.parse(b.last_started_at) : 0;
      return bMs - aMs;
    })[0] ?? null;
  }, [logs]);

  const logsWithDuration = useMemo<TimeLogWithDuration[]>(() => {
    return logs.map((log) => ({
      ...log,
      durationSeconds: getLogDurationSeconds(log, nowMs),
    }));
  }, [logs, nowMs]);

  const totalSecondsToday = useMemo(() => {
    return logsWithDuration.reduce((sum, log) => sum + log.durationSeconds, 0);
  }, [logsWithDuration]);

  const toggleTimer = useCallback(
    async (logId: string) => {
      const log = logs.find((item) => item.id === logId);
      if (!log) return;

      if (log.is_running && log.last_started_at) {
        const elapsedSeconds = Math.max(
          0,
          Math.floor((Date.now() - Date.parse(log.last_started_at)) / 1000)
        );

        const { error } = await supabase
          .from('time_logs')
          .update({
            accumulated_seconds: Math.max(0, (log.accumulated_seconds ?? 0) + elapsedSeconds),
            last_started_at: null,
            is_running: false,
          })
          .eq('id', logId);

        if (error) {
          console.error('Failed to pause timer block:', error);
          return;
        }
      } else {
        const { error } = await supabase
          .from('time_logs')
          .update({
            last_started_at: new Date().toISOString(),
            is_running: true,
          })
          .eq('id', logId);

        if (error) {
          console.error('Failed to resume timer block:', error);
          return;
        }
      }

      await fetchTodayLogs();
    },
    [logs, fetchTodayLogs]
  );

  const createNewBlock = useCallback(
    async (taskId?: string) => {
      if (!user) return;

      const { error } = await supabase.from('time_logs').insert({
        user_id: user.id,
        task_id: taskId ?? null,
        last_started_at: null,
        accumulated_seconds: 0,
        is_running: false,
      });

      if (error) {
        console.error('Failed to create time block:', error);
        return;
      }

      await fetchTodayLogs();
    },
    [user, fetchTodayLogs]
  );

  const assignTask = useCallback(
    async (logId: string, taskId: string) => {
      const { error } = await supabase
        .from('time_logs')
        .update({ task_id: taskId })
        .eq('id', logId);

      if (error) {
        console.error('Failed to assign task to time block:', error);
        return;
      }

      await fetchTodayLogs();
    },
    [fetchTodayLogs]
  );

  useEffect(() => {
    void fetchTodayLogs();
  }, [fetchTodayLogs]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

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
    logsWithDuration,
    activeLog,
    mostRecentLog,
    totalSecondsToday,
    loading,
    toggleTimer,
    createNewBlock,
    assignTask,
    refresh: fetchTodayLogs,
  };
}
