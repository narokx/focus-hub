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

export interface DayData {
  date: string; // YYYY-MM-DD
  tasks: DayTask[];
}

export interface Routine {
  id: string;
  name: string;
  tasks: Array<{
    id: string;
    taskId: string;
    name: string;
    color: TaskColor;
  }>;
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
}

export const TASK_COLORS: TaskColor[] = [
  'coral',
  'orange', 
  'amber',
  'lime',
  'emerald',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'violet',
  'pink',
  'rose',
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
  // Colors that need white text
  const darkColors: TaskColor[] = ['coral', 'emerald', 'teal', 'blue', 'indigo', 'violet', 'pink', 'rose'];
  return darkColors.includes(color) ? 'white' : 'black';
}
