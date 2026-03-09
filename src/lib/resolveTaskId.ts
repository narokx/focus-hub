import { supabase } from '@/integrations/supabase/client';

/**
 * Non-destructive task resolution: finds an existing task by name (case-insensitive)
 * or creates a new one inheriting the given color. Returns the resolved task ID.
 */
export async function resolveTaskId(
  name: string,
  color: string,
  userId: string
): Promise<string | null> {
  // Case-insensitive lookup
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', name)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  // Create new task
  const { data: created, error } = await supabase
    .from('tasks')
    .insert({ name, color, user_id: userId })
    .select('id')
    .maybeSingle();

  if (error || !created) {
    console.error('Failed to resolve/create task:', error);
    return null;
  }

  return created.id;
}
