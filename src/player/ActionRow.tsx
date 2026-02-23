import { invoke } from "@tauri-apps/api/core";
import { PencilIcon, QuickReplayIcon } from "../components/icons";
import { callBackendPrompt } from "../backendPrompt";

interface ActionRowProps {
  platform: string | null;
  isSummarizing: boolean;
  onSummarizingChange: (v: boolean) => void;
  summaryMuted: boolean;
  onSummaryMutedChange: (v: boolean) => void;
  onErrorsAdd: (msg: string) => void;
}

export function ActionRow({
  platform,
  isSummarizing,
  onSummarizingChange,
  summaryMuted,
  onSummaryMutedChange,
  onErrorsAdd,
}: ActionRowProps) {
  const getInitialText = async (): Promise<string> => {
    if (platform === "macos") {
      const text = await invoke<string | null>("get_clipboard_text");
      return text ?? "";
    }
    return invoke<string>("get_text_or_clipboard");
  };

  return (
    <div className="action-row">
      <button
        className="action-btn"
        onClick={async () => {
          const text = await getInitialText();
          void invoke("open_editor_window", { initialText: text });
        }}
        aria-label="Open Insight Editor"
      >
        <PencilIcon size={15} />
        <span>Editor</span>
      </button>

      <div className="action-row__summary-group" aria-label="Summary">
        <button
          type="button"
          className="action-btn action-row__summary-main"
          aria-label={summaryMuted ? "Open summary (muted)" : "Open summary and read aloud"}
          disabled={isSummarizing}
          onClick={async (e) => {
            e.preventDefault();
            onSummarizingChange(true);
            try {
              const text = await getInitialText();
              const trimmed = text?.trim() ?? "";
              if (!trimmed) {
                onErrorsAdd("Summary: no text (copy or select text first).");
                return;
              }
              const textToShow = await callBackendPrompt("SUMMARIZE", trimmed);
              await invoke("open_editor_window", {
                initialText: textToShow,
                triggerRead: !summaryMuted,
              });
            } catch (err) {
              const msg =
                err instanceof Error
                  ? err.message
                  : typeof err === "string"
                    ? err
                    : "Summary request failed.";
              onErrorsAdd(msg);
            } finally {
              onSummarizingChange(false);
            }
          }}
        >
          <span>{isSummarizing ? "…" : "Summary"}</span>
        </button>
        <button
          type="button"
          className="action-btn action-row__summary-toggle"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSummaryMutedChange(!summaryMuted);
          }}
          aria-label={summaryMuted ? "Unmute summary (read aloud when opening)" : "Mute summary (show only)"}
          title={summaryMuted ? "Unmute: summary will be read aloud" : "Mute: summary will not be read aloud"}
        >
          {summaryMuted ? (
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path d="M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
          )}
        </button>
      </div>

      <div className="disabled-action-wrap" data-tooltip="Coming soon">
        <button className="action-btn quick-replay-btn" aria-label="Quick replay" disabled>
          <span className="quick-replay-icon-wrap" aria-hidden="true">
            <QuickReplayIcon size={14} />
          </span>
          <span className="quick-replay-label">
            Quick
            <br />
            Replay
          </span>
        </button>
      </div>
    </div>
  );
}
