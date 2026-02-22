import type { CSSProperties } from "react";
import type { Lint, Suggestion } from "harper.js";
import { SuggestionKind } from "harper.js";
import { toLintClass } from "../../extensions/harperLint";
import "./LintPopup.css";

function getSuggestionLabel(s: Suggestion): string {
  switch (s.kind()) {
    case SuggestionKind.Replace:
      return s.get_replacement_text();
    case SuggestionKind.Remove:
      return "Remove";
    case SuggestionKind.InsertAfter:
      return `Insert "${s.get_replacement_text()}" after`;
    default:
      return "Fix";
  }
}

function getCategoryLabel(lint: Lint): string {
  const pretty = lint.lint_kind_pretty();
  if (pretty.trim()) return pretty;
  const raw = lint.lint_kind().trim().toLowerCase();
  if (!raw) return "Misc";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export interface LintPopupProps {
  lint: Lint;
  style: CSSProperties;
  /** The span text (for "Add to dictionary" on spelling lints). */
  word?: string;
  onApply: (suggestion: Suggestion) => void;
  onDismiss: () => void;
  onAddToDictionary?: (word: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function LintPopup({
  lint,
  style,
  word,
  onApply,
  onDismiss,
  onAddToDictionary,
  onMouseEnter,
  onMouseLeave,
}: LintPopupProps) {
  const suggestions = lint.suggestions();
  const kindClass = toLintClass(lint.lint_kind());
  const isSpelling = kindClass === "spelling";
  const canAddToDictionary = isSpelling && word != null && word.trim() !== "" && onAddToDictionary != null;

  return (
    <div
      className="editor-lint-popup"
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="tooltip"
    >
      <p
        className={`editor-lint-popup__category editor-lint-popup__category--${kindClass}`}
      >
        {getCategoryLabel(lint)}
      </p>
      <p className="editor-lint-popup__message">{lint.message()}</p>
      {suggestions.length > 0 && (
        <ul className="editor-lint-popup__suggestions" role="list">
          {suggestions.map((s, i) => (
            <li key={i} className="editor-lint-popup__item">
              <button
                type="button"
                className="editor-lint-popup__apply"
                onClick={() => onApply(s)}
              >
                {getSuggestionLabel(s)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {canAddToDictionary && (
        <button
          type="button"
          className="editor-lint-popup__add-dict"
          onClick={() => onAddToDictionary(word.trim())}
          aria-label="Add to dictionary"
        >
          Add to dictionary
        </button>
      )}
      <button
        type="button"
        className="editor-lint-popup__ignore"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
        Dismiss
      </button>
    </div>
  );
}
