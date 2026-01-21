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
  onApply: (suggestion: Suggestion) => void;
  onDismiss: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function LintPopup({
  lint,
  style,
  onApply,
  onDismiss,
  onMouseEnter,
  onMouseLeave,
}: LintPopupProps) {
  return (
    <div
      className="editor-lint-popup"
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="tooltip"
    >
      <p className={`editor-lint-popup__category editor-lint-popup__category--${toLintClass(lint.lint_kind())}`}>
        {getCategoryLabel(lint)}
      </p>
      <p className="editor-lint-popup__message">{lint.message()}</p>
      {lint.suggestions().length > 0 && (
        <ul className="editor-lint-popup__suggestions" role="list">
          {lint.suggestions().map((s, i) => (
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
      <button type="button" className="editor-lint-popup__ignore" onClick={onDismiss} aria-label="Dismiss">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
        Dismiss
      </button>
    </div>
  );
}
