import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const NOTES_KEY = 'task-notes';
const NOTES_UPDATED_KEY = 'task-notes-updated-at';

type RemoteKeyColumn = 'note_key' | 'task_id';
type CachedNote = { content: string; updatedAt: number };

let taskNotesRemoteAvailable = true;
let taskNotesKeyColumn: RemoteKeyColumn = 'note_key';
let taskNotesSchemaChecked = false;
let taskNotesHasTaskIdColumn = false;
const remoteNotesCache = new Map<string, Record<string, CachedNote>>();
const inflightFetches = new Map<string, Promise<void>>();

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

async function ensureTaskNotesSchema(userId: string) {
  if (!taskNotesRemoteAvailable || taskNotesSchemaChecked) return;

  const probeNoteKey = await supabase
    .from('task_notes')
    .select('note_key')
    .eq('user_id', userId)
    .limit(1);

  if (!probeNoteKey.error) {
    taskNotesKeyColumn = 'note_key';
    const probeTaskId = await supabase
      .from('task_notes')
      .select('task_id')
      .eq('user_id', userId)
      .limit(1);
    taskNotesHasTaskIdColumn = !probeTaskId.error;
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
      taskNotesHasTaskIdColumn = true;
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

function buildTaskNotePayload(userId: string, taskId: string) {
  const payload: Record<string, string> = {
    user_id: userId,
    content: '',
  };

  if (taskNotesKeyColumn === 'note_key') {
    payload.note_key = taskId;
    if (taskNotesHasTaskIdColumn) {
      payload.task_id = taskId;
    }
    return payload;
  }

  payload.task_id = taskId;
  payload.note_key = taskId;
  return payload;
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
      .select(`${keyColumn}, content, updated_at`)
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
        content: String(row.content || ''),
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
  const [note, setNote] = useState('');

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      if (!taskId) {
        setNote('');
        return;
      }

      const localNotes = loadLocalNotes();
      const localValue = localNotes[taskId] || '';
      const localUpdatedAt = loadLocalUpdatedMap()[taskId] || 0;
      if (!isCancelled) {
        setNote(localValue);
      }

      if (!user) return;

      await loadRemoteNotesForUser(user.id);
      if (!taskNotesRemoteAvailable) return;

      const remoteValue = remoteNotesCache.get(user.id)?.[taskId];
      if (!remoteValue) return;

      const resolved = localUpdatedAt > remoteValue.updatedAt ? localValue : remoteValue.content || localValue;
      if (!isCancelled) {
        setNote(resolved);
      }

      if (localUpdatedAt > remoteValue.updatedAt && localValue) {
        const keyColumn = taskNotesKeyColumn;
        const payload = buildTaskNotePayload(user.id, taskId);
        payload.content = localValue;

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

  const save = useCallback(async (text: string) => {
    if (!taskId) return;

    setNote(text);
    saveLocalNote(taskId, text);
    saveLocalUpdatedAt(taskId, Date.now());

    if (!user) return;

    const existingCache = remoteNotesCache.get(user.id) || {};
    existingCache[taskId] = { content: text, updatedAt: Date.now() };
    remoteNotesCache.set(user.id, existingCache);

    await ensureTaskNotesSchema(user.id);
    if (!taskNotesRemoteAvailable) return;

    const keyColumn = taskNotesKeyColumn;
    const payload = buildTaskNotePayload(user.id, taskId);
    payload.content = text;

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

  return { note, save };
}
