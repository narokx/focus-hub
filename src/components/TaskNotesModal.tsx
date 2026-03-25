import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useTaskNote(taskId: string | null) {
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!taskId || !user) {
      setNote('');
      return;
    }

    let isMounted = true;
    const fetchNote = async () => {
      const { data, error } = await supabase
        .from('task_notes')
        .select('content')
        .eq('user_id', user.id)
        .eq('task_id', taskId)
        .maybeSingle();

      if (isMounted && !error && data) {
        setNote(data.content);
      }
    };

    fetchNote();
    return () => { isMounted = false; };
  }, [taskId, user]);

  const save = useCallback((text: string) => {
    if (!taskId || !user) return;
    setNote(text);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      const { error } = await supabase
        .from('task_notes')
        .upsert({
          user_id: user.id,
          task_id: taskId,
          content: text,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,task_id' });

      if (error) console.error('Error saving task note:', error);
    }, 1000);
  }, [taskId, user]);

  return { note, save };
}

interface TaskNotesModalProps {
  taskId: string;
  taskName: string;
  taskColor: string;
  onClose: () => void;
}

export function TaskNotesModal({ taskId, taskName, taskColor, onClose }: TaskNotesModalProps) {
  const { note, save } = useTaskNote(taskId);
  const [draft, setDraft] = useState('');
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
  const dragRef = useRef<{ sx: number; sy: number; ix: number; iy: number } | null>(null);
  const resizeRef = useRef<{ sx: number; sy: number; iw: number; ih: number } | null>(null);

  useEffect(() => {
    setDraft(note);
  }, [note]);

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    setIsDragging(true);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ix: pos.x, iy: pos.y };

    const move = (e: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, dragRef.current.ix + e.clientX - dragRef.current.sx),
        y: Math.max(0, dragRef.current.iy + e.clientY - dragRef.current.sy),
      });
    };
    const up = () => {
      setIsDragging(false);
      localStorage.setItem('task-notes-modal-pos', JSON.stringify(pos));
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    resizeRef.current = { sx: e.clientX, sy: e.clientY, iw: size.width, ih: size.height };

    const move = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const newW = Math.max(300, resizeRef.current.iw + e.clientX - resizeRef.current.sx);
      const newH = Math.max(200, resizeRef.current.ih + e.clientY - resizeRef.current.sy);
      setSize({ width: newW, height: newH });
    };
    const up = () => {
      setIsResizing(false);
      localStorage.setItem('task-notes-modal-size', JSON.stringify(size));
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const handleSave = () => {
    save(draft);
    onClose();
  };

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[999] bg-card flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/30">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: taskColor }} />
            <span className="text-sm font-semibold truncate">{taskName}</span>
            <span className="text-xs text-muted-foreground">— Notes</span>
          </div>
        </div>
        <div className="flex-1 p-4 overflow-y-auto min-h-0">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add notes, links, ideas... (supports plain text)"
            className="w-full h-full min-h-[200px] resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none leading-relaxed"
          />
        </div>
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-t border-border bg-card">
          <button onClick={handleSave} className="flex-1 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
            Save
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[999] pointer-events-none">
      <div
        className={cn('absolute bg-card border border-border rounded-xl shadow-2xl flex flex-col pointer-events-auto', isDragging && 'select-none')}
        style={{ left: pos.x, top: pos.y, width: size.width, height: size.height }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border cursor-move select-none rounded-t-xl bg-secondary/30" onMouseDown={handleDragStart}>
          <FileText className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: taskColor }} />
            <span className="text-sm font-semibold truncate">{taskName}</span>
            <span className="text-xs text-muted-foreground">— Notes</span>
          </div>
          <button onMouseDown={(e) => e.stopPropagation()} onClick={handleSave} className="no-drag px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity">
            Save
          </button>
          <button onMouseDown={(e) => e.stopPropagation()} onClick={onClose} className="no-drag p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 p-3 min-h-0">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add notes, links, ideas... (supports plain text)"
            className="w-full h-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none leading-relaxed"
          />
        </div>
        <div className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end p-1 opacity-40 hover:opacity-80 transition-opacity" onMouseDown={handleResizeStart}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 8L8 2M5 8L8 5M8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </div>
      </div>
    </div>
  );
}
