import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getContrastColor(color: string): '#000000' | '#ffffff' {
  const darkPresets = new Set(['coral', 'emerald', 'teal', 'blue', 'indigo', 'violet', 'pink', 'rose']);
  if (darkPresets.has(color)) return '#ffffff';

  const lightPresets = new Set(['amber', 'lime', 'cyan', 'orange']);
  if (lightPresets.has(color)) return '#000000';

  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const normalized = hex.length === 3
      ? hex.split('').map((char) => `${char}${char}`).join('')
      : hex;

    if (normalized.length === 6) {
      const r = parseInt(normalized.slice(0, 2), 16);
      const g = parseInt(normalized.slice(2, 4), 16);
      const b = parseInt(normalized.slice(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.5 ? '#000000' : '#ffffff';
    }
  }

  return '#ffffff';
}
