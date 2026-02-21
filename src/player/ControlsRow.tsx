import { PlayIcon, PauseIcon, StopIcon } from "../components/icons";

interface ControlsRowProps {
  isPlaying: boolean;
  isPaused: boolean;
  currentTimeMs: number;
  atEnd: boolean;
  platform: string | null;
  onBackward: () => void;
  onForward: () => void;
  onPlayPause: () => void;
  onStop: () => void;
}

export function ControlsRow({
  isPlaying,
  isPaused,
  currentTimeMs,
  atEnd,
  platform,
  onBackward,
  onForward,
  onPlayPause,
  onStop,
}: ControlsRowProps) {
  return (
    <div className="controls-row">
      <button
        className="control-btn"
        onClick={onBackward}
        disabled={isPaused || currentTimeMs < 5000}
      >
        -5s
      </button>
      <button
        className="control-btn"
        onClick={onForward}
        disabled={isPaused || atEnd}
      >
        +5s
      </button>
      <div className="play-btn-wrap">
        <button
          className="control-btn play-btn"
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
        {platform === "macos" && !isPlaying && (
          <span className="play-btn-hint">Read clipboard</span>
        )}
      </div>
      <button className="control-btn stop-btn" onClick={onStop} aria-label="Stop">
        <StopIcon size={16} />
      </button>
    </div>
  );
}
