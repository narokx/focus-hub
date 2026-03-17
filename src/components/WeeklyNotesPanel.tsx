import { useEffect } from 'react';
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
  Heading1,
  Heading2,
  Italic,
  List,
  Underline as UnderlineIcon,
} from 'lucide-react';

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


const highlightColors = ['#fef08a', '#bbf7d0', '#fbcfe8', '#bfdbfe'];

interface WeeklyNotesPanelProps {
  content: string;
  onUpdateNote: (content: string) => void;
}

export function WeeklyNotesPanel({ content, onUpdateNote }: WeeklyNotesPanelProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyle,
      FontSize,
      Underline,
      Highlight.configure({ multicolor: true }),
    ],
    content,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none min-h-full focus:outline-none p-4',
      },
    },
    onUpdate: ({ editor: tiptapEditor }) => {
      onUpdateNote(tiptapEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;

    if (editor.getHTML() !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) {
    return <div className="h-full -m-4" />;
  }

  return (
    <div className="h-full -m-4 flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
    </div>
  );
}
