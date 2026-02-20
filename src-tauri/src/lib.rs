// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod config;
mod paths;
mod system;
mod tts;
mod voices;

use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
#[cfg(unix)]
use std::{
    io::{Read, Write},
    os::unix::net::{UnixListener, UnixStream},
    path::PathBuf,
};
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tracing::{debug, error, info, warn};
use tracing_subscriber::EnvFilter;

use voices::download::{
    get_current_progress, list_downloaded_voices as list_local_downloaded_voices, DownloadProgress,
    DownloadedVoice,
};

/// Managed state for initial text passed to the editor window.
type EditorInitialText = Arc<Mutex<Option<String>>>;
type GlobalHotkeyState = Arc<Mutex<HotkeyRuntime>>;

#[derive(Debug, Clone)]
struct HotkeyRuntime {
    mode: String,
    session_type: String,
    enabled: bool,
    native_active: bool,
    read_shortcut: Option<Shortcut>,
    pause_shortcut: Option<Shortcut>,
    read_shortcut_label: String,
    pause_shortcut_label: String,
    last_error: Option<String>,
}

impl Default for HotkeyRuntime {
    fn default() -> Self {
        Self {
            mode: "native".to_string(),
            session_type: "unknown".to_string(),
            enabled: true,
            native_active: false,
            read_shortcut: None,
            pause_shortcut: None,
            read_shortcut_label: default_read_shortcut_label(),
            pause_shortcut_label: default_pause_shortcut_label(),
            last_error: None,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
struct HotkeyStatus {
    mode: String,
    session_type: String,
    enabled: bool,
    native_active: bool,
    read_shortcut: String,
    pause_shortcut: String,
    last_error: Option<String>,
}

#[derive(Debug, Clone)]
struct EffectiveHotkeyConfig {
    enabled: bool,
    modifiers: String,
    key: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AppAction {
    ReadSelected,
    TogglePause,
    Stop,
}

/// Tray icon: app logo at 32x32 (icons/32x32.png).
const TRAY_ICON_PNG: &[u8] = include_bytes!("../icons/logo.png");
const TEXT_CAPTURE_TIMEOUT_MS: u64 = 1200;

fn default_modifier_key() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "command"
    }
    #[cfg(not(target_os = "macos"))]
    {
        "control"
    }
}

fn default_read_shortcut_label() -> String {
    #[cfg(target_os = "macos")]
    {
        "Cmd+R".to_string()
    }
    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+R".to_string()
    }
}

fn default_pause_shortcut_label() -> String {
    #[cfg(target_os = "macos")]
    {
        "Cmd+Shift+R".to_string()
    }
    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+Shift+R".to_string()
    }
}

fn current_session_type() -> String {
    std::env::var("XDG_SESSION_TYPE")
        .unwrap_or_else(|_| "unknown".to_string())
        .to_lowercase()
}

fn is_wayland_session() -> bool {
    #[cfg(target_os = "linux")]
    {
        current_session_type() == "wayland"
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

fn supports_native_hotkeys() -> bool {
    !is_wayland_session()
}

fn parse_modifier_token(token: &str) -> Option<Modifiers> {
    match token {
        "control" | "ctrl" => Some(Modifiers::CONTROL),
        "shift" => Some(Modifiers::SHIFT),
        "alt" | "option" => Some(Modifiers::ALT),
        "command" | "cmd" | "super" | "meta" => Some(Modifiers::SUPER),
        _ => None,
    }
}

fn parse_modifiers(raw: &str) -> Result<Option<Modifiers>, String> {
    let mut modifiers = Modifiers::empty();
    for token in raw
        .split(|c: char| c == '+' || c == ',' || c.is_whitespace())
        .map(|t| t.trim().to_lowercase())
        .filter(|t| !t.is_empty())
    {
        let parsed = parse_modifier_token(&token)
            .ok_or_else(|| format!("Unsupported modifier token: {token}"))?;
        modifiers |= parsed;
    }

    if modifiers.is_empty() {
        Ok(None)
    } else {
        Ok(Some(modifiers))
    }
}

fn parse_key_code(raw: &str) -> Result<Code, String> {
    match raw.trim().to_uppercase().as_str() {
        "A" => Ok(Code::KeyA),
        "B" => Ok(Code::KeyB),
        "C" => Ok(Code::KeyC),
        "D" => Ok(Code::KeyD),
        "E" => Ok(Code::KeyE),
        "F" => Ok(Code::KeyF),
        "G" => Ok(Code::KeyG),
        "H" => Ok(Code::KeyH),
        "I" => Ok(Code::KeyI),
        "J" => Ok(Code::KeyJ),
        "K" => Ok(Code::KeyK),
        "L" => Ok(Code::KeyL),
        "M" => Ok(Code::KeyM),
        "N" => Ok(Code::KeyN),
        "O" => Ok(Code::KeyO),
        "P" => Ok(Code::KeyP),
        "Q" => Ok(Code::KeyQ),
        "R" => Ok(Code::KeyR),
        "S" => Ok(Code::KeyS),
        "T" => Ok(Code::KeyT),
        "U" => Ok(Code::KeyU),
        "V" => Ok(Code::KeyV),
        "W" => Ok(Code::KeyW),
        "X" => Ok(Code::KeyX),
        "Y" => Ok(Code::KeyY),
        "Z" => Ok(Code::KeyZ),
        "0" => Ok(Code::Digit0),
        "1" => Ok(Code::Digit1),
        "2" => Ok(Code::Digit2),
        "3" => Ok(Code::Digit3),
        "4" => Ok(Code::Digit4),
        "5" => Ok(Code::Digit5),
        "6" => Ok(Code::Digit6),
        "7" => Ok(Code::Digit7),
        "8" => Ok(Code::Digit8),
        "9" => Ok(Code::Digit9),
        other => Err(format!("Unsupported hotkey key: {other}")),
    }
}

fn format_modifier_label(raw: &str) -> String {
    raw.split(|c: char| c == '+' || c == ',' || c.is_whitespace())
        .filter_map(|token| {
            let normalized = token.trim().to_lowercase();
            if normalized.is_empty() {
                return None;
            }
            let label = match normalized.as_str() {
                "control" | "ctrl" => "Ctrl",
                "shift" => "Shift",
                "alt" | "option" => "Alt",
                "command" | "cmd" => "Cmd",
                "super" | "meta" => "Super",
                _ => token.trim(),
            };
            Some(label.to_string())
        })
        .collect::<Vec<_>>()
        .join("+")
}

fn build_shortcut(modifiers: &str, key: &str) -> Result<Shortcut, String> {
    let mods = parse_modifiers(modifiers)?;
    let code = parse_key_code(key)?;
    Ok(Shortcut::new(mods, code))
}

fn shortcut_label(modifiers: &str, key: &str) -> String {
    let mod_label = format_modifier_label(modifiers);
    let upper_key = key.trim().to_uppercase();
    if mod_label.is_empty() {
        upper_key
    } else {
        format!("{mod_label}+{upper_key}")
    }
}

fn load_effective_hotkey_config() -> EffectiveHotkeyConfig {
    let config = config::load_full_config().unwrap_or_default();
    EffectiveHotkeyConfig {
        enabled: config.hotkey_enabled.unwrap_or(true),
        modifiers: config
            .hotkey_modifiers
            .unwrap_or_else(|| default_modifier_key().to_string()),
        key: config.hotkey_key.unwrap_or_else(|| "r".to_string()),
    }
}

fn pause_shortcut_parts(config: &EffectiveHotkeyConfig) -> (String, String) {
    let modifiers = if config.modifiers.to_lowercase().contains("shift") {
        config.modifiers.clone()
    } else {
        format!("{}+shift", config.modifiers)
    };
    (modifiers, config.key.clone())
}

fn read_text_with_timeout<F>(source: &'static str, reader: F) -> Option<String>
where
    F: FnOnce() -> Option<String> + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(reader());
    });

    match rx.recv_timeout(Duration::from_millis(TEXT_CAPTURE_TIMEOUT_MS)) {
        Ok(text) => text,
        Err(mpsc::RecvTimeoutError::Timeout) => {
            warn!(
                source,
                timeout_ms = TEXT_CAPTURE_TIMEOUT_MS,
                "Text capture timed out"
            );
            None
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            warn!(source, "Text capture worker disconnected");
            None
        }
    }
}

fn get_selected_text_impl() -> Option<String> {
    read_text_with_timeout("selected", system::get_selected_text)
}

fn get_clipboard_text_impl() -> Option<String> {
    read_text_with_timeout("clipboard", system::get_clipboard_text)
}

/// Gets the currently selected text from the system.
#[tauri::command]
fn get_selected_text() -> Option<String> {
    let result = get_selected_text_impl();
    log_selected_text(&result);
    result
}

/// Gets selected text or falls back to clipboard text. Returns empty string if neither available.
fn get_text_or_clipboard_impl() -> String {
    get_selected_text_impl()
        .or_else(get_clipboard_text_impl)
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
    get_clipboard_text_impl()
}

fn execute_action<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    action: AppAction,
    source: &'static str,
) {
    match action {
        AppAction::ReadSelected => {
            let Some(tts_tx) = app
                .try_state::<tts::TtsState>()
                .map(|state| state.inner().clone())
            else {
                warn!(source, "Read Selected: TtsState not found");
                return;
            };

            std::thread::spawn(move || {
                let text = get_text_or_clipboard_impl();
                if text.is_empty() {
                    warn!(source, "Read Selected: no text available");
                    return;
                }
                log_selected_text(&Some(text.clone()));

                let (resp_tx, resp_rx) = mpsc::sync_channel(0);
                if let Err(e) = tts_tx.send(tts::TtsRequest::Speak(text, resp_tx)) {
                    warn!(source, error = %e, "Read Selected: failed to send speak request");
                    return;
                }

                match resp_rx.recv() {
                    Ok(Ok(())) => {}
                    Ok(Err(e)) => {
                        warn!(source, error = %e, "Read Selected: tts_speak failed");
                    }
                    Err(_) => {
                        warn!(source, "Read Selected: TTS worker disconnected");
                    }
                }
            });
        }
        AppAction::TogglePause => {
            let Some(tts_tx) = app
                .try_state::<tts::TtsState>()
                .map(|state| state.inner().clone())
            else {
                warn!(source, "Toggle Pause: TtsState not found");
                return;
            };

            let (resp_tx, resp_rx) = mpsc::sync_channel(0);
            if let Err(e) = tts_tx.send(tts::TtsRequest::TogglePause(resp_tx)) {
                warn!(source, error = %e, "Toggle Pause: failed to send request");
                return;
            }

            match resp_rx.recv() {
                Ok(Ok(paused)) => {
                    debug!(source, paused, "Toggle Pause: updated playback state");
                }
                Ok(Err(e)) => {
                    warn!(source, error = %e, "Toggle Pause: request failed");
                }
                Err(_) => {
                    warn!(source, "Toggle Pause: TTS worker disconnected");
                }
            }
        }
        AppAction::Stop => {
            if let Some(tts_tx) = app
                .try_state::<tts::TtsState>()
                .map(|state| state.inner().clone())
            {
                if let Err(e) = tts_tx.send(tts::TtsRequest::Stop) {
                    warn!(source, error = %e, "Stop: failed to send request");
                }
            } else {
                warn!(source, "Stop: TtsState not found");
            }
        }
    }
}

fn parse_app_action(raw: &str) -> Option<AppAction> {
    match raw.trim().to_lowercase().as_str() {
        "read" | "read-selected" | "read_selected" => Some(AppAction::ReadSelected),
        "pause" | "pause-toggle" | "toggle-pause" | "toggle_pause" => Some(AppAction::TogglePause),
        "stop" => Some(AppAction::Stop),
        _ => None,
    }
}

fn update_hotkey_runtime_on_error(state: &GlobalHotkeyState, message: String) {
    if let Ok(mut runtime) = state.lock() {
        runtime.native_active = false;
        runtime.last_error = Some(message);
    }
}

fn refresh_global_hotkeys<R: tauri::Runtime>(app: &tauri::AppHandle<R>, state: &GlobalHotkeyState) {
    let effective = load_effective_hotkey_config();
    let session_type = current_session_type();
    let mode = if supports_native_hotkeys() {
        "native"
    } else {
        "wayland-compositor"
    };

    let read_label = shortcut_label(&effective.modifiers, &effective.key);
    let (pause_modifiers, pause_key) = pause_shortcut_parts(&effective);
    let pause_label = shortcut_label(&pause_modifiers, &pause_key);

    if let Ok(mut runtime) = state.lock() {
        runtime.mode = mode.to_string();
        runtime.session_type = session_type;
        runtime.enabled = effective.enabled;
        runtime.read_shortcut_label = read_label.clone();
        runtime.pause_shortcut_label = pause_label.clone();
        runtime.last_error = None;
        runtime.native_active = false;
        runtime.read_shortcut = None;
        runtime.pause_shortcut = None;
    }

    if !supports_native_hotkeys() || !effective.enabled {
        if let Err(e) = app.global_shortcut().unregister_all() {
            warn!(error = %e, "Failed to unregister global shortcuts");
        }
        return;
    }

    let read_shortcut = match build_shortcut(&effective.modifiers, &effective.key) {
        Ok(shortcut) => shortcut,
        Err(e) => {
            update_hotkey_runtime_on_error(state, e.clone());
            warn!(error = %e, "Failed to build read shortcut");
            return;
        }
    };

    let pause_shortcut = match build_shortcut(&pause_modifiers, &pause_key) {
        Ok(shortcut) => shortcut,
        Err(e) => {
            update_hotkey_runtime_on_error(state, e.clone());
            warn!(error = %e, "Failed to build pause shortcut");
            return;
        }
    };

    if let Err(e) = app.global_shortcut().unregister_all() {
        let message = format!("Failed to clear old global shortcuts: {e}");
        update_hotkey_runtime_on_error(state, message.clone());
        warn!(error = %e, "Failed to clear old global shortcuts");
        return;
    }

    if let Err(e) = app.global_shortcut().register(read_shortcut) {
        let message = format!("Failed to register {}: {}", read_label, e);
        update_hotkey_runtime_on_error(state, message.clone());
        warn!(error = %e, shortcut = %read_label, "Failed to register read shortcut");
        return;
    }

    if let Err(e) = app.global_shortcut().register(pause_shortcut) {
        let message = format!("Failed to register {}: {}", pause_label, e);
        update_hotkey_runtime_on_error(state, message.clone());
        warn!(error = %e, shortcut = %pause_label, "Failed to register pause shortcut");
        return;
    }

    if let Ok(mut runtime) = state.lock() {
        runtime.native_active = true;
        runtime.read_shortcut = Some(read_shortcut);
        runtime.pause_shortcut = Some(pause_shortcut);
    }
}

fn handle_global_shortcut_event<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    shortcut: &Shortcut,
    event_state: ShortcutState,
    hotkey_state: &GlobalHotkeyState,
) {
    if event_state != ShortcutState::Pressed {
        return;
    }

    let action = {
        let Ok(runtime) = hotkey_state.lock() else {
            return;
        };

        if !runtime.native_active {
            return;
        }

        if runtime
            .read_shortcut
            .as_ref()
            .map(|registered| registered == shortcut)
            .unwrap_or(false)
        {
            Some(AppAction::ReadSelected)
        } else if runtime
            .pause_shortcut
            .as_ref()
            .map(|registered| registered == shortcut)
            .unwrap_or(false)
        {
            Some(AppAction::TogglePause)
        } else {
            None
        }
    };

    if let Some(action) = action {
        execute_action(app, action, "global-hotkey");
    }
}

#[cfg(unix)]
pub fn action_socket_path() -> PathBuf {
    if let Ok(runtime_dir) = std::env::var("XDG_RUNTIME_DIR") {
        let candidate = PathBuf::from(runtime_dir).join("insight-reader.sock");
        if let Some(parent) = candidate.parent() {
            if parent.exists() {
                return candidate;
            }
        }
    }

    let uid = std::fs::metadata("/proc/self")
        .map(|meta| std::os::unix::fs::MetadataExt::uid(&meta))
        .unwrap_or(0);
    let run_user = PathBuf::from(format!("/run/user/{uid}"));
    if run_user.exists() {
        return run_user.join("insight-reader.sock");
    }

    PathBuf::from(format!("/tmp/insight-reader-{uid}.sock"))
}

#[cfg(not(unix))]
pub fn action_socket_path() -> std::path::PathBuf {
    std::path::PathBuf::from("insight-reader.sock")
}

#[cfg(unix)]
pub fn send_action_to_running_instance(action: &str) -> Result<(), String> {
    let uid = std::fs::metadata("/proc/self")
        .map(|meta| std::os::unix::fs::MetadataExt::uid(&meta))
        .unwrap_or(0);

    let mut candidates = Vec::new();
    if let Ok(runtime_dir) = std::env::var("XDG_RUNTIME_DIR") {
        candidates.push(PathBuf::from(runtime_dir).join("insight-reader.sock"));
    }
    candidates.push(PathBuf::from(format!(
        "/run/user/{uid}/insight-reader.sock"
    )));
    candidates.push(PathBuf::from(format!("/tmp/insight-reader-{uid}.sock")));
    candidates.sort();
    candidates.dedup();

    for path in candidates {
        let mut stream = match UnixStream::connect(&path) {
            Ok(stream) => stream,
            Err(_) => continue,
        };

        stream
            .write_all(action.trim().as_bytes())
            .map_err(|e| format!("failed to send action to running instance: {e}"))?;
        return Ok(());
    }

    Err("could not connect to a running instance action socket".to_string())
}

#[cfg(not(unix))]
pub fn send_action_to_running_instance(_action: &str) -> Result<(), String> {
    Err("action bridge is not supported on this platform".to_string())
}

fn start_action_socket_listener<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    #[cfg(unix)]
    {
        let path = action_socket_path();
        std::thread::spawn(move || {
            let listener = match UnixListener::bind(&path) {
                Ok(listener) => listener,
                Err(bind_err) => {
                    if path.exists() {
                        match UnixStream::connect(&path) {
                            Ok(_) => {
                                warn!(path = %path.display(), "Action socket already in use by another instance");
                                return;
                            }
                            Err(_) => {
                                let _ = std::fs::remove_file(&path);
                                match UnixListener::bind(&path) {
                                    Ok(listener) => listener,
                                    Err(e) => {
                                        warn!(error = %e, path = %path.display(), "Failed to bind action socket after cleanup");
                                        return;
                                    }
                                }
                            }
                        }
                    } else {
                        warn!(error = %bind_err, path = %path.display(), "Failed to bind action socket");
                        return;
                    }
                }
            };

            for stream_result in listener.incoming() {
                let mut stream = match stream_result {
                    Ok(stream) => stream,
                    Err(e) => {
                        warn!(error = %e, "Action socket accept failed");
                        continue;
                    }
                };

                let mut payload = String::new();
                if let Err(e) = stream.read_to_string(&mut payload) {
                    warn!(error = %e, "Action socket read failed");
                    continue;
                }

                let action_raw = payload.trim();
                match parse_app_action(action_raw) {
                    Some(action) => execute_action(&app, action, "socket"),
                    None => warn!(action = %action_raw, "Unknown action command"),
                }
            }
        });
    }
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

/// Sets TTS playback volume as percentage from 0 to 100.
#[tauri::command]
fn tts_set_volume(state: State<tts::TtsState>, volume_percent: u8) -> Result<(), String> {
    let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
    state
        .inner()
        .send(tts::TtsRequest::SetVolume(volume_percent, resp_tx))
        .map_err(|e| format!("TTS channel: {e}"))?;
    resp_rx
        .recv()
        .map_err(|_| "TTS worker disconnected".to_string())?
        .map_err(|e| e.to_string())
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
fn get_hotkey_status(state: State<GlobalHotkeyState>) -> HotkeyStatus {
    match state.inner().lock() {
        Ok(runtime) => HotkeyStatus {
            mode: runtime.mode.clone(),
            session_type: runtime.session_type.clone(),
            enabled: runtime.enabled,
            native_active: runtime.native_active,
            read_shortcut: runtime.read_shortcut_label.clone(),
            pause_shortcut: runtime.pause_shortcut_label.clone(),
            last_error: runtime.last_error.clone(),
        },
        Err(_) => HotkeyStatus {
            mode: "unknown".to_string(),
            session_type: "unknown".to_string(),
            enabled: false,
            native_active: false,
            read_shortcut: default_read_shortcut_label(),
            pause_shortcut: default_pause_shortcut_label(),
            last_error: Some("Hotkey state unavailable".to_string()),
        },
    }
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, config_json: String) -> Result<(), String> {
    let cfg: config::FullConfig = serde_json::from_str(&config_json)
        .map_err(|e| format!("Failed to parse config JSON: {}", e))?;
    config::save_full_config(cfg).map_err(|e| e.to_string())?;

    if let Some(state) = app.try_state::<GlobalHotkeyState>() {
        refresh_global_hotkeys(&app, &state.inner().clone());
    }

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

/// Default backend base URL for ReadingService.
const BACKEND_BASE_URL: &str = "http://grars-backend.i.psilva.org:8080";

/// Calls the ReadingService backend POST /api/prompt. Returns the response string on success.
/// See backend-api.md for task semantics (SUMMARIZE, TTS, EXPLAIN1, EXPLAIN2, PROMPT).
/// Backend URL: config.backend_url > INSIGHT_READER_BACKEND_URL env > localhost:8080.
#[tauri::command]
fn backend_prompt(task: String, content: String) -> Result<String, String> {
    let base = config::load_full_config()
        .ok()
        .and_then(|c| c.backend_url)
        .filter(|s| !s.trim().is_empty())
        .or_else(|| std::env::var("INSIGHT_READER_BACKEND_URL").ok())
        .unwrap_or_else(|| BACKEND_BASE_URL.to_string());
    let url = format!("{}/api/prompt", base.trim_end_matches('/'));

    #[derive(serde::Serialize)]
    struct Request {
        task: String,
        content: String,
    }
    #[derive(serde::Deserialize)]
    struct SuccessResponse {
        response: String,
    }
    #[derive(serde::Deserialize)]
    struct ErrorResponse {
        error: Option<String>,
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let resp = client
        .post(&url)
        .json(&Request { task, content })
        .send()
        .map_err(|e| {
            format!(
                "Could not reach the backend at {}. Check Settings → General → Backend URL. \
                 Ensure the server is running and reachable. ({})",
                base, e
            )
        })?;

    let status = resp.status();
    let body = resp
        .text()
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if status.is_success() {
        let parsed: SuccessResponse =
            serde_json::from_str(&body).map_err(|e| format!("Invalid response: {}", e))?;
        Ok(parsed.response)
    } else {
        let err_msg = serde_json::from_str::<ErrorResponse>(&body)
            .ok()
            .and_then(|r| r.error)
            .unwrap_or_else(|| format!("HTTP {}: {}", status, body));
        Err(err_msg)
    }
}

#[tauri::command]
fn check_polly_credentials() -> Result<bool, String> {
    match tts::check_polly_credentials() {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}

fn log_selected_text(result: &Option<String>) {
    match result {
        Some(text) => info!(len = text.len(), "Selected text"),
        None => debug!("No selected text"),
    }
}

/// Builds the tray menu with Read Selected, Summarize Selected, Insight Editor, Show/Hide, and Quit.
fn build_tray_menu<R: tauri::Runtime>(
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    for directive in [
        "aws_config::profile::credentials=warn",
        "aws_credential_types=warn",
    ] {
        if let Ok(parsed) = directive.parse() {
            env_filter = env_filter.add_directive(parsed);
        }
    }

    tracing_subscriber::fmt().with_env_filter(env_filter).init();

    let editor_initial: EditorInitialText = Arc::new(Mutex::new(None));
    let tts_state = tts::create_tts_state();
    let hotkey_state: GlobalHotkeyState = Arc::new(Mutex::new(HotkeyRuntime::default()));
    #[cfg(target_os = "linux")]
    let window_state_plugin = tauri_plugin_window_state::Builder::default()
        // On Linux, restoring/saving SIZE can cause gradual shrink for this window setup.
        .with_state_flags(
            tauri_plugin_window_state::StateFlags::all()
                .difference(tauri_plugin_window_state::StateFlags::SIZE),
        )
        .build();
    #[cfg(not(target_os = "linux"))]
    let window_state_plugin = tauri_plugin_window_state::Builder::default().build();

    let hotkey_state_for_handler = hotkey_state.clone();

    if let Err(e) = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(window_state_plugin)
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    handle_global_shortcut_event(
                        app,
                        shortcut,
                        event.state(),
                        &hotkey_state_for_handler,
                    );
                })
                .build(),
        )
        .manage(editor_initial)
        .manage(tts_state)
        .manage(hotkey_state.clone())
        .invoke_handler(tauri::generate_handler![
            backend_prompt,
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
            tts_set_volume,
            tts_switch_provider,
            get_platform,
            get_config,
            get_hotkey_status,
            save_config,
            list_piper_voices,
            refresh_piper_voices,
            list_polly_voices,
            list_microsoft_voices,
            download_voice,
            get_download_progress,
            list_downloaded_voices,
            open_settings_window,
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
                            execute_action(app, AppAction::ReadSelected, "tray");
                        }
                        "summarize_selected" => {
                            let app = app.clone();
                            std::thread::spawn(move || {
                                let text = get_text_or_clipboard_impl();
                                if text.trim().is_empty() {
                                    warn!("Summarize Selected: no text available");
                                    return;
                                }
                                match backend_prompt("SUMMARIZE".to_string(), text) {
                                    Ok(summary) => {
                                        if let Some(state) = app.try_state::<EditorInitialText>() {
                                            if let Err(e) =
                                                open_or_focus_editor_with_text(&app, &state, summary)
                                            {
                                                warn!(error = %e, "Summarize Selected: open_editor_window failed");
                                            }
                                        } else {
                                            warn!("Summarize Selected: EditorInitialText state not found");
                                        }
                                    }
                                    Err(e) => {
                                        if let Some(state) = app.try_state::<EditorInitialText>() {
                                            let _ = open_or_focus_editor_with_text(
                                                &app,
                                                &state,
                                                format!("Summary failed: {}", e),
                                            );
                                        } else {
                                            warn!(error = %e, "Summarize Selected: backend_prompt failed");
                                        }
                                    }
                                }
                            });
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
            }

            let app_handle = app.handle().clone();

            if let Some(state) = app.try_state::<GlobalHotkeyState>() {
                refresh_global_hotkeys(&app_handle, &state.inner().clone());
            }

            start_action_socket_listener(app_handle.clone());

            if let Ok(start_action) = std::env::var("INSIGHT_READER_START_ACTION") {
                if let Some(action) = parse_app_action(&start_action) {
                    execute_action(&app_handle, action, "startup-action");
                }
                std::env::remove_var("INSIGHT_READER_START_ACTION");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
    {
        error!(error = %e, "Error while running Tauri application");
        std::process::exit(1);
    }
}
