import type { Config, HotkeyStatus } from './Settings.types';
import { VolumeRow } from '../../player/VolumeRow';
import { clampVolume, DEFAULT_VOLUME } from '../../player/utils';

const defaultBackendPlaceholder = 'https://api.insightreader.xyz';

export function GeneralTab({
  config,
  onChange,
  hotkeyStatus,
}: {
  config: Config;
  onChange: (updates: Partial<Config>) => void;
  hotkeyStatus: HotkeyStatus | null;
}) {
  const readShortcut = hotkeyStatus?.read_shortcut || `${config.hotkey_modifiers || 'control'}+${config.hotkey_key || 'r'}`;
  const pauseShortcut = hotkeyStatus?.pause_shortcut || `${config.hotkey_modifiers || 'control'}+shift+${config.hotkey_key || 'r'}`;

  const effectiveVolume = config.ui_muted ? 0 : (config.ui_volume ?? DEFAULT_VOLUME);

  const modeHelp = hotkeyStatus?.mode === 'wayland-compositor'
    ? 'Wayland session detected: app-owned global hotkeys are not available. Configure your compositor shortcut to run `insight-reader action read-selected` instead.'
    : hotkeyStatus?.native_active
      ? `Global shortcuts are active in-app: ${readShortcut} (read), ${pauseShortcut} (pause/resume).`
      : 'Global shortcuts are currently not active in-app.';

  return (
    <div className="tab-content">
      <div className="setting-group">
        <label>Summary / LLM Backend URL</label>
        <input
          type="url"
          placeholder={defaultBackendPlaceholder}
          value={config.backend_url ?? ''}
          onChange={(e) => onChange({ backend_url: e.target.value.trim() || null })}
          className="setting-input"
        />
        <p className="setting-help">
          URL of the ReadingService backend for Summary and other LLM features. Leave empty for default.
        </p>
      </div>

      <div className="setting-group">
        <label>
          <input 
            type="checkbox"
            checked={config.hotkey_enabled ?? true}
            onChange={(e) => onChange({ hotkey_enabled: e.target.checked })}
          />
          Enable Global Hotkey
        </label>
      </div>

      <div className="setting-group">
        <label>HotKeys</label>
        <p className="setting-help">
          {modeHelp}
        </p>
        <p className="setting-help">
          Secondary: {pauseShortcut} ({hotkeyStatus?.mode === 'wayland-compositor' ? 'map this to `insight-reader action pause` in your compositor' : 'pause/resume'})
        </p>
        {hotkeyStatus?.last_error && <p className="setting-help">Hotkey error: {hotkeyStatus.last_error}</p>}
      </div>

      <div className="setting-group">
        <label>Volume</label>
        <VolumeRow
          effectiveVolume={effectiveVolume}
          isMuted={config.ui_muted ?? false}
          onMuteToggle={() => onChange({ ui_muted: !(config.ui_muted ?? false) })}
          onVolumeChange={(rawValue) => {
            const v = clampVolume(parseInt(rawValue, 10));
            onChange({ ui_volume: v });
          }}
        />
      </div>

      <div className="setting-group">
        <label>Log Level</label>
        <select 
          value={config.log_level || 'info'}
          onChange={(e) => onChange({ log_level: e.target.value })}
        >
          <option value="error">Error</option>
          <option value="warn">Warning</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>
      </div>

    </div>
  );
}
