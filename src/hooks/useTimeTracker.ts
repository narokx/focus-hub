import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type TimeLog = Tables<'time_logs'>;
export type TimeLogWithDuration = TimeLog & { durationSeconds: number };

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

function sortByRecent(a: TimeLog, b: TimeLog) {
  const aMs = a.last_started_at ? Date.parse(a.last_started_at) : 0;
  const bMs = b.last_started_at ? Date.parse(b.last_started_at) : 0;
  return bMs - aMs;
}

export function useTimeTracker() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const fetchLogs = useCallback(async () => {
    if (!user) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('time_logs')
      .select('id, user_id, task_id, last_started_at, accumulated_seconds, is_running, is_finished')
      .eq('user_id', user.id);

    if (error) {
      console.error('Failed to fetch time logs:', error);
      setLoading(false);
      return;
    }

    setLogs(data ?? []);
    setLoading(false);
  }, [user]);

  const logsWithDuration = useMemo<TimeLogWithDuration[]>(() => {
    return logs.map((log) => ({
      ...log,
      durationSeconds: getLogDurationSeconds(log, nowMs),
    }));
  }, [logs, nowMs]);

  const unfinishedLogs = useMemo(
    () => logsWithDuration.filter((log) => !log.is_finished).sort(sortByRecent),
    [logsWithDuration]
  );

  const finishedLogs = useMemo(
    () => logsWithDuration.filter((log) => log.is_finished).sort(sortByRecent),
    [logsWithDuration]
  );

  const currentLog = unfinishedLogs[0] ?? null;
  const activeLog = unfinishedLogs.find((log) => log.is_running) ?? null;

  const totalSecondsToday = useMemo(() => {
    return logsWithDuration.reduce((sum, log) => sum + log.durationSeconds, 0);
  }, [logsWithDuration]);

  const pauseLog = useCallback(
    async (logId: string) => {
      const log = logs.find((item) => item.id === logId);
      if (!log || !log.is_running || !log.last_started_at) return;

      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(log.last_started_at)) / 1000));
      const { error } = await supabase
        .from('time_logs')
        .update({
          accumulated_seconds: Math.max(0, (log.accumulated_seconds ?? 0) + elapsedSeconds),
          is_running: false,
        })
        .eq('id', logId)
        .eq('user_id', user?.id ?? '');

      if (error) {
        console.error('Failed to pause timer:', error);
        return;
      }

      await fetchLogs();
    },
    [fetchLogs, logs, user?.id]
  );

  const resumeLog = useCallback(
    async (logId: string) => {
      if (!user) return;

      const { error: stopOthersError } = await supabase
        .from('time_logs')
        .update({ is_running: false })
        .eq('user_id', user.id)
        .eq('is_running', true)
        .neq('id', logId);

      if (stopOthersError) {
        console.error('Failed to stop other running timers:', stopOthersError);
        return;
      }

      const { error } = await supabase
        .from('time_logs')
        .update({
          last_started_at: new Date().toISOString(),
          is_running: true,
          is_finished: false,
        })
        .eq('id', logId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Failed to resume timer:', error);
        return;
      }

      await fetchLogs();
    },
    [fetchLogs, user]
  );

  const startNewLog = useCallback(
    async (taskId: string | null) => {
      if (!user) return;

      const { error: stopOthersError } = await supabase
        .from('time_logs')
        .update({ is_running: false })
        .eq('user_id', user.id)
        .eq('is_running', true);

      if (stopOthersError) {
        console.error('Failed to stop existing running timer:', stopOthersError);
        return;
      }

      const { error } = await supabase.from('time_logs').insert({
        user_id: user.id,
        task_id: taskId,
        last_started_at: new Date().toISOString(),
        accumulated_seconds: 0,
        is_running: true,
        is_finished: false,
      });

      if (error) {
        console.error('Failed to create time block:', error);
        return;
      }

      await fetchLogs();
    },
    [fetchLogs, user]
  );

  const finishLog = useCallback(
    async (logId: string) => {
      const log = logs.find((item) => item.id === logId);
      if (!log) return;

      let accumulated = log.accumulated_seconds ?? 0;
      if (log.is_running && log.last_started_at) {
        accumulated += Math.max(0, Math.floor((Date.now() - Date.parse(log.last_started_at)) / 1000));
      }

      const { error } = await supabase
        .from('time_logs')
        .update({
          accumulated_seconds: Math.max(0, accumulated),
          is_running: false,
          is_finished: true,
        })
        .eq('id', logId)
        .eq('user_id', user?.id ?? '');

      if (error) {
        console.error('Failed to finish timer block:', error);
        return;
      }

      await fetchLogs();
    },
    [fetchLogs, logs, user?.id]
  );

  const resetAll = useCallback(async () => {
    if (!user) return;

    const { error } = await supabase.from('time_logs').delete().eq('user_id', user.id);
    if (error) {
      console.error('Failed to reset time logs:', error);
      return;
    }

    await fetchLogs();
  }, [fetchLogs, user]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`time-logs-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'time_logs', filter: `user_id=eq.${user.id}` },
        () => {
          void fetchLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLogs, user]);

  return {
    logsWithDuration,
    unfinishedLogs,
    finishedLogs,
    currentLog,
    activeLog,
    totalSecondsToday,
    loading,
    pauseLog,
    resumeLog,
    startNewLog,
    finishLog,
    resetAll,
    refresh: fetchLogs,
  };
}
