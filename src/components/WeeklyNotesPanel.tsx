import { Fragment, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension, Mark, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import {
  AlignCenter,
  Bold,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Heading1,
  Heading2,
  Italic,
  List,
  Palette,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/use-mobile';
import { highlightColors, highlightTextColorCss } from '@/lib/highlightPalette';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
    textAlign: {
      setTextAlign: (alignment: 'left' | 'center') => ReturnType;
      unsetTextAlign: () => ReturnType;
    };
    indent: {
      increaseIndent: () => ReturnType;
      decreaseIndent: () => ReturnType;
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
              if (!attributes.fontSize) {
                return {};
              }

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

const TextAlign = Extension.create({
  name: 'textAlign',

  addOptions() {
    return {
      types: ['paragraph', 'heading'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const alignment = element.style.textAlign;
              return alignment === 'left' || alignment === 'center' ? alignment : null;
            },
            renderHTML: (attributes: { textAlign?: 'left' | 'center' | null }) => {
              if (!attributes.textAlign) {
                return {};
              }

              return {
                style: `text-align: ${attributes.textAlign}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextAlign:
        (alignment) =>
        ({ chain }) =>
          this.options.types.every((type: string) => chain().updateAttributes(type, { textAlign: alignment }).run()),
      unsetTextAlign:
        () =>
        ({ chain }) =>
          this.options.types.every((type: string) => chain().resetAttributes(type, 'textAlign').run()),
    };
  },
});

const INDENT_STEP_REM = 2;
const MAX_INDENT_LEVEL = 8;

const Indent = Extension.create({
  name: 'indent',

  addOptions() {
    return {
      types: ['paragraph', 'heading'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indentLevel: {
            default: 0,
            parseHTML: (element: HTMLElement) => {
              const indentLevel = Number.parseInt(element.getAttribute('data-indent-level') ?? '0', 10);
              return Number.isNaN(indentLevel) ? 0 : Math.max(0, Math.min(indentLevel, MAX_INDENT_LEVEL));
            },
            renderHTML: (attributes: { indentLevel?: number }) => {
              const indentLevel = attributes.indentLevel ?? 0;
              if (!indentLevel) {
                return {};
              }

              return {
                'data-indent-level': indentLevel,
                style: `margin-inline-start: ${indentLevel * INDENT_STEP_REM}rem`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const adjustIndent =
      (delta: number) =>
      ({ state, commands }: { state: any; commands: any }) => {
        const { $from } = state.selection;
        const listItemType = getActiveListItemType(state);

        if (listItemType) {
          return delta > 0 ? commands.sinkListItem(listItemType) : commands.liftListItem(listItemType);
        }

        const nodeType = $from.parent.type.name;
        if (!this.options.types.includes(nodeType)) {
          return false;
        }

        const currentLevel = Number($from.parent.attrs.indentLevel ?? 0);
        const nextLevel = Math.max(0, Math.min(MAX_INDENT_LEVEL, currentLevel + delta));
        if (currentLevel === nextLevel) {
          return false;
        }

        return commands.updateAttributes(nodeType, { indentLevel: nextLevel });
      };

    return {
      increaseIndent:
        () =>
        (props) =>
          adjustIndent(1)(props),
      decreaseIndent:
        () =>
        (props) =>
          adjustIndent(-1)(props),
    };
  },
});

const EDITOR_CLASSES = [
  'prose prose-sm dark:prose-invert max-w-none min-h-full focus:outline-none p-4',
  '[&_ul[data-type="taskList"]]:list-none [&_ul[data-type="taskList"]]:p-0',
  '[&_li[data-type="taskItem"]]:flex',
  '[&_li[data-type="taskItem"]_label]:mt-0.5 [&_li[data-type="taskItem"]_label]:mr-2',
  '[&_li[data-type="taskItem"]_label]:select-none',
  '[&_li[data-type="taskItem"]>div]:flex-1',
  '[&_li[data-type="taskItem"]>div>p]:m-0',
  '[&_li[data-type="taskItem"][data-checked="true"]>div>p]:line-through',
  '[&_li[data-type="taskItem"][data-checked="true"]>div>p]:text-muted-foreground',
].join(' ');

const getActiveListItemType = (state: any): 'listItem' | 'taskItem' | null => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const nodeName = $from.node(depth).type.name;
    if (nodeName === 'listItem' || nodeName === 'taskItem') {
      return nodeName;
    }
  }
  return null;
};

const isAtStartOfNestedListItem = (state: any) => {
  const { selection } = state;
  if (!selection.empty || selection.$from.parentOffset !== 0) {
    return false;
  }

  const { $from } = selection;
  let listItemDepth: number | null = null;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const nodeName = $from.node(depth).type.name;
    if (nodeName === 'listItem' || nodeName === 'taskItem') {
      listItemDepth = depth;
      break;
    }
  }

  if (listItemDepth == null) {
    return false;
  }

  for (let depth = listItemDepth - 1; depth > 0; depth -= 1) {
    const nodeName = $from.node(depth).type.name;
    if (nodeName === 'listItem' || nodeName === 'taskItem') {
      return true;
    }
  }

  return false;
};

interface WeeklyNotesPanelProps {
  content: string;
  pages: string[];
  currentPageIndex: number;
  onSaveCurrentPage: (content: string) => void;
  onSetPage: (index: number) => void;
  onAddPage: () => void;
  onDeletePage: (index: number) => void;
  onReorderPages: (fromIndex: number, toIndex: number) => void;
  isLoading: boolean;
  onHistoryAvailabilityChange?: (history: {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
  }) => void;
}

export function WeeklyNotesPanel({
  content,
  pages,
  currentPageIndex,
  onSaveCurrentPage,
  onSetPage,
  onAddPage,
  onDeletePage,
  onReorderPages,
  isLoading,
  onHistoryAvailabilityChange,
}: WeeklyNotesPanelProps) {
  const isMobile = useIsMobile();
  const userIsInteracting = useRef(false);
  const lastSavedContentRef = useRef(content);
  const editorRef = useRef<any>(null);
  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null);
  const [dropInsertIndex, setDropInsertIndex] = useState<number | null>(null);
  const [isHighlightPaletteOpen, setIsHighlightPaletteOpen] = useState(false);

  const onSaveCurrentPageRef = useRef(onSaveCurrentPage);
  useEffect(() => {
    onSaveCurrentPageRef.current = onSaveCurrentPage;
  }, [onSaveCurrentPage]);

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
      TextAlign,
      Indent,
      Underline,
      Highlight.configure({ multicolor: true }),
    ],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: EDITOR_CLASSES,
      },
      handleKeyDown: (_view, event) => {
        const currentEditor = editorRef.current;
        if (!currentEditor) {
          return false;
        }

        if (event.key === 'Tab') {
          event.preventDefault();
          const listItemType = getActiveListItemType(currentEditor.state);

          if (event.shiftKey) {
            if (listItemType) {
              currentEditor.commands.liftListItem(listItemType);
              return true;
            }

            currentEditor.commands.decreaseIndent();
            return true;
          }

          if (listItemType) {
            currentEditor.commands.sinkListItem(listItemType);
            return true;
          }

          currentEditor.commands.increaseIndent();
          return true;
        }

        if (event.key === 'Backspace' && isAtStartOfNestedListItem(currentEditor.state)) {
          const listItemType = getActiveListItemType(currentEditor.state);
          if (listItemType) {
            event.preventDefault();
            currentEditor.commands.liftListItem(listItemType);
            return true;
          }
        }

        return false;
      },
    },
    onUpdate: ({ editor: tiptapEditor, transaction }) => {
      if (transaction.docChanged) {
        const html = tiptapEditor.getHTML();
        lastSavedContentRef.current = html;
        onSaveCurrentPageRef.current(html);
      }
    },
    onFocus: () => {
      userIsInteracting.current = true;
    },
    onBlur: () => {
      userIsInteracting.current = false;
    },
    onCreate: ({ editor: tiptapEditor }) => {
      editorRef.current = tiptapEditor;
    },
    onDestroy: () => {
      editorRef.current = null;
    },
  });

  useEffect(() => {
    if (!editor?.view) return;
    const dom = editor.view.dom;

    const handleCheckboxClick = (e: Event) => {
      const target = e.target as HTMLElement;
      if (
        !(target instanceof HTMLInputElement) ||
        target.type !== 'checkbox'
      ) return;

      const listItem = target.closest('li[data-type="taskItem"]');
      if (!listItem) return;

      // Resolve position BEFORE intercepting the event.
      // Only block the event if we can guarantee we will handle the toggle.
      const view = editor.view;
      let taskItemPos = -1;
      let taskItemNode = null;

      try {
        const posInside = view.posAtDOM(listItem, 0);
        const $pos = view.state.doc.resolve(posInside);
        for (let depth = $pos.depth; depth > 0; depth--) {
          if ($pos.node(depth).type.name === 'taskItem') {
            taskItemNode = $pos.node(depth);
            taskItemPos = $pos.before(depth);
            break;
          }
        }
      } catch {
        return; // Position resolution failed — let native behavior through.
      }

      if (taskItemPos === -1 || !taskItemNode) return;

      // Only now intercept: stop the event from reaching the checkbox,
      // which prevents the change event and Tiptap's .chain().focus() call.
      e.stopPropagation();
      e.preventDefault();

      view.dispatch(
        view.state.tr.setNodeMarkup(taskItemPos, undefined, {
          ...taskItemNode.attrs,
          checked: !taskItemNode.attrs.checked,
        })
      );
    };

    dom.addEventListener('click', handleCheckboxClick, { capture: true });
    return () => {
      dom.removeEventListener('click', handleCheckboxClick, { capture: true });
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    if (userIsInteracting.current) return;
    if (content !== lastSavedContentRef.current && editor.getHTML() !== content) {
      const shouldRefocus = editor.isFocused;
      editor.commands.setContent(content, { emitUpdate: false });
      lastSavedContentRef.current = content;
      if (shouldRefocus) {
        requestAnimationFrame(() => editor.commands.focus('end'));
      }
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor || !onHistoryAvailabilityChange) return;

    const emitHistoryState = () => {
      onHistoryAvailabilityChange({
        canUndo: editor.can().undo(),
        canRedo: editor.can().redo(),
        undo: () => {
          editor.chain().focus().undo().run();
        },
        redo: () => {
          editor.chain().focus().redo().run();
        },
      });
    };

    emitHistoryState();
    editor.on('transaction', emitHistoryState);
    editor.on('selectionUpdate', emitHistoryState);

    return () => {
      editor.off('transaction', emitHistoryState);
      editor.off('selectionUpdate', emitHistoryState);
    };
  }, [editor, onHistoryAvailabilityChange]);

  const totalPages = Math.max(1, pages.length);
  const canGoPrev = currentPageIndex > 0;
  const canGoNext = currentPageIndex < totalPages - 1;

  const navigateTo = (nextIndex: number) => {
    if (!editor) return;
    const html = editor.getHTML();
    lastSavedContentRef.current = html;
    onSaveCurrentPage(html);
    onSetPage(nextIndex);
  };

  const handleAddPage = () => {
    if (!editor) return;
    const html = editor.getHTML();
    lastSavedContentRef.current = html;
    onSaveCurrentPage(html);
    onAddPage();
  };

  const canDeletePage = totalPages > 1;

  const handleDeletePage = () => {
    if (!editor || !canDeletePage) return;
    if (!window.confirm('Are you sure you want to delete this page?')) return;
    onDeletePage(currentPageIndex);
  };

  const getPagePreview = (pageContent: string) => {
    const plain = pageContent
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return plain || '(empty)';
  };

  const handleDropAt = (insertIndex: number) => {
    if (draggedPageIndex == null) return;
    onReorderPages(draggedPageIndex, insertIndex);
    setDraggedPageIndex(null);
    setDropInsertIndex(null);
  };

  const resolveInsertIndexFromThumbnail = (
    event: React.DragEvent<HTMLButtonElement>,
    thumbnailIndex: number
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    return event.clientX < midpoint ? thumbnailIndex : thumbnailIndex + 1;
  };

  if (!editor) {
    return <div className="h-full -m-4" />;
  }

  return (
    <div className="h-full -m-4 flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-1 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {isLoading && (
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Syncing…
          </span>
        )}
        {isMobile ? (
          <>
            <button
              type="button"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              className="shrink-0 rounded-md p-2 text-muted-foreground transition hover:bg-muted enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Undo note edit"
              title="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              className="shrink-0 rounded-md p-2 text-muted-foreground transition hover:bg-muted enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Redo note edit"
              title="Redo"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </>
        ) : null}
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
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`rounded-md p-2 hover:bg-muted ${
            editor.isActive('bold')
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label="Toggle bold"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`rounded-md p-2 hover:bg-muted ${
            editor.isActive('italic')
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label="Toggle italic"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`rounded-md p-2 hover:bg-muted ${
            editor.isActive('underline')
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label="Toggle underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            const isCentered = editor.isActive({ textAlign: 'center' });
            editor.chain().focus().setTextAlign(isCentered ? 'left' : 'center').run();
          }}
          className={`rounded-md p-2 hover:bg-muted ${
            editor.isActive({ textAlign: 'center' })
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label="Toggle center alignment"
        >
          <AlignCenter className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`rounded-md p-2 hover:bg-muted ${
            editor.isActive('heading', { level: 1 })
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label="Toggle heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`rounded-md p-2 hover:bg-muted ${
            editor.isActive('heading', { level: 2 })
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label="Toggle heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`rounded-md p-2 hover:bg-muted ${
            editor.isActive('bulletList')
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label="Toggle bullet list"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          className={`rounded-md p-2 hover:bg-muted ${
            editor.isActive('taskList')
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label="Toggle task list"
        >
          <CheckSquare className="h-4 w-4" />
        </button>
        <Popover open={isHighlightPaletteOpen} onOpenChange={setIsHighlightPaletteOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`rounded-md p-2 hover:bg-muted ${
                editor.isActive('highlight')
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-label="Toggle highlight colors"
            >
              <Palette className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={8}
            className="w-max border bg-background/95 p-2 shadow-lg backdrop-blur"
          >
            <div className="flex flex-nowrap items-center gap-1">
              {highlightColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    editor.chain().focus().toggleHighlight({ color }).run();
                    setIsHighlightPaletteOpen(false);
                  }}
                  className={`h-4 w-4 rounded-full border border-border ${
                    editor.isActive('highlight', { color })
                      ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Toggle ${color} highlight`}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" onKeyDown={(event) => event.stopPropagation()}>
        <EditorContent editor={editor} className="h-full border-0" />
      </div>

      <div className="border-t bg-muted/40 px-3 py-2">
        <div className="mb-2 overflow-x-auto pb-1">
          <div className="flex min-w-max items-end gap-2">
            {pages.map((page, index) => (
              <Fragment key={`weekly-page-thumb-wrap-${index}`}>
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDropInsertIndex(index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleDropAt(index);
                  }}
                  className={`h-12 w-1 shrink-0 rounded transition ${
                    dropInsertIndex === index ? 'bg-primary/80' : 'bg-transparent'
                  }`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    setDraggedPageIndex(index);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    const insertIndex = resolveInsertIndexFromThumbnail(event, index);
                    setDropInsertIndex(insertIndex);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const insertIndex =
                      dropInsertIndex ?? resolveInsertIndexFromThumbnail(event, index);
                    handleDropAt(insertIndex);
                  }}
                  onDragEnd={() => {
                    setDraggedPageIndex(null);
                    setDropInsertIndex(null);
                  }}
                  onClick={() => navigateTo(index)}
                  className={`h-12 w-20 shrink-0 overflow-hidden rounded border p-1 text-left transition ${
                    currentPageIndex === index
                      ? 'border-primary bg-background'
                      : 'border-border/70 bg-background/70 hover:border-primary/50'
                  }`}
                  title={`Page ${index + 1}`}
                >
                  <div className="mb-1 text-[10px] font-semibold text-muted-foreground">P{index + 1}</div>
                  <div className="line-clamp-2 text-[10px] leading-3 text-foreground/80">
                    {getPagePreview(page)}
                  </div>
                </button>
              </Fragment>
            ))}
            <div
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropInsertIndex(pages.length);
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDropAt(pages.length);
              }}
              className={`h-12 w-1 shrink-0 rounded transition ${
                dropInsertIndex === pages.length ? 'bg-primary/80' : 'bg-transparent'
              }`}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigateTo(currentPageIndex - 1)}
          disabled={!canGoPrev}
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="text-xs font-medium text-muted-foreground">Page {currentPageIndex + 1} / {totalPages}</div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigateTo(currentPageIndex + 1)}
            disabled={!canGoNext}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleDeletePage}
            disabled={!canDeletePage}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Delete current page"
            title={canDeletePage ? 'Delete current page' : 'Cannot delete the only page'}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleAddPage}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Add page"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        </div>
      </div>

      <style>{`
        .prose ul[data-type="taskList"] li[data-checked="true"] > div > p {
          text-decoration: line-through !important;
          color: #9ca3af !important;
          opacity: 0.6;
        }
        ${highlightTextColorCss}
      `}</style>
    </div>
  );
}
