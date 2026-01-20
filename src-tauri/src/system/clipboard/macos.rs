//! macOS-specific clipboard implementation using Cmd+C simulation
//!
//! This module implements text selection capture on macOS by simulating Cmd+C.
//! macOS doesn't provide a direct API to read selected text from other applications,
//! so we use AppleScript to send the keystroke to the frontmost application.

use super::{poll_clipboard_for_text, process_text, restore_clipboard, CLIPBOARD_POLL_TIMEOUT_MS};
use arboard::Clipboard;
use macos_accessibility_client::accessibility::application_is_trusted_with_prompt;
use std::process::Command;
use std::time::Duration;
use tracing::{debug, info, warn};

/// Delay before simulating Cmd+C to allow system to settle after hotkey press.
const SETTLE_DELAY_MS: u64 = 50;

/// Delay in AppleScript to allow focus to settle before sending keystroke.
const APPLESCRIPT_FOCUS_DELAY: f64 = 0.05;

/// Check if we have accessibility permissions (macOS only).
///
/// Will prompt the user to grant permissions if not already granted.
/// Returns `true` if permissions are granted, `false` otherwise.
fn check_accessibility_permissions() -> bool {
    let trusted = application_is_trusted_with_prompt();
    if !trusted {
        warn!(
            "Accessibility permissions not granted - enable in System Settings > Privacy & Security > Accessibility"
        );
    }
    trusted
}

/// Simulates Cmd+C using AppleScript to copy selected text from the frontmost application.
fn simulate_cmd_c() -> Result<(), String> {
    debug!("Simulating Cmd+C via AppleScript");

    let script = format!(
        r#"
        tell application "System Events"
            set frontApp to name of first application process whose frontmost is true
            delay {}
            keystroke "c" using command down
        end tell
    "#,
        APPLESCRIPT_FOCUS_DELAY
    );

    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("Failed to execute osascript: {}", e))?;

    if output.status.success() {
        debug!("AppleScript executed successfully");
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let error_msg = if stderr.trim().is_empty() {
            format!(
                "AppleScript failed with exit code {}",
                output.status.code().unwrap_or(-1)
            )
        } else {
            format!("AppleScript failed: {}", stderr.trim())
        };
        warn!(error = %error_msg, "Failed to simulate Cmd+C");
        Err(error_msg)
    }
}

/// Gets the currently selected text on macOS using Cmd+C simulation.
pub(super) fn get_selected_text_macos() -> Option<String> {
    debug!("Capturing selected text via Cmd+C simulation");

    std::thread::sleep(Duration::from_millis(SETTLE_DELAY_MS));

    if !check_accessibility_permissions() {
        warn!("Cannot capture selected text: Accessibility permissions required");
        return None;
    }

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

    if let Err(e) = simulate_cmd_c() {
        warn!(error = %e, "Failed to simulate Cmd+C");
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
