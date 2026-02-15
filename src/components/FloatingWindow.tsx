import React, { useState, useRef, useCallback } from 'react';
import { Resizable, Enable } from 're-resizable';
import { GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FloatingWindowProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultPosition: { x: number; y: number };
  defaultSize: { width: number; height: number };
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  onPositionChange?: (position: { x: number; y: number }) => void;
  onSizeChange?: (size: { width: number; height: number }) => void;
  onTitleChange?: (title: string) => void;
  className?: string;
  headerActions?: React.ReactNode;
}

export function FloatingWindow({
  title,
  icon,
  children,
  defaultPosition,
  defaultSize,
  minWidth = 250,
  minHeight = 200,
  maxWidth = 1200,
  maxHeight = 800,
  onPositionChange,
  onSizeChange,
  onTitleChange,
  className,
  headerActions,
}: FloatingWindowProps) {
  const [position, setPosition] = useState(defaultPosition);
  const [size, setSize] = useState(defaultSize);
  const [isDragging, setIsDragging] = useState(false);
  const [zIndex, setZIndex] = useState(10);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;

    setIsDragging(true);
    setZIndex(100);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const newX = Math.max(0, dragRef.current.initialX + dx);
      const newY = Math.max(0, dragRef.current.initialY + dy);
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setZIndex(10);
      if (dragRef.current) {
        const moved = position.x !== dragRef.current.initialX || position.y !== dragRef.current.initialY;
        if (moved && onPositionChange) {
          onPositionChange(position);
        }
      }
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [position, onPositionChange]);

  const handleResizeStop = useCallback((_e: unknown, _dir: unknown, ref: HTMLElement) => {
    const newSize = { width: ref.offsetWidth, height: ref.offsetHeight };
    setSize(newSize);
    onSizeChange?.(newSize);
  }, [onSizeChange]);

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

  const enableResize: Enable = {
    top: true, right: true, bottom: true, left: true,
    topRight: true, bottomRight: true, bottomLeft: true, topLeft: true,
  };

  return (
    <div
      className="absolute"
      style={{ left: position.x, top: position.y, zIndex: isDragging ? 100 : zIndex }}
      onMouseDown={() => setZIndex(50)}
    >
      <Resizable
        size={size}
        minWidth={minWidth}
        minHeight={minHeight}
        maxWidth={maxWidth}
        maxHeight={maxHeight}
        enable={enableResize}
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
          <div className="window-header" onMouseDown={handleMouseDown}>
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
            <div className="flex items-center gap-2">
              {headerActions}
              <GripHorizontal className="w-4 h-4 text-muted-foreground opacity-50" />
            </div>
          </div>
          <div className="window-content flex-1 overflow-auto scrollbar-thin">
            {children}
          </div>
        </div>
      </Resizable>
    </div>
  );
}
