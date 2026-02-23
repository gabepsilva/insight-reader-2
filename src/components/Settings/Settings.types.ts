export interface Config {
  backend_url?: string | null;
  voice_provider: string | null;
  log_level: string | null;
  selected_voice: string | null;
  selected_polly_voice: string | null;
  selected_microsoft_voice: string | null;
  hotkey_enabled: boolean | null;
  hotkey_modifiers: string | null;
  hotkey_key: string | null;
  ui_volume?: number | null;
  ui_muted?: boolean | null;
  ui_theme?: string | null;
  editor_dark_mode?: boolean | null;
  summary_muted?: boolean | null;
}

export interface HotkeyStatus {
  mode: string;
  session_type: string;
  enabled: boolean;
  native_active: boolean;
  read_shortcut: string;
  pause_shortcut: string;
  last_error: string | null;
}

export type Tab = 'general' | 'voices' | 'about';
