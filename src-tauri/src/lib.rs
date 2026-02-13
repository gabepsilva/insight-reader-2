// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod config;
mod paths;
mod system;
mod tts;
mod voices;

use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent,
};
use tracing::{debug, error, info, warn};
use tracing_subscriber::EnvFilter;

use voices::download::{
    get_current_progress, list_downloaded_voices as list_local_downloaded_voices, DownloadProgress,
    DownloadedVoice,
};

/// Managed state for initial text passed to the editor window.
type EditorInitialText = Arc<Mutex<Option<String>>>;

/// Data stored for each live text viewer window
#[derive(Debug, Clone)]
struct LiveTextData {
    image_path: String,
    ocr_result: Option<system::OcrResult>,
}

/// Managed state for live text data passed to live text viewer windows.
/// Maps window label to live text data (image path and optional OCR result).
type LiveTextWindows = Arc<Mutex<std::collections::HashMap<String, LiveTextData>>>;

/// Tray icon: app logo at 32x32 (icons/32x32.png).
const TRAY_ICON_PNG: &[u8] = include_bytes!("../icons/32x32.png");

/// Gets the currently selected text from the system.
#[tauri::command]
fn get_selected_text() -> Option<String> {
    let result = system::get_selected_text();
    log_selected_text(&result);
    result
}

/// Gets selected text or falls back to clipboard text. Returns empty string if neither available.
fn get_text_or_clipboard_impl() -> String {
    system::get_selected_text()
        .or_else(system::get_clipboard_text)
        .unwrap_or_default()
}

/// Gets selected text or falls back to clipboard text. Returns empty string if neither available.
#[tauri::command]
fn get_text_or_clipboard() -> String {
    get_text_or_clipboard_impl()
}

/// Gets the current clipboard text (e.g. from Ctrl+C / Cmd+C).
#[tauri::command]
fn get_clipboard_text() -> Option<String> {
    system::get_clipboard_text()
}

/// Builds a WebviewUrl for the given HTML file path.
/// In dev mode, uses the configured dev_url or defaults to localhost:1420.
/// In production, uses the app path.
fn build_webview_url<R: tauri::Runtime>(
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

/// Stores initial text, then focuses the editor window (emitting `editor-set-text` if it exists)
/// or creates it. Shared by the `open_editor_window` command and the "Insight Editor" tray item.
fn open_or_focus_editor_with_text<R: tauri::Runtime>(
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
        // EditorPage receives editor-set-text, sets text, and the debounced linter runs after ~350ms.
        return Ok(());
    }

    let url = build_webview_url(app, "editor.html")?;

    WebviewWindowBuilder::new(app, "editor", url)
        .title("Insight — Grammar")
        .inner_size(500.0, 400.0)
        .min_inner_size(400.0, 300.0)
        .resizable(true)
        .decorations(true)
        .center()
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

/// Returns the stored initial text for the editor. Does not consume so that
/// React StrictMode double-mount or HMR remounts can still receive the value.
/// The stored value is overwritten on each open_or_focus_editor_with_text.
#[tauri::command]
fn take_editor_initial_text(state: State<EditorInitialText>) -> Result<Option<String>, String> {
    let guard = state
        .inner()
        .lock()
        .map_err(|e| format!("editor state lock: {}", e))?;
    Ok(guard.clone())
}

/// Speaks the given text with Piper TTS. Fails if TTS is unavailable or text is empty.
#[tauri::command]
fn tts_speak(state: State<tts::TtsState>, text: String) -> Result<(), String> {
    let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
    state
        .inner()
        .send(tts::TtsRequest::Speak(text, resp_tx))
        .map_err(|e| format!("TTS channel: {e}"))?;
    resp_rx
        .recv()
        .map_err(|_| "TTS worker disconnected".to_string())?
        .map_err(|e| e.to_string())
}

/// Stops any ongoing TTS playback. No-op if TTS is unavailable.
#[tauri::command]
fn tts_stop(state: State<tts::TtsState>) -> Result<(), String> {
    state
        .inner()
        .send(tts::TtsRequest::Stop)
        .map_err(|e| format!("TTS channel: {e}"))?;
    Ok(())
}

/// Toggles pause state of TTS playback. Returns true if paused, false if playing.
#[tauri::command]
fn tts_toggle_pause(state: State<tts::TtsState>) -> Result<bool, String> {
    let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
    state
        .inner()
        .send(tts::TtsRequest::TogglePause(resp_tx))
        .map_err(|e| format!("TTS channel: {e}"))?;
    resp_rx
        .recv()
        .map_err(|_| "TTS worker disconnected".to_string())?
        .map_err(|e| e.to_string())
}

/// Gets the current TTS playback status. Returns (is_playing, is_paused).
#[tauri::command]
fn tts_get_status(state: State<tts::TtsState>) -> Result<(bool, bool), String> {
    let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
    state
        .inner()
        .send(tts::TtsRequest::GetStatus(resp_tx))
        .map_err(|e| format!("TTS channel: {e}"))?;
    resp_rx
        .recv()
        .map_err(|_| "TTS worker disconnected".to_string())
}

/// Seeks TTS playback by the given offset in milliseconds.
/// Returns (success, at_start, at_end). Fails if paused or seeking is not supported.
#[tauri::command]
fn tts_seek(state: State<tts::TtsState>, offset_ms: i64) -> Result<(bool, bool, bool), String> {
    let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
    state
        .inner()
        .send(tts::TtsRequest::Seek(offset_ms, resp_tx))
        .map_err(|e| format!("TTS channel: {e}"))?;
    resp_rx
        .recv()
        .map_err(|_| "TTS worker disconnected".to_string())?
        .map_err(|e| e.to_string())
}

/// Gets the current playback position and total duration in milliseconds.
/// Returns (current_ms, total_ms).
#[tauri::command]
fn tts_get_position(state: State<tts::TtsState>) -> Result<(u64, u64), String> {
    let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
    state
        .inner()
        .send(tts::TtsRequest::GetPosition(resp_tx))
        .map_err(|e| format!("TTS channel: {e}"))?;
    resp_rx
        .recv()
        .map_err(|_| "TTS worker disconnected".to_string())
}

/// Switches the TTS provider. provider should be "piper" or "microsoft".
#[tauri::command]
fn tts_switch_provider(state: State<tts::TtsState>, provider: String) -> Result<(), String> {
    let provider = match provider.to_lowercase().as_str() {
        "piper" => tts::TtsProvider::Piper,
        "microsoft" => tts::TtsProvider::Microsoft,
        "polly" => tts::TtsProvider::Polly,
        _ => {
            return Err(format!(
                "Unknown provider: {}. Use 'piper', 'microsoft', or 'polly'.",
                provider
            ))
        }
    };
    let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
    state
        .inner()
        .send(tts::TtsRequest::SwitchProvider(provider, resp_tx))
        .map_err(|e| format!("TTS channel: {e}"))?;
    resp_rx
        .recv()
        .map_err(|_| "TTS worker disconnected".to_string())?
        .map_err(|e| e.to_string())
}

/// Opens a window to display an image with live text overlay.
/// The image_path should be a valid file path to a PNG image.
#[tauri::command]
fn open_live_text_viewer(
    app: tauri::AppHandle,
    state: State<LiveTextWindows>,
    image_path: String,
    ocr_result: Option<system::OcrResult>,
) -> Result<(), String> {
    debug!(path = %image_path, "Opening live text viewer window");

    // Check if file exists
    let path = std::path::Path::new(&image_path);
    if !path.exists() {
        return Err(format!(
            "Image file not found: {} (checked at: {})",
            image_path,
            path.display()
        ));
    }

    // Generate a unique window label with timestamp to prevent collisions
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Failed to get timestamp: {}", e))?
        .as_nanos();
    let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("image");
    let filename_without_ext = filename
        .strip_suffix(".png")
        .or_else(|| filename.strip_suffix(".PNG"))
        .unwrap_or(filename);
    let window_label = format!("live-text-{}-{}", timestamp, filename_without_ext);

    let url = build_webview_url(&app, "live-text.html")?;

    // Create window first, only insert into state after successful creation
    WebviewWindowBuilder::new(&app, &window_label, url)
        .title("Live Text")
        .inner_size(800.0, 600.0)
        .min_inner_size(400.0, 300.0)
        .resizable(true)
        .decorations(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    // Store the live text data in state only after window creation succeeds
    {
        let mut guard = state
            .inner()
            .lock()
            .map_err(|e| format!("live text state lock: {}", e))?;
        guard.insert(
            window_label,
            LiveTextData {
                image_path,
                ocr_result,
            },
        );
    }

    Ok(())
}

/// Returns the image path for the current live text viewer window.
#[tauri::command]
fn take_live_text_image_path(
    window: Window,
    state: State<LiveTextWindows>,
) -> Result<Option<String>, String> {
    let window_label = window.label();
    let guard = state
        .inner()
        .lock()
        .map_err(|e| format!("live text state lock: {}", e))?;
    Ok(guard.get(window_label).map(|data| data.image_path.clone()))
}

/// Returns the live text (OCR) data for the current window.
#[tauri::command]
fn take_live_text_data(
    window: Window,
    state: State<LiveTextWindows>,
) -> Result<Option<system::OcrResult>, String> {
    let window_label = window.label();
    let guard = state
        .inner()
        .lock()
        .map_err(|e| format!("live text state lock: {}", e))?;
    Ok(guard
        .get(window_label)
        .and_then(|data| data.ocr_result.clone()))
}

/// Returns the current platform (e.g., "macos", "windows", "linux").
#[tauri::command]
fn get_platform() -> &'static str {
    #[cfg(target_os = "macos")]
    return "macos";
    #[cfg(target_os = "windows")]
    return "windows";
    #[cfg(target_os = "linux")]
    return "linux";
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return "unknown";
}

#[tauri::command]
fn get_config() -> Result<config::FullConfig, String> {
    config::load_full_config()
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, config_json: String) -> Result<(), String> {
    let cfg: config::FullConfig = serde_json::from_str(&config_json)
        .map_err(|e| format!("Failed to parse config JSON: {}", e))?;
    config::save_full_config(cfg).map_err(|e| e.to_string())?;
    let _ = app.emit("config-changed", ());
    Ok(())
}

#[tauri::command]
async fn list_piper_voices() -> Result<Vec<voices::VoiceInfo>, String> {
    let voices = voices::fetch_piper_voices(false).await?;
    Ok(voices.into_values().collect())
}

#[tauri::command]
async fn refresh_piper_voices() -> Result<Vec<voices::VoiceInfo>, String> {
    let voices = voices::fetch_piper_voices(true).await?;
    Ok(voices.into_values().collect())
}

#[tauri::command]
async fn list_polly_voices() -> Result<Vec<voices::PollyVoiceInfo>, String> {
    voices::fetch_polly_voices().await
}

#[tauri::command]
async fn list_microsoft_voices() -> Result<Vec<voices::MicrosoftVoiceInfo>, String> {
    voices::fetch_microsoft_voices().await
}

#[tauri::command]
async fn download_voice(voice_key: String) -> Result<String, String> {
    let voices = voices::fetch_piper_voices(false).await?;
    let voice_info = voices
        .get(&voice_key)
        .ok_or_else(|| format!("Voice not found: {}", voice_key))?;

    // If files are empty, force refresh to get the full data with files
    if voice_info.files.is_empty() {
        let voices = voices::fetch_piper_voices(true).await?;
        let voice_info = voices
            .get(&voice_key)
            .ok_or_else(|| format!("Voice not found: {}", voice_key))?;
        let path = voices::download::download_voice(&voice_key, voice_info).await?;
        return Ok(path.to_string_lossy().to_string());
    }

    let path = voices::download::download_voice(&voice_key, voice_info).await?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_download_progress() -> Option<DownloadProgress> {
    get_current_progress()
}

#[tauri::command]
fn list_downloaded_voices() -> Result<Vec<DownloadedVoice>, String> {
    list_local_downloaded_voices()
}

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    // Check if settings window already exists
    if let Some(win) = app.get_webview_window("settings") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let url = build_webview_url(&app, "settings.html")?;

    WebviewWindowBuilder::new(&app, "settings", url)
        .title("Settings - Insight Reader")
        .inner_size(600.0, 600.0)
        .min_inner_size(500.0, 500.0)
        .resizable(true)
        .decorations(true)
        .center()
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn cleanup_text(text: String) -> Result<String, String> {
    system::cleanup_text(&text).await
}

#[tauri::command]
fn check_polly_credentials() -> Result<bool, String> {
    match tts::check_polly_credentials() {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Unified error type for screenshot and OCR operations
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", content = "message")]
pub enum CaptureOcrError {
    #[serde(rename = "cancelled")]
    Cancelled,
    #[serde(rename = "screenshot")]
    Screenshot(String),
    #[serde(rename = "ocr")]
    Ocr(String),
}

impl From<system::ScreenshotError> for CaptureOcrError {
    fn from(err: system::ScreenshotError) -> Self {
        match err {
            system::ScreenshotError::Cancelled => CaptureOcrError::Cancelled,
            e => CaptureOcrError::Screenshot(e.to_string()),
        }
    }
}

impl From<system::OcrError> for CaptureOcrError {
    fn from(err: system::OcrError) -> Self {
        CaptureOcrError::Ocr(err.to_string())
    }
}

/// Captures a screenshot and performs OCR to extract text with bounding box positions.
/// Returns the OCR result with text items and their positions, and the screenshot file path.
/// If the user cancels the screenshot selection, returns a Cancelled error.
/// The screenshot file should be deleted after the viewer window is closed.
#[tauri::command]
fn capture_screenshot_and_ocr() -> Result<(system::OcrResult, String), CaptureOcrError> {
    debug!("Starting screenshot capture and OCR");

    // Capture screenshot (returns bytes and path)
    let (screenshot_bytes, screenshot_path) =
        system::capture_screenshot().map_err(CaptureOcrError::from)?;

    debug!(
        bytes = screenshot_bytes.len(),
        path = %screenshot_path.display(),
        "Screenshot captured, starting OCR"
    );

    // Perform OCR with positions
    let ocr_result =
        system::extract_text_with_positions(&screenshot_bytes).map_err(CaptureOcrError::from)?;

    // Log OCR results for debugging
    debug!(
        items = ocr_result.items.len(),
        text = %ocr_result.full_text,
        "OCR completed successfully"
    );
    debug!("OCR items: {:?}", ocr_result.items);

    // Return OCR result and screenshot path (as string for serialization)
    Ok((ocr_result, screenshot_path.to_string_lossy().to_string()))
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
    let live_text_windows: LiveTextWindows = Arc::new(Mutex::new(std::collections::HashMap::new()));
    let tts_state = tts::create_tts_state();

    if let Err(e) = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(editor_initial)
        .manage(live_text_windows)
        .manage(tts_state)
        .invoke_handler(tauri::generate_handler![
            get_selected_text,
            get_clipboard_text,
            get_text_or_clipboard,
            open_editor_window,
            take_editor_initial_text,
            tts_speak,
            tts_stop,
            tts_toggle_pause,
            tts_get_status,
            tts_seek,
            tts_get_position,
            tts_switch_provider,
            capture_screenshot_and_ocr,
            open_live_text_viewer,
            take_live_text_image_path,
            take_live_text_data,
            get_platform,
            get_config,
            save_config,
            list_piper_voices,
            refresh_piper_voices,
            list_polly_voices,
            list_microsoft_voices,
            download_voice,
            get_download_progress,
            list_downloaded_voices,
            open_settings_window,
            cleanup_text,
            check_polly_credentials,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label == "editor" {
                    let _ = window.hide();
                    api.prevent_close();
                } else if label == "main" {
                    // Stop TTS worker thread when main window closes
                    if let Some(state) = window.app_handle().try_state::<tts::TtsState>() {
                        let _ = state.inner().send(tts::TtsRequest::Shutdown);
                    }
                    // Clean up all image files on app exit
                    if let Some(state) = window.app_handle().try_state::<LiveTextWindows>() {
                        let paths: Vec<String> = {
                            let guard = state.inner().lock().ok();
                            guard
                                .map(|g| g.values().map(|data| data.image_path.clone()).collect())
                                .unwrap_or_default()
                        };
                        for path in paths {
                            if let Err(e) = std::fs::remove_file(&path) {
                                warn!(error = %e, path = %path, "Failed to delete image file on app exit");
                            } else {
                                debug!(path = %path, "Deleted image file on app exit");
                            }
                        }
                    }
                } else if label.starts_with("live-text-") {
                    // Delete image file when live text viewer window closes
                    if let Some(state) = window.app_handle().try_state::<LiveTextWindows>() {
                        let image_path = {
                            let guard = state.inner().lock().ok();
                            guard.and_then(|g| g.get(label).map(|data| data.image_path.clone()))
                        };
                        if let Some(path) = image_path {
                            if let Err(e) = std::fs::remove_file(&path) {
                                warn!(error = %e, path = %path, "Failed to delete image file on window close");
                            } else {
                                debug!(path = %path, "Deleted image file on window close");
                            }
                            // Remove from state
                            if let Ok(mut guard) = state.inner().lock() {
                                guard.remove(label);
                            }
                        }
                    }
                }
            }
        })
        .setup(|app| {
            // Tray is created from app.trayIcon config; we add menu, icon, and menu handler here.
            if let Some(tray) = app.tray_by_id("main") {
                // Initial Show/Hide label from current window visibility.
                let is_visible = match app.get_webview_window("main") {
                    Some(win) => win.is_visible().unwrap_or_else(|e| {
                        warn!(error = %e, "is_visible for main window failed, assuming visible");
                        true
                    }),
                    None => {
                        warn!("main window not found for tray label, assuming visible");
                        true
                    }
                };
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
                            let text = get_text_or_clipboard_impl();
                            log_selected_text(&(!text.is_empty()).then_some(text.clone()));
                            match app.try_state::<EditorInitialText>() {
                                Some(state) => {
                                    if let Err(e) =
                                        open_or_focus_editor_with_text(app, &state, text.clone())
                                    {
                                        warn!(error = %e, "Read Selected: open_editor_window failed");
                                    } else {
                                        // Emit trigger event after a short delay to allow editor to mount/set text
                                        // Reduced delay: editor-set-text event should be sufficient, small delay just for safety
                                        let app_handle = app.clone();
                                        std::thread::spawn(move || {
                                            std::thread::sleep(std::time::Duration::from_millis(200));
                                            if let Some(win) = app_handle.get_webview_window("editor") {
                                                if let Err(e) = win.emit("editor-trigger-read", ()) {
                                                    warn!(error = %e, "Failed to emit editor-trigger-read");
                                                }
                                            }
                                        });
                                    }
                                }
                                None => {
                                    warn!("Read Selected: EditorInitialText state not found");
                                }
                            }
                        }
                        "insight_editor" => {
                            let text = get_text_or_clipboard_impl();
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
                                let was_visible = win.is_visible().unwrap_or_else(|e| {
                                    warn!(error = %e, "is_visible failed in toggle, assuming hidden");
                                    false
                                });
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
                            // Stop TTS worker thread before exiting
                            if let Some(state) = app.try_state::<tts::TtsState>() {
                                let _ = state.inner().send(tts::TtsRequest::Shutdown);
                            }
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
                // Set window size after instantiation
                let _ = win.set_size(tauri::LogicalSize::new(487.0, 85.0));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
    {
        error!(error = %e, "Error while running Tauri application");
        std::process::exit(1);
    }
}
