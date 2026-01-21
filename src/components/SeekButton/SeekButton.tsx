import "./SeekButton.css";

interface SeekButtonProps {
  label: string;
  onClick: () => void;
  ariaLabel: string;
  disabled?: boolean;
}

export const SeekButton = ({ label, onClick, ariaLabel, disabled }: SeekButtonProps) => {
  return (
    <button
      className="seek-button"
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
    >
      {label}
    </button>
  );
};
