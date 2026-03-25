import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const NOTES_KEY = 'task-notes';
let taskNotesRemoteAvailable = true;

function loadLocalNotes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveLocalNote(taskId: string, note: string) {
  const notes = loadLocalNotes();
  notes[taskId] = note;
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

export function useTaskNote(taskId: string | null) {
  const { user } = useAuth();
  const [note, setNote] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      if (!taskId) {
        setNote('');
        return;
      }

      if (!user) {
        const notes = loadLocalNotes();
        if (!isCancelled) {
          setNote(notes[taskId] || '');
        }
        return;
      }

      const localNotes = loadLocalNotes();
      const localValue = localNotes[taskId] || '';
      if (!isCancelled) {
        setNote(localValue);
      }

      if (!taskNotesRemoteAvailable) {
        return;
      }

      const { data, error } = await supabase
        .from('task_notes')
        .select('content')
        .eq('user_id', user.id)
        .eq('note_key', taskId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch task note:', error);
        if (error.code === '42P01') {
          taskNotesRemoteAvailable = false;
        }
        return;
      }

      if (!isCancelled) {
        setNote(data?.content || localValue);
      }
    };

    load();

    return () => {
      isCancelled = true;
    };
  }, [taskId, user]);

  const save = useCallback(async (text: string) => {
    if (!taskId) return;

    setNote(text);
    saveLocalNote(taskId, text);

    if (!user) return;
    if (!taskNotesRemoteAvailable) return;

    const { data: existing, error: fetchError } = await supabase
      .from('task_notes')
      .select('id')
      .eq('user_id', user.id)
      .eq('note_key', taskId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error('Failed to fetch existing task note:', fetchError);
      if (fetchError.code === '42P01') {
        taskNotesRemoteAvailable = false;
      }
      return;
    }

    if (existing?.id) {
      const { error } = await supabase
        .from('task_notes')
        .update({ content: text })
        .eq('id', existing.id)
        .eq('user_id', user.id);
      if (error) {
        console.error('Failed to update task note:', error);
      }
      return;
    }

    const { error } = await supabase
      .from('task_notes')
      .insert({
        user_id: user.id,
        note_key: taskId,
        content: text,
      });

    if (error) {
      console.error('Failed to insert task note:', error);
      if (error.code === '42P01') {
        taskNotesRemoteAvailable = false;
      }
    }
  }, [taskId, user]);

  return { note, save };
}
