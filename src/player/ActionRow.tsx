import { invoke } from "@tauri-apps/api/core";
import { PencilIcon, QuickReplayIcon } from "../components/icons";
import { callBackendPrompt } from "../backendPrompt";
import { SummaryWithSpeaker } from "../components/SummaryWithSpeaker";

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

  const handleSummaryClick = async () => {
    onSummarizingChange(true);
    try {
      const text = await getInitialText();
      const trimmed = text?.trim() ?? "";
      if (!trimmed) {
        onErrorsAdd("Summary: no text (copy or select text first).");
        return;
      }
      const task = summaryMuted ? "SUMMARIZE_PROMPT" : "SUMMARIZE_AND_READ_PROMPT";
      const textToShow = await callBackendPrompt(task, trimmed);
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

      <SummaryWithSpeaker
        variant="action-row"
        isSummarizing={isSummarizing}
        summaryMuted={summaryMuted}
        onSummaryMutedChange={onSummaryMutedChange}
        onSummaryClick={handleSummaryClick}
      />

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
