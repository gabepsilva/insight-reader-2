//! System interactions (clipboard, screenshot, OCR, etc.)

mod clipboard;
mod ocr;
mod screenshot;
pub mod text_cleanup;

pub use clipboard::{get_clipboard_text, get_selected_text};
pub use ocr::{extract_text_with_positions, OcrError, OcrResult};
pub use screenshot::{capture_screenshot, ScreenshotError};
pub use text_cleanup::{check_cleanup_available, cleanup_text};
