import type { Editor } from "@tiptap/core";
import type { Lint, Suggestion } from "harper.js";
import { SuggestionKind } from "harper.js";
import { extractTextWithMap } from "./positionMap";

/**
 * Apply a Harper suggestion to the TipTap document via a transaction.
 * Uses positionMap to convert lint span (plain text) to doc positions.
 */
export function applySuggestion(
  editor: Editor,
  lint: Lint,
  suggestion: Suggestion,
): boolean {
  const { state } = editor;
  const { doc } = state;
  const { map } = extractTextWithMap(doc);
  const span = lint.span();
  const from = map.textToDoc(span.start);
  const to = map.textToDoc(span.end);

  const kind = suggestion.kind();
  if (kind === SuggestionKind.Replace) {
    const text = suggestion.get_replacement_text();
    return editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, text)
      .run();
  }
  if (kind === SuggestionKind.Remove) {
    return editor.chain().focus().deleteRange({ from, to }).run();
  }
  if (kind === SuggestionKind.InsertAfter) {
    const text = suggestion.get_replacement_text();
    return editor.chain().focus().insertContentAt(to, text).run();
  }
  return false;
}
