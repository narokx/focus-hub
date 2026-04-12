import { useState, useCallback, useRef } from 'react';
import { AppState } from '@/types';

const MAX_HISTORY = 50;

export function useHistory(initialState: AppState) {
  const [history, setHistory] = useState<AppState[]>([initialState]);
  const [index, setIndex] = useState(0);
  // How many upcoming push() calls should be ignored (used during undo/redo and any follow-up normalization updates)
  const skipPushCountRef = useRef(0);

  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  const skipNextPushes = useCallback((count = 1) => {
    const n = Math.max(0, count);
    skipPushCountRef.current += n;
  }, []);

  const reset = useCallback((state: AppState) => {
    skipPushCountRef.current = 0;
    setHistory([state]);
    setIndex(0);
  }, []);

  const push = useCallback((state: AppState) => {
    if (skipPushCountRef.current > 0) {
      skipPushCountRef.current -= 1;
      return;
    }

    setHistory(prev => {
      // Slice off any redo states
      const newHistory = [...prev.slice(0, index + 1), state];
      // Limit size
      if (newHistory.length > MAX_HISTORY) newHistory.shift();
      return newHistory;
    });
    setIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [index]);

  const undo = useCallback(() => {
    if (!canUndo) return null;
    // Skip the push that will happen due to restoreState(prev)
    skipPushCountRef.current += 1;
    const newIndex = index - 1;
    setIndex(newIndex);
    return history[newIndex];
  }, [canUndo, index, history]);

  const redo = useCallback(() => {
    if (!canRedo) return null;
    // Skip the push that will happen due to restoreState(next)
    skipPushCountRef.current += 1;
    const newIndex = index + 1;
    setIndex(newIndex);
    return history[newIndex];
  }, [canRedo, index, history]);

  return { push, undo, redo, canUndo, canRedo, skipNextPushes, reset };
}
