export type Position = { x: number; y: number };
export type Size = { width: number; height: number };
export type WindowPersistValue = Position | Size | boolean;

import { supabase } from '@/integrations/supabase/client';

type WindowPositionsPayload = Record<string, WindowPersistValue>;
type WindowLayoutsRow = { window_positions?: unknown; updated_at?: string | null };
type CloudWindowPositionsResult = {
  positions: WindowPositionsPayload;
  source: 'ui_layouts' | 'profiles' | 'none';
};

const CLOUD_SYNC_DEBOUNCE_MS = 500;
const ALL_WINDOW_LAYOUT_KEYS = [
  'routines-position',
  'routines-size',
  'routines-minimized',
  'tasks-position',
  'tasks-size',
  'tasks-minimized',
  'calendar-position',
  'calendar-size',
  'calendar-minimized',
  'weekly-notes-position',
  'weekly-notes-size',
  'weekly-notes-minimized',
  'tools-position',
  'tools-size',
  'tools-minimized',
  'stopclock-position',
  'stopclock-size',
] as const;
const pendingByUser = new Map<string, WindowPositionsPayload>();
const timersByUser = new Map<string, ReturnType<typeof setTimeout>>();
const localWriteTimestampsByUser = new Map<string, Map<string, number>>();
const REMOTE_RECONCILE_COOLDOWN_MS = 4000;
const SUPABASE_URL = (() => {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL ?? 'https://wjnsfhvwrsfzpwghjjnh.supabase.co').origin;
  } catch {
    return 'https://wjnsfhvwrsfzpwghjjnh.supabase.co';
  }
})();
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqbnNmaHZ3cnNmenB3Z2hqam5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0OTI4MzcsImV4cCI6MjA4ODA2ODgzN30.X-RUfUhhHvM-NBDr5i-95jlXBWsh8U2toND3azydNEo';

const parseWindowPositions = (value: unknown): WindowPositionsPayload => {
  if (!value || typeof value !== 'object') return {};
  return value as WindowPositionsPayload;
};

const isEqualPersistValue = (a: WindowPersistValue | undefined, b: WindowPersistValue | undefined): boolean => {
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;

  const aPosition = a as Position;
  const bPosition = b as Position;
  if (Number.isFinite(aPosition.x) || Number.isFinite(aPosition.y) || Number.isFinite(bPosition.x) || Number.isFinite(bPosition.y)) {
    return aPosition.x === bPosition.x && aPosition.y === bPosition.y;
  }

  const aSize = a as Size;
  const bSize = b as Size;
  return aSize.width === bSize.width && aSize.height === bSize.height;
};

const markLocalWindowMutation = (userId: string, key: string) => {
  const byKey = localWriteTimestampsByUser.get(userId) ?? new Map<string, number>();
  byKey.set(key, Date.now());
  localWriteTimestampsByUser.set(userId, byKey);
};

export const shouldApplyCloudValue = (userId: string, key: string, nextValue: WindowPersistValue): boolean => {
  const pending = pendingByUser.get(userId);
  const pendingValue = pending?.[key];
  if (pendingValue !== undefined && !isEqualPersistValue(pendingValue, nextValue)) {
    return false;
  }

  const localWriteAt = localWriteTimestampsByUser.get(userId)?.get(key);
  if (!localWriteAt) return true;

  return Date.now() - localWriteAt > REMOTE_RECONCILE_COOLDOWN_MS;
};

const readLocalWindowPositions = (): WindowPositionsPayload => {
  if (typeof window === 'undefined') return {};

  return ALL_WINDOW_LAYOUT_KEYS.reduce<WindowPositionsPayload>((acc, key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return acc;

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'boolean') {
        acc[key] = parsed;
      } else if (
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

const writeLocalLayoutUpdatedAt = (timestamp: number): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('window-layout-updated-at', String(timestamp));
  }
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
    return { positions: {}, source: 'none' };
  }

  return {
    positions: parseWindowPositions(profileData?.window_positions),
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

export const getStoredSizeWithLegacyKey = (key: string, legacyKey: string, fallback: Size): Size => {
  const next = getStoredSize(key, fallback);
  if (next.width !== fallback.width || next.height !== fallback.height) {
    return next;
  }
  return getStoredSize(legacyKey, fallback);
};

export const getStoredMinimized = (key: string, fallback: boolean): boolean => {
  if (typeof window === 'undefined') return fallback;

  const stored = localStorage.getItem(key);
  if (!stored) return fallback;

  try {
    const parsed = JSON.parse(stored);
    if (typeof parsed === 'boolean') return parsed;
    return fallback;
  } catch {
    return fallback;
  }
};

export const getStoredMinimizedWithLegacyKey = (key: string, legacyKey: string, fallback: boolean): boolean => {
  const next = getStoredMinimized(key, fallback);
  if (next !== fallback) {
    return next;
  }
  return getStoredMinimized(legacyKey, fallback);
};

export const savePosition = (key: string, position: Position): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(position));
};

export const saveSize = (key: string, size: Size): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(size));
};

export const saveMinimized = (key: string, minimized: boolean): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(minimized));
};

export const syncToCloud = (userId: string, key: string, value: WindowPersistValue): void => {
  if (!userId) return;

  markLocalWindowMutation(userId, key);

  const pending = pendingByUser.get(userId) ?? {};
  const localSnapshot = readLocalWindowPositions();
  pendingByUser.set(userId, { ...localSnapshot, ...pending, [key]: value });
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

export const flushCloudSyncNow = async (userId: string): Promise<void> => {
  if (!userId) return;
  const existingTimer = timersByUser.get(userId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    timersByUser.delete(userId);
  }
  await flushCloudSync(userId);
};

const readAccessTokenFromStorage = (): string | null => {
  if (typeof window === 'undefined') return null;
  const authTokenKey = Object.keys(localStorage).find((key) => key.endsWith('-auth-token'));
  if (!authTokenKey) return null;

  const raw = localStorage.getItem(authTokenKey);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      access_token?: string;
      currentSession?: { access_token?: string };
    };
    return parsed.currentSession?.access_token ?? parsed.access_token ?? null;
  } catch {
    return null;
  }
};

export const flushCloudSyncKeepalive = (userId: string): void => {
  if (!userId || typeof window === 'undefined') return;

  const pending = pendingByUser.get(userId) ?? {};
  const localSnapshot = readLocalWindowPositions();
  const positions = { ...localSnapshot, ...pending };
  if (Object.keys(positions).length === 0) return;

  const accessToken = readAccessTokenFromStorage();
  if (!accessToken) return;

  pendingByUser.delete(userId);
  const timer = timersByUser.get(userId);
  if (timer) {
    clearTimeout(timer);
    timersByUser.delete(userId);
  }

  writeLocalLayoutUpdatedAt(Date.now());

  void fetch(`${SUPABASE_URL}/rest/v1/ui_layouts?on_conflict=user_id`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: userId,
      window_positions: positions,
      updated_at: new Date().toISOString(),
    }),
  }).catch(() => {
    // Ignore keepalive failures; regular sync on next session will recover.
  });
};

export const getCloudWindowPositions = async (userId: string): Promise<WindowPositionsPayload> => {
  if (!userId) return {};

  const localPositions = readLocalWindowPositions();
  const remote = await readRemoteRow(userId);
  const hasRemote = Object.keys(remote.positions).length > 0;

  if (hasRemote) {
    return remote.positions;
  }

  if (Object.keys(localPositions).length > 0) {
    const pending = pendingByUser.get(userId) ?? {};
    pendingByUser.set(userId, { ...pending, ...localPositions });
    void flushCloudSync(userId);
  }

  return localPositions;
};

export const subscribeToCloudWindowPositions = (
  userId: string,
  onUpdate: (positions: WindowPositionsPayload) => void,
): (() => void) => {
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
        onUpdate(parseWindowPositions(next?.window_positions));
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('ui_layouts realtime subscription degraded, status:', status);
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
};
