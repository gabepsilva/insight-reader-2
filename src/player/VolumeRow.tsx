interface VolumeRowProps {
  effectiveVolume: number;
  isMuted: boolean;
  onMuteToggle: () => void;
  onVolumeChange: (rawValue: string) => void;
}

export function VolumeRow({
  effectiveVolume,
  isMuted,
  onMuteToggle,
  onVolumeChange,
}: VolumeRowProps) {
  return (
    <div className="volume-row">
      <button
        className="volume-toggle"
        onClick={onMuteToggle}
        aria-label={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </svg>
        )}
      </button>
      <div className="volume-track">
        <input
          type="range"
          min="0"
          max="100"
          value={effectiveVolume}
          onChange={(e) => onVolumeChange(e.target.value)}
          aria-valuetext={`${effectiveVolume}%`}
          style={{
            background: `linear-gradient(to right, var(--volume-fill-color) 0%, var(--volume-fill-color) ${effectiveVolume}%, var(--volume-track-color) ${effectiveVolume}%, var(--volume-track-color) 100%)`,
          }}
        />
      </div>
      <span className="volume-value">{effectiveVolume}</span>
    </div>
  );
}
