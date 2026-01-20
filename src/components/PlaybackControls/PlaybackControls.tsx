import { PlayIcon, PauseIcon, StopIcon } from "../icons";
import { ControlButton } from "../ui/ControlButton";
import { Waveform } from "../Waveform";
import "./PlaybackControls.css";

interface PlaybackControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onStop: () => void;
}

export function PlaybackControls({
  isPlaying,
  onPlayPause,
  onStop,
}: PlaybackControlsProps) {
  return (
    <div className="playback-controls">
      <ControlButton
        onClick={onPlayPause}
        aria-label={isPlaying ? "Pause" : "Play"}
        variant="primary"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </ControlButton>

      <ControlButton onClick={onStop} aria-label="Stop" variant="danger">
        <StopIcon />
      </ControlButton>

      <Waveform />
    </div>
  );
}
