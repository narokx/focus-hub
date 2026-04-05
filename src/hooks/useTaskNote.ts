import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';

const NOTES_KEY = 'task-notes';
const NOTES_UPDATED_KEY = 'task-notes-updated-at';
const NOTES_PAGE_INDEX_KEY = 'task-notes-page-index';

type RemoteKeyColumn = 'note_key' | 'task_id';
type CachedNote = { pages: string[]; updatedAt: number };

let taskNotesRemoteAvailable = true;
let taskNotesKeyColumn: RemoteKeyColumn = 'note_key';
let taskNotesSchemaChecked = false;
const remoteNotesCache = new Map<string, Record<string, CachedNote>>();
const inflightFetches = new Map<string, Promise<void>>();
const saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function normalizePages(value: unknown): string[] {
  if (Array.isArray(value)) {
    const pages = value.map((page) => (typeof page === 'string' ? page : ''));
    return pages.length > 0 ? pages : [''];
  }
  if (typeof value === 'string') return [value];
  return [''];
}

function loadLocalNotes(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, normalizePages(value)]));
  } catch {
    return {};
  }
}

function saveLocalPages(taskId: string, pages: string[]) {
  const notes = loadLocalNotes();
  notes[taskId] = normalizePages(pages);
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

function loadLocalUpdatedMap(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(NOTES_UPDATED_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveLocalUpdatedAt(taskId: string, timestamp: number) {
  const map = loadLocalUpdatedMap();
  map[taskId] = timestamp;
  localStorage.setItem(NOTES_UPDATED_KEY, JSON.stringify(map));
}

function loadLocalPageIndexMap(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(NOTES_PAGE_INDEX_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveLocalPageIndex(taskId: string, index: number) {
  const map = loadLocalPageIndexMap();
  map[taskId] = index;
  localStorage.setItem(NOTES_PAGE_INDEX_KEY, JSON.stringify(map));
}

async function ensureTaskNotesSchema(userId: string) {
  if (!taskNotesRemoteAvailable || taskNotesSchemaChecked) return;

  const probeNoteKey = await supabase
    .from('task_notes')
    .select('note_key')
    .eq('user_id', userId)
    .limit(1);

  if (!probeNoteKey.error) {
    taskNotesKeyColumn = 'note_key';
    taskNotesSchemaChecked = true;
    return;
  }

  if (probeNoteKey.error.code === '42P01') {
    taskNotesRemoteAvailable = false;
    taskNotesSchemaChecked = true;
    return;
  }

  if (probeNoteKey.error.code === '42703') {
    const probeTaskId = await supabase
      .from('task_notes')
      .select('task_id')
      .eq('user_id', userId)
      .limit(1);

    if (!probeTaskId.error) {
      taskNotesKeyColumn = 'task_id';
      taskNotesSchemaChecked = true;
      return;
    }

    if (probeTaskId.error?.code === '42P01') {
      taskNotesRemoteAvailable = false;
    }
    taskNotesSchemaChecked = true;
    return;
  }

  console.error('Failed to probe task_notes schema:', probeNoteKey.error);
}

async function loadRemoteNotesForUser(userId: string) {
  if (!taskNotesRemoteAvailable) return;
  await ensureTaskNotesSchema(userId);
  if (!taskNotesRemoteAvailable) return;

  if (inflightFetches.has(userId)) {
    await inflightFetches.get(userId);
    return;
  }

  const fetchPromise = (async () => {
    const keyColumn = taskNotesKeyColumn;
    const { data, error } = await supabase
      .from('task_notes')
      .select(`${keyColumn}, content, pages, updated_at`)
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to fetch task notes:', error);
      if (error.code === '42P01') {
        taskNotesRemoteAvailable = false;
      }
      return;
    }

    const cache: Record<string, CachedNote> = {};
    for (const row of (data || []) as Array<Record<string, unknown>>) {
      const key = String(row[keyColumn] || '').trim();
      if (!key) continue;
      cache[key] = {
        pages: normalizePages((row.pages as unknown[]) ?? row.content ?? ''),
        updatedAt: row.updated_at ? Date.parse(String(row.updated_at)) : 0,
      };
    }

    remoteNotesCache.set(userId, cache);
  })();

  inflightFetches.set(userId, fetchPromise);
  try {
    await fetchPromise;
  } finally {
    inflightFetches.delete(userId);
  }
}

export function useTaskNote(taskId: string | null) {
  const { user } = useAuth();
  const [pages, setPages] = useState<string[]>(['']);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const activeTaskRef = useRef<string | null>(taskId);
  const latestPagesRef = useRef<string[]>(['']);

  useEffect(() => {
    activeTaskRef.current = taskId;
  }, [taskId]);

  useEffect(() => {
    latestPagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      if (!taskId) {
        setPages(['']);
        setCurrentPageIndex(0);
        return;
      }

      const localNotes = loadLocalNotes();
      const localPages = normalizePages(localNotes[taskId]);
      const localUpdatedAt = loadLocalUpdatedMap()[taskId] || 0;
      const localPageIndex = loadLocalPageIndexMap()[taskId] || 0;
      if (!isCancelled) {
        setPages(localPages);
        setCurrentPageIndex(Math.min(Math.max(localPageIndex, 0), localPages.length - 1));
      }

      if (!user) return;

      await loadRemoteNotesForUser(user.id);
      if (!taskNotesRemoteAvailable) return;

      const remoteValue = remoteNotesCache.get(user.id)?.[taskId];
      if (!remoteValue) return;

      const resolved = localUpdatedAt > remoteValue.updatedAt ? localPages : remoteValue.pages;
      if (!isCancelled) {
        setPages(resolved);
        setCurrentPageIndex((prev) => Math.min(prev, resolved.length - 1));
      }

      if (localUpdatedAt > remoteValue.updatedAt) {
        const keyColumn = taskNotesKeyColumn;
        const payload = {
          user_id: user.id,
          [keyColumn]: taskId,
          content: localPages[0] ?? '',
          pages: localPages as unknown as Json,
        } as Record<string, string | Json>;

        const { error } = await supabase.from('task_notes').upsert(payload, {
          onConflict: `user_id,${keyColumn}`,
        });

        if (error && error.code !== '23505') {
          console.error('Failed to backfill newer local task note:', error);
        }
      }
    };

    load();

    return () => {
      isCancelled = true;
    };
  }, [taskId, user]);

  const persistPages = useCallback(async (nextPages: string[]) => {
    if (!taskId) return;

    const safePages = normalizePages(nextPages);
    saveLocalPages(taskId, safePages);
    saveLocalUpdatedAt(taskId, Date.now());

    if (!user) return;

    const existingCache = remoteNotesCache.get(user.id) || {};
    existingCache[taskId] = { pages: safePages, updatedAt: Date.now() };
    remoteNotesCache.set(user.id, existingCache);

    await ensureTaskNotesSchema(user.id);
    if (!taskNotesRemoteAvailable) return;

    const keyColumn = taskNotesKeyColumn;
    const payload = {
      user_id: user.id,
      [keyColumn]: taskId,
      content: safePages[0] ?? '',
      pages: safePages as unknown as Json,
    } as Record<string, string | Json>;

    const { error } = await supabase.from('task_notes').upsert(payload, {
      onConflict: `user_id,${keyColumn}`,
    });

    if (error) {
      console.error('Failed to save task note:', error);
      if (error.code === '42P01') {
        taskNotesRemoteAvailable = false;
      }
    }
  }, [taskId, user]);

  const queuePersist = useCallback((nextPages: string[]) => {
    if (!taskId) return;
    const prior = saveTimeouts.get(taskId);
    if (prior) clearTimeout(prior);

    const timeout = setTimeout(() => {
      void persistPages(nextPages);
      saveTimeouts.delete(taskId);
    }, 700);

    saveTimeouts.set(taskId, timeout);
  }, [taskId, persistPages]);

  const saveCurrentPage = useCallback((content: string) => {
    if (!taskId) return;

    setPages((prev) => {
      const safe = normalizePages(prev);
      const next = [...safe];
      const index = Math.min(Math.max(currentPageIndex, 0), next.length - 1);
      next[index] = content;
      queuePersist(next);
      return next;
    });
  }, [taskId, currentPageIndex, queuePersist]);

  const setPage = useCallback((index: number) => {
    if (!taskId) return;

    setCurrentPageIndex((prev) => {
      const maxIndex = Math.max(0, pages.length - 1);
      const bounded = Math.min(Math.max(index, 0), maxIndex);
      saveLocalPageIndex(taskId, bounded);
      return Number.isFinite(bounded) ? bounded : prev;
    });
  }, [taskId, pages.length]);

  const addPage = useCallback(() => {
    if (!taskId) return;

    setPages((prev) => {
      const safe = normalizePages(prev);
      const next = [...safe, ''];
      const nextIndex = next.length - 1;
      setCurrentPageIndex(nextIndex);
      saveLocalPageIndex(taskId, nextIndex);
      queuePersist(next);
      return next;
    });
  }, [taskId, queuePersist]);

  const deletePage = useCallback((index: number) => {
    if (!taskId) return;

    setPages((prev) => {
      const safe = normalizePages(prev);
      if (safe.length <= 1) {
        return safe;
      }

      const boundedIndex = Math.min(Math.max(index, 0), safe.length - 1);
      const next = safe.filter((_, pageIndex) => pageIndex !== boundedIndex);
      const nextIndex = Math.max(0, Math.min(boundedIndex - 1, next.length - 1));
      setCurrentPageIndex(nextIndex);
      saveLocalPageIndex(taskId, nextIndex);
      queuePersist(next);
      return next;
    });
  }, [taskId, queuePersist]);

  useEffect(() => {
    return () => {
      const currentTaskId = activeTaskRef.current;
      if (!currentTaskId) return;
      const pending = saveTimeouts.get(currentTaskId);
      if (pending) {
        clearTimeout(pending);
        saveTimeouts.delete(currentTaskId);
        void persistPages(latestPagesRef.current);
      }
    };
  }, [persistPages]);

  const note = pages[Math.min(currentPageIndex, Math.max(0, pages.length - 1))] ?? '';

  return {
    note,
    pages,
    currentPageIndex,
    saveCurrentPage,
    setPage,
    addPage,
    deletePage,
    save: saveCurrentPage,
  };
}
