import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const LOCAL_NOTES_KEY = 'productivity-weekly-notes';

export function useSupabaseNotes() {
  const { user } = useAuth();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const isReady = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistNote = useCallback(async (nextContent: string) => {
    if (!user) return;

    const { data, error } = await supabase
      .from('user_notes')
      .upsert(
        { user_id: user.id, content: nextContent },
        { onConflict: 'user_id' }
      )
      .select('id')
      .single();

    if (error) {
      console.error('Failed to update note:', error);
      return;
    }

    setNoteId(data.id);
  }, [user]);

  const updateNote = useCallback((nextContent: string) => {
    if (!isReady.current || loading) return;

    setContent(nextContent);
    localStorage.setItem(LOCAL_NOTES_KEY, nextContent);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      persistNote(nextContent);
    }, 1000);
  }, [persistNote, loading]);

  const fetchOrCreateNote = useCallback(async () => {
    isReady.current = false;

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
        .order('updated_at', { ascending: false })
        .limit(1)
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
        isReady.current = true;
        setLoading(false);
        return;
      }

      const { data: created, error: createError } = await supabase
        .from('user_notes')
        .upsert({ user_id: user.id, content: '' }, { onConflict: 'user_id' })
        .select('id, content')
        .single();

      if (createError) {
        console.error('Failed to create note:', createError);
        setLoading(false);
        return;
      }

      setNoteId(created?.id ?? null);
      setContent(created?.content ?? '');
      isReady.current = true;
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch or create note:', error);
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchOrCreateNote();

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [fetchOrCreateNote]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`user-notes-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_notes',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const nextContent = (payload.new as { content?: string }).content ?? '';
          setContent(nextContent);
          localStorage.setItem(LOCAL_NOTES_KEY, nextContent);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
    refresh: fetchOrCreateNote,
  };
}
