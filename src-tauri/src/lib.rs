//! Insight Reader Tauri backend: app entry, command wiring, and lifecycle.
//!
//! This crate is the Rust entry point for the Tauri app. It owns `run()`, plugin and state
//! registration, `invoke_handler![]`, `on_window_event`, and `setup` that delegates to modules.
//! Business logic lives in the modules below; this file does not contain domain logic.
//!
//! **Modules:** `action_socket` — Unix single-instance action bridge; `actions` — read/pause/stop
//! execution; `backend` — ReadingService HTTP API; `config` / `paths` — config and paths;
//! `hotkeys` — global shortcut state and handling; `system` — clipboard/selection; `text_capture` —
//! timeout-wrapped selection/clipboard; `tts` / `voices` — TTS and voice listing; `tray` — tray
//! menu and icon; `windows` — webview URL and editor window.

mod action_socket;
mod actions;
mod backend;
mod config;
mod hotkeys;
mod paths;
mod system;
mod text_capture;
mod tray;
mod tts;
mod voices;
mod windows;

pub use action_socket::send_action_to_running_instance;

use std::sync::{Arc, Mutex};
use tauri::{menu::MenuEvent, Emitter, Manager, State, WebviewWindowBuilder, WindowEvent};
use tracing::{error, warn};
use tracing_subscriber::EnvFilter;

use voices::download::{
    get_current_progress, list_downloaded_voices as list_local_downloaded_voices, DownloadProgress,
    DownloadedVoice,
};

// --- State types (shared with windows and tray) ---

/// Managed state for initial text passed to the editor window. Used by windows and tray.
pub type EditorInitialText = Arc<Mutex<Option<String>>>;

// --- TTS and voice commands (thin wrappers around tts / voices) ---

/// Speaks the given text with Piper TTS. Fails if TTS is unavailable or text is empty.
#[tauri::command]
fn tts_speak(state: State<tts::TtsState>, text: String) -> Result<(), String> {
    let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
    state
        .inner()
        .send(tts::TtsRequest::Speak(text, resp_tx))
        .map_err(|e| format!("TTS channel: {e}"))?;
    resp_rx
        .recv()
        .map_err(|_| "TTS worker disconnected".to_string())?
        .map_err(|e| e.to_string())
}

/// Stops any ongoing TTS playback. No-op if TTS is unavailable.
#[tauri::command]
fn tts_stop(state: State<tts::TtsState>) -> Result<(), String> {
    state
        .inner()
        .send(tts::TtsRequest::Stop)
        .map_err(|e| format!("TTS channel: {e}"))?;
    Ok(())
}

/// Toggles pause state of TTS playback. Returns true if paused, false if playing.
#[tauri::command]
fn tts_toggle_pause(state: State<tts::TtsState>) -> Result<bool, String> {
    let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
    state
        .inner()
        .send(tts::TtsRequest::TogglePause(resp_tx))
        .map_err(|e| format!("TTS channel: {e}"))?;
    resp_rx
        .recv()
        .map_err(|_| "TTS worker disconnected".to_string())?
        .map_err(|e| e.to_string())
}

/// Gets the current TTS playback status. Returns (is_playing, is_paused).
#[tauri::command]
fn tts_get_status(state: State<tts::TtsState>) -> Result<(bool, bool), String> {
    let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
    state
        .inner()
        .send(tts::TtsRequest::GetStatus(resp_tx))
        .map_err(|e| format!("TTS channel: {e}"))?;
    resp_rx
        .recv()
        .map_err(|_| "TTS worker disconnected".to_string())
}

/// Seeks TTS playback by the given offset in milliseconds.
/// Returns (success, at_start, at_end). Fails if paused or seeking is not supported.
#[tauri::command]
fn tts_seek(state: State<tts::TtsState>, offset_ms: i64) -> Result<(bool, bool, bool), String> {
    let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
    state
        .inner()
        .send(tts::TtsRequest::Seek(offset_ms, resp_tx))
        .map_err(|e| format!("TTS channel: {e}"))?;
    resp_rx
        .recv()
        .map_err(|_| "TTS worker disconnected".to_string())?
        .map_err(|e| e.to_string())
}

/// Gets the current playback position and total duration in milliseconds.
/// Returns (current_ms, total_ms).
#[tauri::command]
fn tts_get_position(state: State<tts::TtsState>) -> Result<(u64, u64), String> {
    let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
    state
        .inner()
        .send(tts::TtsRequest::GetPosition(resp_tx))
        .map_err(|e| format!("TTS channel: {e}"))?;
    resp_rx
        .recv()
        .map_err(|_| "TTS worker disconnected".to_string())
}

/// Sets TTS playback volume as percentage from 0 to 100.
#[tauri::command]
fn tts_set_volume(state: State<tts::TtsState>, volume_percent: u8) -> Result<(), String> {
    let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
    state
        .inner()
        .send(tts::TtsRequest::SetVolume(volume_percent, resp_tx))
        .map_err(|e| format!("TTS channel: {e}"))?;
    resp_rx
        .recv()
        .map_err(|_| "TTS worker disconnected".to_string())?
        .map_err(|e| e.to_string())
}

/// Switches the TTS provider. provider should be "piper" or "microsoft".
#[tauri::command]
fn tts_switch_provider(state: State<tts::TtsState>, provider: String) -> Result<(), String> {
    let provider = match provider.to_lowercase().as_str() {
        "piper" => tts::TtsProvider::Piper,
        "microsoft" => tts::TtsProvider::Microsoft,
        "polly" => tts::TtsProvider::Polly,
        _ => {
            return Err(format!(
                "Unknown provider: {}. Use 'piper', 'microsoft', or 'polly'.",
                provider
            ))
        }
    };
    let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
    state
        .inner()
        .send(tts::TtsRequest::SwitchProvider(provider, resp_tx))
        .map_err(|e| format!("TTS channel: {e}"))?;
    resp_rx
        .recv()
        .map_err(|_| "TTS worker disconnected".to_string())?
        .map_err(|e| e.to_string())
}

// --- Config, platform, and misc commands ---

/// Returns the current platform (e.g., "macos", "windows", "linux").
#[tauri::command]
fn get_platform() -> &'static str {
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
fn get_config() -> Result<config::FullConfig, String> {
    config::load_full_config()
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, config_json: String) -> Result<(), String> {
    let cfg: config::FullConfig = serde_json::from_str(&config_json)
        .map_err(|e| format!("Failed to parse config JSON: {}", e))?;
    config::save_full_config(cfg).map_err(|e| e.to_string())?;

    if let Some(state) = app.try_state::<hotkeys::GlobalHotkeyState>() {
        hotkeys::refresh_global_hotkeys(&app, &state.inner().clone());
    }

    let _ = app.emit("config-changed", ());
    Ok(())
}

#[tauri::command]
async fn list_piper_voices() -> Result<Vec<voices::VoiceInfo>, String> {
    let voices = voices::fetch_piper_voices(false).await?;
    Ok(voices.into_values().collect())
}

#[tauri::command]
async fn refresh_piper_voices() -> Result<Vec<voices::VoiceInfo>, String> {
    let voices = voices::fetch_piper_voices(true).await?;
    Ok(voices.into_values().collect())
}

#[tauri::command]
async fn list_polly_voices() -> Result<Vec<voices::PollyVoiceInfo>, String> {
    voices::fetch_polly_voices().await
}

#[tauri::command]
async fn list_microsoft_voices() -> Result<Vec<voices::MicrosoftVoiceInfo>, String> {
    voices::fetch_microsoft_voices().await
}

#[tauri::command]
async fn download_voice(voice_key: String) -> Result<String, String> {
    let voices = voices::fetch_piper_voices(false).await?;
    let voice_info = voices
        .get(&voice_key)
        .ok_or_else(|| format!("Voice not found: {}", voice_key))?;

    // If files are empty, force refresh to get the full data with files
    if voice_info.files.is_empty() {
        let voices = voices::fetch_piper_voices(true).await?;
        let voice_info = voices
            .get(&voice_key)
            .ok_or_else(|| format!("Voice not found: {}", voice_key))?;
        let path = voices::download::download_voice(&voice_key, voice_info).await?;
        return Ok(path.to_string_lossy().to_string());
    }

    let path = voices::download::download_voice(&voice_key, voice_info).await?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_download_progress() -> Option<DownloadProgress> {
    get_current_progress()
}

#[tauri::command]
fn list_downloaded_voices() -> Result<Vec<DownloadedVoice>, String> {
    list_local_downloaded_voices()
}

// --- Settings window ---

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    // Check if settings window already exists
    if let Some(win) = app.get_webview_window("settings") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let url = windows::build_webview_url(&app, "settings.html")?;

    WebviewWindowBuilder::new(&app, "settings", url)
        .title("Settings - Insight Reader")
        .inner_size(600.0, 600.0)
        .min_inner_size(500.0, 500.0)
        .resizable(true)
        .decorations(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

// --- Entry point and Tauri builder ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    for directive in [
        "aws_config::profile::credentials=warn",
        "aws_credential_types=warn",
    ] {
        if let Ok(parsed) = directive.parse() {
            env_filter = env_filter.add_directive(parsed);
        }
    }

    tracing_subscriber::fmt().with_env_filter(env_filter).init();

    let editor_initial: EditorInitialText = Arc::new(Mutex::new(None));
    let tts_state = tts::create_tts_state();
    let hotkey_state: hotkeys::GlobalHotkeyState =
        Arc::new(Mutex::new(hotkeys::HotkeyRuntime::default()));
    #[cfg(target_os = "linux")]
    let window_state_plugin = tauri_plugin_window_state::Builder::default()
        // On Linux, restoring/saving SIZE can cause gradual shrink for this window setup.
        .with_state_flags(
            tauri_plugin_window_state::StateFlags::all()
                .difference(tauri_plugin_window_state::StateFlags::SIZE),
        )
        .build();
    #[cfg(not(target_os = "linux"))]
    let window_state_plugin = tauri_plugin_window_state::Builder::default().build();

    let hotkey_state_for_handler = hotkey_state.clone();

    if let Err(e) = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(window_state_plugin)
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    hotkeys::handle_global_shortcut_event(
                        app,
                        shortcut,
                        event.state(),
                        &hotkey_state_for_handler,
                        |app, action| actions::execute_action(app, action, "global-hotkey"),
                    );
                })
                .build(),
        )
        .manage(editor_initial)
        .manage(tts_state)
        .manage(hotkey_state.clone())
        .invoke_handler(tauri::generate_handler![
            backend::backend_prompt,
            text_capture::get_selected_text,
            text_capture::get_clipboard_text,
            text_capture::get_text_or_clipboard,
            windows::open_editor_window,
            windows::take_editor_initial_text,
            tts_speak,
            tts_stop,
            tts_toggle_pause,
            tts_get_status,
            tts_seek,
            tts_get_position,
            tts_set_volume,
            tts_switch_provider,
            get_platform,
            get_config,
            hotkeys::get_hotkey_status,
            save_config,
            list_piper_voices,
            refresh_piper_voices,
            list_polly_voices,
            list_microsoft_voices,
            download_voice,
            get_download_progress,
            list_downloaded_voices,
            open_settings_window,
            backend::check_polly_credentials,
        ])
        // --- Window close behavior ---
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label == "editor" {
                    let _ = window.hide();
                    api.prevent_close();
                } else if label == "main" {
                    // Stop TTS worker thread when main window closes
                    if let Some(state) = window.app_handle().try_state::<tts::TtsState>() {
                        let _ = state.inner().send(tts::TtsRequest::Shutdown);
                    }
                }
            }
        })
        // --- Setup: tray, window effects, hotkeys, action socket, startup action ---
        .setup(|app| {
            // Tray is created from app.trayIcon config; we add menu, icon, and menu handler here.
            if let Some(tray) = app.tray_by_id("main") {
                // Initial Show/Hide label from current window visibility.
                let is_visible = match app.get_webview_window("main") {
                    Some(win) => win.is_visible().unwrap_or_else(|e| {
                        warn!(error = %e, "is_visible for main window failed, assuming visible");
                        true
                    }),
                    None => {
                        warn!("main window not found for tray label, assuming visible");
                        true
                    }
                };
                let toggle_label = if is_visible {
                    "Hide Window"
                } else {
                    "Show Window"
                };
                let menu = tray::build_tray_menu(app, toggle_label)?;
                tray.set_menu(Some(menu))?;

                tray.on_menu_event(move |app, event: MenuEvent| {
                    let id = event.id().0.as_str();
                    match id {
                        "read_selected" => {
                            actions::execute_action(app, hotkeys::AppAction::ReadSelected, "tray");
                        }
                        "summarize_selected" => {
                            let app = app.clone();
                            std::thread::spawn(move || {
                                let text = text_capture::get_text_or_clipboard_impl();
                                if text.trim().is_empty() {
                                    warn!("Summarize Selected: no text available");
                                    return;
                                }
                                match backend::backend_prompt("SUMMARIZE".to_string(), text) {
                                    Ok(summary) => {
                                        if let Some(state) = app.try_state::<EditorInitialText>() {
                                            if let Err(e) =
                                                windows::open_or_focus_editor_with_text(&app, &state, summary)
                                            {
                                                warn!(error = %e, "Summarize Selected: open_editor_window failed");
                                            }
                                        } else {
                                            warn!("Summarize Selected: EditorInitialText state not found");
                                        }
                                    }
                                    Err(e) => {
                                        if let Some(state) = app.try_state::<EditorInitialText>() {
                                            let _ = windows::open_or_focus_editor_with_text(
                                                &app,
                                                &state,
                                                format!("Summary failed: {}", e),
                                            );
                                        } else {
                                            warn!(error = %e, "Summarize Selected: backend_prompt failed");
                                        }
                                    }
                                }
                            });
                        }
                        "insight_editor" => {
                            let text = text_capture::get_text_or_clipboard_impl();
                            match app.try_state::<EditorInitialText>() {
                                Some(state) => {
                                    if let Err(e) =
                                        windows::open_or_focus_editor_with_text(app, &state, text)
                                    {
                                        warn!(error = %e, "Insight Editor: open_editor_window failed");
                                    }
                                }
                                None => {
                                    warn!("Insight Editor: EditorInitialText state not found");
                                }
                            }
                        }
                        "toggle_visibility" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let was_visible = win.is_visible().unwrap_or_else(|e| {
                                    warn!(error = %e, "is_visible failed in toggle, assuming hidden");
                                    false
                                });
                                let new_label = if was_visible {
                                    let _ = win.hide();
                                    "Show Window"
                                } else {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                    "Hide Window"
                                };
                                if let Some(t) = app.tray_by_id("main") {
                                    if let Err(e) = tray::build_tray_menu(app, new_label)
                                        .and_then(|m| t.set_menu(Some(m)))
                                    {
                                        warn!(error = %e, "Failed to update tray menu");
                                    }
                                }
                            }
                        }
                        "quit" => {
                            // Stop TTS worker thread before exiting
                            if let Some(state) = app.try_state::<tts::TtsState>() {
                                let _ = state.inner().send(tts::TtsRequest::Shutdown);
                            }
                            app.exit(0);
                        }
                        _ => {}
                    }
                });

                // Use the app logo for the tray.
                if let Ok(icon) = tauri::image::Image::from_bytes(tray::TRAY_ICON_PNG) {
                    let _ = tray.set_icon(Some(icon));
                }
            }

            let app_handle = app.handle().clone();

            if let Some(state) = app.try_state::<hotkeys::GlobalHotkeyState>() {
                hotkeys::refresh_global_hotkeys(&app_handle, &state.inner().clone());
            }

            action_socket::start_action_socket_listener(app_handle.clone());

            if let Ok(start_action) = std::env::var("INSIGHT_READER_START_ACTION") {
                if let Some(action) = hotkeys::parse_app_action(&start_action) {
                    actions::execute_action(&app_handle, action, "startup-action");
                }
                std::env::remove_var("INSIGHT_READER_START_ACTION");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
    {
        error!(error = %e, "Error while running Tauri application");
        std::process::exit(1);
    }
}
