import { TimeSlot } from '@/types';
import { timeToMinutes } from '@/lib/utils';

function isLocked(slot: TimeSlot): boolean {
  return !!slot.locked;
}

export function normalizeSlotLock(slot: TimeSlot): TimeSlot {
  return { ...slot, locked: isLocked(slot) };
}

export function sortTimeSlotsRespectingLocks(slots: TimeSlot[]): TimeSlot[] {
  const unlockedSorted = slots
    .filter((slot) => !isLocked(slot))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  let unlockedIndex = 0;
  return slots.map((slot) => {
    if (isLocked(slot)) return slot;
    const nextUnlocked = unlockedSorted[unlockedIndex++];
    return nextUnlocked ?? slot;
  });
}
