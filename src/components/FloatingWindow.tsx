import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Resizable, Enable } from 're-resizable';
import { GripHorizontal, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingWindowProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  position: { x: number; y: number };
  size: { width: number; height: number };
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  onPositionChange?: (position: { x: number; y: number }) => void;
  onSizeChange?: (size: { width: number; height: number }) => void;
  onTitleChange?: (title: string) => void;
  className?: string;
  headerActions?: React.ReactNode;
  windowKey?: string;
  minimized?: boolean;
  onMinimizeChange?: (minimized: boolean) => void;
}

export function FloatingWindow({
  title,
  icon,
  children,
  position,
  size,
  minWidth = 250,
  minHeight = 200,
  maxWidth = 1200,
  maxHeight = 800,
  onPositionChange,
  onSizeChange,
  onTitleChange,
  className,
  headerActions,
  minimized = false,
  onMinimizeChange,
}: FloatingWindowProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [zIndex, setZIndex] = useState(10);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; initialX: number; initialY: number } | null>(null);
  const resizePointerRef = useRef<{ pointerId: number; target: HTMLElement } | null>(null);
  const windowElementRef = useRef<HTMLDivElement | null>(null);
  const currentPositionRef = useRef(position);
  const currentSizeRef = useRef(size);

  useEffect(() => {
    currentPositionRef.current = position;
  }, [position]);

  useEffect(() => {
    currentSizeRef.current = size;
  }, [size]);

  const stopDragging = useCallback(() => {
    setIsDragging(false);
    setZIndex(10);
    dragRef.current = null;
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    setZIndex(10);
    if (typeof document !== 'undefined') {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.documentElement.style.cursor = '';
      document.documentElement.style.userSelect = '';
    }
  }, []);

  useEffect(() => {
    const clearGlobalPointerState = () => {
      if (typeof document === 'undefined') return;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.documentElement.style.cursor = '';
      document.documentElement.style.userSelect = '';
    };

    const handleForcedInteractionEnd = () => {
      clearGlobalPointerState();
      if (isDragging) stopDragging();
      if (isResizing) stopResizing();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.buttons !== 0) return;
      handleForcedInteractionEnd();
    };

    window.addEventListener('pointerup', handleForcedInteractionEnd, true);
    window.addEventListener('mouseup', handleForcedInteractionEnd, true);
    window.addEventListener('pointercancel', handleForcedInteractionEnd, true);
    window.addEventListener('blur', handleForcedInteractionEnd);
    window.addEventListener('pointermove', handlePointerMove, true);

    return () => {
      window.removeEventListener('pointerup', handleForcedInteractionEnd, true);
      window.removeEventListener('mouseup', handleForcedInteractionEnd, true);
      window.removeEventListener('pointercancel', handleForcedInteractionEnd, true);
      window.removeEventListener('blur', handleForcedInteractionEnd);
      window.removeEventListener('pointermove', handlePointerMove, true);
    };
  }, [isDragging, isResizing, stopDragging, stopResizing]);

  const handleDragPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isResizing) return;
    if ((e.target as HTMLElement).closest('.no-drag')) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setZIndex(100);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      initialX: currentPositionRef.current.x,
      initialY: currentPositionRef.current.y,
    };
  }, [isResizing]);

  const handleDragPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    if (dragRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const newX = Math.max(0, dragRef.current.initialX + dx);
    const newY = Math.max(0, dragRef.current.initialY + dy);
    const nextPosition = { x: newX, y: newY };
    currentPositionRef.current = nextPosition;
    onPositionChange?.(nextPosition);
  }, [onPositionChange]);

  const handleDragPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    stopDragging();
  }, [stopDragging]);

  const handleResizeStart = useCallback(() => {
    setIsResizing(true);
    setIsDragging(false);
    setZIndex(100);
  }, []);

  const handleResizeStop = useCallback((_e: unknown, _dir: unknown, ref: HTMLElement) => {
    const newSize = { width: ref.offsetWidth, height: ref.offsetHeight };
    currentSizeRef.current = newSize;
    stopResizing();
    onSizeChange?.(newSize);
  }, [onSizeChange, stopResizing]);

  const handleResize = useCallback((_e: unknown, _dir: unknown, ref: HTMLElement) => {
    const nextSize = { width: ref.offsetWidth, height: ref.offsetHeight };
    currentSizeRef.current = nextSize;
    onSizeChange?.(nextSize);
  }, [onSizeChange]);

  const handleResizePointerDownCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.resize-handle')) return;
    target.setPointerCapture(e.pointerId);
    resizePointerRef.current = { pointerId: e.pointerId, target };
  }, []);

  const handleResizePointerUpCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizePointerRef.current || resizePointerRef.current.pointerId !== e.pointerId) return;
    if (resizePointerRef.current.target.hasPointerCapture(e.pointerId)) {
      resizePointerRef.current.target.releasePointerCapture(e.pointerId);
    }
    resizePointerRef.current = null;
    if (!isResizing) return;
    const windowElement = windowElementRef.current;
    if (windowElement) {
      const nextSize = { width: windowElement.offsetWidth, height: windowElement.offsetHeight };
      currentSizeRef.current = nextSize;
      onSizeChange?.(nextSize);
    }
    stopResizing();
  }, [isResizing, onSizeChange, stopResizing]);

  const handleTitleDoubleClick = () => {
    if (onTitleChange) {
      setIsEditingTitle(true);
      setEditTitle(title);
    }
  };

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (editTitle.trim() && editTitle !== title && onTitleChange) {
      onTitleChange(editTitle.trim());
    }
  };

  const enableResize: Enable = minimized ? {
    top: false, right: true, bottom: false, left: true,
    topRight: false, bottomRight: false, bottomLeft: false, topLeft: false,
  } : {
    top: true, right: true, bottom: true, left: true,
    topRight: true, bottomRight: true, bottomLeft: true, topLeft: true,
  };

  return (
    <div
      ref={windowElementRef}
      className="absolute"
      style={{
        left: position.x,
        top: position.y,
        zIndex: isDragging ? 100 : zIndex,
        userSelect: isDragging || isResizing ? 'none' : undefined,
      }}
      onMouseDown={() => setZIndex(50)}
    >
      <Resizable
        size={minimized ? { width: size.width, height: 44 } : size}
        minWidth={minimized ? 200 : minWidth}
        minHeight={minimized ? 44 : minHeight}
        maxWidth={maxWidth}
        maxHeight={minimized ? 44 : maxHeight}
        enable={enableResize}
        onResizeStart={handleResizeStart}
        onResize={handleResize}
        onResizeStop={handleResizeStop}
        enableUserSelectHack={false}
        onPointerDownCapture={handleResizePointerDownCapture}
        onPointerUpCapture={handleResizePointerUpCapture}
        onPointerCancelCapture={handleResizePointerUpCapture}
        handleStyles={{
          top: { cursor: 'ns-resize', height: 8, top: -4 },
          bottom: { cursor: 'ns-resize', height: 8, bottom: -4 },
          left: { cursor: 'ew-resize', width: 8, left: -4 },
          right: { cursor: 'ew-resize', width: 8, right: -4 },
          topLeft: { cursor: 'nwse-resize', width: 12, height: 12, top: -6, left: -6 },
          topRight: { cursor: 'nesw-resize', width: 12, height: 12, top: -6, right: -6 },
          bottomLeft: { cursor: 'nesw-resize', width: 12, height: 12, bottom: -6, left: -6 },
          bottomRight: { cursor: 'nwse-resize', width: 12, height: 12, bottom: -6, right: -6 },
        }}
        handleClasses={{
          top: 'resize-handle', bottom: 'resize-handle',
          left: 'resize-handle', right: 'resize-handle',
          topLeft: 'resize-handle rounded-tl-lg', topRight: 'resize-handle rounded-tr-lg',
          bottomLeft: 'resize-handle rounded-bl-lg', bottomRight: 'resize-handle rounded-br-lg',
        }}
      >
        <div className={cn('window-panel flex flex-col h-full', className)}>
          <div
            className="window-header flex-shrink-0"
            onPointerDown={handleDragPointerDown}
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerUp}
            onPointerCancel={handleDragPointerUp}
          >
            <div className="flex items-center gap-2">
              {icon}
              {isEditingTitle ? (
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={handleTitleSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTitleSubmit();
                    if (e.key === 'Escape') { setIsEditingTitle(false); setEditTitle(title); }
                  }}
                  className="window-title bg-transparent border border-input rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring no-drag"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="window-title cursor-pointer hover:text-primary transition-colors"
                  onClick={(e) => { e.stopPropagation(); handleTitleDoubleClick(); }}
                >
                  {title}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {headerActions}
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onMinimizeChange?.(!minimized); }}
                className="no-drag p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                title={minimized ? 'Restore' : 'Minimize'}
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <GripHorizontal className="w-4 h-4 text-muted-foreground opacity-50" />
            </div>
          </div>
          <div className="window-content flex-1 overflow-auto scrollbar-thin" style={{ display: minimized ? 'none' : 'block' }}>
            {children}
          </div>
        </div>
      </Resizable>
    </div>
  );
}
