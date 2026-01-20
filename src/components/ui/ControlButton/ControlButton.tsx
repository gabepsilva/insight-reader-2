import "./ControlButton.css";

type ControlButtonVariant = "primary" | "danger" | "icon";

interface ControlButtonProps {
  onClick: () => void;
  "aria-label": string;
  variant?: ControlButtonVariant;
  className?: string;
  children: React.ReactNode;
}

export function ControlButton({
  onClick,
  "aria-label": ariaLabel,
  variant = "icon",
  className = "",
  children,
}: ControlButtonProps) {
  const variantClass = `control-button--${variant}`;
  const fullClass = `control-button ${variantClass} ${className}`.trim();

  return (
    <button
      type="button"
      className={fullClass}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
