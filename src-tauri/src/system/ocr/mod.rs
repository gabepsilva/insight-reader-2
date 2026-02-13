//! OCR (Optical Character Recognition) functionality

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "macos")]
pub use macos::extract_text_with_positions;

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum OcrError {
    #[error("Vision framework error: {0}")]
    Vision(String),
    #[error("Image conversion failed: {0}")]
    ImageConversion(String),
    #[error("No text detected in image")]
    NoTextDetected,
}

/// Bounding box coordinates (normalized 0-1, origin at bottom-left)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundingBox {
    pub x: f64,      // minX (left)
    pub y: f64,      // minY (bottom)
    pub width: f64,  // width
    pub height: f64, // height
}

/// OCR result with text and its position in the image
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrTextItem {
    pub text: String,
    pub bounding_box: BoundingBox,
    pub confidence: f64,
}

/// OCR result containing all detected text items with positions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrResult {
    pub items: Vec<OcrTextItem>,
    pub full_text: String, // Combined text for convenience
}

#[cfg(not(target_os = "macos"))]
pub fn extract_text_with_positions(_image_bytes: &[u8]) -> Result<OcrResult, OcrError> {
    Err(OcrError::Vision(
        "OCR not implemented for this platform".to_string(),
    ))
}
