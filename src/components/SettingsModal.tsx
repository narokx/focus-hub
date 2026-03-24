import React, { useRef, useState } from 'react';
import { Settings, Download, Upload, Moon, Sun, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { useTheme } from '@/hooks/useTheme';
import { Routine, generateDefaultTimeSlots } from '@/types';

const STORAGE_KEY = 'productivity-heatmap-state';

export function SettingsModal({
  onImportComplete,
  refreshNotes,
}: {
  onImportComplete?: () => void | Promise<void>;
  refreshNotes?: () => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { signOut, user } = useAuth();

  const isValidUUID = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // ── Export: pull all data from Supabase ──
  const handleExport = async () => {
    if (!user) {
      // Fallback to localStorage for non-authenticated users
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return;
      const parsed = JSON.parse(data);
      const weeklyNotes = localStorage.getItem('productivity-weekly-notes') || '';
      downloadJson(JSON.stringify({ ...parsed, weeklyNotes }));
      return;
    }

    setIsExporting(true);
    try {
      // Fetch all data from Supabase in parallel
      const [tasksRes, routinesRes, routineTasksRes, routineSlotsRes, bufferRes, eventsRes, notesRes] = await Promise.all([
        supabase.from('tasks').select('id, name, color').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('routines').select('id, name, color').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('routine_tasks').select('id, routine_id, task_id, order_index, tasks(id, name, color)').order('order_index', { ascending: true }),
        supabase.from('routine_time_slots').select('id, routine_id, start_time, end_time, task_id, tasks(id, name, color)').order('start_time', { ascending: true }),
        supabase.from('daily_task_buffer').select('id, date, task_id, completed, order_index, tasks(id, name, color)').eq('user_id', user.id).order('order_index', { ascending: true }),
        supabase.from('calendar_events').select('id, date, start_time, end_time, task_id, completed, tasks(id, name, color)').eq('user_id', user.id).order('start_time', { ascending: true }),
        supabase.from('user_notes').select('content').eq('user_id', user.id).maybeSingle(),
      ]);

      // Build quickTasks array
      const quickTasks = (tasksRes.data || []).map(t => ({
        id: t.id,
        name: t.name,
        color: t.color || '#3B82F6',
      }));

      // Build routines with nested structure
      const rtData = routineTasksRes.data || [];
      const rsData = routineSlotsRes.data || [];
      const routines = (routinesRes.data || []).map(r => {
        const tasks = rtData
          .filter(rt => rt.routine_id === r.id)
          .map(rt => {
            const task = rt.tasks as any;
            return {
              id: rt.id,
              taskId: task?.id || rt.task_id || '',
              name: task?.name || '',
              color: task?.color || '#3B82F6',
            };
          });

        const dbSlots = rsData.filter(s => s.routine_id === r.id);
        let timeSlots;
        if (dbSlots.length > 0) {
          timeSlots = dbSlots.map(s => {
            const task = s.tasks as any;
            return {
              id: s.id,
              startTime: s.start_time,
              endTime: s.end_time,
              task: s.task_id && task ? {
                id: `rst-${s.id}`,
                taskId: task.id,
                name: task.name,
                color: task.color || '#3B82F6',
              } : null,
            };
          });
        } else {
          timeSlots = generateDefaultTimeSlots();
        }

        return { id: r.id, name: r.name, color: r.color || '#3B82F6', tasks, timeSlots };
      });

      // Build calendar with nested structure
      const bufferData = bufferRes.data || [];
      const eventsData = eventsRes.data || [];
      const allDates = new Set<string>();
      bufferData.forEach(b => allDates.add(b.date));
      eventsData.forEach(e => allDates.add(e.date));

      const calendar: Record<string, any> = {};
      for (const date of allDates) {
        const dayBuffer = bufferData.filter(b => b.date === date);
        const dayEvents = eventsData.filter(e => e.date === date);

        const tasks = dayBuffer.map(b => {
          const task = b.tasks as any;
          return {
            id: b.id,
            taskId: task?.id || b.task_id || '',
            name: task?.name || '',
            color: task?.color || '#3B82F6',
            completed: b.completed || false,
          };
        });

        const defaultSlots = generateDefaultTimeSlots();
        let timeSlots;
        if (dayEvents.length > 0) {
          const eventSlots = dayEvents.map(e => {
            const task = e.tasks as any;
            return {
              id: e.id,
              startTime: e.start_time,
              endTime: e.end_time,
              task: task ? {
                id: `dst-${e.id}`,
                taskId: task.id,
                name: task.name,
                color: task.color || '#3B82F6',
                completed: e.completed || false,
              } : null,
            };
          });

          timeSlots = defaultSlots.map(ds => {
            const match = eventSlots.find(es => es.startTime === ds.startTime && es.endTime === ds.endTime);
            return match || ds;
          });
          const defaultTimeKeys = new Set(defaultSlots.map(s => `${s.startTime}-${s.endTime}`));
          const extraSlots = eventSlots.filter(es => !defaultTimeKeys.has(`${es.startTime}-${es.endTime}`));
          timeSlots = [...timeSlots, ...extraSlots];
        } else {
          timeSlots = defaultSlots;
        }

        calendar[date] = { date, tasks, timeSlots };
      }

      // Also include localStorage window settings for backward compat
      let windowPositions, windowTitles;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          windowPositions = parsed.windowPositions;
          windowTitles = parsed.windowTitles;
        }
      } catch {}

      const exportData = {
        quickTasks,
        routines,
        calendar,
        weeklyNotes: notesRes.data?.content || '',
        ...(windowPositions && { windowPositions }),
        ...(windowTitles && { windowTitles }),
      };

      downloadJson(JSON.stringify(exportData));
    } catch (e) {
      console.error('Export failed:', e);
      alert('Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  function downloadJson(data: string) {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `productivity-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Reconcile a task name to a UUID, creating if needed
  async function reconcileTaskId(
    name: string,
    color: string,
    userId: string,
    taskNameMap: Map<string, string>
  ): Promise<string | null> {
    const key = name.toLowerCase();
    const existing = taskNameMap.get(key);
    if (existing) return existing;

    const { data, error } = await supabase
      .from('tasks')
      .insert({ name, color: color || '#3B82F6', user_id: userId })
      .select('id')
      .maybeSingle();

    if (error || !data) {
      console.error('Failed to create task during reconciliation:', error);
      return null;
    }

    taskNameMap.set(key, data.id);
    return data.id;
  }

  async function importRoutines(routines: any[], userId: string, taskNameMap: Map<string, string>) {
    const { data: existingRoutines } = await supabase
      .from('routines')
      .select('id, name')
      .eq('user_id', userId);
    
    // Convert to map for ID retrieval
    const existingRoutineMap = new Map((existingRoutines || []).map(r => [r.name.toLowerCase(), r.id]));

    for (const routine of routines) {
      if (!routine.name) continue;

      let routineId: string;
      const lowerName = routine.name.toLowerCase();

      if (existingRoutineMap.has(lowerName)) {
        // Update color of existing routine and assign ID for task insertion
        routineId = existingRoutineMap.get(lowerName)!;
        await supabase
          .from('routines')
          .update({ color: routine.color || '#3B82F6' })
          .eq('id', routineId);
      } else {
        // Build payload dynamically based on UUID validity
        const payload = {
          ...(routine.id && isValidUUID(routine.id) ? { id: routine.id } : {}),
          name: routine.name,
          color: routine.color || '#3B82F6',
          user_id: userId,
        };

        const { data, error } = await supabase
          .from('routines')
          .upsert(payload, { onConflict: 'id' })
          .select('id')
          .maybeSingle();

        if (error || !data) {
          console.error('Failed to upsert routine:', error);
          continue;
        }
        routineId = data.id;
      }

      await supabase.from('routine_tasks').delete().eq('routine_id', routineId);
      await supabase.from('routine_time_slots').delete().eq('routine_id', routineId);
      
      const bufferTasks: any[] = routine.tasks || [];
      const bufferRows = [];
      for (let i = 0; i < bufferTasks.length; i++) {
        const t = bufferTasks[i];
        const resolvedTaskId = await reconcileTaskId(t.name, t.color, userId, taskNameMap);
        if (resolvedTaskId) {
          bufferRows.push({
            routine_id: routineId,
            task_id: resolvedTaskId,
            order_index: i,
          });
        }
      }

      if (bufferRows.length > 0) {
        const { error } = await supabase.from('routine_tasks').insert(bufferRows);
        if (error) console.error('Failed to insert routine_tasks:', error);
      }

      const timeSlots: any[] = routine.timeSlots || [];
      const slotRows = [];
      for (const slot of timeSlots) {
        // Skip empty time slots (no task assigned)
        if (!slot.task) continue;
        let taskId: string | null = null;
        if (slot.task.name) {
          taskId = await reconcileTaskId(slot.task.name, slot.task.color, userId, taskNameMap);
        }
        if (taskId) {
          slotRows.push({
            routine_id: routineId,
            start_time: slot.startTime,
            end_time: slot.endTime,
            task_id: taskId,
          });
        }
      }

      if (slotRows.length > 0) {
        const { error } = await supabase.from('routine_time_slots').insert(slotRows);
        if (error) console.error('Failed to insert routine_time_slots:', error);
      }
    }
  }

  async function importCalendar(calendar: Record<string, any>, userId: string, taskNameMap: Map<string, string>) {
    for (const [date, dayData] of Object.entries(calendar)) {
      if (!dayData) continue;

      // Import buffer tasks
      const tasks: any[] = dayData.tasks || [];
      const bufferRows = [];
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        if (!t.name) continue;
        const resolvedTaskId = await reconcileTaskId(t.name, t.color, userId, taskNameMap);
        if (resolvedTaskId) {
          bufferRows.push({
            user_id: userId,
            date,
            task_id: resolvedTaskId,
            completed: t.completed || false,
            order_index: i,
          });
        }
      }

      if (bufferRows.length > 0) {
        // Deduplicate: delete existing buffer for this date first
        await supabase.from('daily_task_buffer').delete().eq('user_id', userId).eq('date', date);
        const { error } = await supabase.from('daily_task_buffer').insert(bufferRows);
        if (error) console.error('Failed to insert daily_task_buffer:', error);
      }

      // Import time slots (only those with tasks assigned)
      const timeSlots: any[] = dayData.timeSlots || [];
      const eventRows = [];
      for (const slot of timeSlots) {
        if (!slot.task) continue;
        if (!slot.task.name) continue;
        const resolvedTaskId = await reconcileTaskId(slot.task.name, slot.task.color, userId, taskNameMap);
        if (resolvedTaskId) {
          eventRows.push({
            user_id: userId,
            date,
            task_id: resolvedTaskId,
            start_time: slot.startTime,
            end_time: slot.endTime,
            completed: slot.task.completed || false,
          });
        }
      }

      if (eventRows.length > 0) {
        // Deduplicate: delete existing events for this date first
        await supabase.from('calendar_events').delete().eq('user_id', userId).eq('date', date);
        const { error } = await supabase.from('calendar_events').insert(eventRows);
        if (error) console.error('Failed to insert calendar_events:', error);
      }
    }
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target?.result as string;
        const parsed = JSON.parse(data);

        if (!Array.isArray(parsed.quickTasks)) {
          alert('Invalid backup file structure.');
          return;
        }

        // Save to localStorage for backward compatibility
        localStorage.setItem(STORAGE_KEY, data);
        localStorage.setItem('productivity-weekly-notes', parsed.weeklyNotes || '');

        if (user) {
          setIsImporting(true);

          // ── Import quickTasks ──
          const quickTasks: any[] = parsed.quickTasks;
          const withValidId = quickTasks.filter(t => t.id && isValidUUID(t.id));
          const withoutValidId = quickTasks.filter(t => !t.id || !isValidUUID(t.id));

          if (withValidId.length > 0) {
            const rows = withValidId.map(t => ({
              id: t.id,
              name: t.name,
              color: t.color || '#3B82F6',
              user_id: user.id,
            }));
            const { error } = await supabase.from('tasks').upsert(rows, { onConflict: 'id' });
            if (error) {
              console.error('Failed to upsert tasks with valid IDs:', error);
              alert('Failed to import some tasks to cloud.');
              setIsImporting(false);
              return;
            }
          }

          if (withoutValidId.length > 0) {
            const { data: existing } = await supabase
              .from('tasks')
              .select('name')
              .eq('user_id', user.id);
            const existingNames = new Set((existing || []).map(t => t.name.toLowerCase()));

            const newTasks = withoutValidId
              .filter(t => !existingNames.has(t.name.toLowerCase()))
              .map(t => ({
                name: t.name,
                color: t.color || '#3B82F6',
                user_id: user.id,
              }));

            if (newTasks.length > 0) {
              const { error } = await supabase.from('tasks').insert(newTasks);
              if (error) {
                console.error('Failed to insert new tasks:', error);
                alert('Failed to import some tasks to cloud.');
                setIsImporting(false);
                return;
              }
            }
          }

          // Build task name map for reconciliation
          const { data: allTasks } = await supabase
            .from('tasks')
            .select('id, name')
            .eq('user_id', user.id);
          const taskNameMap = new Map<string, string>();
          (allTasks || []).forEach(t => taskNameMap.set(t.name.toLowerCase(), t.id));

          // ── Import routines ──
          if (Array.isArray(parsed.routines) && parsed.routines.length > 0) {
            await importRoutines(parsed.routines, user.id, taskNameMap);
          }

          // ── Import calendar ──
          if (parsed.calendar && typeof parsed.calendar === 'object') {
            await importCalendar(parsed.calendar, user.id, taskNameMap);
          }

          const weeklyNotesContent = parsed.weeklyNotes || '';
          const { data: existingNote, error: noteFetchError } = await supabase
            .from('user_notes')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();

          if (noteFetchError) {
            console.error('Failed to fetch user note during import:', noteFetchError);
          } else if (existingNote?.id) {
            const { error: noteUpdateError } = await supabase
              .from('user_notes')
              .update({ content: weeklyNotesContent })
              .eq('id', existingNote.id)
              .eq('user_id', user.id);

            if (noteUpdateError) {
              console.error('Failed to update user note during import:', noteUpdateError);
            } else if (refreshNotes) {
              await refreshNotes();
            }
          } else {
            const { error: noteInsertError } = await supabase
              .from('user_notes')
              .insert({ user_id: user.id, content: weeklyNotesContent });

            if (noteInsertError) {
              console.error('Failed to insert user note during import:', noteInsertError);
            } else if (refreshNotes) {
              await refreshNotes();
            }
          }

          // Refresh UI state: await so routines/tasks/calendar are re-fetched before success
          if (onImportComplete) {
            await Promise.resolve(onImportComplete());
          }
          setIsImporting(false);
          alert('Data imported successfully!');
        } else {
          alert('Data imported locally. Sign in to sync to cloud.');
        }
      } catch {
        alert('Invalid backup file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
          <Settings className="w-5 h-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your preferences and data</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          {/* Theme Toggle */}
          <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-secondary/30">
            <div className="flex items-center gap-3">
              {theme === 'dark' ? <Moon className="w-5 h-5 text-primary" /> : <Sun className="w-5 h-5 text-primary" />}
              <div>
                <div className="text-sm font-medium">Theme</div>
                <div className="text-xs text-muted-foreground">{theme === 'dark' ? 'Dark mode active' : 'Light mode active'}</div>
              </div>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                theme === 'dark' ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Export */}
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-secondary transition-colors text-left disabled:opacity-50"
          >
            <Download className={`w-5 h-5 text-primary ${isExporting ? 'animate-pulse' : ''}`} />
            <div>
              <div className="text-sm font-medium">{isExporting ? 'Exporting...' : 'Export Data'}</div>
              <div className="text-xs text-muted-foreground">{isExporting ? 'Fetching from cloud...' : 'Download all data as a .json file'}</div>
            </div>
          </button>

          {/* Import */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-secondary transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className={`w-5 h-5 text-primary ${isImporting ? 'animate-pulse' : ''}`} />
            <div>
              <div className="text-sm font-medium">{isImporting ? 'Importing...' : 'Import Data'}</div>
              <div className="text-xs text-muted-foreground">{isImporting ? 'Syncing with Supabase...' : 'Restore from a .json backup'}</div>
            </div>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />

          {/* Sign Out */}
          {user && (
            <>
              <div className="border-t border-border my-1" />
              <div className="px-4 py-1">
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              </div>
              <button
                onClick={signOut}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border border-destructive/30 hover:bg-destructive/10 transition-colors text-left text-destructive"
              >
                <LogOut className="w-5 h-5" />
                <div>
                  <div className="text-sm font-medium">Sign Out</div>
                  <div className="text-xs opacity-70">Log out and return to login</div>
                </div>
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
