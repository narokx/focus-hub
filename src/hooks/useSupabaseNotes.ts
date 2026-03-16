import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const SAVE_DEBOUNCE_MS = 500;

export function useSupabaseNotes() {
  const { user } = useAuth();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
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
    setContent(nextContent);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      persistNote(nextContent);
    }, SAVE_DEBOUNCE_MS);
  }, [persistNote]);

  useEffect(() => {
    let isMounted = true;

    if (!user) {
      setNoteId(null);
      setContent('');
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const fetchOrCreateNote = async () => {
      try {
        if (!isMounted) return;
        setLoading(true);

        const { data: existing, error: fetchError } = await supabase
          .from('user_notes')
          .select('id, content')
          .eq('user_id', user.id)
          .maybeSingle()
          .abortSignal(controller.signal);

        if (fetchError) {
          console.error('Failed to fetch note:', fetchError);
          if (!isMounted) return;
          setLoading(false);
          return;
        }

        if (existing) {
          if (!isMounted) return;
          setNoteId(existing.id);
          setContent(existing.content ?? '');
          setLoading(false);
          return;
        }

        const { data: created, error: createError } = await supabase
          .from('user_notes')
          .insert({ user_id: user.id, content: '' })
          .select('id, content')
          .maybeSingle()
          .abortSignal(controller.signal);

        if (createError) {
          console.error('Failed to create note:', createError);
          if (!isMounted) return;
          setLoading(false);
          return;
        }

        if (!isMounted) return;
        setNoteId(created?.id ?? null);
        setContent(created?.content ?? '');
        setLoading(false);
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') {
          return;
        }

        console.error('Failed to fetch or create note:', error);
        if (!isMounted) return;
        setLoading(false);
      }
    };

    fetchOrCreateNote();

    return () => {
      isMounted = false;
      controller.abort();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [user]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    content,
    loading,
    updateNote,
  };
}
