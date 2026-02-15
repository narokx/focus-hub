import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isFuture, startOfWeek, endOfWeek, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';
import { DayData, generateDefaultTimeSlots } from '@/types';
import { TimelineView } from './TimelineView';
import { cn } from '@/lib/utils';

interface HeatmapCalendarProps {
  calendar: Record<string, DayData>;
  onDayClick: (date: string) => void;
  selectedDate: string | null;
  onCloseDay: () => void;
  onToggleDayTask: (date: string, taskId: string) => void;
  onUpdateDayTask: (date: string, taskId: string, name: string) => void;
  onRemoveDayTask: (date: string, taskId: string) => void;
  onAddDayTimeSlot: (date: string) => void;
  onDeleteDayTimeSlot: (date: string, slotId: string) => void;
  onUpdateDaySlotTime: (date: string, slotId: string, field: 'startTime' | 'endTime', value: string) => void;
  onMoveDaySlotToUnassigned: (date: string, slotId: string) => void;
  onToggleDaySlotTask: (date: string, slotId: string) => void;
}

function getCompletionLevel(dayData?: DayData): 'empty' | 'low' | 'mid' | 'high' {
  if (!dayData) return 'empty';
  const slotTasks = (dayData.timeSlots || []).filter(s => s.task).length;
  const unassignedTasks = dayData.tasks.length;
  const totalTasks = slotTasks + unassignedTasks;
  if (totalTasks === 0) return 'empty';
  const completedSlots = (dayData.timeSlots || []).filter(s => s.task?.completed).length;
  const completedUnassigned = dayData.tasks.filter(t => t.completed).length;
  const completed = completedSlots + completedUnassigned;
  const percentage = (completed / totalTasks) * 100;
  if (percentage < 30) return 'low';
  if (percentage < 70) return 'mid';
  return 'high';
}

function DayCell({ date, dayData, currentMonth, onClick, isSelected }: {
  date: Date; dayData?: DayData; currentMonth: Date; onClick: () => void; isSelected: boolean;
}) {
  const dateStr = format(date, 'yyyy-MM-dd');
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateStr}`,
    data: { type: 'day', date: dateStr },
  });

  const inMonth = isSameMonth(date, currentMonth);
  const today = isToday(date);
  const future = isFuture(date) && !today;
  const level = (!future && dayData) ? getCompletionLevel(dayData) : 'empty';
  const slotCount = (dayData?.timeSlots || []).filter(s => s.task).length;
  const taskCount = (dayData?.tasks.length || 0) + slotCount;

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        'calendar-cell',
        !inMonth && 'opacity-30',
        level === 'empty' && 'calendar-cell-empty',
        level === 'low' && 'calendar-cell-low',
        level === 'mid' && 'calendar-cell-mid',
        level === 'high' && 'calendar-cell-high',
        today && 'ring-2 ring-primary ring-offset-2',
        isSelected && 'ring-2 ring-primary',
        isOver && 'ring-2 ring-accent-foreground scale-110'
      )}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs font-medium">{format(date, 'd')}</span>
        {taskCount > 0 && <span className="text-[10px] opacity-70">{taskCount}</span>}
      </div>
    </div>
  );
}

export function HeatmapCalendar({
  calendar,
  onDayClick,
  selectedDate,
  onCloseDay,
  onToggleDayTask,
  onUpdateDayTask,
  onRemoveDayTask,
  onAddDayTimeSlot,
  onDeleteDayTimeSlot,
  onUpdateDaySlotTime,
  onMoveDaySlotToUnassigned,
  onToggleDaySlotTask,
}: HeatmapCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const selectedDayData = selectedDate ? calendar[selectedDate] : null;

  return (
    <div className="flex h-full gap-4">
      {/* Selected day timeline panel - LEFT SIDE */}
      {selectedDate && (
        <div className="w-[280px] flex-shrink-0 border-r border-border/50 pr-4 animate-fade-in flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">
                {format(new Date(selectedDate), 'EEEE, MMMM d')}
              </h3>
            </div>
            <button onClick={onCloseDay} className="p-1 rounded hover:bg-secondary transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-auto scrollbar-thin min-h-0">
            <TimelineView
              timeSlots={selectedDayData?.timeSlots || generateDefaultTimeSlots()}
              unassignedTasks={selectedDayData?.tasks || []}
              droppablePrefix={`day-${selectedDate}`}
              showCompleted={true}
              onAddTimeSlot={() => onAddDayTimeSlot(selectedDate)}
              onDeleteTimeSlot={(slotId) => onDeleteDayTimeSlot(selectedDate, slotId)}
              onUpdateSlotTime={(slotId, field, value) => onUpdateDaySlotTime(selectedDate, slotId, field, value)}
              onRemoveTaskFromSlot={(slotId) => onMoveDaySlotToUnassigned(selectedDate, slotId)}
              onToggleSlotTask={(slotId) => onToggleDaySlotTask(selectedDate, slotId)}
              onToggleUnassigned={(taskId) => onToggleDayTask(selectedDate, taskId)}
              onRemoveUnassigned={(taskId) => onRemoveDayTask(selectedDate, taskId)}
              onUpdateUnassignedName={(taskId, name) => onUpdateDayTask(selectedDate, taskId, name)}
            />
          </div>
        </div>
      )}

      {/* Calendar grid - RIGHT SIDE */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 rounded-md hover:bg-secondary transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold">{format(currentMonth, 'MMMM yyyy')}</h2>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 rounded-md hover:bg-secondary transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-shrink-0">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map(day => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map(date => {
              const dateStr = format(date, 'yyyy-MM-dd');
              return (
                <DayCell
                  key={dateStr}
                  date={date}
                  dayData={calendar[dateStr]}
                  currentMonth={currentMonth}
                  onClick={() => onDayClick(dateStr)}
                  isSelected={selectedDate === dateStr}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-heatmap-empty border border-border" />
              <span>None</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-heatmap-low" />
              <span>&lt;30%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-heatmap-mid" />
              <span>30-69%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-heatmap-high" />
              <span>≥70%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
