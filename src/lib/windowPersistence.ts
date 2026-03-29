export type Position = { x: number; y: number };
export type Size = { width: number; height: number };
export type WindowPersistValue = Position | Size;

import { supabase } from '@/integrations/supabase/client';

type WindowPositionsPayload = Record<string, WindowPersistValue>;
type WindowLayoutsRow = { window_positions?: unknown; updated_at?: string | null };
type CloudWindowPositionsResult = {
  positions: WindowPositionsPayload;
  updatedAtMs: number;
};

const CLOUD_SYNC_DEBOUNCE_MS = 500;
const LOCAL_LAYOUT_UPDATED_KEY = 'productivity-window-layout-updated-at';
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

const readRemoteRow = async (userId: string): Promise<CloudWindowPositionsResult> => {
  const { data } = await supabase
    .from('ui_layouts')
    .select('window_positions, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  const row = (data ?? null) as WindowLayoutsRow | null;
  return {
    positions: parseWindowPositions(row?.window_positions),
    updatedAtMs: row?.updated_at ? Date.parse(row.updated_at) : 0,
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

  await supabase
    .from('ui_layouts')
    .upsert({ user_id: userId, window_positions: merged, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
};

export const getCloudWindowPositions = async (userId: string): Promise<WindowPositionsPayload> => {
  if (!userId) return {};

  const localUpdatedAt = readLocalLayoutUpdatedAt();
  const remote = await readRemoteRow(userId);

  if (localUpdatedAt > remote.updatedAtMs) {
    void flushCloudSync(userId);
    return {};
  }

  writeLocalLayoutUpdatedAt(Math.max(localUpdatedAt, remote.updatedAtMs, Date.now()));
  return remote.positions;
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
        const nextUpdatedAt = next?.updated_at ? Date.parse(next.updated_at) : Date.now();
        if (readLocalLayoutUpdatedAt() > nextUpdatedAt) return;
        writeLocalLayoutUpdatedAt(nextUpdatedAt);
        onUpdate(parseWindowPositions(next?.window_positions));
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
