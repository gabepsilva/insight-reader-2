import "./SeekButton.css";

interface SeekButtonProps {
  label: string;
  onClick: () => void;
  ariaLabel: string;
}

export const SeekButton = ({ label, onClick, ariaLabel }: SeekButtonProps) => {
  return (
    <button
      className="seek-button"
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {label}
    </button>
  );
};
