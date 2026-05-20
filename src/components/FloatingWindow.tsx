import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Resizable, Enable } from 're-resizable';
import { GripHorizontal, Maximize2, Minimize2, Minus } from 'lucide-react';
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

const BASE_WINDOW_Z_INDEX = 20;
const MAX_WINDOW_Z_INDEX = 9000;
let highestWindowZIndex = BASE_WINDOW_Z_INDEX;

const getNextWindowZIndex = () => {
  highestWindowZIndex += 1;

  // Keep floating windows below global popup layers (dialogs/popovers).
  // Without this bound, repeated drag/focus events can push window z-index values
  // above modal layers, causing confirmation popups to appear underneath tabs.
  if (highestWindowZIndex >= MAX_WINDOW_Z_INDEX) {
    highestWindowZIndex = BASE_WINDOW_Z_INDEX + 1;
  }

  return highestWindowZIndex;
};

function useInteractionEnd(isActive: boolean, onEnd: () => void) {
  useEffect(() => {
    if (!isActive) return;

    const handleEnd = () => onEnd();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        onEnd();
      }
    };

    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('pointerup', handleEnd);
    window.addEventListener('blur', handleEnd);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('blur', handleEnd);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActive, onEnd]);
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
  const [zIndex, setZIndex] = useState(() => getNextWindowZIndex());
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const preFullscreenRef = useRef<{ position: { x: number; y: number }; size: { width: number; height: number } } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    latestX: number;
    latestY: number;
  } | null>(null);
  const dragHandleRef = useRef<HTMLDivElement | null>(null);
  const latestPositionRef = useRef(position);

  useEffect(() => {
    latestPositionRef.current = position;
  }, [position]);

  const bringToFront = useCallback(() => {
    setZIndex(getNextWindowZIndex());
  }, []);

  const stopDragging = useCallback(() => {
    if (dragRef.current) {
      // onPositionChange call removed as it is redundant with handlePointerMove

      const dragHandle = dragHandleRef.current;
      if (dragHandle?.hasPointerCapture(dragRef.current.pointerId)) {
        dragHandle.releasePointerCapture(dragRef.current.pointerId);
      }
    }

    setIsDragging(false);
    dragRef.current = null;
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    if (typeof document !== 'undefined') {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.documentElement.style.cursor = '';
      document.documentElement.style.userSelect = '';
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isResizing) return;
    if (isDragging) return;
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    if (e.button !== 0) return;
    if (!e.isPrimary) return;

    bringToFront();
    setIsDragging(true);

    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      initialX: latestPositionRef.current.x,
      initialY: latestPositionRef.current.y,
      latestX: latestPositionRef.current.x,
      latestY: latestPositionRef.current.y,
    };
  }, [bringToFront, isDragging, isResizing]);

  useInteractionEnd(isDragging, stopDragging);
  useInteractionEnd(isResizing, stopResizing);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!dragRef.current) return;
      if (moveEvent.pointerId !== dragRef.current.pointerId) return;
      const dx = moveEvent.clientX - dragRef.current.startX;
      const dy = moveEvent.clientY - dragRef.current.startY;
      const newX = Math.max(0, dragRef.current.initialX + dx);
      const newY = Math.max(0, dragRef.current.initialY + dy);
      dragRef.current.latestX = newX;
      dragRef.current.latestY = newY;
      onPositionChange?.({ x: newX, y: newY });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (!dragRef.current) return;
      if (upEvent.pointerId !== dragRef.current.pointerId) return;
      stopDragging();
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, onPositionChange, stopDragging]);

  const handleResizeStart = useCallback(() => {
    if (isFullscreen) return;
    bringToFront();
    setIsResizing(true);
    setIsDragging(false);
  }, [bringToFront, isFullscreen]);

  const handleResizeStop = useCallback((_e: unknown, _dir: unknown, ref: HTMLElement) => {
    const newSize = { width: ref.offsetWidth, height: ref.offsetHeight };
    stopResizing();
    onSizeChange?.(newSize);
  }, [onSizeChange, stopResizing]);

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

  const toggleFullscreen = useCallback(() => {
    if (minimized) return;

    bringToFront();
    setIsEditingTitle(false);
    setIsFullscreen((prev) => {
      if (prev) {
        const snapshot = preFullscreenRef.current;
        if (snapshot) {
          onPositionChange?.(snapshot.position);
          onSizeChange?.(snapshot.size);
        }
        return false;
      }

      preFullscreenRef.current = {
        position: latestPositionRef.current,
        size,
      };
      onPositionChange?.({ x: 0, y: 0 });
      onSizeChange?.({ width: window.innerWidth, height: window.innerHeight });
      return true;
    });
  }, [bringToFront, minimized, onPositionChange, onSizeChange, size]);

  const fullscreenSize = {
    width: '100%',
    height: '100%',
  };

  const enableResize: Enable | false = isFullscreen ? false : minimized ? {
    top: false, right: true, bottom: false, left: true,
    topRight: false, bottomRight: false, bottomLeft: false, topLeft: false,
  } : {
    top: true, right: true, bottom: true, left: true,
    topRight: true, bottomRight: true, bottomLeft: true, topLeft: true,
  };

  return (
    <div
      className={cn(isFullscreen ? 'fixed inset-0' : 'absolute')}
      style={isFullscreen ? { zIndex } : { left: position.x, top: position.y, zIndex }}
      onMouseDownCapture={bringToFront}
    >
      <Resizable
        size={isFullscreen ? fullscreenSize : minimized ? { width: size.width, height: 44 } : size}
        minWidth={isFullscreen ? fullscreenSize.width : minimized ? 200 : minWidth}
        minHeight={isFullscreen ? fullscreenSize.height : minimized ? 44 : minHeight}
        maxWidth={isFullscreen ? Number.POSITIVE_INFINITY : maxWidth}
        maxHeight={isFullscreen ? Number.POSITIVE_INFINITY : minimized ? 44 : maxHeight}
        enable={enableResize}
        onResizeStart={handleResizeStart}
        onResizeStop={handleResizeStop}
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
            ref={dragHandleRef}
            className="window-header flex-shrink-0"
            onPointerDown={isFullscreen ? undefined : handlePointerDown}
            onDoubleClick={(event) => {
              if ((event.target as HTMLElement).closest('.no-drag')) return;
              toggleFullscreen();
            }}
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
                disabled={minimized}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className={cn(
                  'no-drag p-1 rounded text-muted-foreground transition-colors',
                  minimized
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-secondary/60 hover:text-foreground',
                )}
                title={minimized
                  ? 'Fullscreen unavailable while minimized'
                  : isFullscreen
                    ? 'Exit fullscreen'
                    : 'Enter fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
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
