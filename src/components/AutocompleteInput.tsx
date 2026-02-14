import React, { useState, useRef, useEffect } from 'react';
import { QuickTask, TASK_COLOR_MAP, getContrastColor } from '@/types';
import { cn } from '@/lib/utils';

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (task: QuickTask) => void;
  suggestions: QuickTask[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export function AutocompleteInput({
  value,
  onChange,
  onSelect,
  suggestions,
  placeholder = 'Task name...',
  className,
  autoFocus,
  onKeyDown,
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = value.trim()
    ? suggestions.filter(s => s.name.toLowerCase().includes(value.toLowerCase()))
    : [];

  useEffect(() => {
    setIsOpen(filtered.length > 0 && value.trim().length > 0);
    setHighlightIndex(-1);
  }, [value, filtered.length]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDownInternal = (e: React.KeyboardEvent) => {
    if (isOpen && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex(prev => Math.min(prev + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && highlightIndex >= 0) {
        e.preventDefault();
        onSelect(filtered[highlightIndex]);
        setIsOpen(false);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDownInternal}
        onFocus={() => filtered.length > 0 && setIsOpen(true)}
        placeholder={placeholder}
        className={cn(
          'w-full px-2 py-1.5 text-sm bg-background rounded border border-input focus:outline-none focus:ring-2 focus:ring-ring',
          className
        )}
        autoFocus={autoFocus}
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-[160px] overflow-y-auto">
          {filtered.map((task, i) => (
            <button
              key={task.id}
              onClick={() => {
                onSelect(task);
                setIsOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors',
                i === highlightIndex && 'bg-accent'
              )}
            >
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: TASK_COLOR_MAP[task.color] }}
              />
              <span>{task.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
