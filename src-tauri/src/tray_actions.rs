//! Tray menu action handling.
//!
//! Dispatches tray menu events (Read Selected, Summarize Selected, Insight Editor,
//! Hide/Show Window, Quit). Summarize runs in a background thread with a dedicated
//! tokio runtime; runtime creation failures are surfaced to the user instead of panicking.

use tauri::menu::MenuEvent;
use tauri::Manager;
use tracing::{error, warn};

use crate::actions;
use crate::backend;
use crate::commands_windows;
use crate::config;
use crate::hotkeys;
use crate::text_capture;
use crate::tts;
use crate::windows;

/// Handles a tray menu click. Call from `tray.on_menu_event` in setup.
pub fn handle_tray_menu_event<R: tauri::Runtime>(app: &tauri::AppHandle<R>, event: MenuEvent) {
    let id = event.id().0.as_str();
    match id {
        "read_selected" => {
            actions::execute_action(app, hotkeys::AppAction::ReadSelected, "tray");
        }
        "summarize_selected" => {
            let app = app.clone();
            std::thread::spawn(move || {
                handle_summarize_selected(&app);
            });
        }
        "insight_editor" => {
            let text = text_capture::get_text_or_clipboard_impl();
            match app.try_state::<crate::EditorInitialText>() {
                Some(state) => {
                    if let Err(e) =
                        windows::open_or_focus_editor_with_text(app, &state, text, false)
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
            let _ = commands_windows::hide_main_window_impl(app, true);
        }
        "show_window" => {
            commands_windows::show_main_window_impl(app);
        }
        "quit" => {
            if let Some(state) = app.try_state::<tts::TtsState>() {
                let _ = state.inner().send(tts::TtsRequest::Shutdown);
            }
            app.exit(0);
        }
        _ => {}
    }
}

fn handle_summarize_selected<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let text = text_capture::get_text_or_clipboard_impl();
    if text.trim().is_empty() {
        warn!("Summarize Selected: no text available");
        return;
    }

    let summary_muted = config::load_full_config()
        .ok()
        .and_then(|c| c.summary_muted)
        .unwrap_or(false);
    let task = if summary_muted {
        "SUMMARIZE_PROMPT"
    } else {
        "SUMMARIZE_AND_READ_PROMPT"
    };

    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(e) => {
            error!(error = %e, "Failed to create tokio runtime for tray summarize");
            if let Some(state) = app.try_state::<crate::EditorInitialText>() {
                let msg = "Summary failed: could not start background task.";
                let _ =
                    windows::open_or_focus_editor_with_text(app, &state, msg.to_string(), false);
            }
            return;
        }
    };

    let result = rt.block_on(backend::backend_prompt(
        task.to_string(),
        text,
        None,
        None,
        None,
    ));

    match result {
        Ok(summary) => {
            if let Some(state) = app.try_state::<crate::EditorInitialText>() {
                if let Err(e) =
                    windows::open_or_focus_editor_with_text(app, &state, summary, !summary_muted)
                {
                    warn!(error = %e, "Summarize Selected: open_editor_window failed");
                }
            } else {
                warn!("Summarize Selected: EditorInitialText state not found");
            }
        }
        Err(e) => {
            if let Some(state) = app.try_state::<crate::EditorInitialText>() {
                let _ = windows::open_or_focus_editor_with_text(
                    app,
                    &state,
                    format!("Summary failed: {}", e),
                    false,
                );
            } else {
                warn!(error = %e, "Summarize Selected: backend_prompt failed");
            }
        }
    }
}
