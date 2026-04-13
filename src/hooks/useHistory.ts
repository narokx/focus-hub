import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { AppState } from '@/types';

const MAX_HISTORY = 50;

export function useHistory(initialState: AppState) {
  const [history, setHistory] = useState<AppState[]>([initialState]);
  const [index, setIndex] = useState(0);
  // How many upcoming push() calls should be ignored (used during undo/redo and any follow-up normalization updates)
  const skipPushCountRef = useRef(0);
  const timelineRef = useRef<{ history: AppState[]; index: number }>({ history: [initialState], index: 0 });

  useEffect(() => {
    timelineRef.current = { history, index };
  }, [history, index]);

  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  const skipNextPushes = useCallback((count = 1) => {
    const n = Math.max(0, count);
    skipPushCountRef.current += n;
  }, []);

  const reset = useCallback((state: AppState) => {
    skipPushCountRef.current = 0;
    timelineRef.current = { history: [state], index: 0 };
    setHistory([state]);
    setIndex(0);
  }, []);

  const push = useCallback((state: AppState) => {
    if (skipPushCountRef.current > 0) {
      skipPushCountRef.current -= 1;
      return;
    }

    setHistory(prevHistory => {
      const currentIndex = timelineRef.current.index;
      const nextHistory = [...prevHistory.slice(0, currentIndex + 1), state];
      if (nextHistory.length > MAX_HISTORY) {
        nextHistory.shift();
      }

      const nextIndex = nextHistory.length - 1;
      timelineRef.current = { history: nextHistory, index: nextIndex };
      setIndex(nextIndex);
      return nextHistory;
    });
  }, []);

  const undo = useCallback(() => {
    const { history: currentHistory, index: currentIndex } = timelineRef.current;
    if (currentIndex <= 0) return null;
    // Skip the push that will happen due to restoreState(prev)
    skipPushCountRef.current += 1;
    const newIndex = currentIndex - 1;
    timelineRef.current = { history: currentHistory, index: newIndex };
    setIndex(newIndex);
    return currentHistory[newIndex];
  }, []);

  const redo = useCallback(() => {
    const { history: currentHistory, index: currentIndex } = timelineRef.current;
    if (currentIndex >= currentHistory.length - 1) return null;
    // Skip the push that will happen due to restoreState(next)
    skipPushCountRef.current += 1;
    const newIndex = currentIndex + 1;
    timelineRef.current = { history: currentHistory, index: newIndex };
    setIndex(newIndex);
    return currentHistory[newIndex];
  }, []);

  return useMemo(() => ({ push, undo, redo, canUndo, canRedo, skipNextPushes, reset }), [push, undo, redo, canUndo, canRedo, skipNextPushes, reset]);
}
