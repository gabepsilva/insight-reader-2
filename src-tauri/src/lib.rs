//! Insight Reader Tauri backend: app entry, command wiring, and lifecycle.
#![allow(unexpected_cfgs)] // objc crate macros use cargo-clippy cfg
//! This crate is the Rust entry point for the Tauri app. It owns `run()`, plugin and state
//! registration, `invoke_handler![]`, `on_window_event`, and `setup` that delegates to modules.
//! Business logic lives in the modules below; this file does not contain domain logic.
//!
//! **Modules:** `action_socket` — Unix single-instance action bridge; `actions` — read/pause/stop
//! execution; `backend` — ReadingService HTTP API; `config` / `paths` — config and paths;
//! `hotkeys` — global shortcut state and handling; `system` — clipboard/selection; `text_capture` —
//! timeout-wrapped selection/clipboard; `tts` / `voices` — TTS and voice listing; `tray` — tray
//! menu and icon; `windows` — webview URL and editor window.

#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

mod action_socket;
mod actions;
mod backend;
mod config;
mod hotkeys;
mod machine_id;
#[cfg(target_os = "macos")]
mod macos_dock_icon;
mod paths;
mod system;
mod text_capture;
mod tray;
mod tts;
mod voices;
mod windows;

pub use action_socket::send_action_to_running_instance;

use std::sync::{Arc, Mutex};
#[cfg(target_os = "macos")]
use tauri::window::{Effect, EffectsBuilder};
#[cfg(target_os = "macos")]
use tauri::RunEvent;
use tauri::{
    menu::MenuEvent, Emitter, LogicalSize, Manager, State, WebviewWindowBuilder, WindowEvent,
};
use tracing::{error, warn};
use tracing_subscriber::EnvFilter;

use voices::download::{
    get_current_progress, list_downloaded_voices as list_local_downloaded_voices, DownloadProgress,
    DownloadedVoice,
};

// --- State types (shared with windows and tray) ---

/// Managed state for initial text passed to the editor window. Used by windows and tray.
pub type EditorInitialText = Arc<Mutex<Option<String>>>;

/// Main window size (default and minimum). Matches tauri.conf.json.
/// Used when resetting size on show-from-tray if current size is below minimum.
const MAIN_WINDOW_WIDTH: f64 = 350.0;
const MAIN_WINDOW_HEIGHT: f64 = 260.0;

// --- TTS and voice commands (thin wrappers around tts / voices) ---

/// Speaks the given text (Piper, Microsoft, or Polly). Fails if TTS is unavailable or text is empty.
/// Runs send+recv in spawn_blocking so the command thread does not block while synthesis runs.
#[tauri::command]
async fn tts_speak(state: State<'_, tts::TtsState>, text: String) -> Result<(), String> {
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::Speak(text, resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())?
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
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
async fn tts_toggle_pause(state: State<'_, tts::TtsState>) -> Result<bool, String> {
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::TogglePause(resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())?
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

/// Gets the current TTS playback status. Returns (is_playing, is_paused).
#[tauri::command]
async fn tts_get_status(state: State<'_, tts::TtsState>) -> Result<(bool, bool), String> {
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::GetStatus(resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

/// Seeks TTS playback by the given offset in milliseconds.
/// Returns (success, at_start, at_end). Fails if paused or seeking is not supported.
#[tauri::command]
async fn tts_seek(
    state: State<'_, tts::TtsState>,
    offset_ms: i64,
) -> Result<(bool, bool, bool), String> {
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::Seek(offset_ms, resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())?
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

/// Gets the current playback position and total duration in milliseconds.
/// Returns (current_ms, total_ms).
#[tauri::command]
async fn tts_get_position(state: State<'_, tts::TtsState>) -> Result<(u64, u64), String> {
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::GetPosition(resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

/// Sets TTS playback volume as percentage from 0 to 100.
#[tauri::command]
async fn tts_set_volume(state: State<'_, tts::TtsState>, volume_percent: u8) -> Result<(), String> {
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::SetVolume(volume_percent, resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())?
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

/// Sets TTS playback speed (1.0 = normal). Takes effect immediately. Clamped to 0.25..=4.0.
#[tauri::command]
async fn tts_set_speed(state: State<'_, tts::TtsState>, speed: f64) -> Result<(), String> {
    let raw = speed as f32;
    let speed_f32 = if raw.is_finite() {
        raw.clamp(0.25, 4.0)
    } else {
        1.0
    };
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::SetSpeed(speed_f32, resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())?
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

/// Switches the TTS provider. provider should be "piper", "microsoft", or "polly".
#[tauri::command]
async fn tts_switch_provider(
    state: State<'_, tts::TtsState>,
    provider: String,
) -> Result<(), String> {
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
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::SwitchProvider(provider, resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())?
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
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
    let mut cfg: config::FullConfig = serde_json::from_str(&config_json)
        .map_err(|e| format!("Failed to parse config JSON: {}", e))?;
    // Preserve or create installation_id so frontend never overwrites it
    cfg.installation_id = Some(config::get_or_create_installation_id()?);
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

    let builder = WebviewWindowBuilder::new(&app, "settings", url)
        .title("Settings - Insight Reader")
        .inner_size(600.0, 600.0)
        .min_inner_size(500.0, 500.0)
        .resizable(true)
        .decorations(false)
        .shadow(true)
        .accept_first_mouse(true)
        .always_on_top(true)
        .center();

    #[cfg(target_os = "macos")]
    let builder = builder.transparent(true).effects(
        EffectsBuilder::new()
            .effect(Effect::HudWindow)
            .radius(10.0)
            .build(),
    );

    let _window = builder.build().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    let _ = _window.set_decorations(false);

    Ok(())
}

/// Hides the main window and updates the tray menu. Shared by the close button,
/// minimize button, and tray "Hide Window".
/// - `to_tray`: when true (tray "Hide Window"), on macOS sets Accessory to hide from Dock.
///   When false (minimize/close buttons), keeps Regular so the app stays in the Dock.
fn hide_main_window_impl<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    _to_tray: bool,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.hide().map_err(|e| e.to_string())?;
        #[cfg(target_os = "macos")]
        if _to_tray {
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
        }
        if let Some(t) = app.tray_by_id("main") {
            tray::build_tray_menu(app, false)
                .and_then(|m| t.set_menu(Some(m)))
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Shows the main window, resizing if too small, and updates the tray menu.
/// Shared by tray "Show Window" and dock icon click (RunEvent::Reopen).
/// On macOS, restores Regular activation policy so the app appears in the dock.
/// We set the policy after showing the window so the Dock picks up the correct app icon.
fn show_main_window_impl<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(win) = app.get_webview_window("main") {
        if let (Ok(size), Ok(scale)) = (win.inner_size(), win.scale_factor()) {
            let logical_w = size.width as f64 / scale;
            let logical_h = size.height as f64 / scale;
            if logical_w < MAIN_WINDOW_WIDTH || logical_h < MAIN_WINDOW_HEIGHT {
                if let Err(e) =
                    win.set_size(LogicalSize::new(MAIN_WINDOW_WIDTH, MAIN_WINDOW_HEIGHT))
                {
                    warn!(error = %e, "Failed to resize main window when showing");
                }
            }
        }
        let _ = win.show();
        let _ = win.set_focus();
        #[cfg(target_os = "macos")]
        {
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            // Explicitly set app icon; switching Accessory→Regular can show generic icon otherwise
            macos_dock_icon::restore_dock_icon();
        }
        if let Some(t) = app.tray_by_id("main") {
            let _ = tray::build_tray_menu(app, true).and_then(|m| t.set_menu(Some(m)));
        }
    }
}

#[tauri::command]
fn hide_main_window(app: tauri::AppHandle, to_tray: Option<bool>) -> Result<(), String> {
    hide_main_window_impl(&app, to_tray.unwrap_or(false))
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

    let app = match tauri::Builder::default()
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
            backend::backend_health_check,
            text_capture::get_selected_text,
            text_capture::get_clipboard_text,
            text_capture::get_text_or_clipboard,
            windows::open_editor_window,
            windows::get_editor_initial_text,
            tts_speak,
            tts_stop,
            tts_toggle_pause,
            tts_get_status,
            tts_seek,
            tts_get_position,
            tts_set_volume,
            tts_set_speed,
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
            hide_main_window,
        ])
        // --- Window close behavior ---
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label == "editor" {
                    let _ = window.hide();
                    api.prevent_close();
                } else if label == "main" {
                    // Close button hides window but keeps app in Dock; restore via tray or Dock
                    let _ = hide_main_window_impl(window.app_handle(), false);
                    api.prevent_close();
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
                let menu = tray::build_tray_menu(app, is_visible)?;
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
                                // backend_prompt is async; run it in a dedicated runtime so this thread can block until done.
                                let rt = tokio::runtime::Runtime::new().expect("tokio runtime for tray summarize");
                                let result = rt.block_on(backend::backend_prompt(
                                    "SUMMARIZE".to_string(),
                                    text,
                                ));
                                match result {
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
                        "hide_window" => {
                            let _ = hide_main_window_impl(app, true);
                        }
                        "show_window" => {
                            show_main_window_impl(app);
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
        .build(tauri::generate_context!())
    {
        Ok(app) => app,
        Err(e) => {
            error!(error = %e, "Error while building Tauri application");
            std::process::exit(1);
        }
    };

    app.run(|_app_handle, _event| {
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } = _event
        {
            show_main_window_impl(_app_handle);
        }
    });
}
