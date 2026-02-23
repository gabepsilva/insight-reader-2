//! Webview URL construction and editor window lifecycle.
//!
//! Builds the correct URL for loading HTML (dev server vs packed app path) and provides
//! open_or_focus_editor_with_text: store initial text in state, then focus the editor window
//! (emitting `editor-set-text` if it already exists) or create it. Used by the open_editor_window
//! command and by the tray "Insight Editor" and "Summarize Selected" flows.

#[cfg(target_os = "macos")]
use tauri::window::{Effect, EffectsBuilder};
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::{EditorInitialStateInner, EditorInitialText};

/// Window corner radius in logical pixels. Mac-only for now.
#[cfg(target_os = "macos")]
const WINDOW_RADIUS_MACOS: f64 = 10.0;

// --- URL building ---

/// Builds a WebviewUrl for the given HTML file path.
/// In dev mode, uses the configured dev_url or defaults to localhost:1420.
/// In production, uses the app path.
pub fn build_webview_url<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    html_path: &str,
) -> Result<WebviewUrl, String> {
    if tauri::is_dev() {
        let base = app
            .config()
            .build
            .dev_url
            .as_ref()
            .map(|u| u.as_str().trim_end_matches('/').to_string())
            .unwrap_or_else(|| "http://localhost:1420".to_string());
        let url = format!("{}/{}", base, html_path);
        Ok(WebviewUrl::External(
            url.parse().map_err(|e| format!("dev_url parse: {}", e))?,
        ))
    } else {
        Ok(WebviewUrl::App(format!("/{}", html_path).into()))
    }
}

// --- Editor window ---

/// Stores initial text (and optional trigger_read), then focuses the editor window
/// (emitting `editor-set-text` and optionally `editor-trigger-read` if it exists) or creates it.
pub fn open_or_focus_editor_with_text<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    state: &State<EditorInitialText>,
    initial_text: String,
    trigger_read: bool,
) -> Result<(), String> {
    {
        let mut guard = state
            .inner()
            .lock()
            .map_err(|e| format!("editor state lock: {}", e))?;
        *guard = EditorInitialStateInner {
            text: Some(initial_text.clone()),
            trigger_read,
        };
    }

    if let Some(win) = app.get_webview_window("editor") {
        win.emit("editor-set-text", &initial_text)
            .map_err(|e: tauri::Error| e.to_string())?;
        let _ = win.show(); // restore if it was hidden (user had "closed" it)
        win.set_focus().map_err(|e| e.to_string())?;
        if trigger_read {
            let _ = win.emit("editor-trigger-read", ());
        }
        return Ok(());
    }

    let url = build_webview_url(app, "editor.html")?;

    let builder = WebviewWindowBuilder::new(app, "editor", url)
        .title("Insight Editor")
        .inner_size(800.0, 400.0)
        .min_inner_size(400.0, 300.0)
        .resizable(true)
        .decorations(false)
        .always_on_top(true)
        .accept_first_mouse(true)
        .shadow(true)
        .center();

    #[cfg(target_os = "macos")]
    let builder = builder.transparent(true).effects(
        EffectsBuilder::new()
            .effect(Effect::HudWindow)
            .radius(WINDOW_RADIUS_MACOS)
            .build(),
    );

    let window = builder.build().map_err(|e| e.to_string())?;
    if trigger_read {
        let _ = window.emit("editor-trigger-read", ());
    }

    // Ensure decorations stay off on macOS (builder can be inconsistent for secondary windows)
    #[cfg(target_os = "macos")]
    let _ = window.set_decorations(false);

    Ok(())
}

// --- Commands ---

/// Opens the grammar editor window, creating it if it does not exist.
/// If the window already exists, emits `editor-set-text` with `initial_text` and focuses it.
/// When `trigger_read` is true, also emits `editor-trigger-read` so the editor starts TTS.
#[tauri::command]
pub fn open_editor_window(
    app: tauri::AppHandle,
    state: State<EditorInitialText>,
    initial_text: String,
    trigger_read: Option<bool>,
) -> Result<(), String> {
    open_or_focus_editor_with_text(&app, &state, initial_text, trigger_read.unwrap_or(false))
}

/// Returns the stored initial text and trigger_read flag, and clears trigger_read after read.
#[tauri::command]
pub fn get_editor_initial_text(
    state: State<EditorInitialText>,
) -> Result<EditorInitialStateInner, String> {
    let mut guard = state
        .inner()
        .lock()
        .map_err(|e| format!("editor state lock: {}", e))?;
    let out = guard.clone();
    guard.trigger_read = false;
    Ok(out)
}
