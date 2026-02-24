import type { BackendPromptTask } from "../../backendPrompt";
import { ExplainWithMode } from "../ExplainWithMode";
import { SummaryWithSpeaker } from "../SummaryWithSpeaker";
import "./EditorToolbar.css";

interface EditorToolbarProps {
  fontSize: number;
  minFontSize: number;
  maxFontSize: number;
  readPreparing: boolean;
  transformTask: BackendPromptTask | null;
  hasText: boolean;
  summaryMuted: boolean;
  onSummaryMutedChange: (muted: boolean) => void;
  explainMode: "EXPLAIN1" | "EXPLAIN2";
  onExplainModeChange: (mode: "EXPLAIN1" | "EXPLAIN2") => void;
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
  summaryMuted,
  onSummaryMutedChange,
  explainMode,
  onExplainModeChange,
  onDecreaseFontSize,
  onIncreaseFontSize,
  onRead,
  onClear,
  onSummarize,
  onExplain,
}: EditorToolbarProps) {
  const aiDisabled = !hasText || transformTask != null;
  const isExplaining =
    transformTask === "EXPLAIN1" || transformTask === "EXPLAIN2";

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
          title="Format document for text-to-speech reading"
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
      <ExplainWithMode
        explainMode={explainMode}
        onExplainModeChange={onExplainModeChange}
        onExplain={onExplain}
        disabled={aiDisabled}
        isExplaining={isExplaining}
        title="Explain the content"
      />
      <SummaryWithSpeaker
        variant="toolbar"
        label="Summarize"
        isSummarizing={
          transformTask === "SUMMARIZE" ||
          transformTask === "SUMMARIZE_PROMPT" ||
          transformTask === "SUMMARIZE_AND_READ_PROMPT"
        }
        summaryMuted={summaryMuted}
        onSummaryMutedChange={onSummaryMutedChange}
        onSummaryClick={onSummarize}
        disabled={aiDisabled}
      />
    </div>
  );
}
