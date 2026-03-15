import React, { useMemo, useState } from 'react';
import { format, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, eachDayOfInterval, parseISO } from 'date-fns';
import { DayData } from '@/types';
import { getColorValue, Routine } from '@/types';
import { BarChart2, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RoutineAnalyticsPanel } from '@/components/RoutineAnalyticsPanel';

type Range = 'this-week' | 'last-week' | 'this-month' | 'last-30' | 'all-time' | 'custom';

interface WeeklyStatsPanelProps {
  calendar: Record<string, DayData>;
  routines?: Routine[];
}

function parseTimeTo24hNum(time: string): number {
  // 24h format: "07:00"
  const match24 = time.match(/^(\d+):(\d+)$/);
  if (match24) return parseInt(match24[1]) + parseInt(match24[2]) / 60;
  // 12h format: "07:00 AM"
  const match12 = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match12) return 0;
  let h = parseInt(match12[1]);
  const m = parseInt(match12[2]);
  const ampm = match12[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h + m / 60;
}

function slotDuration(slot: { startTime: string; endTime: string }): number {
  const start = parseTimeTo24hNum(slot.startTime);
  const end = parseTimeTo24hNum(slot.endTime);
  const diff = end - start;
  return diff < 0 ? diff + 24 : diff;
}

interface TaskStat {
  name: string;
  color: string;
  hours: number;
  doneHours: number;
  count: number;
}

function computeStats(calendar: Record<string, DayData>, dateRange: string[]): TaskStat[] {
  const map = new Map<string, TaskStat>();

  const addStat = (name: string, color: string, hours: number, doneHours: number) => {
    const existing = map.get(name);
    if (existing) {
      existing.hours += hours;
      existing.doneHours += doneHours;
      existing.count += 1;
    } else {
      map.set(name, { name, color: getColorValue(color), hours, doneHours, count: 1 });
    }
  };

  for (const date of dateRange) {
    const day = calendar[date];
    if (!day) continue;

    for (const slot of day.timeSlots || []) {
      if (!slot.task) continue;
      const dur = slotDuration(slot);

      const subtasks = slot.task.subtasks || [];
      const subtotalPct = subtasks.reduce((sum, subtask) => sum + subtask.percentage, 0);
      const mainPct = 100 - subtotalPct;
      const mainDur = dur * (mainPct / 100);
      const mainDoneDur = slot.task.completed ? mainDur : 0;

      addStat(slot.task.name, slot.task.color, mainDur, mainDoneDur);

      for (const subtask of subtasks) {
        const subDur = dur * (subtask.percentage / 100);
        const subDoneDur = slot.task.completed ? subDur : 0;
        addStat(subtask.name, subtask.color, subDur, subDoneDur);
      }
    }

    for (const task of day.tasks || []) {
      const key = task.name;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { name: task.name, color: getColorValue(task.color), hours: 0, doneHours: 0, count: 1 });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.hours - a.hours);
}

export function WeeklyStatsPanel({ calendar, routines = [] }: WeeklyStatsPanelProps) {
  const [range, setRange] = useState<Range>('this-week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sortKey, setSortKey] = useState<'hours' | 'name' | 'color'>('hours');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const dateRange = useMemo(() => {
    const now = new Date();
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
    if (range === 'this-week') {
      return eachDayOfInterval({ start: startOfWeek(now), end: endOfWeek(now) }).map(fmt);
    } else if (range === 'last-week') {
      const prev = subWeeks(now, 1);
      return eachDayOfInterval({ start: startOfWeek(prev), end: endOfWeek(prev) }).map(fmt);
    } else if (range === 'this-month') {
      return eachDayOfInterval({ start: startOfMonth(now), end: endOfMonth(now) }).map(fmt);
    } else if (range === 'last-30') {
      const start = new Date(now); start.setDate(start.getDate() - 29);
      return eachDayOfInterval({ start, end: now }).map(fmt);
    } else if (range === 'custom' && customStart && customEnd) {
      try {
        const s = parseISO(customStart);
        const e = parseISO(customEnd);
        if (s <= e) return eachDayOfInterval({ start: s, end: e }).map(fmt);
      } catch {
        return [];
      }
    } else {
      return Object.keys(calendar).sort();
    }
  }, [range, calendar, customStart, customEnd]);

  const taskStats = useMemo(() => computeStats(calendar, dateRange), [calendar, dateRange]);

  const sortedTaskStats = useMemo(() => {
    return [...taskStats].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'hours') cmp = a.hours - b.hours;
      else if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'color') cmp = a.color.localeCompare(b.color);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [taskStats, sortKey, sortDir]);

  const totalHours = taskStats.reduce((sum, s) => sum + s.hours, 0);
  const totalDone = taskStats.reduce((sum, s) => sum + s.doneHours, 0);
  const maxHours = Math.max(...taskStats.map(s => s.hours), 1);

  const rangeLabel = useMemo(() => {
    const now = new Date();
    if (range === 'this-week') return `${format(startOfWeek(now), 'MMM d')} – ${format(endOfWeek(now), 'MMM d')}`;
    if (range === 'last-week') {
      const prev = subWeeks(now, 1);
      return `${format(startOfWeek(prev), 'MMM d')} – ${format(endOfWeek(prev), 'MMM d')}`;
    }
    if (range === 'this-month') return format(now, 'MMMM yyyy');
    if (range === 'last-30') return 'Last 30 Days';
    if (range === 'custom') return 'Custom Range';
    return 'All Time';
  }, [range]);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{rangeLabel}</span>
        </div>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as Range)}
          className="text-xs bg-secondary border border-input rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
        >
          <option value="this-week">This Week</option>
          <option value="last-week">Last Week</option>
          <option value="this-month">This Month</option>
          <option value="last-30">Last 30 Days</option>
          <option value="all-time">All Time</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>

      {/* Custom range pickers */}
      {range === 'custom' && (
        <div className="flex items-center gap-2 p-2 bg-secondary/40 rounded-lg">
          <Calendar className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="flex-1 text-xs bg-transparent border border-input rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="flex-1 text-xs bg-transparent border border-input rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-secondary/40 rounded-lg p-2 text-center">
          <div className="text-base font-bold text-foreground">{totalHours.toFixed(1)}h</div>
          <div className="text-[10px] text-muted-foreground">Scheduled</div>
        </div>
        <div className="bg-secondary/40 rounded-lg p-2 text-center">
          <div className="text-base font-bold" style={{ color: 'hsl(142 71% 45%)' }}>{totalDone.toFixed(1)}h</div>
          <div className="text-[10px] text-muted-foreground">Completed</div>
        </div>
        <div className="bg-secondary/40 rounded-lg p-2 text-center">
          <div className="text-base font-bold text-foreground">{taskStats.length}</div>
          <div className="text-[10px] text-muted-foreground">Tasks</div>
        </div>
      </div>

      {/* Task breakdown */}
      <div className="flex-1 overflow-auto scrollbar-thin min-h-0">
        {taskStats.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground italic text-center">No tasks in this period.<br />Schedule some tasks on the calendar!</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <div className="w-2 h-2 rounded-full bg-primary" />
                <span>Task Distribution</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="text-xs bg-secondary rounded px-2 py-1 border-none outline-none text-foreground"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as 'hours' | 'name' | 'color')}
                >
                  <option value="hours">Hours</option>
                  <option value="name">Name</option>
                  <option value="color">Color</option>
                </select>
                <button
                  onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="text-xs bg-secondary hover:bg-secondary/80 rounded px-2 py-1"
                >
                  {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {sortedTaskStats.map((stat, i) => {
              const successPct = stat.hours > 0 ? (stat.doneHours / stat.hours) * 100 : 0;
              const failedHours = stat.hours - stat.doneHours;
              const failedPct = stat.hours > 0 ? (failedHours / stat.hours) * 100 : 0;
              return (
                <div key={i} className="flex items-center gap-2 group">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stat.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium truncate">{stat.name}</span>
                      <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                        {stat.hours > 0 ? `${stat.doneHours.toFixed(1)}/${stat.hours.toFixed(1)}h` : `${stat.count}×`}
                      </span>
                    </div>
                    {stat.hours > 0 && (
                      <div className="h-2 bg-secondary rounded-full overflow-hidden flex">
                        {/* Success bar */}
                        <div
                          className="h-full transition-all duration-500"
                          style={{
                            width: `${(successPct / 100) * (stat.hours / maxHours) * 100}%`,
                            backgroundColor: stat.color,
                          }}
                        />
                        {/* Failure bar */}
                        {failedPct > 0 && (
                          <div
                            className="h-full bg-destructive transition-all duration-500 opacity-70"
                            style={{
                              width: `${(failedPct / 100) * (stat.hours / maxHours) * 100}%`,
                            }}
                          />
                        )}
                      </div>
                    )}
                    {stat.hours > 0 && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-muted-foreground">✓ {stat.doneHours.toFixed(1)}h done</span>
                        {failedHours > 0.01 && (
                          <span className="text-[9px] text-destructive">✗ {failedHours.toFixed(1)}h missed</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          </>
        )}
      </div>
      {/* Routine Analytics Section */}
      {routines.length > 0 && (
        <>
          <div className="border-t border-border my-2" />
          <RoutineAnalyticsPanel routines={routines} />
        </>
      )}
    </div>
  );
}
