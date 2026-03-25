import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const LOCAL_NOTES_KEY = 'productivity-weekly-notes';

export function useSupabaseNotes() {
  const { user } = useAuth();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const hasLoadedInitialData = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistNote = useCallback(async (nextContent: string) => {
    if (!user || !noteId) return;

    const { error } = await supabase
      .from('user_notes')
      .update({ content: nextContent })
      .eq('id', noteId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Failed to update note:', error);
    }
  }, [noteId, user]);

  const updateNote = useCallback((nextContent: string) => {
    // BLOCK all saves if data hasn't finished loading for the first time
    if (!hasLoadedInitialData.current || loading || !noteId || !user) return;

    setContent(nextContent);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(() => {
      persistNote(nextContent);
    }, 1000);
  }, [persistNote, loading, noteId, user]);

  const fetchNote = useCallback(async () => {
    if (!user) {
      setNoteId(null);
      setContent(localStorage.getItem(LOCAL_NOTES_KEY) || '');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: existing, error: fetchError } = await supabase
        .from('user_notes')
        .select('id, content')
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) {
        console.error('Failed to fetch note:', fetchError);
        setLoading(false);
        return;
      }

      if (existing) {
        localStorage.setItem(LOCAL_NOTES_KEY, existing.content ?? '');
        setNoteId(existing.id);
        setContent(existing.content ?? '');
        hasLoadedInitialData.current = true;
        setLoading(false);
        return;
      }

      const { data: created, error: createError } = await supabase
        .from('user_notes')
        .insert({ user_id: user.id, content: '' })
        .select('id, content')
        .maybeSingle();

      if (createError) {
        console.error('Failed to create note:', createError);
        setLoading(false);
        return;
      }

      setNoteId(created?.id ?? null);
      setContent(created?.content ?? '');
      hasLoadedInitialData.current = true;
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch or create note:', error);
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNote();

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [fetchNote]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    noteId,
    content,
    loading,
    updateNote,
    refresh: fetchNote,
  };
}
