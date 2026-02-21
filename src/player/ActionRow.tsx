import { invoke } from "@tauri-apps/api/core";
import { PencilIcon, QuickReplayIcon, SummaryIcon } from "../components/icons";
import { callBackendPrompt } from "../backendPrompt";

interface ActionRowProps {
  platform: string | null;
  isSummarizing: boolean;
  onSummarizingChange: (v: boolean) => void;
  onErrorsAdd: (msg: string) => void;
}

export function ActionRow({
  platform,
  isSummarizing,
  onSummarizingChange,
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
        aria-label="Open grammar editor"
      >
        <PencilIcon size={15} />
        <span>Edit</span>
      </button>

      <button
        className="action-btn"
        aria-label="Open summary"
        disabled={isSummarizing}
        onClick={async () => {
          onSummarizingChange(true);
          try {
            const text = await getInitialText();
            const trimmed = text?.trim() ?? "";
            if (!trimmed) {
              onErrorsAdd("Summary: no text (copy or select text first).");
              return;
            }
            const textToShow = await callBackendPrompt("SUMMARIZE", trimmed);
            await invoke("open_editor_window", { initialText: textToShow });
          } catch (e) {
            const msg =
              e instanceof Error
                ? e.message
                : typeof e === "string"
                  ? e
                  : "Summary request failed.";
            onErrorsAdd(msg);
          } finally {
            onSummarizingChange(false);
          }
        }}
      >
        <SummaryIcon size={15} />
        <span>{isSummarizing ? "…" : "Summary"}</span>
      </button>

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
