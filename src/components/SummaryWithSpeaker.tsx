import { ToolbarSplitButton } from "./ToolbarSplitButton";
import "./SummaryWithSpeaker.css";

export interface SummaryWithSpeakerProps {
  isSummarizing: boolean;
  summaryMuted: boolean;
  onSummaryMutedChange: (muted: boolean) => void;
  onSummaryClick: () => void;
  disabled?: boolean;
  /** "action-row" for main window card, "toolbar" for editor toolbar */
  variant: "action-row" | "toolbar";
  /** Optional label (default "Summary") */
  label?: string;
}

export function SummaryWithSpeaker({
  isSummarizing,
  summaryMuted,
  onSummaryMutedChange,
  onSummaryClick,
  disabled = false,
  variant,
  label = "Summary",
}: SummaryWithSpeakerProps) {
  const effectiveDisabled = disabled || isSummarizing;

  if (variant === "toolbar") {
    return (
      <ToolbarSplitButton
        ariaLabel="Summary"
        mainLabel={label}
        mainBusy={isSummarizing}
        onMainClick={onSummaryClick}
        mainDisabled={effectiveDisabled}
        mainAriaLabel={
          summaryMuted
            ? "Summarize (muted)"
            : "Summarize and read aloud"
        }
        mainTitle={undefined}
        toggleContent={
          summaryMuted ? (
            <svg
              width={15}
              height={15}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg
              width={15}
              height={15}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path d="M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
          )
        }
        onToggleClick={() => onSummaryMutedChange(!summaryMuted)}
        toggleDisabled={false}
        toggleTitle={
          summaryMuted
            ? "Unmute: summary will be read aloud"
            : "Mute: summary will not be read aloud"
        }
        toggleAriaLabel={
          summaryMuted
            ? "Unmute summary (read aloud when summarizing)"
            : "Mute summary (show only)"
        }
      />
    );
  }

  return (
    <div
      className={`summary-with-speaker summary-with-speaker--${variant}`}
      aria-label="Summary"
    >
      <button
        type="button"
        className="summary-with-speaker__main"
        aria-label={
          summaryMuted
            ? "Summarize (muted)"
            : "Summarize and read aloud"
        }
        disabled={effectiveDisabled}
        onClick={(e) => {
          e.preventDefault();
          onSummaryClick();
        }}
      >
        <span>{isSummarizing ? "…" : label}</span>
      </button>
      <button
        type="button"
        className="summary-with-speaker__toggle"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSummaryMutedChange(!summaryMuted);
        }}
        aria-label={
          summaryMuted
            ? "Unmute summary (read aloud when summarizing)"
            : "Mute summary (show only)"
        }
        title={
          summaryMuted
            ? "Unmute: summary will be read aloud"
            : "Mute: summary will not be read aloud"
        }
      >
        {summaryMuted ? (
          <svg
            width={15}
            height={15}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg
            width={15}
            height={15}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </svg>
        )}
      </button>
    </div>
  );
}
