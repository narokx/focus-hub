import React, { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import {
  Bold,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  FileText,
  Heading1,
  Heading2,
  Italic,
  List,
  Plus,
  Trash2,
  Underline as UnderlineIcon,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTaskNote } from '@/hooks/useTaskNote';
import { useEscapeStack } from '@/hooks/useEscapeStack';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

const textSizeOptions = [
  { label: 'Small', value: '0.875rem' },
  { label: 'Normal', value: '1rem' },
  { label: 'Large', value: '1.25rem' },
];

const TextStyle = Mark.create({
  name: 'textStyle',
  parseHTML() {
    return [{ tag: 'span' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
});

const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().unsetMark('textStyle').run(),
    };
  },
});

const highlightColors = ['#fef08a', '#bbf7d0', '#fbcfe8', '#bfdbfe'];
const EDITOR_CLASSES = 'prose prose-sm dark:prose-invert max-w-none min-h-full focus:outline-none p-3';

interface TaskNotesModalProps {
  taskId: string;
  taskName: string;
  taskColor: string;
  onClose: () => void;
}

export function TaskNotesModal({ taskId, taskName, taskColor, onClose }: TaskNotesModalProps) {
  useEscapeStack(true, onClose);
  const { pages, currentPageIndex, note, saveCurrentPage, setPage, addPage, deletePage } = useTaskNote(taskId);
  const isMobile = useIsMobile();
  const [size, setSize] = useState(() => {
    try {
      const s = localStorage.getItem('task-notes-modal-size');
      return s ? JSON.parse(s) : { width: 640, height: 520 };
    } catch {
      return { width: 640, height: 520 };
    }
  });
  const [pos, setPos] = useState(() => {
    try {
      const p = localStorage.getItem('task-notes-modal-pos');
      return p
        ? JSON.parse(p)
        : { x: Math.max(40, window.innerWidth / 2 - 320), y: Math.max(40, window.innerHeight / 2 - 260) };
    } catch {
      return { x: 200, y: 150 };
    }
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = React.useRef<{ sx: number; sy: number; ix: number; iy: number } | null>(null);
  const resizeRef = React.useRef<{ sx: number; sy: number; iw: number; ih: number } | null>(null);
  const userIsInteracting = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList.configure({
        HTMLAttributes: {
          class: 'list-none p-0 m-0',
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'flex items-start gap-3 mb-1.5',
        },
      }),
      TextStyle,
      FontSize,
      Underline,
      Highlight.configure({ multicolor: true }),
    ],
    content: note,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: EDITOR_CLASSES,
      },
    },
    onUpdate: ({ editor: tiptapEditor, transaction }) => {
      if (transaction.docChanged && userIsInteracting.current) {
        saveCurrentPage(tiptapEditor.getHTML());
      }
    },
    onFocus: () => {
      userIsInteracting.current = true;
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== note) {
      const wasFocused = editor.isFocused;
      editor.commands.setContent(note, { emitUpdate: false });
      if (wasFocused) requestAnimationFrame(() => editor.commands.focus('end'));
    }
  }, [editor, note]);

  const flushCurrentPage = () => {
    if (!editor) return;
    saveCurrentPage(editor.getHTML());
  };

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;
    setIsDragging(true);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ix: pos.x, iy: pos.y };

    const move = (event: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(0, dragRef.current.ix + event.clientX - dragRef.current.sx),
        y: Math.max(0, dragRef.current.iy + event.clientY - dragRef.current.sy),
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
    resizeRef.current = { sx: e.clientX, sy: e.clientY, iw: size.width, ih: size.height };

    const move = (event: MouseEvent) => {
      if (!resizeRef.current) return;
      const newW = Math.max(360, resizeRef.current.iw + event.clientX - resizeRef.current.sx);
      const newH = Math.max(260, resizeRef.current.ih + event.clientY - resizeRef.current.sy);
      setSize({ width: newW, height: newH });
    };
    const up = () => {
      localStorage.setItem('task-notes-modal-size', JSON.stringify(size));
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const totalPages = Math.max(1, pages.length);
  const canDeletePage = totalPages > 1;

  const toolbar = editor && (
    <div className="flex items-center gap-1 border-b bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <select
        value={editor.getAttributes('textStyle').fontSize || '1rem'}
        onChange={(event) => {
          const nextSize = event.target.value;
          if (nextSize === '1rem') {
            editor.chain().focus().unsetFontSize().run();
            return;
          }
          editor.chain().focus().setFontSize(nextSize).run();
        }}
        className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
        aria-label="Text size"
      >
        {textSizeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Bold">
        <Bold className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Italic">
        <Italic className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Underline">
        <UnderlineIcon className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Heading 1">
        <Heading1 className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Heading 2">
        <Heading2 className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Bullets">
        <List className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleTaskList().run()} className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Task list">
        <CheckSquare className="h-4 w-4" />
      </button>
      <div className="ml-1 flex items-center gap-1">
        {highlightColors.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => editor.chain().focus().toggleHighlight({ color }).run()}
            className="h-4 w-4 rounded-full border border-border transition hover:scale-110"
            style={{ backgroundColor: color }}
            aria-label={`Toggle ${color} highlight`}
          />
        ))}
      </div>
    </div>
  );

  const pagination = (
    <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-2">
      <button
        type="button"
        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        disabled={currentPageIndex <= 0}
        onClick={() => {
          flushCurrentPage();
          setPage(currentPageIndex - 1);
        }}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-xs font-medium text-muted-foreground">Page {currentPageIndex + 1} / {totalPages}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          disabled={currentPageIndex >= totalPages - 1}
          onClick={() => {
            flushCurrentPage();
            setPage(currentPageIndex + 1);
          }}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canDeletePage}
          onClick={() => {
            if (!window.confirm('Are you sure you want to delete this page?')) return;
            flushCurrentPage();
            deletePage(currentPageIndex);
          }}
          title={canDeletePage ? 'Delete current page' : 'Cannot delete the only page'}
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          onClick={() => {
            flushCurrentPage();
            addPage();
          }}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  // Mobile: fullscreen modal
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
          <button
            onClick={() => {
              flushCurrentPage();
              onClose();
            }}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {toolbar}

        <div className="flex-1 overflow-y-auto min-h-0" onKeyDown={(event) => event.stopPropagation()}>
          <EditorContent editor={editor} className="h-full" />
        </div>

        {pagination}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[999] pointer-events-none">
      <div
        className={cn(
          'absolute bg-card border border-border rounded-xl shadow-2xl flex flex-col pointer-events-auto',
          isDragging && 'select-none'
        )}
        style={{ left: pos.x, top: pos.y, width: size.width, height: size.height }}
      >
        <div
          className="flex items-center gap-2 px-4 py-3 border-b border-border cursor-move select-none rounded-t-xl bg-secondary/30"
          onMouseDown={handleDragStart}
        >
          <FileText className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: taskColor }} />
            <span className="text-sm font-semibold truncate">{taskName}</span>
            <span className="text-xs text-muted-foreground">— Notes</span>
          </div>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              flushCurrentPage();
              onClose();
            }}
            className="no-drag p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {toolbar}

        <div className="flex-1 min-h-0 overflow-y-auto" onKeyDown={(event) => event.stopPropagation()}>
          <EditorContent editor={editor} className="h-full" />
        </div>

        {pagination}

        <div
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end p-1 opacity-40 hover:opacity-80 transition-opacity"
          onMouseDown={handleResizeStart}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 8L8 2M5 8L8 5M8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
