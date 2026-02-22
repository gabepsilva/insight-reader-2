import type { BackendPromptTask } from "../../backendPrompt";
import "./EditorToolbar.css";

interface EditorToolbarProps {
  fontSize: number;
  minFontSize: number;
  maxFontSize: number;
  readPreparing: boolean;
  transformTask: BackendPromptTask | null;
  hasText: boolean;
  backendHealthy: boolean;
  onDecreaseFontSize: () => void;
  onIncreaseFontSize: () => void;
  onRead: () => void;
  onClear: () => void;
  onSummarize: () => void;
  onExplain: () => void;
}

export function EditorToolbar({
  fontSize,
  minFontSize,
  maxFontSize,
  readPreparing,
  transformTask,
  hasText,
  backendHealthy,
  onDecreaseFontSize,
  onIncreaseFontSize,
  onRead,
  onClear,
  onSummarize,
  onExplain,
}: EditorToolbarProps) {
  const aiDisabled = !hasText || !backendHealthy || transformTask != null;

  return (
    <div className="editor-toolbar">
      <div className="editor-toolbar__font-group" aria-label="Font size controls">
        <button
          type="button"
          onClick={onDecreaseFontSize}
          disabled={fontSize <= minFontSize}
          aria-label="Decrease font size"
          title="Decrease font size"
        >
          A-
        </button>
        <button
          type="button"
          onClick={onIncreaseFontSize}
          disabled={fontSize >= maxFontSize}
          aria-label="Increase font size"
          title="Increase font size"
        >
          A+
        </button>
      </div>
      <div className="editor-toolbar__separator" aria-hidden="true" />
      <div className="editor-toolbar__font-group" aria-label="Format and read">
        <button
          type="button"
          onClick={onClear}
          disabled={aiDisabled}
          aria-label="Format doc for reading"
          title={backendHealthy ? "Format document for text-to-speech reading" : "Backend unavailable"}
        >
          {transformTask === "TTS" ? (
            "..."
          ) : (
            <span className="editor-toolbar__icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <path d="M8 7h8" />
                <path d="M8 11h8" />
              </svg>
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onRead}
          disabled={!hasText || readPreparing}
          aria-label={readPreparing ? "Preparing read aloud" : "Read aloud"}
          title="Read aloud (stop from main window)"
        >
          {readPreparing ? (
            "Preparing..."
          ) : (
            <>
              <span className="editor-toolbar__icon" aria-hidden="true">
                ▶
              </span>
              <span className="editor-toolbar__label">Read</span>
            </>
          )}
        </button>
      </div>
      <div className="editor-toolbar__separator" aria-hidden="true" />
      <div className="editor-toolbar__spacer" />
      <button
        type="button"
        className="editor-toolbar__primary-btn"
        onClick={onExplain}
        disabled={aiDisabled}
        aria-label="Explain"
        title={backendHealthy ? "Explain the content in simpler terms" : "Backend unavailable"}
      >
        {transformTask === "EXPLAIN1" ? (
          "..."
        ) : (
          <>
            <span className="editor-toolbar__icon" aria-hidden="true">
              ?
            </span>
            <span className="editor-toolbar__label">Explain</span>
          </>
        )}
      </button>
      <button
        type="button"
        className="editor-toolbar__primary-btn"
        onClick={onSummarize}
        disabled={aiDisabled}
        aria-label="Summarize"
        title={backendHealthy ? "Replace content with concise summary" : "Backend unavailable"}
      >
        {transformTask === "SUMMARIZE" ? (
          "..."
        ) : (
          <>
            <span className="editor-toolbar__icon" aria-hidden="true">
              ✦
            </span>
            <span className="editor-toolbar__label">Summarize</span>
          </>
        )}
      </button>
    </div>
  );
}
