import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isFuture, startOfWeek, endOfWeek, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X, ArrowLeft, Zap, Trash2 } from 'lucide-react';
import { DayData, QuickTask, Routine, generateDefaultTimeSlots } from '@/types';
import { TimelineView } from './TimelineView';
import { TaskPickerModal } from './TaskPickerModal';
import { RoutinePickerModal } from './RoutinePickerModal';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { parseLocalDate } from '@/lib/dateUtils';

interface HeatmapCalendarProps {
  calendar: Record<string, DayData>;
  routines?: Routine[];
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
  onUpdateDaySlotTaskName?: (date: string, slotId: string, name: string) => void;
  availableTasks?: QuickTask[];
  onAssignTaskToSlot?: (date: string, slotId: string, task: { name: string; color: string; taskId: string }) => void;
  onAddSubtaskToSlot?: (date: string, slotId: string, task: QuickTask) => void;
  onApplyRoutine?: (date: string, routine: Routine) => void;
  onClearDayTimeline?: (date: string) => void;
  onUpdateDayColor?: (date: string, color: string) => void;
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

function DayCell({
  date,
  dayData,
  currentMonth,
  onClick,
  isSelected,
  onUpdateDayColor,
}: {
  date: Date;
  dayData?: DayData;
  currentMonth: Date;
  onClick: () => void;
  isSelected: boolean;
  onUpdateDayColor?: (date: string, color: string) => void;
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

  const baseDayColor = dayData?.dayColor;
  let successColor: string | null = null;
  if (level === 'low') successColor = '#ef4444';
  else if (level === 'mid') successColor = '#eab308';
  else if (level === 'high') successColor = '#22c55e';

 const style = baseDayColor
    ? { background: `linear-gradient(135deg, ${baseDayColor} 50%, ${successColor || 'transparent'} 50%)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      style={style}
      className={cn(
        'calendar-cell',
        !inMonth && 'opacity-30',
        level === 'empty' && 'calendar-cell-empty',
        level === 'low' && 'calendar-cell-low',
        level === 'mid' && 'calendar-cell-mid',
        level === 'high' && 'calendar-cell-high',
        today && 'ring-2 ring-yellow-400 ring-offset-2',
        isSelected && 'ring-2 ring-primary',
        isOver && 'ring-2 ring-accent-foreground scale-110'
      )}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs font-medium">{format(date, 'd')}</span>
        {taskCount > 0 && <span className="text-[10px] opacity-70">{taskCount}</span>}
      </div>
      {/* Hidden color picker for per-day manual color override */}
      {onUpdateDayColor && (
        <input
          type="color"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          value={dayData?.dayColor || '#ffffff'}
          onChange={(e) => onUpdateDayColor(dateStr, e.target.value)}
        />
      )}
    </div>
  );
}

export function HeatmapCalendar({
  calendar,
  routines,
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
  onUpdateDaySlotTaskName,
  availableTasks,
  onAssignTaskToSlot,
  onAddSubtaskToSlot,
  onApplyRoutine,
  onClearDayTimeline,
  onUpdateDayColor,
}: HeatmapCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [timeListWidth, setTimeListWidth] = useState(280);
  const [showRoutinePicker, setShowRoutinePicker] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const resizingRef = React.useRef<{ startX: number; startW: number } | null>(null);
  const isMobile = useIsMobile();
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const selectedDayData = selectedDate ? calendar[selectedDate] : null;

  const handleDividerMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = { startX: e.clientX, startW: timeListWidth };

    const move = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = e.clientX - resizingRef.current.startX;
      setTimeListWidth(Math.max(200, Math.min(500, resizingRef.current.startW + delta)));
    };
    const up = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [timeListWidth]);

  const showCalendarGrid = !isMobile || !selectedDate;
  const showTimeline = !!selectedDate;

  return (
    <div className="flex h-full">
      {showTimeline && (
        <>
          <div
            className={cn(
              "flex-shrink-0 animate-fade-in flex flex-col overflow-hidden",
              isMobile ? "w-full" : "pr-4"
            )}
            style={isMobile ? undefined : { width: timeListWidth }}
          >
            {isMobile && (
              <button
                onClick={onCloseDay}
                className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2.5 mb-2 rounded-lg bg-secondary text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Calendar
              </button>
            )}

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">
                  {format(parseLocalDate(selectedDate!), 'EEEE, MMMM d')}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                {routines && routines.length > 0 && (
                  <button
                    onClick={() => setShowRoutinePicker(true)}
                    className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                    title="Add routine"
                  >
                    <Zap className="w-4 h-4" />
                  </button>
                )}
                {onClearDayTimeline && (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-destructive"
                    title="Clear timeline"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                {!isMobile && (
                  <button onClick={onCloseDay} className="p-1 rounded hover:bg-secondary transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-auto scrollbar-thin min-h-0">
              <TimelineView
                timeSlots={selectedDayData?.timeSlots || generateDefaultTimeSlots()}
                unassignedTasks={selectedDayData?.tasks || []}
                droppablePrefix={`day-${selectedDate}`}
                showCompleted={true}
                onAddTimeSlot={() => onAddDayTimeSlot(selectedDate!)}
                onDeleteTimeSlot={(slotId) => onDeleteDayTimeSlot(selectedDate!, slotId)}
                onUpdateSlotTime={(slotId, field, value) => onUpdateDaySlotTime(selectedDate!, slotId, field, value)}
                onRemoveTaskFromSlot={(slotId) => onMoveDaySlotToUnassigned(selectedDate!, slotId)}
                onToggleSlotTask={(slotId) => onToggleDaySlotTask(selectedDate!, slotId)}
                onToggleUnassigned={(taskId) => onToggleDayTask(selectedDate!, taskId)}
                onRemoveUnassigned={(taskId) => onRemoveDayTask(selectedDate!, taskId)}
                onUpdateUnassignedName={(taskId, name) => onUpdateDayTask(selectedDate!, taskId, name)}
                onUpdateSlotTaskName={onUpdateDaySlotTaskName ? (slotId, name) => onUpdateDaySlotTaskName(selectedDate!, slotId, name) : undefined}
                onEmptySlotClick={availableTasks && onAssignTaskToSlot ? (slotId) => setPickerSlotId(slotId) : undefined}
                availableTasks={availableTasks}
                onAddSubtask={(slotId, task) => { if (selectedDate && onAddSubtaskToSlot) onAddSubtaskToSlot(selectedDate, slotId, task); }}
              />
            </div>

            {pickerSlotId && availableTasks && onAssignTaskToSlot && (
              <TaskPickerModal
                tasks={availableTasks}
                onSelect={(task) => {
                  onAssignTaskToSlot(selectedDate!, pickerSlotId, { name: task.name, color: task.color, taskId: task.id });
                  setPickerSlotId(null);
                }}
                onClose={() => setPickerSlotId(null)}
              />
            )}
          </div>

          {!isMobile && (
            <div
              className="w-1 flex-shrink-0 cursor-col-resize bg-border hover:bg-primary/60 transition-colors"
              onMouseDown={handleDividerMouseDown}
              title="Drag to resize timeline panel"
            />
          )}
        </>
      )}

      {showCalendarGrid && (
        <div className={cn("flex-1 flex flex-col gap-4 min-w-0", !isMobile && "pl-4")}>
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
                    onUpdateDayColor={onUpdateDayColor}
                  />
                );
              })}
            </div>

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
      )}

      {showRoutinePicker && routines && selectedDate && (
        <RoutinePickerModal
          routines={routines}
          onSelect={(routine) => {
            if (onApplyRoutine) {
              onApplyRoutine(selectedDate, routine);
            }
          }}
          onClose={() => setShowRoutinePicker(false)}
        />
      )}

      {showClearConfirm && selectedDate && (
        <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Timeline</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all tasks and time slots for {format(parseLocalDate(selectedDate), 'MMMM d, yyyy')}. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (onClearDayTimeline) {
                    onClearDayTimeline(selectedDate);
                  }
                  setShowClearConfirm(false);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Clear Timeline
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
