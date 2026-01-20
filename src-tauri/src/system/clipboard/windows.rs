//! Windows-specific clipboard implementation using Ctrl+C simulation
//!
//! This module implements text selection capture on Windows by simulating Ctrl+C.
//! Windows doesn't provide a direct API to read selected text from other applications,
//! so we use enigo to send the keystroke to the foreground window.

use super::{poll_clipboard_for_text, process_text, restore_clipboard, CLIPBOARD_POLL_TIMEOUT_MS};
use arboard::Clipboard;
use std::time::Duration;
use tracing::{debug, info, warn};

/// Delay before simulating Ctrl+C to allow system to settle after hotkey press.
const SETTLE_DELAY_MS: u64 = 100;

/// Delay after sending keystrokes to allow system to process.
const KEYSTROKE_DELAY_MS: u64 = 50;

/// Simulates Ctrl+C using enigo to copy selected text from the foreground window.
fn simulate_ctrl_c() -> Result<(), String> {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};

    debug!("Simulating Ctrl+C via enigo");

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|e| e.to_string())?;
    enigo
        .key(Key::Unicode('c'), Direction::Click)
        .map_err(|e| e.to_string())?;
    enigo
        .key(Key::Control, Direction::Release)
        .map_err(|e| e.to_string())?;

    std::thread::sleep(Duration::from_millis(KEYSTROKE_DELAY_MS));
    debug!("Ctrl+C simulated successfully");
    Ok(())
}

/// Gets the currently selected text on Windows using Ctrl+C simulation.
pub(super) fn get_selected_text_windows() -> Option<String> {
    debug!("Capturing selected text via Ctrl+C simulation");

    std::thread::sleep(Duration::from_millis(SETTLE_DELAY_MS));

    let mut clipboard = match Clipboard::new() {
        Ok(cb) => cb,
        Err(e) => {
            warn!(error = %e, "Failed to initialize clipboard");
            return None;
        }
    };

    let original_text = clipboard.get_text().ok();

    if let Err(e) = clipboard.clear() {
        warn!(error = %e, "Failed to clear clipboard");
    }

    if let Err(e) = simulate_ctrl_c() {
        warn!(error = %e, "Failed to simulate Ctrl+C");
        restore_clipboard(original_text);
        return None;
    }

    let selected_text = poll_clipboard_for_text(Duration::from_millis(CLIPBOARD_POLL_TIMEOUT_MS));

    if let Some(text) = &selected_text {
        info!(chars = text.len(), "Successfully captured selected text");
    } else {
        debug!("No text selected or clipboard didn't update within timeout");
    }

    restore_clipboard(original_text);
    selected_text.and_then(|text| process_text(text, "selected text"))
}
