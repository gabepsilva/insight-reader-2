// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod system;

use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tracing::{debug, error, info, warn};
use tracing_subscriber::EnvFilter;

/// Managed state for initial text passed to the editor window.
type EditorInitialText = Arc<Mutex<Option<String>>>;

/// Tray icon: app logo at 32x32 (icons/32x32.png).
const TRAY_ICON_PNG: &[u8] = include_bytes!("../icons/32x32.png");

/// Gets the currently selected text from the system.
#[tauri::command]
fn get_selected_text() -> Option<String> {
    let result = system::get_selected_text();
    log_selected_text(&result);
    result
}

/// Gets the current clipboard text (e.g. from Ctrl+C / Cmd+C).
#[tauri::command]
fn get_clipboard_text() -> Option<String> {
    system::get_clipboard_text()
}

/// Stores initial text, then focuses the editor window (emitting `editor-set-text` if it exists)
/// or creates it. Shared by the `open_editor_window` command and the "Insight Editor" tray item.
fn open_or_focus_editor_with_text<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    state: &State<EditorInitialText>,
    initial_text: String,
) -> Result<(), String> {
    {
        let mut guard = (*state.inner())
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

    let url = if tauri::is_dev() {
        let base = app
            .config()
            .build
            .dev_url
            .as_ref()
            .map(|u| u.as_str().trim_end_matches('/').to_string())
            .unwrap_or_else(|| "http://localhost:1420".to_string());
        let url = format!("{}/editor.html", base);
        WebviewUrl::External(url.parse().map_err(|e| format!("dev_url parse: {}", e))?)
    } else {
        WebviewUrl::App("/editor.html".into())
    };

    WebviewWindowBuilder::new(app, "editor", url)
        .title("Grammar")
        .inner_size(500.0, 400.0)
        .resizable(true)
        .decorations(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Opens the grammar editor window, creating it if it does not exist.
/// If the window already exists, emits `editor-set-text` with `initial_text` and focuses it.
#[tauri::command]
fn open_editor_window(
    app: tauri::AppHandle,
    state: State<EditorInitialText>,
    initial_text: String,
) -> Result<(), String> {
    open_or_focus_editor_with_text(&app, &state, initial_text)
}

/// Takes the stored initial text for the editor (consumes it). Called by the editor page on mount.
#[tauri::command]
fn take_editor_initial_text(state: State<EditorInitialText>) -> Option<String> {
    let mut guard = (*state.inner()).lock().ok()?;
    guard.take()
}

fn log_selected_text(result: &Option<String>) {
    match result {
        Some(text) => info!(len = text.len(), "Selected text"),
        None => debug!("No selected text"),
    }
}

/// Builds the tray menu with Read Selected, Insight Editor, Show/Hide, and Quit.
fn build_tray_menu<R: tauri::Runtime>(
    app: &impl tauri::Manager<R>,
    toggle_label: &str,
) -> Result<Menu<R>, tauri::Error> {
    let read_selected =
        MenuItem::with_id(app, "read_selected", "Read Selected", true, None::<&str>)?;
    let insight_editor =
        MenuItem::with_id(app, "insight_editor", "Insight Editor", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let toggle = MenuItem::with_id(app, "toggle_visibility", toggle_label, true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    Menu::with_items(
        app,
        &[
            &read_selected,
            &insight_editor,
            &sep1,
            &toggle,
            &sep2,
            &quit,
        ],
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let editor_initial: EditorInitialText = Arc::new(Mutex::new(None));

    if let Err(e) = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(editor_initial)
        .invoke_handler(tauri::generate_handler![
            get_selected_text,
            get_clipboard_text,
            open_editor_window,
            take_editor_initial_text,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "editor" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .setup(|app| {
            // Tray is created from app.trayIcon config; we add menu, icon, and menu handler here.
            if let Some(tray) = app.tray_by_id("main") {
                // Initial Show/Hide label from current window visibility.
                let is_visible = app
                    .get_webview_window("main")
                    .and_then(|w| w.is_visible().ok())
                    .unwrap_or(true);
                let toggle_label = if is_visible {
                    "Hide Window"
                } else {
                    "Show Window"
                };
                let menu = build_tray_menu(app, toggle_label)?;
                tray.set_menu(Some(menu))?;

                tray.on_menu_event(move |app, event: MenuEvent| {
                    let id = event.id().0.as_str();
                    match id {
                        "read_selected" => {
                            log_selected_text(&system::get_selected_text());
                        }
                        "insight_editor" => {
                            let text = system::get_selected_text()
                                .or_else(system::get_clipboard_text)
                                .unwrap_or_default();
                            match app.try_state::<EditorInitialText>() {
                                Some(state) => {
                                    if let Err(e) =
                                        open_or_focus_editor_with_text(app, &state, text)
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
                                let was_visible = win.is_visible().unwrap_or(false);
                                let new_label = if was_visible {
                                    let _ = win.hide();
                                    "Show Window"
                                } else {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                    "Hide Window"
                                };
                                if let Some(t) = app.tray_by_id("main") {
                                    if let Err(e) = build_tray_menu(app, new_label)
                                        .and_then(|m| t.set_menu(Some(m)))
                                    {
                                        warn!(error = %e, "Failed to update tray menu");
                                    }
                                }
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                });

                // Use the app logo for the tray.
                if let Ok(icon) = tauri::image::Image::from_bytes(TRAY_ICON_PNG) {
                    let _ = tray.set_icon(Some(icon));
                }
            }

            // Square window corners; Popover keeps translucency without rounding
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_effects(
                    tauri::window::EffectsBuilder::new()
                        .effect(tauri::window::Effect::Popover)
                        .state(tauri::window::EffectState::Active)
                        .radius(0.0)
                        .color(tauri::window::Color(0, 0, 0, 0))
                        .build(),
                );
            }
            Ok(())
        })
        .run(tauri::generate_context!())
    {
        error!(error = %e, "Error while running Tauri application");
        std::process::exit(1);
    }
}
