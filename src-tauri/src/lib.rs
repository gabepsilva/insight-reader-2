// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod system;

use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    Manager,
};

/// Tray icon: app logo at 32x32 (icons/32x32.png).
const TRAY_ICON_PNG: &[u8] = include_bytes!("../icons/32x32.png");

/// Gets the currently selected text from the system and prints it to stdout.
#[tauri::command]
fn get_selected_text() -> Option<String> {
    let result = system::get_selected_text();
    log_selected_text(&result);
    result
}

fn log_selected_text(result: &Option<String>) {
    match result {
        Some(text) => println!("Selected text: {}", text),
        None => println!("No selected text"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_selected_text])
        .setup(|app| {
            // Tray is created from app.trayIcon config; we add menu, icon, and menu handler here.
            if let Some(tray) = app.tray_by_id("main") {
                // Menu: same order as original — Read Selected, separator, Show/Hide, separator, Quit
                let read_selected =
                    MenuItem::with_id(app, "read_selected", "Read Selected", true, None::<&str>)?;
                let sep1 = PredefinedMenuItem::separator(app)?;
                let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
                let hide = MenuItem::with_id(app, "hide", "Hide Window", true, None::<&str>)?;
                let sep2 = PredefinedMenuItem::separator(app)?;
                let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

                let menu =
                    Menu::with_items(app, &[&read_selected, &sep1, &show, &hide, &sep2, &quit])?;
                tray.set_menu(Some(menu))?;

                tray.on_menu_event(move |app, event: MenuEvent| {
                    let id = event.id().0.as_str();
                    match id {
                        "read_selected" => {
                            log_selected_text(&system::get_selected_text());
                        }
                        "show" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.hide();
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
        eprintln!("error while running tauri application: {}", e);
        std::process::exit(1);
    }
}
