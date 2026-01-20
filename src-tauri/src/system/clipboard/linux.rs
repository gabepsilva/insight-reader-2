//! Linux-specific clipboard implementation

use super::process_text;
use arboard::{Clipboard, GetExtLinux, LinuxClipboardKind};
use tracing::{debug, info};

/// Gets the currently selected text on Linux.
/// Tries PRIMARY selection first, then falls back to clipboard.
pub(super) fn get_selected_text_linux() -> Option<String> {
    info!("Attempting to read selected text (PRIMARY selection, fallback to clipboard)");

    let mut clipboard = Clipboard::new().ok()?;

    // First attempt: Try PRIMARY selection (selected text)
    if let Ok(text) = clipboard
        .get()
        .clipboard(LinuxClipboardKind::Primary)
        .text()
    {
        if let Some(result) = process_text(text, "PRIMARY selection") {
            return Some(result);
        }
        debug!("PRIMARY selection is empty, falling back to clipboard");
    } else {
        debug!("PRIMARY selection unavailable, falling back to clipboard");
    }

    // Fallback: Try regular clipboard
    clipboard
        .get_text()
        .ok()
        .and_then(|text| process_text(text, "clipboard (fallback)"))
}
