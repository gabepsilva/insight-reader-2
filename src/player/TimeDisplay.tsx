import { formatTime } from "./utils";

interface TimeDisplayProps {
  currentTimeMs: number;
  totalTimeMs: number;
}

export function TimeDisplay({ currentTimeMs, totalTimeMs }: TimeDisplayProps) {
  return (
    <div className="time-display">
      <span className="current-time">{formatTime(currentTimeMs)}</span>
      <span className="total-time">/ {formatTime(totalTimeMs)}</span>
    </div>
  );
}
