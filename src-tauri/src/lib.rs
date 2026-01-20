// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            // Match the control-bar's 12px border-radius so the window has rounded corners
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_effects(
                    tauri::window::EffectsBuilder::new()
                        .effect(tauri::window::Effect::Popover)
                        .state(tauri::window::EffectState::Active)
                        .radius(12.0)
                        .color(tauri::window::Color(0, 255, 0, 0))
                        .build(),
                );
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
