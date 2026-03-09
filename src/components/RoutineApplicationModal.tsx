import React, { useState, useMemo } from 'react';
import { format, getDay, endOfMonth, eachDayOfInterval, isSameDay, isAfter, startOfDay } from 'date-fns';
import { Loader2, Calendar, CalendarDays } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Routine } from '@/types';
import { parseLocalDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';

interface RoutineApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  routine: Routine | null;
  targetDate: string | null;
  onApply: (dates: string[]) => Promise<void>;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function RoutineApplicationModal({
  isOpen,
  onClose,
  routine,
  targetDate,
  onApply,
}: RoutineApplicationModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'single' | 'recurring'>('single');

  // Calculate weekday name and remaining dates
  const { weekdayName, remainingDates } = useMemo(() => {
    if (!targetDate) return { weekdayName: '', remainingDates: [] };
    
    const date = parseLocalDate(targetDate);
    const dayOfWeek = getDay(date);
    const weekday = WEEKDAY_NAMES[dayOfWeek];
    const monthEnd = endOfMonth(date);
    
    // Get all days from target date to end of month (inclusive)
    const allDays = eachDayOfInterval({ start: date, end: monthEnd });
    
    // Filter to only same weekday
    const sameDays = allDays.filter(d => getDay(d) === dayOfWeek);
    
    // Format as YYYY-MM-DD strings
    const dateStrings = sameDays.map(d => format(d, 'yyyy-MM-dd'));
    
    return { weekdayName: weekday, remainingDates: dateStrings };
  }, [targetDate]);

  const handleApply = async () => {
    if (!targetDate) return;
    
    setIsLoading(true);
    
    try {
      const datesToApply = selectedMode === 'single' ? [targetDate] : remainingDates;
      await onApply(datesToApply);
      onClose();
    } catch (error) {
      console.error('Failed to apply routine:', error);
      // Keep modal open on error so user can retry
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return; // Prevent closing during operation
    onClose();
  };

  if (!routine || !targetDate) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => isLoading && e.preventDefault()}>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground font-medium">
              Syncing routine data...
            </p>
            <p className="text-xs text-muted-foreground">
              Applying to {selectedMode === 'single' ? '1 day' : `${remainingDates.length} days`}
            </p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Apply "{routine.name}"</DialogTitle>
              <DialogDescription>
                Choose how to apply this routine to {format(parseLocalDate(targetDate), 'MMMM d, yyyy')}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 py-4">
              <button
                onClick={() => setSelectedMode('single')}
                className={cn(
                  'flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left',
                  selectedMode === 'single'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <div className={cn(
                  'p-2 rounded-full',
                  selectedMode === 'single' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                )}>
                  <Calendar className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Just this {weekdayName}</p>
                  <p className="text-sm text-muted-foreground">
                    Apply only to {format(parseLocalDate(targetDate), 'MMMM d')}
                  </p>
                </div>
              </button>

              <button
                onClick={() => setSelectedMode('recurring')}
                className={cn(
                  'flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left',
                  selectedMode === 'recurring'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <div className={cn(
                  'p-2 rounded-full',
                  selectedMode === 'recurring' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                )}>
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">All remaining {weekdayName}s</p>
                  <p className="text-sm text-muted-foreground">
                    Apply to {remainingDates.length} {weekdayName}{remainingDates.length > 1 ? 's' : ''} this month
                  </p>
                </div>
              </button>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleApply}>
                Apply Routine
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

