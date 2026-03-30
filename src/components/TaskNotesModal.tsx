import React, { useState, useEffect } from 'react';
import { X, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTaskNote } from '@/hooks/useTaskNote';

interface TaskNotesModalProps {
  taskId: string;
  taskName: string;
  taskColor: string;
  onClose: () => void;
}

export function TaskNotesModal({ taskId, taskName, taskColor, onClose }: TaskNotesModalProps) {
  const { note, save } = useTaskNote(taskId);
  const [draft, setDraft] = useState(note);
  const isMobile = useIsMobile();
  const [size, setSize] = useState(() => {
    try {
      const s = localStorage.getItem('task-notes-modal-size');
      return s ? JSON.parse(s) : { width: 480, height: 340 };
    } catch { return { width: 480, height: 340 }; }
  });
  const [pos, setPos] = useState(() => {
    try {
      const p = localStorage.getItem('task-notes-modal-pos');
      return p ? JSON.parse(p) : { x: Math.max(40, window.innerWidth / 2 - 240), y: Math.max(40, window.innerHeight / 2 - 170) };
    } catch { return { x: 200, y: 150 }; }
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = React.useRef<{
    sx: number;
    sy: number;
    ix: number;
    iy: number;
    pointerId: number;
    captureTarget: HTMLElement;
  } | null>(null);
  const resizeRef = React.useRef<{
    sx: number;
    sy: number;
    iw: number;
    ih: number;
    pointerId: number;
    captureTarget: HTMLElement;
  } | null>(null);
  const posRef = React.useRef(pos);
  const sizeRef = React.useRef(size);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    setDraft(note);
  }, [note]);

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      ix: pos.x,
      iy: pos.y,
      pointerId: e.pointerId,
      captureTarget: e.currentTarget,
    };

    const move = (e: PointerEvent) => {
      if (!dragRef.current) return;
      if (e.buttons === 0) {
        up();
        return;
      }
      setPos({
        x: Math.max(0, dragRef.current.ix + e.clientX - dragRef.current.sx),
        y: Math.max(0, dragRef.current.iy + e.clientY - dragRef.current.sy),
      });
    };
    const up = () => {
      if (dragRef.current) {
        const { captureTarget, pointerId } = dragRef.current;
        if (captureTarget.hasPointerCapture(pointerId)) {
          captureTarget.releasePointerCapture(pointerId);
        }
      }
      setIsDragging(false);
      dragRef.current = null;
      localStorage.setItem('task-notes-modal-pos', JSON.stringify(posRef.current));
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };

  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsResizing(true);
    resizeRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      iw: size.width,
      ih: size.height,
      pointerId: e.pointerId,
      captureTarget: e.currentTarget,
    };

    const move = (e: PointerEvent) => {
      if (!resizeRef.current) return;
      if (e.buttons === 0) {
        up();
        return;
      }
      const newW = Math.max(300, resizeRef.current.iw + e.clientX - resizeRef.current.sx);
      const newH = Math.max(200, resizeRef.current.ih + e.clientY - resizeRef.current.sy);
      setSize({ width: newW, height: newH });
    };
    const up = () => {
      if (resizeRef.current) {
        const { captureTarget, pointerId } = resizeRef.current;
        if (captureTarget.hasPointerCapture(pointerId)) {
          captureTarget.releasePointerCapture(pointerId);
        }
      }
      setIsResizing(false);
      resizeRef.current = null;
      localStorage.setItem('task-notes-modal-size', JSON.stringify(sizeRef.current));
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };

  const handleSave = () => {
    save(draft);
    onClose();
  };

  // Mobile: fullscreen modal
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[999] bg-card flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/30">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: taskColor }} />
            <span className="text-sm font-semibold truncate">{taskName}</span>
            <span className="text-xs text-muted-foreground">— Notes</span>
          </div>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 p-4 overflow-y-auto min-h-0">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add notes, links, ideas... (supports plain text)"
            className="w-full h-full min-h-[200px] resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none leading-relaxed"
          />
        </div>

        {/* Fixed bottom buttons */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-t border-border bg-card">
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Desktop: floating draggable/resizable window
  return (
    <div className="fixed inset-0 z-[999] pointer-events-none">
      <div
        className={cn(
          'absolute bg-card border border-border rounded-xl shadow-2xl flex flex-col pointer-events-auto',
          isDragging && 'select-none'
        )}
        style={{ left: pos.x, top: pos.y, width: size.width, height: size.height }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-3 border-b border-border cursor-move select-none rounded-t-xl bg-secondary/30"
          onPointerDown={handleDragStart}
        >
          <FileText className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: taskColor }} />
            <span className="text-sm font-semibold truncate">{taskName}</span>
            <span className="text-xs text-muted-foreground">— Notes</span>
          </div>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleSave}
            className="no-drag px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
          >
            Save
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="no-drag p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-3 min-h-0">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add notes, links, ideas... (supports plain text)"
            className="w-full h-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none leading-relaxed"
          />
        </div>

        {/* Resize handle */}
        <div
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end p-1 opacity-40 hover:opacity-80 transition-opacity"
          onPointerDown={handleResizeStart}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 8L8 2M5 8L8 5M8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
