export type TaskColor = string;

export interface QuickTask {
  id: string;
  name: string;
  color: TaskColor;
}

export interface DayTask {
  id: string;
  taskId: string;
  name: string;
  color: TaskColor;
  completed: boolean;
}

export interface TimeSlotTask {
  id: string;
  taskId: string;
  name: string;
  color: TaskColor;
  completed?: boolean;
}

export interface TimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  task?: TimeSlotTask | null;
}

export interface DayData {
  date: string;
  tasks: DayTask[]; // unassigned buffer
  timeSlots: TimeSlot[];
}

export interface Routine {
  id: string;
  name: string;
  tasks: Array<{
    id: string;
    taskId: string;
    name: string;
    color: TaskColor;
  }>; // unassigned buffer
  timeSlots: TimeSlot[];
}

export interface WindowPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppState {
  quickTasks: QuickTask[];
  routines: Routine[];
  calendar: Record<string, DayData>;
  windowPositions: {
    calendar: WindowPosition;
    routines: WindowPosition;
    quickTasks: WindowPosition;
  };
  windowTitles: {
    calendar: string;
    routines: string;
    quickTasks: string;
  };
}

export const PRESET_COLORS: { name: string; value: string }[] = [
  { name: 'coral', value: '#FF6B6B' },
  { name: 'orange', value: '#FF9F43' },
  { name: 'amber', value: '#FECA57' },
  { name: 'lime', value: '#A3CB38' },
  { name: 'emerald', value: '#10AC84' },
  { name: 'teal', value: '#0ABDE3' },
  { name: 'cyan', value: '#48DBFB' },
  { name: 'blue', value: '#3B82F6' },
  { name: 'indigo', value: '#6366F1' },
  { name: 'violet', value: '#8B5CF6' },
  { name: 'pink', value: '#EC4899' },
  { name: 'rose', value: '#F43F5E' },
];

// Legacy preset name to hex map
const LEGACY_COLOR_MAP: Record<string, string> = {
  coral: '#FF6B6B',
  orange: '#FF9F43',
  amber: '#FECA57',
  lime: '#A3CB38',
  emerald: '#10AC84',
  teal: '#0ABDE3',
  cyan: '#48DBFB',
  blue: '#3B82F6',
  indigo: '#6366F1',
  violet: '#8B5CF6',
  pink: '#EC4899',
  rose: '#F43F5E',
};

// Old CSS variable map for backward compat
const CSS_VAR_MAP: Record<string, string> = {
  coral: 'hsl(var(--task-coral))',
  orange: 'hsl(var(--task-orange))',
  amber: 'hsl(var(--task-amber))',
  lime: 'hsl(var(--task-lime))',
  emerald: 'hsl(var(--task-emerald))',
  teal: 'hsl(var(--task-teal))',
  cyan: 'hsl(var(--task-cyan))',
  blue: 'hsl(var(--task-blue))',
  indigo: 'hsl(var(--task-indigo))',
  violet: 'hsl(var(--task-violet))',
  pink: 'hsl(var(--task-pink))',
  rose: 'hsl(var(--task-rose))',
};

export const TASK_COLORS: string[] = [
  'coral', 'orange', 'amber', 'lime', 'emerald', 'teal',
  'cyan', 'blue', 'indigo', 'violet', 'pink', 'rose',
];

export const TASK_COLOR_MAP: Record<string, string> = CSS_VAR_MAP;

export function getColorValue(color: TaskColor): string {
  // If it's a CSS variable preset name, use that
  if (CSS_VAR_MAP[color]) return CSS_VAR_MAP[color];
  // Otherwise it's a raw hex/color value
  return color;
}

export function getContrastColor(color: TaskColor): 'white' | 'black' {
  // Known dark preset names
  const darkPresets = ['coral', 'emerald', 'teal', 'blue', 'indigo', 'violet', 'pink', 'rose'];
  if (darkPresets.includes(color)) return 'white';
  // Known light preset names
  const lightPresets = ['amber', 'lime', 'cyan', 'orange'];
  if (lightPresets.includes(color)) return 'black';
  // Custom hex: calculate luminance
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? 'black' : 'white';
  }
  return 'white';
}

function formatHour(hour: number): string {
  const h24 = hour % 24;
  return `${h24.toString().padStart(2, '0')}:00`;
}

export function parseTimeTo24h(time: string): string {
  // Already 24h (e.g. "07:00")
  if (/^\d{2}:\d{2}$/.test(time)) return time;
  // 12h format (e.g. "07:00 AM")
  const match = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return time;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function generateDefaultTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let i = 0; i < 18; i++) {
    const startHour = (7 + i) % 24;
    const endHour = (8 + i) % 24;
    slots.push({
      id: `ts-${i}`,
      startTime: formatHour(startHour),
      endTime: formatHour(endHour),
      task: null,
    });
  }
  return slots;
}
