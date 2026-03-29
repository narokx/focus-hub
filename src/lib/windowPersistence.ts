export type Position = { x: number; y: number };
export type Size = { width: number; height: number };

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
