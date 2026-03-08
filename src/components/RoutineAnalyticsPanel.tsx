import React, { useState, useMemo } from 'react';
import { Routine } from '@/types';
import { getColorValue } from '@/types';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoutineAnalyticsPanelProps {
  routines: Routine[];
}

function parseTimeTo24hNum(time: string): number {
  const match24 = time.match(/^(\d+):(\d+)$/);
  if (match24) return parseInt(match24[1]) + parseInt(match24[2]) / 60;
  const match12 = time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match12) return 0;
  let h = parseInt(match12[1]);
  const m = parseInt(match12[2]);
  const ampm = match12[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
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
}

export function RoutineAnalyticsPanel({ routines }: RoutineAnalyticsPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleRoutine = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const metrics = useMemo(() => {
    const map = new Map<string, TaskMetric>();
    const selected = routines.filter(r => selectedIds.has(r.id));

    for (const routine of selected) {
      for (const slot of routine.timeSlots) {
        if (!slot.task) continue;
        const dur = slotDurationHours(slot);
        const key = slot.task.name;
        const existing = map.get(key);
        if (existing) {
          existing.totalHours += dur;
          existing.frequency += 1;
        } else {
          map.set(key, {
            name: slot.task.name,
            color: getColorValue(slot.task.color),
            totalHours: dur,
            frequency: 1,
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalHours - a.totalHours);
  }, [routines, selectedIds]);

  const selectedCount = selectedIds.size;
  const maxHours = Math.max(...metrics.map(m => m.totalHours), 0.1);

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
      ) : metrics.length === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-4">
          No assigned tasks in selected routines
        </p>
      ) : (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-secondary/40 rounded-lg p-2 text-center">
              <div className="text-base font-bold text-foreground">
                {metrics.reduce((s, m) => s + m.totalHours, 0).toFixed(1)}h
              </div>
              <div className="text-[10px] text-muted-foreground">Total Hours</div>
            </div>
            <div className="bg-secondary/40 rounded-lg p-2 text-center">
              <div className="text-base font-bold text-foreground">
                {selectedCount > 0
                  ? (metrics.reduce((s, m) => s + m.totalHours, 0) / selectedCount).toFixed(1)
                  : '0.0'}h
              </div>
              <div className="text-[10px] text-muted-foreground">Daily Avg</div>
            </div>
            <div className="bg-secondary/40 rounded-lg p-2 text-center">
              <div className="text-base font-bold text-foreground">
                {(metrics.reduce((s, m) => s + m.totalHours, 0) * 7 / Math.max(selectedCount, 1)).toFixed(1)}h
              </div>
              <div className="text-[10px] text-muted-foreground">Weekly Proj.</div>
            </div>
          </div>

          {/* Task breakdown bars */}
          <div className="flex flex-col gap-2">
            {metrics.map((m, i) => {
              const dailyAvg = m.totalHours / selectedCount;
              const weeklyProj = dailyAvg * 7;
              return (
                <div key={i} className="flex items-center gap-2">
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
                      <span className="text-[9px] text-muted-foreground">
                        ~{weeklyProj.toFixed(1)}h/wk
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
