import { useEffect, useRef, useState } from "react";
import { PlayIcon, PauseIcon, StopIcon } from "../components/icons";
import { PLAYBACK_SPEEDS } from "./utils";

interface ControlsRowProps {
  isPlaying: boolean;
  isPaused: boolean;
  /** True while TTS synthesis is starting (request in progress). */
  isPreparing: boolean;
  currentTimeMs: number;
  atEnd: boolean;
  platform: string | null;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  onBackward: () => void;
  onForward: () => void;
  onPlayPause: () => void;
  onStop: () => void;
}

export function ControlsRow({
  isPlaying,
  isPaused,
  isPreparing,
  currentTimeMs,
  atEnd,
  platform,
  playbackSpeed,
  onPlaybackSpeedChange,
  onBackward,
  onForward,
  onPlayPause,
  onStop,
}: ControlsRowProps) {
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const speedWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!speedMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = speedWrapRef.current;
      if (el && !el.contains(e.target as Node)) {
        setSpeedMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [speedMenuOpen]);

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
          disabled={isPreparing}
          aria-label={
            isPreparing ? "Preparing…" : isPlaying ? "Pause" : "Play"
          }
        >
          {isPreparing ? (
            <span className="play-btn-preparing">Preparing…</span>
          ) : isPlaying ? (
            <PauseIcon size={18} />
          ) : (
            <PlayIcon size={18} />
          )}
        </button>
        {platform === "macos" && !isPlaying && !isPreparing && (
          <span className="play-btn-hint">Read clipboard</span>
        )}
      </div>
      <button className="control-btn stop-btn" onClick={onStop} aria-label="Stop">
        <StopIcon size={16} />
      </button>
      <div
        ref={speedWrapRef}
        className={`speed-wrap${speedMenuOpen ? " speed-wrap--open" : ""}`}
        data-no-drag="true"
      >
        <button
          className="speed-btn"
          type="button"
          aria-label="Playback speed"
          title="Playback speed"
          aria-expanded={speedMenuOpen}
          onClick={() => setSpeedMenuOpen((open) => !open)}
        >
          {playbackSpeed}x
        </button>
        <div className="speed-menu">
          {PLAYBACK_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={playbackSpeed === speed ? "speed-item active" : "speed-item"}
              onClick={() => {
                onPlaybackSpeedChange(speed);
                setSpeedMenuOpen(false);
              }}
            >
              {speed}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
