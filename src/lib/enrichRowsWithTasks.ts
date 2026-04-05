import { supabase } from '@/integrations/supabase/client';

type TaskLikeRow = {
  task_id?: string | null;
  [key: string]: any;
};

type EnrichRowsWithTasksResult<T extends TaskLikeRow> = {
  data: Array<T & { tasks: { id: string; name: string; color: string | null } | null }> | null;
  error: any;
};

export async function enrichRowsWithTasks<T extends TaskLikeRow>(rows: T[]): Promise<EnrichRowsWithTasksResult<T>> {
  const taskIds = Array.from(new Set(rows.map((row) => row.task_id).filter(Boolean)));
  if (taskIds.length === 0) {
    return {
      data: rows.map((row) => ({ ...row, tasks: null })),
      error: null,
    };
  }

  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, name, color')
    .in('id', taskIds);

  if (tasksError) {
    return { data: null, error: tasksError };
  }

  const taskMap = new Map((tasks || []).map((task) => [task.id, task]));
  return {
    data: rows.map((row) => ({
      ...row,
      tasks: row.task_id ? taskMap.get(row.task_id) || null : null,
    })),
    error: null,
  };
}
