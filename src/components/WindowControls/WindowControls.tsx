import { MinimizeIcon, CloseIcon } from "../icons";
import "./WindowControls.css";

interface WindowControlsProps {
  onMinimize: () => void;
  onClose: () => void;
}

export function WindowControls({ onMinimize, onClose }: WindowControlsProps) {
  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-controls__btn window-controls__btn--minimize"
        onClick={onMinimize}
        aria-label="Minimize"
      >
        <MinimizeIcon size={6} />
      </button>
      <button
        type="button"
        className="window-controls__btn window-controls__btn--close"
        onClick={onClose}
        aria-label="Close"
      >
        <CloseIcon size={6} />
      </button>
    </div>
  );
}
