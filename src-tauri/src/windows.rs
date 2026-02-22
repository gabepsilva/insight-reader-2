//! Webview URL construction and editor window lifecycle.
//!
//! Builds the correct URL for loading HTML (dev server vs packed app path) and provides
//! open_or_focus_editor_with_text: store initial text in state, then focus the editor window
//! (emitting `editor-set-text` if it already exists) or create it. Used by the open_editor_window
//! command and by the tray "Insight Editor" and "Summarize Selected" flows.

#[cfg(target_os = "macos")]
use tauri::window::{Effect, EffectsBuilder};
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::EditorInitialText;

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

/// Stores initial text, then focuses the editor window (emitting `editor-set-text` if it exists)
/// or creates it. Shared by the `open_editor_window` command and the "Insight Editor" tray item.
pub fn open_or_focus_editor_with_text<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    state: &State<EditorInitialText>,
    initial_text: String,
) -> Result<(), String> {
    {
        let mut guard = state
            .inner()
            .lock()
            .map_err(|e| format!("editor state lock: {}", e))?;
        *guard = Some(initial_text.clone());
    }

    if let Some(win) = app.get_webview_window("editor") {
        win.emit("editor-set-text", &initial_text)
            .map_err(|e: tauri::Error| e.to_string())?;
        let _ = win.show(); // restore if it was hidden (user had "closed" it)
        win.set_focus().map_err(|e| e.to_string())?;
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

    let _window = builder.build().map_err(|e| e.to_string())?;

    // Ensure decorations stay off on macOS (builder can be inconsistent for secondary windows)
    #[cfg(target_os = "macos")]
    let _ = _window.set_decorations(false);

    Ok(())
}

// --- Commands ---

/// Opens the grammar editor window, creating it if it does not exist.
/// If the window already exists, emits `editor-set-text` with `initial_text` and focuses it.
#[tauri::command]
pub fn open_editor_window(
    app: tauri::AppHandle,
    state: State<EditorInitialText>,
    initial_text: String,
) -> Result<(), String> {
    open_or_focus_editor_with_text(&app, &state, initial_text)
}

/// Returns the stored initial text for the editor (does not consume, so
/// React StrictMode double-mount or HMR remounts can still receive the value).
#[tauri::command]
pub fn get_editor_initial_text(state: State<EditorInitialText>) -> Result<Option<String>, String> {
    let guard = state
        .inner()
        .lock()
        .map_err(|e| format!("editor state lock: {}", e))?;
    Ok(guard.clone())
}
