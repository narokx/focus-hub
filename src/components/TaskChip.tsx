import React, { useState, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { TaskColor, getColorValue, getContrastColor } from '@/types';
import { cn } from '@/lib/utils';

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
}

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
}: TaskChipProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleDoubleClick = () => {
    if (editable) {
      setIsEditing(true);
      setEditName(name);
    }
  };

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

  const textColor = getContrastColor(color);
  const bgColor = getColorValue(color);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: bgColor,
        color: textColor,
      }}
      className={cn(
        'task-chip relative inline-flex items-center gap-2 no-drag',
        isDragging && 'opacity-50 scale-95',
        completed && 'opacity-60',
        className
      )}
      {...(draggable && !isEditing ? { ...attributes, ...listeners } : {})}
      onDoubleClick={handleDoubleClick}
    >
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
        <span className={cn(completed && 'line-through')}>{name}</span>
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
            'w-4 h-4 flex items-center justify-center rounded-full transition-colors ml-1',
            textColor === 'white' 
              ? 'hover:bg-white/20' 
              : 'hover:bg-black/10'
          )}
        >
          ×
        </button>
      )}
    </div>
  );
}
