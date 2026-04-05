import { useEffect, useRef } from 'react';
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
  Plus,
  Trash2,
  Underline as UnderlineIcon,
} from 'lucide-react';

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
      types: ['paragraph', 'heading', 'taskItem'],
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
    const getActiveListItem = (state: any): { type: 'listItem' | 'taskItem'; depth: number } | null => {
      const { $from } = state.selection;
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        const nodeName = $from.node(depth).type.name;
        if (nodeName === 'listItem' || nodeName === 'taskItem') {
          return { type: nodeName, depth };
        }
      }
      return null;
    };

    const adjustIndent =
      (delta: number) =>
      ({ editor, state, commands }: { editor: any; state: any; commands: any }) => {
        const { $from } = state.selection;
        const activeListItem = getActiveListItem(state);

        if (activeListItem?.type === 'listItem') {
          return delta > 0
            ? editor.commands.sinkListItem(activeListItem.type)
            : editor.commands.liftListItem(activeListItem.type);
        }

        if (activeListItem?.type === 'taskItem') {
          const didAdjustListDepth =
            delta > 0 ? editor.commands.sinkListItem('taskItem') : editor.commands.liftListItem('taskItem');
          if (didAdjustListDepth) {
            return true;
          }

          const currentLevel = Number($from.node(activeListItem.depth).attrs.indentLevel ?? 0);
          const nextLevel = Math.max(0, Math.min(MAX_INDENT_LEVEL, currentLevel + delta));
          if (currentLevel === nextLevel) {
            return true;
          }

          return commands.updateAttributes('taskItem', { indentLevel: nextLevel });
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

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.increaseIndent(),
      'Shift-Tab': () => this.editor.commands.decreaseIndent(),
    };
  },
});

const highlightColors = ['#fef08a', '#bbf7d0', '#fbcfe8', '#bfdbfe'];

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

interface WeeklyNotesPanelProps {
  content: string;
  pages: string[];
  currentPageIndex: number;
  onSaveCurrentPage: (content: string) => void;
  onSetPage: (index: number) => void;
  onAddPage: () => void;
  onDeletePage: (index: number) => void;
  isLoading: boolean;
}

export function WeeklyNotesPanel({
  content,
  pages,
  currentPageIndex,
  onSaveCurrentPage,
  onSetPage,
  onAddPage,
  onDeletePage,
  isLoading,
}: WeeklyNotesPanelProps) {
  const userIsInteracting = useRef(false);

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
    },
    onUpdate: ({ editor: tiptapEditor, transaction }) => {
      if (transaction.docChanged && userIsInteracting.current) {
        onSaveCurrentPageRef.current(tiptapEditor.getHTML());
      }
    },
    onFocus: () => {
      userIsInteracting.current = true;
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== content) {
      const shouldRefocus = editor.isFocused;
      editor.commands.setContent(content, { emitUpdate: false });
      if (shouldRefocus) {
        requestAnimationFrame(() => editor.commands.focus('end'));
      }
    }
  }, [content, editor]);

  const totalPages = Math.max(1, pages.length);
  const canGoPrev = currentPageIndex > 0;
  const canGoNext = currentPageIndex < totalPages - 1;

  const navigateTo = (nextIndex: number) => {
    if (!editor) return;
    onSaveCurrentPage(editor.getHTML());
    onSetPage(nextIndex);
  };

  const handleAddPage = () => {
    if (!editor) return;
    onSaveCurrentPage(editor.getHTML());
    onAddPage();
  };

  const canDeletePage = totalPages > 1;

  const handleDeletePage = () => {
    if (!editor || !canDeletePage) return;
    if (!window.confirm('Are you sure you want to delete this page?')) return;
    onDeletePage(currentPageIndex);
  };

  if (!editor) {
    return <div className="h-full -m-4" />;
  }

  return (
    <div className="h-full -m-4 flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {isLoading && (
          <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Syncing…
          </span>
        )}
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
          className={`rounded-md p-2 transition hover:bg-muted ${
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
          className={`rounded-md p-2 transition hover:bg-muted ${
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
          className={`rounded-md p-2 transition hover:bg-muted ${
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
          className={`rounded-md p-2 transition hover:bg-muted ${
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
          className={`rounded-md p-2 transition hover:bg-muted ${
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
          className={`rounded-md p-2 transition hover:bg-muted ${
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
          className={`rounded-md p-2 transition hover:bg-muted ${
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
          className={`rounded-md p-2 transition hover:bg-muted ${
            editor.isActive('taskList')
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label="Toggle task list"
        >
          <CheckSquare className="h-4 w-4" />
        </button>
        <div className="ml-2 flex items-center gap-1">
          {highlightColors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => editor.chain().focus().toggleHighlight({ color }).run()}
              className={`h-4 w-4 rounded-full border border-border transition ${
                editor.isActive('highlight', { color })
                  ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                  : 'hover:scale-110'
              }`}
              style={{ backgroundColor: color }}
              aria-label={`Toggle ${color} highlight`}
            />
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" onKeyDown={(event) => event.stopPropagation()}>
        <EditorContent editor={editor} className="h-full border-0" />
      </div>

      <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-2">
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

      <style>{`
        .prose ul[data-type="taskList"] li[data-checked="true"] > div > p {
          text-decoration: line-through !important;
          color: #9ca3af !important;
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
}
