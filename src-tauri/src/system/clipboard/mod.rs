//! Clipboard and selection reading utilities

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

use tracing::debug;

#[cfg(any(target_os = "macos", target_os = "windows"))]
use arboard::Clipboard;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::time::Duration;

#[cfg(any(target_os = "macos", target_os = "windows"))]
const CLIPBOARD_POLL_TIMEOUT_MS: u64 = 300;
#[cfg(any(target_os = "macos", target_os = "windows"))]
const CLIPBOARD_POLL_INTERVAL_MS: u64 = 50;

/// Polls clipboard for new content. Used by macOS and Windows Cmd+C/Ctrl+C simulation.
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn poll_clipboard_for_text(max_wait: Duration) -> Option<String> {
    let poll_interval = Duration::from_millis(CLIPBOARD_POLL_INTERVAL_MS);
    let mut elapsed = Duration::ZERO;

    while elapsed < max_wait {
        std::thread::sleep(poll_interval);
        elapsed += poll_interval;

        if let Some(text) = Clipboard::new()
            .and_then(|mut cb| cb.get_text())
            .ok()
            .filter(|t| !t.is_empty())
        {
            debug!(
                elapsed_ms = elapsed.as_millis(),
                "Clipboard updated with new content"
            );
            return Some(text);
        }
    }

    debug!(
        timeout_ms = max_wait.as_millis(),
        "Clipboard polling timeout reached"
    );
    None
}

/// Restores clipboard after Cmd+C/Ctrl+C simulation. Used by macOS and Windows.
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn restore_clipboard(original_text: Option<String>) {
    let Ok(mut clipboard) = Clipboard::new() else {
        tracing::warn!("Failed to create clipboard instance for restoration");
        return;
    };

    match original_text {
        Some(text) => {
            let text_len = text.len();
            if let Err(e) = clipboard.set_text(text) {
                tracing::warn!(error = %e, "Failed to restore original clipboard contents");
            } else {
                debug!(chars = text_len, "Restored original clipboard contents");
            }
        }
        None => {
            if let Err(e) = clipboard.clear() {
                tracing::warn!(error = %e, "Failed to clear clipboard during restoration");
            } else {
                debug!("Cleared clipboard (original was empty)");
            }
        }
    }
}

/// Helper to process and return trimmed text if non-empty.
/// Logs only length to avoid leaking clipboard/selection content (e.g. passwords) into logs.
fn process_text(text: String, source: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        debug!("{} is empty", source);
        None
    } else {
        debug!(len = trimmed.len(), "Captured text from {}", source);
        Some(trimmed.to_string())
    }
}

/// Gets the current clipboard text (e.g. from Ctrl+C / Cmd+C).
/// - On macOS and Windows: Uses `arboard::Clipboard::get_text()`.
/// - On Linux: Uses the explicit Clipboard buffer (`LinuxClipboardKind::Clipboard`) so it matches Ctrl+C, not PRIMARY.
/// - Processed with `process_text`; returns `None` if empty or on error.
pub fn get_clipboard_text() -> Option<String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        Clipboard::new()
            .ok()
            .and_then(|mut cb| cb.get_text().ok())
            .and_then(|t| process_text(t, "clipboard"))
    }

    #[cfg(target_os = "linux")]
    {
        linux::get_clipboard_text_linux()
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        tracing::warn!("Platform not supported for clipboard");
        None
    }
}

/// Gets the currently selected text.
/// - On macOS: Simulates Cmd+C to copy selected text, then reads from clipboard (restores original clipboard after)
/// - On Linux: Uses arboard to read from PRIMARY selection first, falls back to clipboard
/// - On Windows: Simulates Ctrl+C to copy selected text, then reads from clipboard (restores original clipboard after)
/// - On other platforms: Returns None
pub fn get_selected_text() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        macos::get_selected_text_macos()
    }

    #[cfg(target_os = "linux")]
    {
        linux::get_selected_text_linux()
    }

    #[cfg(target_os = "windows")]
    {
        windows::get_selected_text_windows()
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        tracing::warn!("Platform not supported for text selection");
        None
    }
}
