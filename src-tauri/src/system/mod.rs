//! System interactions (clipboard, screenshot, OCR, etc.)

mod clipboard;
mod ocr;
mod screenshot;

pub use clipboard::{get_clipboard_text, get_selected_text};
pub use ocr::{extract_text_with_positions, OcrError, OcrResult};
pub use screenshot::{capture_screenshot, ScreenshotError};
