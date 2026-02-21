//! Global keyboard shortcut registration and handling.
//!
//! Reads hotkey config (enabled, modifiers, key), builds platform shortcuts (Cmd+R / Ctrl+R
//! for read, with shift for pause), and registers them with the Tauri global shortcut plugin.
//! On Wayland, native global hotkeys are not supported so we only report status; the frontend
//! can use compositor-specific or in-app shortcuts. State (HotkeyRuntime) is managed in lib and
//! passed to refresh_global_hotkeys and handle_global_shortcut_event. Called from lib's setup
//! and from save_config when the user changes settings.

use std::sync::{Arc, Mutex};

use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tracing::warn;

use crate::config;

// --- State and config types ---

/// Runtime state for global hotkeys: mode, labels, registered shortcuts, last error.
/// Stored in Tauri state as `GlobalHotkeyState`.
#[derive(Debug, Clone)]
pub struct HotkeyRuntime {
    pub mode: String,
    pub session_type: String,
    pub enabled: bool,
    pub native_active: bool,
    pub read_shortcut: Option<Shortcut>,
    pub pause_shortcut: Option<Shortcut>,
    pub read_shortcut_label: String,
    pub pause_shortcut_label: String,
    pub last_error: Option<String>,
}

/// Action that can be triggered by a hotkey or the action socket.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppAction {
    ReadSelected,
    TogglePause,
    Stop,
}

/// Serializable status returned by the get_hotkey_status command.
#[derive(Debug, Clone, serde::Serialize)]
pub struct HotkeyStatus {
    pub mode: String,
    pub session_type: String,
    pub enabled: bool,
    pub native_active: bool,
    pub read_shortcut: String,
    pub pause_shortcut: String,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone)]
struct EffectiveHotkeyConfig {
    enabled: bool,
    modifiers: String,
    key: String,
}

pub type GlobalHotkeyState = Arc<Mutex<HotkeyRuntime>>;

// --- Platform defaults and session detection ---

fn default_modifier_key() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "command"
    }
    #[cfg(not(target_os = "macos"))]
    {
        "control"
    }
}

fn default_read_shortcut_label() -> String {
    #[cfg(target_os = "macos")]
    {
        "Cmd+R".to_string()
    }
    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+R".to_string()
    }
}

fn default_pause_shortcut_label() -> String {
    #[cfg(target_os = "macos")]
    {
        "Cmd+Shift+R".to_string()
    }
    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+Shift+R".to_string()
    }
}

fn current_session_type() -> String {
    std::env::var("XDG_SESSION_TYPE")
        .unwrap_or_else(|_| "unknown".to_string())
        .to_lowercase()
}

fn is_wayland_session() -> bool {
    #[cfg(target_os = "linux")]
    {
        current_session_type() == "wayland"
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

fn supports_native_hotkeys() -> bool {
    !is_wayland_session()
}

impl Default for HotkeyRuntime {
    fn default() -> Self {
        Self {
            mode: "native".to_string(),
            session_type: "unknown".to_string(),
            enabled: true,
            native_active: false,
            read_shortcut: None,
            pause_shortcut: None,
            read_shortcut_label: default_read_shortcut_label(),
            pause_shortcut_label: default_pause_shortcut_label(),
            last_error: None,
        }
    }
}

// --- Parsing and building shortcuts ---

fn parse_modifier_token(token: &str) -> Option<Modifiers> {
    match token {
        "control" | "ctrl" => Some(Modifiers::CONTROL),
        "shift" => Some(Modifiers::SHIFT),
        "alt" | "option" => Some(Modifiers::ALT),
        "command" | "cmd" | "super" | "meta" => Some(Modifiers::SUPER),
        _ => None,
    }
}

fn parse_modifiers(raw: &str) -> Result<Option<Modifiers>, String> {
    let mut modifiers = Modifiers::empty();
    for token in raw
        .split(|c: char| c == '+' || c == ',' || c.is_whitespace())
        .map(|t| t.trim().to_lowercase())
        .filter(|t| !t.is_empty())
    {
        let parsed = parse_modifier_token(&token)
            .ok_or_else(|| format!("Unsupported modifier token: {token}"))?;
        modifiers |= parsed;
    }

    if modifiers.is_empty() {
        Ok(None)
    } else {
        Ok(Some(modifiers))
    }
}

fn parse_key_code(raw: &str) -> Result<Code, String> {
    match raw.trim().to_uppercase().as_str() {
        "A" => Ok(Code::KeyA),
        "B" => Ok(Code::KeyB),
        "C" => Ok(Code::KeyC),
        "D" => Ok(Code::KeyD),
        "E" => Ok(Code::KeyE),
        "F" => Ok(Code::KeyF),
        "G" => Ok(Code::KeyG),
        "H" => Ok(Code::KeyH),
        "I" => Ok(Code::KeyI),
        "J" => Ok(Code::KeyJ),
        "K" => Ok(Code::KeyK),
        "L" => Ok(Code::KeyL),
        "M" => Ok(Code::KeyM),
        "N" => Ok(Code::KeyN),
        "O" => Ok(Code::KeyO),
        "P" => Ok(Code::KeyP),
        "Q" => Ok(Code::KeyQ),
        "R" => Ok(Code::KeyR),
        "S" => Ok(Code::KeyS),
        "T" => Ok(Code::KeyT),
        "U" => Ok(Code::KeyU),
        "V" => Ok(Code::KeyV),
        "W" => Ok(Code::KeyW),
        "X" => Ok(Code::KeyX),
        "Y" => Ok(Code::KeyY),
        "Z" => Ok(Code::KeyZ),
        "0" => Ok(Code::Digit0),
        "1" => Ok(Code::Digit1),
        "2" => Ok(Code::Digit2),
        "3" => Ok(Code::Digit3),
        "4" => Ok(Code::Digit4),
        "5" => Ok(Code::Digit5),
        "6" => Ok(Code::Digit6),
        "7" => Ok(Code::Digit7),
        "8" => Ok(Code::Digit8),
        "9" => Ok(Code::Digit9),
        other => Err(format!("Unsupported hotkey key: {other}")),
    }
}

fn format_modifier_label(raw: &str) -> String {
    raw.split(|c: char| c == '+' || c == ',' || c.is_whitespace())
        .filter_map(|token| {
            let normalized = token.trim().to_lowercase();
            if normalized.is_empty() {
                return None;
            }
            let label = match normalized.as_str() {
                "control" | "ctrl" => "Ctrl",
                "shift" => "Shift",
                "alt" | "option" => "Alt",
                "command" | "cmd" => "Cmd",
                "super" | "meta" => "Super",
                _ => token.trim(),
            };
            Some(label.to_string())
        })
        .collect::<Vec<_>>()
        .join("+")
}

fn build_shortcut(modifiers: &str, key: &str) -> Result<Shortcut, String> {
    let mods = parse_modifiers(modifiers)?;
    let code = parse_key_code(key)?;
    Ok(Shortcut::new(mods, code))
}

fn shortcut_label(modifiers: &str, key: &str) -> String {
    let mod_label = format_modifier_label(modifiers);
    let upper_key = key.trim().to_uppercase();
    if mod_label.is_empty() {
        upper_key
    } else {
        format!("{mod_label}+{upper_key}")
    }
}

fn load_effective_hotkey_config() -> EffectiveHotkeyConfig {
    let config = config::load_full_config().unwrap_or_default();
    EffectiveHotkeyConfig {
        enabled: config.hotkey_enabled.unwrap_or(true),
        modifiers: config
            .hotkey_modifiers
            .unwrap_or_else(|| default_modifier_key().to_string()),
        key: config.hotkey_key.unwrap_or_else(|| "r".to_string()),
    }
}

fn pause_shortcut_parts(config: &EffectiveHotkeyConfig) -> (String, String) {
    let modifiers = if config.modifiers.to_lowercase().contains("shift") {
        config.modifiers.clone()
    } else {
        format!("{}+shift", config.modifiers)
    };
    (modifiers, config.key.clone())
}

fn update_hotkey_runtime_on_error(state: &GlobalHotkeyState, message: String) {
    if let Ok(mut runtime) = state.lock() {
        runtime.native_active = false;
        runtime.last_error = Some(message);
    }
}

// --- Registration and event handling ---

/// Re-reads config and registers or unregisters global shortcuts. Called from setup and save_config.
pub fn refresh_global_hotkeys<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    state: &GlobalHotkeyState,
) {
    let effective = load_effective_hotkey_config();
    let session_type = current_session_type();
    let mode = if supports_native_hotkeys() {
        "native"
    } else {
        "wayland-compositor"
    };

    let read_label = shortcut_label(&effective.modifiers, &effective.key);
    let (pause_modifiers, pause_key) = pause_shortcut_parts(&effective);
    let pause_label = shortcut_label(&pause_modifiers, &pause_key);

    if let Ok(mut runtime) = state.lock() {
        runtime.mode = mode.to_string();
        runtime.session_type = session_type;
        runtime.enabled = effective.enabled;
        runtime.read_shortcut_label = read_label.clone();
        runtime.pause_shortcut_label = pause_label.clone();
        runtime.last_error = None;
        runtime.native_active = false;
        runtime.read_shortcut = None;
        runtime.pause_shortcut = None;
    }

    if !supports_native_hotkeys() || !effective.enabled {
        if let Err(e) = app.global_shortcut().unregister_all() {
            warn!(error = %e, "Failed to unregister global shortcuts");
        }
        return;
    }

    let read_shortcut = match build_shortcut(&effective.modifiers, &effective.key) {
        Ok(shortcut) => shortcut,
        Err(e) => {
            update_hotkey_runtime_on_error(state, e.clone());
            warn!(error = %e, "Failed to build read shortcut");
            return;
        }
    };

    let pause_shortcut = match build_shortcut(&pause_modifiers, &pause_key) {
        Ok(shortcut) => shortcut,
        Err(e) => {
            update_hotkey_runtime_on_error(state, e.clone());
            warn!(error = %e, "Failed to build pause shortcut");
            return;
        }
    };

    if let Err(e) = app.global_shortcut().unregister_all() {
        let message = format!("Failed to clear old global shortcuts: {e}");
        update_hotkey_runtime_on_error(state, message.clone());
        warn!(error = %e, "Failed to clear old global shortcuts");
        return;
    }

    if let Err(e) = app.global_shortcut().register(read_shortcut) {
        let message = format!("Failed to register {}: {}", read_label, e);
        update_hotkey_runtime_on_error(state, message.clone());
        warn!(error = %e, shortcut = %read_label, "Failed to register read shortcut");
        return;
    }

    if let Err(e) = app.global_shortcut().register(pause_shortcut) {
        let message = format!("Failed to register {}: {}", pause_label, e);
        update_hotkey_runtime_on_error(state, message.clone());
        warn!(error = %e, shortcut = %pause_label, "Failed to register pause shortcut");
        return;
    }

    if let Ok(mut runtime) = state.lock() {
        runtime.native_active = true;
        runtime.read_shortcut = Some(read_shortcut);
        runtime.pause_shortcut = Some(pause_shortcut);
    }
}

/// Called by the global shortcut plugin when a key is pressed. Determines the action and invokes dispatch.
pub fn handle_global_shortcut_event<R, F>(
    app: &tauri::AppHandle<R>,
    shortcut: &Shortcut,
    event_state: ShortcutState,
    hotkey_state: &GlobalHotkeyState,
    dispatch: F,
) where
    R: tauri::Runtime,
    F: Fn(&tauri::AppHandle<R>, AppAction),
{
    if event_state != ShortcutState::Pressed {
        return;
    }

    let action = {
        let Ok(runtime) = hotkey_state.lock() else {
            return;
        };

        if !runtime.native_active {
            return;
        }

        if runtime
            .read_shortcut
            .as_ref()
            .map(|registered| registered == shortcut)
            .unwrap_or(false)
        {
            Some(AppAction::ReadSelected)
        } else if runtime
            .pause_shortcut
            .as_ref()
            .map(|registered| registered == shortcut)
            .unwrap_or(false)
        {
            Some(AppAction::TogglePause)
        } else {
            None
        }
    };

    if let Some(action) = action {
        dispatch(app, action);
    }
}

// --- Parsing action strings (used by action socket and startup env) ---

/// Parses an action string (e.g. from socket or INSIGHT_READER_START_ACTION) into AppAction.
pub fn parse_app_action(raw: &str) -> Option<AppAction> {
    match raw.trim().to_lowercase().as_str() {
        "read" | "read-selected" | "read_selected" => Some(AppAction::ReadSelected),
        "pause" | "pause-toggle" | "toggle-pause" | "toggle_pause" => Some(AppAction::TogglePause),
        "stop" => Some(AppAction::Stop),
        _ => None,
    }
}

// --- Command ---

#[tauri::command]
pub fn get_hotkey_status(state: tauri::State<GlobalHotkeyState>) -> HotkeyStatus {
    match state.inner().lock() {
        Ok(runtime) => HotkeyStatus {
            mode: runtime.mode.clone(),
            session_type: runtime.session_type.clone(),
            enabled: runtime.enabled,
            native_active: runtime.native_active,
            read_shortcut: runtime.read_shortcut_label.clone(),
            pause_shortcut: runtime.pause_shortcut_label.clone(),
            last_error: runtime.last_error.clone(),
        },
        Err(_) => HotkeyStatus {
            mode: "unknown".to_string(),
            session_type: "unknown".to_string(),
            enabled: false,
            native_active: false,
            read_shortcut: default_read_shortcut_label(),
            pause_shortcut: default_pause_shortcut_label(),
            last_error: Some("Hotkey state unavailable".to_string()),
        },
    }
}
