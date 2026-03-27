import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const LOCAL_NOTES_KEY = 'productivity-weekly-notes';
const LOCAL_NOTES_UPDATED_KEY = 'productivity-weekly-notes-updated-at';

export function useSupabaseNotes() {
  const { user } = useAuth();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const isReady = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef('');

  useEffect(() => {
    latestContentRef.current = content;
  }, [content]);

  const readLocalUpdatedAt = useCallback(() => {
    const raw = localStorage.getItem(LOCAL_NOTES_UPDATED_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const persistNote = useCallback(async (nextContent: string) => {
    if (!user) return;

    const { data: updatedRows, error: updateError } = await supabase
      .from('user_notes')
      .update({ content: nextContent })
      .eq('user_id', user.id)
      .select('id');

    if (updateError) {
      console.error('Failed to update weekly notes rows:', updateError);
      return;
    }

    if (updatedRows && updatedRows.length > 0) {
      setNoteId(updatedRows[0].id);
      return;
    }

    const { data: created, error: createError } = await supabase
      .from('user_notes')
      .insert({ user_id: user.id, content: nextContent })
      .select('id')
      .maybeSingle();

    if (createError) {
      console.error('Failed to create note while persisting:', createError);
      return;
    }

    setNoteId(created?.id ?? null);
  }, [user]);

  const updateNote = useCallback((nextContent: string) => {
    if (!isReady.current || loading) return;

    setContent(nextContent);
    localStorage.setItem(LOCAL_NOTES_KEY, nextContent);
    localStorage.setItem(LOCAL_NOTES_UPDATED_KEY, String(Date.now()));

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

      const { data: existingRows, error: fetchError } = await supabase
        .from('user_notes')
        .select('id, content, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (fetchError) {
        console.error('Failed to fetch note:', fetchError);
        setContent(localStorage.getItem(LOCAL_NOTES_KEY) || '');
        isReady.current = true;
        setLoading(false);
        return;
      }

      const existing = existingRows?.[0];
      if (existing) {
        const local = localStorage.getItem(LOCAL_NOTES_KEY) || '';
        const localUpdatedAt = readLocalUpdatedAt();
        const remoteUpdatedAt = existing.updated_at ? Date.parse(existing.updated_at) : 0;
        const remote = existing.content ?? '';
        const resolved = localUpdatedAt > remoteUpdatedAt ? local : remote || local;
        localStorage.setItem(LOCAL_NOTES_KEY, resolved);
        localStorage.setItem(
          LOCAL_NOTES_UPDATED_KEY,
          String(Math.max(localUpdatedAt, remoteUpdatedAt, Date.now()))
        );
        setNoteId(existing.id);
        setContent(resolved);
        if (localUpdatedAt > remoteUpdatedAt && local) {
          void persistNote(local);
        }
        isReady.current = true;
        setLoading(false);
        return;
      }

      const local = localStorage.getItem(LOCAL_NOTES_KEY) || '';
      setNoteId(null);
      setContent(local);
      isReady.current = true;
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch or create note:', error);
      setLoading(false);
    }
  }, [user, persistNote, readLocalUpdatedAt]);

  useEffect(() => {
    fetchOrCreateNote();

    return () => {
      if (saveTimeoutRef.current) {
        if (user && latestContentRef.current) {
          void persistNote(latestContentRef.current);
        }
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [fetchOrCreateNote, persistNote, user]);

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
          const nextUpdatedAtRaw = (payload.new as { updated_at?: string }).updated_at;
          const nextUpdatedAt = nextUpdatedAtRaw ? Date.parse(nextUpdatedAtRaw) : Date.now();
          const localUpdatedAt = readLocalUpdatedAt();
          if (localUpdatedAt > nextUpdatedAt) {
            return;
          }
          setContent(nextContent);
          localStorage.setItem(LOCAL_NOTES_KEY, nextContent);
          localStorage.setItem(LOCAL_NOTES_UPDATED_KEY, String(nextUpdatedAt));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, readLocalUpdatedAt]);

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
