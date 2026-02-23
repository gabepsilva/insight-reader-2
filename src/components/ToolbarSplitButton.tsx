import type { ReactNode } from "react";
import "./ToolbarSplitButton.css";

export interface ToolbarSplitButtonProps {
  /** Label for the main action (e.g. "Summarize", "Explain") */
  mainLabel: string;
  /** When true, main shows "…" instead of label and is disabled */
  mainBusy?: boolean;
  onMainClick: () => void;
  mainDisabled?: boolean;
  mainAriaLabel?: string;
  mainTitle?: string;
  /** Content for the toggle part (e.g. icon) */
  toggleContent: ReactNode;
  onToggleClick: () => void;
  toggleDisabled?: boolean;
  toggleTitle?: string;
  toggleAriaLabel?: string;
  /** Wrapper aria-label */
  ariaLabel: string;
  /** "primary" = blue main (default), "neutral" = grey main like the toggle */
  mainVariant?: "primary" | "neutral";
}

/**
 * Reusable toolbar split button: primary main action + neutral toggle.
 * Matches the Summarize button look (bright main, grey toggle).
 */
export function ToolbarSplitButton({
  mainLabel,
  mainBusy = false,
  onMainClick,
  mainDisabled = false,
  mainAriaLabel,
  mainTitle,
  toggleContent,
  onToggleClick,
  toggleDisabled = false,
  toggleTitle,
  toggleAriaLabel,
  ariaLabel,
  mainVariant = "primary",
}: ToolbarSplitButtonProps) {
  const effectiveMainDisabled = mainDisabled || mainBusy;

  return (
    <div
      className={`toolbar-split-button ${mainVariant === "neutral" ? "toolbar-split-button--neutral-main" : ""}`}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="toolbar-split-button__main"
        aria-label={mainAriaLabel ?? mainLabel}
        title={mainTitle}
        disabled={effectiveMainDisabled}
        onClick={(e) => {
          e.preventDefault();
          onMainClick();
        }}
      >
        <span>{mainBusy ? "…" : mainLabel}</span>
      </button>
      <button
        type="button"
        className="toolbar-split-button__toggle"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleClick();
        }}
        aria-label={toggleAriaLabel}
        title={toggleTitle}
        disabled={toggleDisabled}
      >
        {toggleContent}
      </button>
    </div>
  );
}
