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
      .update({ content: nextContent, updated_at: new Date().toISOString() })
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
    if (!user) {
      setNoteId(null);
      setContent('');
      setLoading(false);
      return;
    }

    let mounted = true;

    const fetchOrCreateNote = async () => {
      setLoading(true);

      const { data: existing, error: fetchError } = await supabase
        .from('user_notes')
        .select('id, content')
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchError) {
        console.error('Failed to fetch note:', fetchError);
        if (mounted) setLoading(false);
        return;
      }

      if (existing) {
        if (mounted) {
          setNoteId(existing.id);
          setContent(existing.content ?? '');
          setLoading(false);
        }
        return;
      }

      const { data: created, error: createError } = await supabase
        .from('user_notes')
        .insert({ user_id: user.id, content: '' })
        .select('id, content')
        .maybeSingle();

      if (createError) {
        console.error('Failed to create note:', createError);
        if (mounted) setLoading(false);
        return;
      }

      if (mounted) {
        setNoteId(created?.id ?? null);
        setContent(created?.content ?? '');
        setLoading(false);
      }
    };

    fetchOrCreateNote();

    return () => {
      mounted = false;
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
