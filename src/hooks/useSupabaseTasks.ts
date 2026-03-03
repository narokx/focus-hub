import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { QuickTask } from '@/types';

const LOCAL_STORAGE_KEY = 'productivity-heatmap-state';

export function useSupabaseTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<QuickTask[]>([]);
  const [loading, setLoading] = useState(true);
  const syncedRef = useRef(false);

  // Fetch tasks from Supabase
  const fetchTasks = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('tasks')
      .select('id, name, color')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch tasks:', error);
      return;
    }

    const mapped: QuickTask[] = (data || []).map(t => ({
      id: t.id,
      name: t.name,
      color: t.color || '#3B82F6',
    }));

    setTasks(mapped);
    return mapped;
  }, [user]);

  // Silent one-time sync: migrate local tasks to cloud
  const silentSync = useCallback(async (cloudTasks: QuickTask[]) => {
    if (!user || syncedRef.current) return;
    syncedRef.current = true;

    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      const localTasks: QuickTask[] = parsed.quickTasks || [];
      if (localTasks.length === 0) return;

      const cloudIds = new Set(cloudTasks.map(t => t.id));
      const cloudNames = new Set(cloudTasks.map(t => t.name.toLowerCase()));
      const toSync = localTasks.filter(t => !cloudIds.has(t.id) && !cloudNames.has(t.name.toLowerCase()));

      if (toSync.length === 0) return;

      const rows = toSync.map(t => ({
        name: t.name,
        color: t.color,
        user_id: user.id,
      }));

      const { data, error } = await supabase.from('tasks').insert(rows).select('id, name, color');
      if (error) {
        console.error('Silent sync failed:', error);
        return;
      }

      if (data) {
        const newTasks: QuickTask[] = data.map(t => ({
          id: t.id,
          name: t.name,
          color: t.color || '#3B82F6',
        }));
        setTasks(prev => [...prev, ...newTasks]);
      }
    } catch (e) {
      console.error('Silent sync error:', e);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      syncedRef.current = false;
      return;
    }

    setLoading(true);
    fetchTasks().then(cloudTasks => {
      setLoading(false);
      if (cloudTasks) {
        silentSync(cloudTasks);
      }
    });
  }, [user, fetchTasks, silentSync]);

  // CRUD with optimistic updates
  const addTask = useCallback(async (name: string, color: string) => {
    if (!user) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic: QuickTask = { id: tempId, name, color };
    setTasks(prev => [...prev, optimistic]);

    const { data, error } = await supabase
      .from('tasks')
      .insert({ name, color, user_id: user.id })
      .select('id, name, color')
      .maybeSingle();

    if (error || !data) {
      console.error('Failed to add task:', error);
      setTasks(prev => prev.filter(t => t.id !== tempId));
      return;
    }

    setTasks(prev => prev.map(t => t.id === tempId ? { id: data.id, name: data.name, color: data.color || '#3B82F6' } : t));
  }, [user]);

  const updateTask = useCallback(async (id: string, updates: Partial<QuickTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));

    const dbUpdates: Record<string, string> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.color !== undefined) dbUpdates.color = updates.color;

    const { error } = await supabase.from('tasks').update(dbUpdates).eq('id', id);
    if (error) {
      console.error('Failed to update task:', error);
      // Refetch to restore correct state
      fetchTasks();
    }
  }, [fetchTasks]);

  const deleteTask = useCallback(async (id: string) => {
    const prev = tasks;
    setTasks(p => p.filter(t => t.id !== id));

    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete task:', error);
      setTasks(prev);
    }
  }, [tasks]);

  const reorderTasks = useCallback((fromIndex: number, toIndex: number) => {
    setTasks(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, moved);
      return arr;
    });
    // Order is client-side only for now
  }, []);

  return {
    tasks,
    loading,
    addTask,
    updateTask,
    deleteTask,
    reorderTasks,
    setTasks,
    fetchTasks,
  };
}
