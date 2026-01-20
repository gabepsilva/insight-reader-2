// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod system;

use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    Manager,
};
use tracing::{debug, error, info, warn};
use tracing_subscriber::EnvFilter;

/// Tray icon: app logo at 32x32 (icons/32x32.png).
const TRAY_ICON_PNG: &[u8] = include_bytes!("../icons/32x32.png");

/// Gets the currently selected text from the system.
#[tauri::command]
fn get_selected_text() -> Option<String> {
    let result = system::get_selected_text();
    log_selected_text(&result);
    result
}

fn log_selected_text(result: &Option<String>) {
    match result {
        Some(text) => info!(len = text.len(), "Selected text"),
        None => debug!("No selected text"),
    }
}

/// Builds the tray menu with a single Show/Hide item whose label reflects the current action.
fn build_tray_menu<R: tauri::Runtime>(
    app: &impl tauri::Manager<R>,
    toggle_label: &str,
) -> Result<Menu<R>, tauri::Error> {
    let read_selected =
        MenuItem::with_id(app, "read_selected", "Read Selected", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let toggle = MenuItem::with_id(app, "toggle_visibility", toggle_label, true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    Menu::with_items(app, &[&read_selected, &sep1, &toggle, &sep2, &quit])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    if let Err(e) = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_selected_text])
        .setup(|app| {
            // Tray is created from app.trayIcon config; we add menu, icon, and menu handler here.
            if let Some(tray) = app.tray_by_id("main") {
                // Initial Show/Hide label from current window visibility.
                let is_visible = app
                    .get_webview_window("main")
                    .and_then(|w| w.is_visible().ok())
                    .unwrap_or(true);
                let toggle_label = if is_visible { "Hide Window" } else { "Show Window" };
                let menu = build_tray_menu(app, toggle_label)?;
                tray.set_menu(Some(menu))?;

                tray.on_menu_event(move |app, event: MenuEvent| {
                    let id = event.id().0.as_str();
                    match id {
                        "read_selected" => {
                            log_selected_text(&system::get_selected_text());
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
                                    if let Err(e) =
                                        build_tray_menu(app, new_label).and_then(|m| t.set_menu(Some(m)))
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
