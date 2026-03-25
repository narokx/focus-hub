import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const NOTES_KEY = 'task-notes';

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

      const { data, error } = await supabase
        .from('task_notes')
        .select('content')
        .eq('user_id', user.id)
        .eq('note_key', taskId)
        .maybeSingle();

      if (error) {
        console.error('Failed to fetch task note:', error);
        if (!isCancelled) {
          setNote('');
        }
        return;
      }

      if (!isCancelled) {
        setNote(data?.content || '');
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

    const { error } = await supabase
      .from('task_notes')
      .upsert(
        {
          user_id: user.id,
          note_key: taskId,
          content: text,
        },
        { onConflict: 'user_id,note_key' }
      );

    if (error) {
      console.error('Failed to save task note:', error);
    }
  }, [taskId, user]);

  return { note, save };
}
