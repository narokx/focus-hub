export type Position = { x: number; y: number };
export type Size = { width: number; height: number };
export type WindowPersistValue = Position | Size;

import { supabase } from '@/integrations/supabase/client';

type WindowPositionsPayload = Record<string, WindowPersistValue>;
type WindowLayoutsRow = { window_positions?: unknown; updated_at?: string | null };
type CloudWindowPositionsResult = {
  positions: WindowPositionsPayload;
  updatedAtMs: number;
  source: 'ui_layouts' | 'profiles' | 'none';
};

const CLOUD_SYNC_DEBOUNCE_MS = 500;
const LOCAL_LAYOUT_UPDATED_KEY = 'productivity-window-layout-updated-at';
const ALL_WINDOW_LAYOUT_KEYS = [
  'routines-position',
  'routines-size',
  'tasks-position',
  'tasks-size',
  'calendar-position',
  'calendar-size',
  'weekly-notes-position',
  'weeklyNotes-size',
  'tools-position',
  'tools-size',
  'stopclock-position',
  'stopclock-size',
] as const;
const pendingByUser = new Map<string, WindowPositionsPayload>();
const timersByUser = new Map<string, ReturnType<typeof setTimeout>>();

const parseWindowPositions = (value: unknown): WindowPositionsPayload => {
  if (!value || typeof value !== 'object') return {};
  return value as WindowPositionsPayload;
};

const readLocalLayoutUpdatedAt = (): number => {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem(LOCAL_LAYOUT_UPDATED_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const writeLocalLayoutUpdatedAt = (updatedAtMs: number): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_LAYOUT_UPDATED_KEY, String(updatedAtMs));
};

const readLocalWindowPositions = (): WindowPositionsPayload => {
  if (typeof window === 'undefined') return {};

  return ALL_WINDOW_LAYOUT_KEYS.reduce<WindowPositionsPayload>((acc, key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return acc;

    try {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === 'object' &&
        ((Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) ||
          (Number.isFinite(parsed.width) && Number.isFinite(parsed.height)))
      ) {
        acc[key] = parsed as WindowPersistValue;
      }
    } catch {
      // ignore malformed local entries
    }
    return acc;
  }, {});
};

const readRemoteRow = async (userId: string): Promise<CloudWindowPositionsResult> => {
  const { data, error } = await supabase
    .from('ui_layouts')
    .select('window_positions, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!error) {
    const row = (data ?? null) as WindowLayoutsRow | null;
    return {
      positions: parseWindowPositions(row?.window_positions),
      updatedAtMs: row?.updated_at ? Date.parse(row.updated_at) : 0,
      source: 'ui_layouts',
    };
  }

  console.warn('Failed reading ui_layouts, falling back to profiles.window_positions:', error);

  const { data: profileData, error: profileError } = await (supabase as any)
    .from('profiles')
    .select('window_positions')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    console.error('Failed reading fallback profiles.window_positions:', profileError);
    return { positions: {}, updatedAtMs: 0, source: 'none' };
  }

  return {
    positions: parseWindowPositions(profileData?.window_positions),
    updatedAtMs: 0,
    source: 'profiles',
  };
};

export const getStoredPosition = (key: string, fallback: Position): Position => {
  if (typeof window === 'undefined') return fallback;

  const stored = localStorage.getItem(key);
  if (!stored) return fallback;

  try {
    const parsed = JSON.parse(stored);
    if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return parsed;
    return fallback;
  } catch {
    return fallback;
  }
};

export const getStoredSize = (key: string, fallback: Size): Size => {
  if (typeof window === 'undefined') return fallback;

  const stored = localStorage.getItem(key);
  if (!stored) return fallback;

  try {
    const parsed = JSON.parse(stored);
    if (Number.isFinite(parsed.width) && Number.isFinite(parsed.height)) return parsed;
    return fallback;
  } catch {
    return fallback;
  }
};

export const savePosition = (key: string, position: Position): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(position));
};

export const saveSize = (key: string, size: Size): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(size));
};

export const syncToCloud = (userId: string, key: string, value: WindowPersistValue): void => {
  if (!userId) return;

  const pending = pendingByUser.get(userId) ?? {};
  pendingByUser.set(userId, { ...pending, [key]: value });
  writeLocalLayoutUpdatedAt(Date.now());

  const existingTimer = timersByUser.get(userId);
  if (existingTimer) clearTimeout(existingTimer);

  const nextTimer = setTimeout(() => {
    void flushCloudSync(userId);
  }, CLOUD_SYNC_DEBOUNCE_MS);
  timersByUser.set(userId, nextTimer);
};

const flushCloudSync = async (userId: string): Promise<void> => {
  const pending = pendingByUser.get(userId);
  pendingByUser.delete(userId);
  timersByUser.delete(userId);
  if (!pending || Object.keys(pending).length === 0) return;

  const remote = await readRemoteRow(userId);
  const existingPositions = remote.positions;

  const merged = { ...existingPositions, ...pending };

  const { error } = await supabase
    .from('ui_layouts')
    .upsert({ user_id: userId, window_positions: merged, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (!error) return;

  console.warn('Failed writing ui_layouts, falling back to profiles.window_positions:', error);
  const { error: fallbackError } = await (supabase as any)
    .from('profiles')
    .upsert({ id: userId, window_positions: merged }, { onConflict: 'id' });

  if (fallbackError) {
    console.error('Failed fallback write to profiles.window_positions:', fallbackError);
  }
};

export const getCloudWindowPositions = async (userId: string): Promise<WindowPositionsPayload> => {
  if (!userId) return {};

  const localUpdatedAt = readLocalLayoutUpdatedAt();
  const localPositions = readLocalWindowPositions();
  const remote = await readRemoteRow(userId);

  if (localUpdatedAt > remote.updatedAtMs) {
    if (Object.keys(localPositions).length > 0) {
      const pending = pendingByUser.get(userId) ?? {};
      pendingByUser.set(userId, { ...pending, ...localPositions });
      void flushCloudSync(userId);
    }
    return localPositions;
  }

  writeLocalLayoutUpdatedAt(Math.max(localUpdatedAt, remote.updatedAtMs, Date.now()));
  return remote.positions;
};

export const subscribeToCloudWindowPositions = (
  userId: string,
  onUpdate: (positions: WindowPositionsPayload) => void,
): (() => void) => {
  let channelStatus: string | null = null;

  const channel = supabase
    .channel(`ui-layouts-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'ui_layouts',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const next = payload.new as WindowLayoutsRow;
        const nextUpdatedAt = next?.updated_at ? Date.parse(next.updated_at) : Date.now();
        if (readLocalLayoutUpdatedAt() > nextUpdatedAt) return;
        writeLocalLayoutUpdatedAt(nextUpdatedAt);
        onUpdate(parseWindowPositions(next?.window_positions));
      },
    )
    .subscribe((status) => {
      channelStatus = status;
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('ui_layouts realtime subscription degraded, status:', status);
      }
    });

  return () => {
    if (channelStatus && channelStatus !== 'CLOSED') {
      channel.unsubscribe();
    }
    supabase.removeChannel(channel);
  };
};
