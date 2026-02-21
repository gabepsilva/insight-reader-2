//! System tray icon and menu.
//!
//! Builds the tray menu (Read Selected, Summarize Selected, Insight Editor, Show/Hide, Quit)
//! and provides the app logo for the tray icon. The menu event handler lives in lib's setup and
//! dispatches to actions, windows, and backend. Show/Hide toggles main window visibility; Quit
//! stops the TTS worker and exits.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

/// Tray icon: app logo at 32x32 (icons/logo.png).
pub const TRAY_ICON_PNG: &[u8] = include_bytes!("../icons/logo.png");

/// Builds the tray menu with Read Selected, Summarize Selected, Insight Editor, Show/Hide, and Quit.
pub fn build_tray_menu<R: tauri::Runtime>(
    app: &impl tauri::Manager<R>,
    toggle_label: &str,
) -> Result<Menu<R>, tauri::Error> {
    let read_selected =
        MenuItem::with_id(app, "read_selected", "Read Selected", true, None::<&str>)?;
    let summarize_selected = MenuItem::with_id(
        app,
        "summarize_selected",
        "Summarize Selected",
        true,
        None::<&str>,
    )?;
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
            &summarize_selected,
            &insight_editor,
            &sep1,
            &toggle,
            &sep2,
            &quit,
        ],
    )
}
