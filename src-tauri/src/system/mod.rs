//! System interactions (clipboard, etc.)

mod clipboard;

pub use clipboard::{get_clipboard_text, get_selected_text};
