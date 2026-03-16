import React, { useState, useMemo } from 'react';
import { Routine, parseTimeTo24h } from '@/types';
import { getColorValue } from '@/types';
import { Layers } from 'lucide-react';
import { cn, formatMinutes } from '@/lib/utils';

interface RoutineAnalyticsPanelProps {
  routines: Routine[];
}

function parseTimeTo24hNum(time: string): number {
  const normalized = parseTimeTo24h(time); // "HH:MM"
  const [h, m] = normalized.split(':').map(Number);
  return h + m / 60;
}

function slotDurationHours(slot: { startTime: string; endTime: string }): number {
  const start = parseTimeTo24hNum(slot.startTime);
  const end = parseTimeTo24hNum(slot.endTime);
  const diff = end - start;
  return diff < 0 ? diff + 24 : diff;
}

interface TaskMetric {
  name: string;
  color: string;
  totalHours: number;
  frequency: number;
  occurrences: { source: string; hours: number }[];
}

export function RoutineAnalyticsPanel({ routines }: RoutineAnalyticsPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<'hours' | 'name' | 'color'>('hours');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);


  const toggleRoutine = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const taskMetrics = useMemo(() => {
    const map = new Map<string, TaskMetric>();
    const selected = routines.filter(r => selectedIds.has(r.id));

    const addMetric = (name: string, color: string, hours: number, source: string) => {
      const existing = map.get(name);
      if (existing) {
        existing.totalHours += hours;
        existing.frequency += 1;
        const occurrence = existing.occurrences.find((entry) => entry.source === source);
        if (occurrence) occurrence.hours += hours;
        else existing.occurrences.push({ source, hours });
      } else {
        map.set(name, {
          name,
          color: getColorValue(color),
          totalHours: hours,
          frequency: 1,
          occurrences: [{ source, hours }],
        });
      }
    };

    for (const routine of selected) {
      for (const slot of routine.timeSlots) {
        if (!slot.task) continue;
        const dur = slotDurationHours(slot);

        const subtasks = slot.task.subtasks || [];
        const subtotalPct = subtasks.reduce((sum, subtask) => sum + subtask.percentage, 0);
        const mainPct = Math.max(0, 100 - subtotalPct);
        const mainDur = dur * (mainPct / 100);

        addMetric(slot.task.name, slot.task.color, mainDur, routine.name);

        for (const subtask of subtasks) {
          const subDur = dur * (subtask.percentage / 100);
          addMetric(subtask.name, subtask.color, subDur, routine.name);
        }
      }
    }

    return map;
  }, [routines, selectedIds]);

  const sortedMetrics = useMemo(() => {
    return Array.from(taskMetrics.values()).sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'hours') cmp = a.totalHours - b.totalHours;
      else if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'color') cmp = a.color.localeCompare(b.color);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [taskMetrics, sortKey, sortDir]);

  const selectedCount = selectedIds.size;
  const maxHours = Math.max(...sortedMetrics.map(m => m.totalHours), 0.1);

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">Routine Analytics</span>
      </div>

      {/* Routine multi-select pills */}
      <div className="flex flex-wrap gap-1.5">
        {routines.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No routines available</span>
        )}
        {routines.map(r => {
          const active = selectedIds.has(r.id);
          return (
            <button
              key={r.id}
              onClick={() => toggleRoutine(r.id)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-secondary text-muted-foreground border-border hover:text-foreground hover:border-foreground/30'
              )}
            >
              {r.name}
            </button>
          );
        })}
      </div>

      {/* Metrics */}
      {selectedCount === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-4">
          Select routines above to see analytics
        </p>
      ) : sortedMetrics.length === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-4">
          No assigned tasks in selected routines
        </p>
      ) : (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-secondary/40 rounded-lg p-2 text-center">
              <div className="text-base font-bold text-foreground">
                {sortedMetrics.reduce((s, m) => s + m.totalHours, 0).toFixed(1)}h
              </div>
              <div className="text-[10px] text-muted-foreground">Total Hours</div>
            </div>
            <div className="bg-secondary/40 rounded-lg p-2 text-center">
              <div className="text-base font-bold text-foreground">
                {selectedCount > 0
                  ? (sortedMetrics.reduce((s, m) => s + m.totalHours, 0) / selectedCount).toFixed(1)
                  : '0.0'}h
              </div>
              <div className="text-[10px] text-muted-foreground">Daily Avg</div>
            </div>
          </div>

          {/* Task breakdown bars */}
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Task Breakdown</h4>
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
                aria-label="Toggle Sort Direction"
              >
                {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {sortedMetrics.map((m) => {
              const dailyAvg = m.totalHours / selectedCount;
              return (
                <div key={m.name}>
                  <div
                    className="flex items-center gap-2 cursor-pointer rounded-sm px-1 py-0.5 hover:bg-secondary/40 transition-colors"
                    onClick={() => setExpandedTask(expandedTask === m.name ? null : m.name)}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: m.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium truncate">{m.name}</span>
                        <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                          {m.totalHours.toFixed(1)}h · {m.frequency}×
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(m.totalHours / maxHours) * 100}%`,
                            backgroundColor: m.color,
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-muted-foreground">
                          Avg {dailyAvg.toFixed(1)}h/day
                        </span>
                      </div>
                    </div>
                  </div>
                  {expandedTask === m.name && m.occurrences.length > 0 && (
                    <div
                      className="bg-background/50 rounded-md p-2 mt-1 ml-5 border-l-2 space-y-1"
                      style={{ borderLeftColor: m.color }}
                    >
                      {m.occurrences.map((occurrence) => (
                        <div
                          key={`${m.name}-${occurrence.source}`}
                          className="flex items-center justify-between text-[11px] text-muted-foreground"
                        >
                          <span>{occurrence.source}</span>
                          <span>{formatMinutes(occurrence.hours)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
