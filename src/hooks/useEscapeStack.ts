import { useEffect, useRef } from 'react';

type EscapeEntry = {
  id: string;
  close: () => void;
};

const escapeStack: EscapeEntry[] = [];
let listenerAttached = false;

function removeEntry(id: string) {
  const idx = escapeStack.findIndex((entry) => entry.id === id);
  if (idx >= 0) escapeStack.splice(idx, 1);
}

function detachListenerIfNeeded() {
  if (!listenerAttached || escapeStack.length > 0 || typeof window === 'undefined') return;
  window.removeEventListener('keydown', handleEscapeKeyDown, true);
  listenerAttached = false;
}

function handleEscapeKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  const top = escapeStack[escapeStack.length - 1];
  if (!top) return;
  event.preventDefault();
  event.stopPropagation();
  top.close();
}

function registerEntry(id: string, close: () => void) {
  removeEntry(id);
  escapeStack.push({ id, close });

  if (!listenerAttached && typeof window !== 'undefined') {
    window.addEventListener('keydown', handleEscapeKeyDown, true);
    listenerAttached = true;
  }
}

function unregisterEntry(id: string) {
  removeEntry(id);
  detachListenerIfNeeded();
}

export function useEscapeStack(active: boolean, onClose: () => void, explicitId?: string) {
  const idRef = useRef(explicitId || `esc-layer-${Math.random().toString(36).slice(2, 10)}`);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active) return;

    const stackId = idRef.current;
    registerEntry(stackId, () => onCloseRef.current());
    return () => unregisterEntry(stackId);
  }, [active]);
}
