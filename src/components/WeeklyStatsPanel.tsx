import React, { useMemo, useState } from 'react';
import { format, startOfWeek, endOfWeek, subWeeks, eachDayOfInterval, parseISO } from 'date-fns';
import { DayData } from '@/types';
import { getColorValue } from '@/types';
import { BarChart2 } from 'lucide-react';

type Range = 'this-week' | 'last-week' | 'all-time';

interface WeeklyStatsPanelProps {
  calendar: Record<string, DayData>;
}

function parseTimeToHours(time: string): number {
  // e.g. "07:00 AM", "01:00 PM"
  const match = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return 0;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h + m / 60;
}

function slotDuration(slot: { startTime: string; endTime: string }): number {
  const start = parseTimeToHours(slot.startTime);
  const end = parseTimeToHours(slot.endTime);
  const diff = end - start;
  // handle overnight wrap
  return diff < 0 ? diff + 24 : diff;
}

interface TaskStat {
  name: string;
  color: string;
  hours: number;
  count: number;
}

function computeStats(calendar: Record<string, DayData>, dateRange: string[]): TaskStat[] {
  const map = new Map<string, TaskStat>();

  for (const date of dateRange) {
    const day = calendar[date];
    if (!day) continue;

    // Slot tasks
    for (const slot of day.timeSlots || []) {
      if (!slot.task) continue;
      const key = slot.task.name;
      const dur = slotDuration(slot);
      const existing = map.get(key);
      if (existing) {
        existing.hours += dur;
        existing.count += 1;
      } else {
        map.set(key, { name: slot.task.name, color: getColorValue(slot.task.color), hours: dur, count: 1 });
      }
    }

    // Unassigned tasks (count as 0 hours but show in stats)
    for (const task of day.tasks || []) {
      const key = task.name;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { name: task.name, color: getColorValue(task.color), hours: 0, count: 1 });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.hours - a.hours);
}

export function WeeklyStatsPanel({ calendar }: WeeklyStatsPanelProps) {
  const [range, setRange] = useState<Range>('this-week');

  const dateRange = useMemo(() => {
    const now = new Date();
    if (range === 'this-week') {
      const start = startOfWeek(now);
      const end = endOfWeek(now);
      return eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'));
    } else if (range === 'last-week') {
      const start = startOfWeek(subWeeks(now, 1));
      const end = endOfWeek(subWeeks(now, 1));
      return eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'));
    } else {
      return Object.keys(calendar).sort();
    }
  }, [range, calendar]);

  const stats = useMemo(() => computeStats(calendar, dateRange), [calendar, dateRange]);

  const totalHours = stats.reduce((sum, s) => sum + s.hours, 0);
  const maxHours = Math.max(...stats.map(s => s.hours), 1);

  const rangeLabel = range === 'this-week'
    ? `${format(startOfWeek(new Date()), 'MMM d')} – ${format(endOfWeek(new Date()), 'MMM d')}`
    : range === 'last-week'
      ? `${format(startOfWeek(subWeeks(new Date(), 1)), 'MMM d')} – ${format(endOfWeek(subWeeks(new Date(), 1)), 'MMM d')}`
      : 'All Time';

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
          <option value="all-time">All Time</option>
        </select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-secondary/40 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-foreground">{totalHours.toFixed(1)}h</div>
          <div className="text-xs text-muted-foreground">Total Scheduled</div>
        </div>
        <div className="bg-secondary/40 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-foreground">{stats.length}</div>
          <div className="text-xs text-muted-foreground">Unique Tasks</div>
        </div>
      </div>

      {/* Task breakdown */}
      <div className="flex-1 overflow-auto scrollbar-thin min-h-0">
        {stats.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground italic text-center">No tasks in this period.<br />Schedule some tasks on the calendar!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {stats.map((stat, i) => (
              <div key={i} className="flex items-center gap-2 group">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: stat.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium truncate">{stat.name}</span>
                    <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                      {stat.hours > 0 ? `${stat.hours.toFixed(1)}h` : `${stat.count}×`}
                    </span>
                  </div>
                  {stat.hours > 0 && (
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(stat.hours / maxHours) * 100}%`,
                          backgroundColor: stat.color,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
