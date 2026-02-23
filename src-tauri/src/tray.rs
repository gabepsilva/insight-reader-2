//! System tray icon and menu.
//!
//! Builds the tray menu (Read Selected, Summarize Selected, Insight Editor, Hide Window,
//! Show Window, Quit) and provides the app logo for the tray icon. Menu event handling
//! lives in `tray_actions`; hide/show control the main window; quit is handled there too.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

/// Tray icon: app logo at 32x32 (icons/logo.png).
pub const TRAY_ICON_PNG: &[u8] = include_bytes!("../icons/logo.png");

/// Builds the tray menu with Read Selected, Summarize Selected, Insight Editor, Hide Window,
/// Show Window, and Quit. Hide is enabled when the main window is visible; Show when hidden.
pub fn build_tray_menu<R: tauri::Runtime>(
    app: &impl tauri::Manager<R>,
    is_main_visible: bool,
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
    let hide_window = MenuItem::with_id(
        app,
        "hide_window",
        "Hide Window",
        is_main_visible,
        None::<&str>,
    )?;
    let show_window = MenuItem::with_id(
        app,
        "show_window",
        "Show Window",
        true, // Always enabled so user can restore/resize if window is too small
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    Menu::with_items(
        app,
        &[
            &read_selected,
            &summarize_selected,
            &insight_editor,
            &sep1,
            &hide_window,
            &show_window,
            &sep2,
            &quit,
        ],
    )
}
