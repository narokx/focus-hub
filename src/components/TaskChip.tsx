import React, { useState, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Pencil, FileText, Star } from 'lucide-react';
import { TaskColor, getColorValue, getContrastColor } from '@/types';
import { cn } from '@/lib/utils';
import { TaskNotesModal, useTaskNote } from './TaskNotesModal';

interface TaskChipProps {
  id: string;
  name: string;
  color: TaskColor;
  draggable?: boolean;
  dragData?: Record<string, unknown>;
  editable?: boolean;
  onNameChange?: (name: string) => void;
  onDelete?: () => void;
  completed?: boolean;
  onToggleComplete?: () => void;
  className?: string;
  showDelete?: boolean;
  noteId?: string;
  isExpanded?: boolean;
  onExpand?: () => void;
}

const DRAG_THRESHOLD = 10;

export function TaskChip({
  id,
  name,
  color,
  draggable = true,
  dragData = {},
  editable = false,
  onNameChange,
  onDelete,
  completed = false,
  onToggleComplete,
  className,
  showDelete = false,
  noteId,
  isExpanded = false,
  onExpand,
}: TaskChipProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [notesOpen, setNotesOpen] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const { note } = useTaskNote(noteId || null);
  const hasNotes = !!note?.trim();

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { type: 'task', name, color, ...dragData },
    disabled: !draggable || isEditing,
  });

  const style = transform ? {
    transform: CSS.Transform.toString(transform),
  } : undefined;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (editName.trim() && editName !== name && onNameChange) {
      onNameChange(editName.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditName(name);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    setIsPressed(true);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsPressed(false);
    if (!pointerStartRef.current || isDragging) {
      pointerStartRef.current = null;
      return;
    }
    
    const dx = Math.abs(e.clientX - pointerStartRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartRef.current.y);
    pointerStartRef.current = null;
    
    // If moved more than threshold, it's a drag, not a tap
    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) return;
    
    // Trigger expansion toggle
    if (onExpand && !isEditing) {
      onExpand();
    }
  };

  const textColor = getContrastColor(color);
  const bgColor = getColorValue(color);
  const showActions = isExpanded && !isEditing;

  // Calculate expanded width based on action count
  const actionCount = (editable ? 1 : 0) + (noteId ? 1 : 0) + (showDelete && onDelete ? 1 : 0);
  const expandedExtraWidth = actionCount * 20; // ~20px per action button

  return (
    <>
      <div
        ref={setNodeRef}
        style={{
          ...style,
          backgroundColor: bgColor,
          color: textColor,
          willChange: isExpanded ? 'width' : 'auto',
        }}
        className={cn(
          'task-chip relative inline-flex items-center gap-1.5 no-drag overflow-hidden',
          'transition-[width,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          isDragging && 'opacity-50 scale-95',
          completed && 'opacity-60',
          isPressed && !isDragging && 'scale-[0.98]',
          className
        )}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { setIsPressed(false); pointerStartRef.current = null; }}
        {...(draggable && !isEditing ? { ...attributes, ...listeners } : {})}
      >
        {/* Star indicator for notes */}
        {hasNotes && (
          <Star className="w-3 h-3 flex-shrink-0 fill-current opacity-80" />
        )}

        {onToggleComplete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleComplete();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              'w-4 h-4 rounded border-2 flex-shrink-0 transition-colors',
              textColor === 'white' ? 'border-white/70' : 'border-black/40',
              completed && (textColor === 'white' ? 'bg-white/30' : 'bg-black/20')
            )}
          >
            {completed && (
              <svg viewBox="0 0 12 12" className="w-full h-full">
                <path
                  d="M2.5 6L5 8.5L9.5 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        )}
        
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onPointerDown={(e) => e.stopPropagation()}
            className="editable-text bg-transparent min-w-[60px] text-inherit"
            style={{ color: 'inherit' }}
          />
        ) : (
          <span className={cn('flex-shrink-0', completed && 'line-through')}>{name}</span>
        )}

        {/* Action icons container with animated reveal */}
        <div
          className={cn(
            'flex items-center gap-0.5 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            showActions ? 'opacity-100 scale-100' : 'opacity-0 scale-75 w-0'
          )}
          style={{
            width: showActions ? `${expandedExtraWidth}px` : 0,
          }}
        >
          {editable && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
                setEditName(name);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                'w-4 h-4 flex items-center justify-center rounded-full flex-shrink-0 transition-opacity',
                textColor === 'white' ? 'hover:bg-white/20' : 'hover:bg-black/10'
              )}
              title="Rename"
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>
          )}

          {noteId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setNotesOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                'w-4 h-4 flex items-center justify-center rounded-full flex-shrink-0 transition-opacity',
                textColor === 'white' ? 'hover:bg-white/20' : 'hover:bg-black/10'
              )}
              title="Notes"
            >
              <FileText className="w-2.5 h-2.5" />
            </button>
          )}
          
          {showDelete && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDelete();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                'w-4 h-4 flex items-center justify-center rounded-full transition-colors',
                textColor === 'white' 
                  ? 'hover:bg-white/20' 
                  : 'hover:bg-black/10'
              )}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {notesOpen && noteId && (
        <TaskNotesModal
          taskId={noteId}
          taskName={name}
          taskColor={bgColor}
          onClose={() => setNotesOpen(false)}
        />
      )}
    </>
  );
}
