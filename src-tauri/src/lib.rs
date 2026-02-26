//! Insight Reader Tauri backend: composition root and lifecycle.
#![allow(unexpected_cfgs)] // objc crate macros use cargo-clippy cfg
//! This crate is the Rust entry point for the Tauri app. It owns `run()`, plugin and state
//! registration, and wires command modules and tray actions. Business logic lives in the modules;
//! this file is bootstrap only.
//!
//! **Modules:** `action_socket` — single-instance action bridge; `actions` — read/pause/stop;
//! `backend` — ReadingService HTTP API; `commands_*` — Tauri commands by domain; `config` / `paths` —
//! config and paths; `hotkeys` — global shortcuts; `system` / `text_capture` — clipboard/selection;
//! `tts` / `voices` — TTS and voice listing; `tray` / `tray_actions` — tray menu and handlers;
//! `windows` — webview URL and editor window.

#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

mod action_socket;
mod actions;
mod backend;
mod commands_config;
mod commands_tts;
mod commands_voices;
mod commands_windows;
mod config;
mod hotkeys;
mod machine_id;
#[cfg(target_os = "macos")]
mod macos_dock_icon;
mod paths;
mod system;
mod text_capture;
mod tray;
mod tray_actions;
mod tts;
mod voices;
mod windows;

pub use action_socket::send_action_to_running_instance;

use std::sync::{Arc, Mutex};
#[cfg(target_os = "macos")]
use tauri::RunEvent;
use tauri::{Manager, WindowEvent};
use tracing::error;
use tracing_subscriber::EnvFilter;

// --- State types (shared with windows and tray) ---

/// Initial state for the editor window: text to show and whether to trigger TTS read after load.
#[derive(Clone, Default, serde::Serialize)]
pub struct EditorInitialStateInner {
    pub text: Option<String>,
    pub trigger_read: bool,
}

/// Managed state for initial text and trigger-read flag passed to the editor window.
pub type EditorInitialState = Arc<Mutex<EditorInitialStateInner>>;

/// Legacy type alias for code that still refers to EditorInitialText (e.g. try_state).
pub type EditorInitialText = EditorInitialState;

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

    let editor_initial: EditorInitialState =
        Arc::new(Mutex::new(EditorInitialStateInner::default()));
    let initial_config = config::load_full_config().unwrap_or_default();
    let config_state: commands_config::ConfigState = Arc::new(Mutex::new(initial_config));
    let tts_state = tts::create_tts_state();
    let hotkey_state: hotkeys::GlobalHotkeyState =
        Arc::new(Mutex::new(hotkeys::HotkeyRuntime::default()));

    #[cfg(target_os = "linux")]
    let window_state_plugin = tauri_plugin_window_state::Builder::default()
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
        .manage(config_state)
        .manage(tts_state)
        .manage(hotkey_state.clone())
        .invoke_handler(tauri::generate_handler![
            backend::backend_prompt,
            backend::check_polly_credentials,
            text_capture::get_selected_text,
            text_capture::get_clipboard_text,
            text_capture::get_text_or_clipboard,
            windows::open_editor_window,
            windows::get_editor_initial_text,
            commands_tts::tts_speak,
            commands_tts::tts_stop,
            commands_tts::tts_toggle_pause,
            commands_tts::tts_get_status,
            commands_tts::tts_seek,
            commands_tts::tts_get_position,
            commands_tts::tts_set_volume,
            commands_tts::tts_set_speed,
            commands_tts::tts_switch_provider,
            commands_config::get_platform,
            commands_config::get_config,
            commands_config::save_config,
            commands_config::set_explain_mode,
            hotkeys::get_hotkey_status,
            commands_voices::list_piper_voices,
            commands_voices::refresh_piper_voices,
            commands_voices::list_polly_voices,
            commands_voices::list_microsoft_voices,
            commands_voices::download_voice,
            commands_voices::get_download_progress,
            commands_voices::list_downloaded_voices,
            commands_windows::open_settings_window,
            commands_windows::hide_main_window,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label == "editor" {
                    let _ = window.hide();
                    api.prevent_close();
                } else if label == "main" {
                    let _ = commands_windows::hide_main_window_impl(window.app_handle(), false);
                    api.prevent_close();
                }
            }
        })
        .setup(|app| {
            // Ensure main window decorations stay off on macOS (config can be inconsistent)
            #[cfg(target_os = "macos")]
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_decorations(false);
            }

            if let Some(tray) = app.tray_by_id("main") {
                let is_visible = match app.get_webview_window("main") {
                    Some(win) => win.is_visible().unwrap_or_else(|e| {
                        tracing::warn!(error = %e, "is_visible for main window failed, assuming visible");
                        true
                    }),
                    None => {
                        tracing::warn!("main window not found for tray label, assuming visible");
                        true
                    }
                };
                let menu = tray::build_tray_menu(app, is_visible)?;
                tray.set_menu(Some(menu))?;

                tray.on_menu_event(tray_actions::handle_tray_menu_event);

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
            commands_windows::show_main_window_impl(_app_handle);
        }
    });
}
