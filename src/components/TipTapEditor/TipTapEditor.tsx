import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions/placeholder";
import type { Lint } from "harper.js";
import { HarperLint } from "../../extensions/harperLint";
import "./TipTapEditor.css";

const noopLint: (text: string) => Promise<Lint[]> = async () => [];

function toDocContent(content: string): JSONContent {
  const paragraph: JSONContent = content
    ? { type: "paragraph", content: [{ type: "text", text: content }] }
    : { type: "paragraph" };
  return { type: "doc", content: [paragraph] };
}

export interface TipTapEditorProps {
  /** Plain text or JSON content. If string, used as single paragraph. */
  content: string;
  /** Called when content changes. Receives plain text. */
  onUpdate?: (text: string) => void;
  /** Callback to expose the editor instance (e.g. for applying suggestions). */
  editorRef?: (editor: Editor | null) => void;
  /** Placeholder when empty. */
  placeholder?: string;
  /** Whether the editor is editable. */
  editable?: boolean;
  /** Lint function for Harper (plain text -> Lint[]). When provided, HarperLint runs and shows decorations. */
  lint?: (text: string) => Promise<Lint[]>;
  /** Called when lints from the extension change (for legend, etc.). */
  onLintsChange?: (lints: Lint[]) => void;
  /** Called when pointer is over a lint (index, mouse pos). */
  onHover?: (index: number, mouse: { x: number; y: number }) => void;
  /** Called when pointer leaves a lint. */
  onHoverEnd?: () => void;
  /** Returns keys of dismissed lints; HarperLint excludes them from decorations and onLintsChange. */
  getDismissedKeys?: () => Set<string>;
  /** Ref to the plugin's schedule(immediate?) so the host can trigger re-lint (e.g. after dismiss). */
  scheduleLintRef?: { current: ((immediate?: boolean) => void) | null };
}

/**
 * TipTap-based editor with StarterKit and Placeholder.
 * Exposes the editor via editorRef for parent use (e.g. lint apply).
 */
export function TipTapEditor({
  content,
  onUpdate,
  editorRef,
  placeholder = "Paste or type text to check…",
  editable = true,
  lint,
  onLintsChange,
  onHover,
  onHoverEnd,
  getDismissedKeys,
  scheduleLintRef,
}: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      HarperLint.configure({
        lint: lint ?? noopLint,
        onLintsChange,
        onHover,
        onHoverEnd,
        getDismissedKeys,
        scheduleLintRef,
      }),
    ],
    content: content === "" ? undefined : toDocContent(content),
    editable,
    editorProps: {
      attributes: {
        "data-placeholder": placeholder,
      },
    },
    onUpdate: ({ editor: e }) => {
      const t = e.getText();
      onUpdate?.(t);
    },
  });

  useEffect(() => {
    editorRef?.(editor ?? null);
  }, [editor, editorRef]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getText();
    if (current !== content) {
      editor.commands.setContent(toDocContent(content), { emitUpdate: false });
    }
  }, [content, editor]);

  return <EditorContent editor={editor} className="tiptap-editor-content" />;
}
