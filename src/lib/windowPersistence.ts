export type Position = { x: number; y: number };
export type Size = { width: number; height: number };
export type WindowPersistValue = Position | Size;

import { supabase } from '@/integrations/supabase/client';

type WindowPositionsPayload = Record<string, WindowPersistValue>;

const CLOUD_SYNC_DEBOUNCE_MS = 500;
const pendingByUser = new Map<string, WindowPositionsPayload>();
const timersByUser = new Map<string, ReturnType<typeof setTimeout>>();

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

  const { data: existingRow } = await (supabase as any)
    .from('profiles')
    .select('window_positions')
    .eq('id', userId)
    .maybeSingle();

  const existingPositions =
    existingRow && typeof existingRow.window_positions === 'object' && existingRow.window_positions
      ? existingRow.window_positions
      : {};

  const merged = { ...existingPositions, ...pending };

  await (supabase as any)
    .from('profiles')
    .upsert({ id: userId, window_positions: merged }, { onConflict: 'id' });
};

export const getCloudWindowPositions = async (userId: string): Promise<WindowPositionsPayload> => {
  if (!userId) return {};

  const { data: existingRow } = await (supabase as any)
    .from('profiles')
    .select('window_positions')
    .eq('id', userId)
    .maybeSingle();

  if (!existingRow || !existingRow.window_positions || typeof existingRow.window_positions !== 'object') {
    return {};
  }

  return existingRow.window_positions as WindowPositionsPayload;
};
