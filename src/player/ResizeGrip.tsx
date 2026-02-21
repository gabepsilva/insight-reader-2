interface ResizeGripProps {
  windowSize: { width: number; height: number };
  hovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function ResizeGrip({
  windowSize,
  hovered,
  onMouseEnter,
  onMouseLeave,
}: ResizeGripProps) {
  return (
    <div
      className="resize-grip"
      data-no-drag="true"
      aria-hidden="true"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {hovered && windowSize.width > 0 && windowSize.height > 0 && (
        <span className="resize-grip-dimensions">
          {windowSize.width} × {windowSize.height}
        </span>
      )}
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      >
        <path d="M12 9 L9 12" />
        <path d="M12 6 L6 12" />
        <path d="M12 3 L3 12" />
      </svg>
    </div>
  );
}
