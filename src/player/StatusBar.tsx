import { getProviderLabel, getVoiceLabel } from "./types";
import type { Config } from "./types";
import { useBackendHealth } from "./hooks/useBackendHealth";

interface StatusBarProps {
  config: Config | null;
}

export function StatusBar({ config }: StatusBarProps) {
  const backendHealthy = useBackendHealth();

  return (
    <footer className="status-bar">
      <span className="status-item">
        <span className="status-value status-value--backend">
          <span
            className={`status-backend-dot ${backendHealthy ? "status-backend-dot--healthy" : ""}`}
            title={backendHealthy ? "Backend reachable" : "Backend unreachable"}
            aria-label={backendHealthy ? "Backend reachable" : "Backend unreachable"}
          />
        </span>
      </span>
      <span className="status-separator" />
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
