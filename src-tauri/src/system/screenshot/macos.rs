//! macOS-specific screenshot implementation using screencapture command

use std::fs;
use std::process::Command;
use thiserror::Error;
use tracing::{debug, error, info};

#[derive(Error, Debug)]
pub enum ScreenshotError {
    #[error("Failed to create temporary file: {0}")]
    TempFile(std::io::Error),
    #[error("Failed to execute screencapture command: {0}")]
    CommandExecution(String),
    #[error("Failed to read screenshot file: {0}")]
    ReadFile(std::io::Error),
    #[error("Screenshot selection cancelled by user")]
    Cancelled,
}

/// Captures a screenshot region on macOS using interactive selection.
/// Shows a crosshair cursor for the user to select a region.
/// Returns the screenshot as PNG bytes and the path to the temporary file.
/// The caller is responsible for cleaning up the temporary file.
pub fn capture_screenshot() -> Result<(Vec<u8>, std::path::PathBuf), ScreenshotError> {
    debug!("Starting interactive screenshot region selection");

    // Create temporary file path for the screenshot
    let temp_dir = std::env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| {
            ScreenshotError::TempFile(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to get timestamp: {}", e),
            ))
        })?
        .as_nanos();
    let temp_path = temp_dir.join(format!("insight-reader-screenshot-{}.png", timestamp));

    debug!(path = %temp_path.display(), "Screenshot will be saved to temp file");

    // Execute screencapture with -i flag for interactive region selection
    // -i: interactive mode (shows crosshair for region selection)
    // -x: disable sound
    // The user can press Escape to cancel
    let output = Command::new("screencapture")
        .arg("-i")
        .arg("-x")
        .arg(&temp_path)
        .output()
        .map_err(|e| {
            ScreenshotError::CommandExecution(format!("Failed to execute screencapture: {}", e))
        })?;

    // Check if the command succeeded
    if !output.status.success() {
        let exit_code = output.status.code().unwrap_or(-1);
        let stderr = String::from_utf8_lossy(&output.stderr);

        // Exit code 1 typically means user cancelled (Escape key)
        if exit_code == 1 {
            debug!("User cancelled screenshot selection");
            return Err(ScreenshotError::Cancelled);
        }

        let error_msg = if stderr.trim().is_empty() {
            format!("screencapture failed with exit code {}", exit_code)
        } else {
            format!("screencapture failed: {}", stderr.trim())
        };
        error!(error = %error_msg, "Screenshot capture failed");
        return Err(ScreenshotError::CommandExecution(error_msg));
    }

    // Verify the file was actually created
    if !temp_path.exists() {
        error!(path = %temp_path.display(), "Screenshot file was not created");
        return Err(ScreenshotError::CommandExecution(
            "Screenshot file was not created".to_string(),
        ));
    }

    // Read the screenshot file
    let image_bytes = fs::read(&temp_path).map_err(ScreenshotError::ReadFile)?;

    info!(
        bytes = image_bytes.len(),
        path = %temp_path.display(),
        "Screenshot captured successfully"
    );
    Ok((image_bytes, temp_path))
}
