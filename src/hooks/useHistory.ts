import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState } from '@/types';

const MAX_HISTORY = 50;

export function useHistory(initialState: AppState) {
  const [history, setHistory] = useState<AppState[]>([initialState]);
  const [index, setIndex] = useState(0);
  // Track if we should skip pushing (during undo/redo)
  const skipPushRef = useRef(false);

  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  const push = useCallback((state: AppState) => {
    if (skipPushRef.current) {
      skipPushRef.current = false;
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
    skipPushRef.current = true;
    const newIndex = index - 1;
    setIndex(newIndex);
    return history[newIndex];
  }, [canUndo, index, history]);

  const redo = useCallback(() => {
    if (!canRedo) return null;
    skipPushRef.current = true;
    const newIndex = index + 1;
    setIndex(newIndex);
    return history[newIndex];
  }, [canRedo, index, history]);

  return { push, undo, redo, canUndo, canRedo };
}
