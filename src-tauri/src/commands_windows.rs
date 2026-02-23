//! Tauri commands and helpers for main/settings window visibility and lifecycle.

#[cfg(target_os = "macos")]
use tauri::window::{Effect, EffectsBuilder};
use tauri::{LogicalSize, Manager, WebviewWindowBuilder};
use tracing::warn;

use crate::tray;
use crate::windows;

#[cfg(target_os = "macos")]
use crate::macos_dock_icon;

/// Main window size (default and minimum). Matches tauri.conf.json.
/// Used when resetting size on show-from-tray if current size is below minimum.
const MAIN_WINDOW_WIDTH: f64 = 350.0;
const MAIN_WINDOW_HEIGHT: f64 = 260.0;

/// Hides the main window and updates the tray menu. Shared by the close button,
/// minimize button, and tray "Hide Window".
/// - `to_tray`: when true (tray "Hide Window"), on macOS sets Accessory to hide from Dock.
///   When false (minimize/close buttons), keeps Regular so the app stays in the Dock.
pub fn hide_main_window_impl<R: tauri::Runtime>(
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
pub fn show_main_window_impl<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
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
            macos_dock_icon::restore_dock_icon();
        }
        if let Some(t) = app.tray_by_id("main") {
            let _ = tray::build_tray_menu(app, true).and_then(|m| t.set_menu(Some(m)));
        }
    }
}

#[tauri::command]
pub fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
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

#[tauri::command]
pub fn hide_main_window(app: tauri::AppHandle, to_tray: Option<bool>) -> Result<(), String> {
    hide_main_window_impl(&app, to_tray.unwrap_or(false))
}
