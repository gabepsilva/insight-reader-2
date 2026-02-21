import { getProviderLabel, getVoiceLabel } from "./types";
import type { Config } from "./types";

interface StatusBarProps {
  config: Config | null;
}

export function StatusBar({ config }: StatusBarProps) {
  return (
    <footer className="status-bar">
      <span className="status-item">
        <span className="status-label">Provider:</span>
        <span className="status-value">
          {config ? getProviderLabel(config.voice_provider) : "Loading..."}
        </span>
      </span>
      <span className="status-separator" />
      <span className="status-item">
        <span className="status-label">Voice:</span>
        <span className="status-value">
          {config ? getVoiceLabel(config) : "Loading..."}
        </span>
      </span>
    </footer>
  );
}
