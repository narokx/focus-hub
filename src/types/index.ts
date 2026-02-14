export type TaskColor = 
  | 'coral' 
  | 'orange' 
  | 'amber' 
  | 'lime' 
  | 'emerald' 
  | 'teal' 
  | 'cyan' 
  | 'blue' 
  | 'indigo' 
  | 'violet' 
  | 'pink' 
  | 'rose';

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

export const TASK_COLORS: TaskColor[] = [
  'coral', 'orange', 'amber', 'lime', 'emerald', 'teal',
  'cyan', 'blue', 'indigo', 'violet', 'pink', 'rose',
];

export const TASK_COLOR_MAP: Record<TaskColor, string> = {
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

export function getContrastColor(color: TaskColor): 'white' | 'black' {
  const darkColors: TaskColor[] = ['coral', 'emerald', 'teal', 'blue', 'indigo', 'violet', 'pink', 'rose'];
  return darkColors.includes(color) ? 'white' : 'black';
}

function formatHour(hour: number): string {
  const h24 = hour % 24;
  const h12 = h24 % 12 || 12;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  return `${h12.toString().padStart(2, '0')}:00 ${ampm}`;
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
