import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

const LOCAL_NOTES_KEY = 'productivity-weekly-notes';
const LOCAL_NOTES_UPDATED_KEY = 'productivity-weekly-notes-updated-at';
const LOCAL_NOTES_CLIENT_ID_KEY = 'productivity-weekly-notes-client-id';
const LOCAL_NOTES_PAGE_INDEX_KEY = 'productivity-weekly-notes-page-index';

function createClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizePages(value: unknown): string[] {
  if (Array.isArray(value)) {
    const cleaned = value.map((page) => (typeof page === 'string' ? page : ''));
    return cleaned.length > 0 ? cleaned : [''];
  }

  if (typeof value === 'string') {
    return [value];
  }

  return [''];
}

function parseLocalPages(): string[] {
  const raw = localStorage.getItem(LOCAL_NOTES_KEY);
  if (!raw) return [''];

  try {
    return normalizePages(JSON.parse(raw));
  } catch {
    return normalizePages(raw);
  }
}

function persistLocalPages(pages: string[]) {
  localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(normalizePages(pages)));
}

export function useSupabaseNotes() {
  const { user } = useAuth();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [pages, setPages] = useState<string[]>(['']);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const isReady = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPagesRef = useRef<string[]>(['']);
  const clientIdRef = useRef(createClientId());

  useEffect(() => {
    latestPagesRef.current = pages;
  }, [pages]);

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
    async (nextPages: string[]) => {
      if (!user) return;

      const sanitizedPages = normalizePages(nextPages);
      const { data, error } = await supabase
        .from('user_notes')
        .upsert(
          {
            user_id: user.id,
            content: sanitizedPages[0] ?? '',
            pages: sanitizedPages as unknown as Json,
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

  const queuePersist = useCallback(
    (nextPages: string[]) => {
      const sanitized = normalizePages(nextPages);
      persistLocalPages(sanitized);
      localStorage.setItem(LOCAL_NOTES_UPDATED_KEY, String(Date.now()));

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        persistNote(sanitized);
      }, 1000);
    },
    [persistNote]
  );

  const saveCurrentPage = useCallback(
    (content: string) => {
      if (!isReady.current || loading) return;

      setPages((prev) => {
        const safe = normalizePages(prev);
        const next = [...safe];
        const boundedIndex = Math.min(Math.max(currentPageIndex, 0), next.length - 1);
        next[boundedIndex] = content;
        queuePersist(next);
        return next;
      });
    },
    [currentPageIndex, loading, queuePersist]
  );

  const setPage = useCallback((index: number) => {
    setCurrentPageIndex((prev) => {
      const maxIndex = Math.max(0, latestPagesRef.current.length - 1);
      const bounded = Math.min(Math.max(index, 0), maxIndex);
      localStorage.setItem(LOCAL_NOTES_PAGE_INDEX_KEY, String(bounded));
      return Number.isFinite(bounded) ? bounded : prev;
    });
  }, []);

  const addPage = useCallback(() => {
    if (!isReady.current || loading) return;

    setPages((prev) => {
      const safe = normalizePages(prev);
      const next = [...safe, ''];
      const nextIndex = next.length - 1;
      setCurrentPageIndex(nextIndex);
      localStorage.setItem(LOCAL_NOTES_PAGE_INDEX_KEY, String(nextIndex));
      queuePersist(next);
      return next;
    });
  }, [loading, queuePersist]);

  const fetchOrCreateNote = useCallback(async () => {
    isReady.current = false;

    if (!user) {
      setNoteId(null);
      const localPages = parseLocalPages();
      const localIndex = Number(localStorage.getItem(LOCAL_NOTES_PAGE_INDEX_KEY) || 0);
      setPages(localPages);
      setCurrentPageIndex(Math.min(Math.max(localIndex, 0), localPages.length - 1));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: existingRows, error: fetchError } = await supabase
        .from('user_notes')
        .select('id, content, pages, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (fetchError) {
        console.error('Failed to fetch note:', fetchError);
        const fallback = parseLocalPages();
        setPages(fallback);
        setCurrentPageIndex(0);
        isReady.current = true;
        setLoading(false);
        return;
      }

      const existing = existingRows?.[0];
      if (existing) {
        const localPages = parseLocalPages();
        const localUpdatedAt = readLocalUpdatedAt();
        const remoteUpdatedAt = existing.updated_at ? Date.parse(existing.updated_at) : 0;
        const remotePages = normalizePages((existing.pages as unknown[]) ?? existing.content ?? '');
        const resolved = localUpdatedAt > remoteUpdatedAt ? localPages : remotePages;
        const localIndex = Number(localStorage.getItem(LOCAL_NOTES_PAGE_INDEX_KEY) || 0);

        persistLocalPages(resolved);
        localStorage.setItem(
          LOCAL_NOTES_UPDATED_KEY,
          String(Math.max(localUpdatedAt, remoteUpdatedAt, Date.now()))
        );

        setNoteId(existing.id);
        setPages(resolved);
        setCurrentPageIndex(Math.min(Math.max(localIndex, 0), resolved.length - 1));

        if (localUpdatedAt > remoteUpdatedAt) {
          void persistNote(localPages);
        }

        isReady.current = true;
        setLoading(false);
        return;
      }

      const local = parseLocalPages();
      const localIndex = Number(localStorage.getItem(LOCAL_NOTES_PAGE_INDEX_KEY) || 0);
      setNoteId(null);
      setPages(local);
      setCurrentPageIndex(Math.min(Math.max(localIndex, 0), local.length - 1));
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
        if (user) {
          void persistNote(latestPagesRef.current);
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

          const nextPages = normalizePages(
            (payload.new as { pages?: unknown; content?: string }).pages ??
              (payload.new as { content?: string }).content ??
              ''
          );
          const nextUpdatedAtRaw = (payload.new as { updated_at?: string }).updated_at;
          const nextUpdatedAt = nextUpdatedAtRaw ? Date.parse(nextUpdatedAtRaw) : Date.now();
          const localUpdatedAt = readLocalUpdatedAt();
          if (localUpdatedAt > nextUpdatedAt) {
            return;
          }

          persistLocalPages(nextPages);
          localStorage.setItem(LOCAL_NOTES_UPDATED_KEY, String(nextUpdatedAt));
          setPages(nextPages);
          setCurrentPageIndex((prev) => Math.min(prev, nextPages.length - 1));
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

  const content = pages[Math.min(currentPageIndex, Math.max(0, pages.length - 1))] ?? '';

  return {
    pages,
    currentPageIndex,
    content,
    loading,
    saveCurrentPage,
    setPage,
    addPage,
    refresh: fetchOrCreateNote,
  };
}
