import { useEffect } from "react";
import { marked } from "marked";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions/placeholder";
import type { Lint } from "harper.js";
import { HarperLint } from "../../extensions/harperLint";
import "./TipTapEditor.css";

const noopLint: (text: string) => Promise<Lint[]> = async () => [];

/** Heuristic: content looks like Markdown (e.g. from Clear text / Summarize backend). */
function looksLikeMarkdown(s: string): boolean {
  return (
    /\*\*[^*]|__[^_]|^#{1,6}\s|^>\s|^\s*[-*]\s|^```/m.test(s) || />\s*\n/.test(s)
  );
}

function markdownToHtml(s: string): string {
  return marked.parse(s) as string;
}

function toDocContent(content: string): JSONContent {
  const paragraph: JSONContent = content
    ? { type: "paragraph", content: [{ type: "text", text: content }] }
    : { type: "paragraph" };
  return { type: "doc", content: [paragraph] };
}

function contentToSet(content: string): string | JSONContent {
  if (!content) return { type: "doc", content: [{ type: "paragraph" }] };
  if (looksLikeMarkdown(content)) return markdownToHtml(content);
  return toDocContent(content);
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
    content: content === "" ? undefined : contentToSet(content),
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
      const toSet = contentToSet(content);
      editor.commands.setContent(toSet, { emitUpdate: false });
      // Ensure Harper runs on programmatic content (e.g. pre-filled or editor-set-text).
      // Schedule after the next tick so the doc update and plugin view have been applied.
      const tid = setTimeout(() => {
        scheduleLintRef?.current?.(true);
      }, 0);
      return () => clearTimeout(tid);
    }
  }, [content, editor]);

  return <EditorContent editor={editor} className="tiptap-editor-content" />;
}
