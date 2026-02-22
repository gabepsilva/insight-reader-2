import type { ReactNode } from "react";
import "./EditorLegend.css";

interface EditorLegendProps {
  issueCount: number;
  grammarEnabled: boolean;
  onToggleGrammar: () => void;
  children?: ReactNode;
}

export function EditorLegend({
  issueCount,
  grammarEnabled,
  onToggleGrammar,
  children,
}: EditorLegendProps) {
  return (
    <div className="editor-legend" aria-label="Lint issues">
      <button
        type="button"
        className="editor-legend__count editor-legend__toggle"
        onClick={onToggleGrammar}
        aria-pressed={grammarEnabled}
        aria-label={
          grammarEnabled
            ? "Grammar verification on; click to disable"
            : "Grammar verification off; click to enable"
        }
      >
        {grammarEnabled ? (
          <>
            {issueCount} issue{issueCount === 1 ? "" : "s"} found
            <span className="editor-legend__hint"> (click to disable)</span>
          </>
        ) : (
          <span className="editor-legend__hint">click to enable grammar verification</span>
        )}
      </button>
      {children}
    </div>
  );
}
