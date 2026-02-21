import type { Config, HotkeyStatus } from './Settings.types';

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

  const modeHelp = hotkeyStatus?.mode === 'wayland-compositor'
    ? 'Wayland session detected: configure your compositor shortcut to run `insight-reader action read-selected`.'
    : hotkeyStatus?.native_active
      ? `Global shortcuts are active in-app: ${readShortcut} (read), ${pauseShortcut} (pause/resume).`
      : 'Global shortcuts are currently not active in-app.';

  return (
    <div className="tab-content">
      <div className="setting-group">
        <label>Summary / LLM Backend URL</label>
        <input
          type="url"
          placeholder="http://grars-backend.i.psilva.org:8080"
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
        <label>Hotkey</label>
        <input 
          type="text"
          value={readShortcut}
          disabled
          className="hotkey-input"
        />
        <p className="setting-help">
          {modeHelp}
        </p>
        <p className="setting-help">
          Secondary: {pauseShortcut} ({hotkeyStatus?.mode === 'wayland-compositor' ? 'map this to `insight-reader action pause` in your compositor' : 'pause/resume'})
        </p>
        {hotkeyStatus?.last_error && <p className="setting-help">Hotkey error: {hotkeyStatus.last_error}</p>}
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
