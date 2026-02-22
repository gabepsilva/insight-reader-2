import { useCallback, useRef } from "react";
import "./AssistantPanelResizeHandle.css";

const ASSISTANT_WIDTH_KEY = "insight-reader-editor-assistant-width";
const ASSISTANT_WIDTH_MIN = 180;
const ASSISTANT_WIDTH_MAX = 420;
const ASSISTANT_WIDTH_DEFAULT = 260;

function loadStoredWidth(): number {
  try {
    const stored = localStorage.getItem(ASSISTANT_WIDTH_KEY);
    if (stored != null) {
      const n = parseInt(stored, 10);
      if (!Number.isNaN(n) && n >= ASSISTANT_WIDTH_MIN && n <= ASSISTANT_WIDTH_MAX) {
        return n;
      }
    }
  } catch {
    /* ignore */
  }
  return ASSISTANT_WIDTH_DEFAULT;
}

function saveWidth(width: number): void {
  try {
    localStorage.setItem(ASSISTANT_WIDTH_KEY, String(width));
  } catch {
    /* ignore */
  }
}

export interface AssistantPanelResizeHandleProps {
  width: number;
  onWidthChange: (width: number) => void;
}

export function AssistantPanelResizeHandle({
  width,
  onWidthChange,
}: AssistantPanelResizeHandleProps) {
  const latestWidthRef = useRef(width);
  latestWidthRef.current = width;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = startX - moveEvent.clientX;
        const newWidth = Math.min(
          ASSISTANT_WIDTH_MAX,
          Math.max(ASSISTANT_WIDTH_MIN, startWidth + deltaX),
        );
        onWidthChange(newWidth);
      };

      const handleMouseUp = () => {
        saveWidth(latestWidthRef.current);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [width, onWidthChange],
  );

  return (
    <div
      className="assistant-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize Quick adjustment panel"
      data-no-drag="true"
      onMouseDown={handleMouseDown}
    >
      <div className="assistant-resize-handle__track" />
    </div>
  );
}

export {
  loadStoredWidth,
  ASSISTANT_WIDTH_MIN,
  ASSISTANT_WIDTH_MAX,
  ASSISTANT_WIDTH_DEFAULT,
};
