import TaskItem from '@tiptap/extension-task-item';
import type { NodeViewRendererProps } from '@tiptap/core';

const isIosSafari = () => {
  if (typeof window === 'undefined') return false;

  const ua = window.navigator.userAgent;
  const isIOS = /iP(ad|hone|od)/.test(ua)
    || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  const isWebKit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);

  return isIOS && isWebKit;
};

export const SafeTaskItem = TaskItem.extend({
  addNodeView() {
    const parent = this.parent?.bind(this) as
      | ((props: NodeViewRendererProps) => ReturnType<typeof TaskItem.options.addNodeView>)
      | undefined;

    return (props: NodeViewRendererProps) => {
      const original = parent?.(props);
      if (!original || !isIosSafari()) {
        return original;
      }

      const checkbox = (original.dom as HTMLElement).querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (!checkbox) {
        return original;
      }

      const replacement = checkbox.cloneNode(true) as HTMLInputElement;
      checkbox.replaceWith(replacement);

      replacement.addEventListener('mousedown', event => event.preventDefault());
      replacement.addEventListener('change', event => {
        const { editor, getPos, node } = props;

        if (!editor.isEditable && !this.options.onReadOnlyChecked) {
          replacement.checked = !replacement.checked;
          return;
        }

        const { checked } = event.target as HTMLInputElement;

        if (editor.isEditable && typeof getPos === 'function') {
          const position = getPos();
          if (typeof position === 'number') {
            const tr = editor.state.tr;
            const currentNode = tr.doc.nodeAt(position);

            tr.setNodeMarkup(position, undefined, {
              ...currentNode?.attrs,
              checked,
            });

            editor.view.dispatch(tr);
          }
        }

        if (!editor.isEditable && this.options.onReadOnlyChecked && !this.options.onReadOnlyChecked(node, checked)) {
          replacement.checked = !replacement.checked;
        }
      });

      return original;
    };
  },
});
