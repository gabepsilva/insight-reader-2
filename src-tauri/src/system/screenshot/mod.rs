//! Screenshot capture functionality

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "macos")]
pub use macos::{capture_screenshot, ScreenshotError};

#[cfg(not(target_os = "macos"))]
use thiserror::Error;

#[cfg(not(target_os = "macos"))]
use thiserror::Error;

#[cfg(not(target_os = "macos"))]
#[derive(Error, Debug)]
#[error("Screenshot capture not implemented for this platform")]
pub struct ScreenshotError;

#[cfg(not(target_os = "macos"))]
pub fn capture_screenshot() -> Result<(Vec<u8>, std::path::PathBuf), ScreenshotError> {
    Err(ScreenshotError)
}
