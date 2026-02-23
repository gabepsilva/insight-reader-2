import { ToolbarSplitButton } from "./ToolbarSplitButton";

export type ExplainMode = "EXPLAIN1" | "EXPLAIN2";

export interface ExplainWithModeProps {
  explainMode: ExplainMode;
  onExplainModeChange: (mode: ExplainMode) => void;
  onExplain: () => void;
  disabled?: boolean;
  isExplaining: boolean;
  title?: string;
}

const EXPLAIN1_TOGGLE_LABEL = "Like I missed the meeting";
const EXPLAIN2_TOGGLE_LABEL = "Like high school";

export function ExplainWithMode({
  explainMode,
  onExplainModeChange,
  onExplain,
  disabled = false,
  isExplaining,
  title = "Explain the content",
}: ExplainWithModeProps) {
  const effectiveDisabled = disabled || isExplaining;
  const otherMode: ExplainMode = explainMode === "EXPLAIN1" ? "EXPLAIN2" : "EXPLAIN1";
  const toggleLabel =
    explainMode === "EXPLAIN1" ? EXPLAIN1_TOGGLE_LABEL : EXPLAIN2_TOGGLE_LABEL;

  const handleToggleClick = () => {
    onExplainModeChange(otherMode);
  };

  return (
    <ToolbarSplitButton
      ariaLabel="Explain"
      mainLabel="Explain"
      mainBusy={isExplaining}
      mainVariant="neutral"
      onMainClick={onExplain}
      mainDisabled={effectiveDisabled}
      mainAriaLabel="Explain"
      mainTitle={title}
      toggleContent={
        explainMode === "EXPLAIN1" ? (
          <svg
            width={15}
            height={15}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
        ) : (
          <svg
            width={15}
            height={15}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <path d="M8 7h8" />
            <path d="M8 11h8" />
          </svg>
        )
      }
      onToggleClick={handleToggleClick}
      toggleDisabled={disabled}
      toggleTitle={toggleLabel}
      toggleAriaLabel={`Explain mode: ${toggleLabel}. Click to switch to ${explainMode === "EXPLAIN1" ? EXPLAIN2_TOGGLE_LABEL : EXPLAIN1_TOGGLE_LABEL}.`}
    />
  );
}
