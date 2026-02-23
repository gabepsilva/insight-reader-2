//! Tauri commands for config, platform, and explain mode.

use std::sync::{Arc, Mutex};

use tauri::{Emitter, Manager, State};

use crate::config;
use crate::hotkeys;

/// Shared config state type used by these commands and by lib's composition root.
pub type ConfigState = Arc<Mutex<config::FullConfig>>;

/// Returns the current platform (e.g., "macos", "windows", "linux").
#[tauri::command]
pub fn get_platform() -> &'static str {
    #[cfg(target_os = "macos")]
    return "macos";
    #[cfg(target_os = "windows")]
    return "windows";
    #[cfg(target_os = "linux")]
    return "linux";
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return "unknown";
}

#[tauri::command]
pub fn get_config(state: State<'_, ConfigState>) -> Result<config::FullConfig, String> {
    let cfg = state
        .lock()
        .map_err(|_| "Config lock poisoned".to_string())?;
    Ok(cfg.clone())
}

#[tauri::command]
pub fn save_config(
    app: tauri::AppHandle,
    state: State<'_, ConfigState>,
    config_json: String,
) -> Result<(), String> {
    let mut cfg: config::FullConfig = serde_json::from_str(&config_json)
        .map_err(|e| format!("Failed to parse config JSON: {}", e))?;
    cfg.installation_id = Some(config::get_or_create_installation_id()?);
    {
        let mut shared = state
            .lock()
            .map_err(|_| "Config lock poisoned".to_string())?;
        *shared = cfg.clone();
    }
    config::save_full_config(cfg).map_err(|e| e.to_string())?;

    if let Some(state) = app.try_state::<hotkeys::GlobalHotkeyState>() {
        hotkeys::refresh_global_hotkeys(&app, &state.inner().clone());
    }

    let _ = app.emit("config-changed", ());
    Ok(())
}

/// Sets the explain mode preference in a single, serialized read-modify-write.
#[tauri::command]
pub fn set_explain_mode(
    app: tauri::AppHandle,
    state: State<'_, ConfigState>,
    mode: String,
) -> Result<(), String> {
    let new_cfg = {
        let mut cfg = state
            .lock()
            .map_err(|_| "Config lock poisoned".to_string())?;
        cfg.explain_mode = Some(mode);
        cfg.clone()
    };

    config::save_full_config(new_cfg).map_err(|e| e.to_string())?;

    if let Some(state) = app.try_state::<hotkeys::GlobalHotkeyState>() {
        hotkeys::refresh_global_hotkeys(&app, &state.inner().clone());
    }

    let _ = app.emit("config-changed", ());
    Ok(())
}
