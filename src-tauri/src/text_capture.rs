//! Timeout-wrapped selection and clipboard text capture.
//!
//! System selection and clipboard reads can block (e.g. on X11). This module runs them in a
//! short-lived thread with a timeout so the UI and TTS pipeline stay responsive. Used by the
//! frontend (get_selected_text, get_text_or_clipboard, get_clipboard_text commands) and by the
//! actions layer when executing "Read Selected" or "Summarize Selected".

use std::sync::mpsc;
use std::time::Duration;

use tracing::{debug, info, warn};

use crate::system;

// --- Constants ---

/// Max time we wait for the system to return selected or clipboard text before giving up.
const TEXT_CAPTURE_TIMEOUT_MS: u64 = 1200;

// --- Helpers ---

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

/// Selected text via system integration (e.g. X11 selection). Runs with timeout.
pub fn get_selected_text_impl() -> Option<String> {
    read_text_with_timeout("selected", system::get_selected_text)
}

/// Clipboard text. Runs with timeout.
pub fn get_clipboard_text_impl() -> Option<String> {
    read_text_with_timeout("clipboard", system::get_clipboard_text)
}

/// Logs whether we got selected text or not; used after capture for diagnostics.
pub fn log_selected_text(result: &Option<String>) {
    match result {
        Some(text) => info!(len = text.len(), "Selected text"),
        None => debug!("No selected text"),
    }
}

/// Selected text, or clipboard if selection is empty. Used by actions and tray.
pub fn get_text_or_clipboard_impl() -> String {
    get_selected_text_impl()
        .or_else(get_clipboard_text_impl)
        .unwrap_or_default()
}

// --- Commands ---

/// Gets the currently selected text from the system.
#[tauri::command]
pub fn get_selected_text() -> Option<String> {
    let result = get_selected_text_impl();
    log_selected_text(&result);
    result
}

/// Gets selected text or falls back to clipboard text. Returns empty string if neither available.
#[tauri::command]
pub fn get_text_or_clipboard() -> String {
    get_text_or_clipboard_impl()
}

/// Gets the current clipboard text (e.g. from Ctrl+C / Cmd+C).
#[tauri::command]
pub fn get_clipboard_text() -> Option<String> {
    get_clipboard_text_impl()
}
