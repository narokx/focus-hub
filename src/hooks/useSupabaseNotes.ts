import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const LOCAL_NOTES_KEY = 'productivity-weekly-notes';
const LOCAL_NOTES_UPDATED_KEY = 'productivity-weekly-notes-updated-at';
const LOCAL_NOTES_CLIENT_ID_KEY = 'productivity-weekly-notes-client-id';

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useSupabaseNotes() {
  const { user } = useAuth();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const isReady = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef('');
  const clientIdRef = useRef('');

  useEffect(() => {
    latestContentRef.current = content;
  }, [content]);

  useEffect(() => {
    const existingClientId = localStorage.getItem(LOCAL_NOTES_CLIENT_ID_KEY);
    if (existingClientId) {
      clientIdRef.current = existingClientId;
      return;
    }

    const generatedClientId = createClientId();
    clientIdRef.current = generatedClientId;
    localStorage.setItem(LOCAL_NOTES_CLIENT_ID_KEY, generatedClientId);
  }, []);

  const readLocalUpdatedAt = useCallback(() => {
    const raw = localStorage.getItem(LOCAL_NOTES_UPDATED_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const persistNote = useCallback(
    async (nextContent: string) => {
      if (!user) return;

      const { data, error } = await supabase
        .from('user_notes')
        .upsert(
          {
            user_id: user.id,
            content: nextContent,
            last_client_id: clientIdRef.current,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('Failed to persist weekly notes:', error);
        return;
      }

      if (data?.id && data.id !== noteId) {
        setNoteId(data.id);
      }
    },
    [user, noteId]
  );
  
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
        .select('id, content, updated_at, last_client_id')
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
          const incomingClientId = (payload.new as { last_client_id?: string | null }).last_client_id;
          if (incomingClientId && incomingClientId === clientIdRef.current) {
            return;
          }

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
