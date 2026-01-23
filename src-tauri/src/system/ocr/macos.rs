//! macOS-specific OCR implementation using Swift script with Vision framework

use super::{BoundingBox, OcrError, OcrResult, OcrTextItem};
use crate::paths;
use serde_json;
use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;
use tracing::{debug, error, info, warn};

/// Extracts text from an image using macOS Vision framework via Swift script.
///
/// # Arguments
/// * `image_bytes` - The image data (PNG, JPEG, etc.)
///
/// # Returns
/// The extracted text as a string, or an error if OCR fails.
#[allow(dead_code)] // Kept for potential future use
fn extract_text_from_image(image_bytes: &[u8]) -> Result<String, OcrError> {
    debug!(bytes = image_bytes.len(), "Starting OCR on image");

    // Create temporary file for the image
    let temp_dir = env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| OcrError::ImageConversion(format!("Failed to get timestamp: {}", e)))?
        .as_nanos();
    let temp_image_path = temp_dir.join(format!("insight-reader-ocr-{}.png", timestamp));

    // Write image bytes to temporary file
    fs::write(&temp_image_path, image_bytes).map_err(|e| {
        OcrError::ImageConversion(format!("Failed to write temp image file: {}", e))
    })?;

    debug!(path = %temp_image_path.display(), "Wrote image to temp file");

    // Find the Swift script path: try multiple locations
    let script_path = find_swift_script()
        .map_err(|e| OcrError::Vision(format!("Swift script not found: {}", e)))?;

    debug!(script = %script_path.display(), "Using Swift script for text extraction");

    // Execute Swift script
    let output = Command::new("swift")
        .arg(&script_path)
        .arg(temp_image_path.as_os_str())
        .output()
        .map_err(|e| OcrError::Vision(format!("Failed to execute swift command: {}", e)))?;

    // Clean up temporary image file
    if let Err(e) = fs::remove_file(&temp_image_path) {
        warn!(error = %e, path = %temp_image_path.display(), "Failed to remove temporary image file");
    } else {
        debug!(path = %temp_image_path.display(), "Cleaned up temporary image file");
    }

    // Check if the command succeeded
    if !output.status.success() {
        let exit_code = output.status.code().unwrap_or(-1);
        let stderr = String::from_utf8_lossy(&output.stderr);

        // Exit code 1 might mean "no text found" (which is not an error)
        // Check if stderr contains an actual error message
        if exit_code == 1 && stderr.trim().is_empty() {
            warn!("No text found in image");
            return Err(OcrError::NoTextDetected);
        }

        error!(
            code = exit_code,
            stderr = %stderr.trim(),
            "Text extraction failed"
        );
        return Err(OcrError::Vision(format!(
            "Text extraction failed: {}",
            stderr.trim()
        )));
    }

    // Preserve all newlines from OCR output - only trim trailing newline from script output
    let extracted_text = String::from_utf8_lossy(&output.stdout)
        .trim_end()
        .to_string();

    if extracted_text.is_empty() {
        warn!("No text found in image");
        return Err(OcrError::NoTextDetected);
    }

    info!(chars = extracted_text.len(), "OCR completed successfully");
    debug!(text = %extracted_text.chars().take(100).collect::<String>(), "Extracted text preview");

    Ok(extracted_text)
}

/// Extracts text from an image with bounding box positions using macOS Vision framework via Swift script.
///
/// # Arguments
/// * `image_bytes` - The image data (PNG, JPEG, etc.)
///
/// # Returns
/// An `OcrResult` containing text items with their positions and confidence scores, or an error if OCR fails.
pub fn extract_text_with_positions(image_bytes: &[u8]) -> Result<OcrResult, OcrError> {
    debug!(
        bytes = image_bytes.len(),
        "Starting OCR with positions on image"
    );

    // Get cache directory: ${HOME}/.insight-reader-2/cache
    let cache_dir = paths::get_cache_dir()
        .map_err(|e| OcrError::ImageConversion(format!("Failed to get cache directory: {}", e)))?;

    // Create cache directory if it doesn't exist
    fs::create_dir_all(&cache_dir).map_err(|e| {
        OcrError::ImageConversion(format!("Failed to create cache directory: {}", e))
    })?;

    // Create image file in cache directory
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| OcrError::ImageConversion(format!("Failed to get timestamp: {}", e)))?
        .as_nanos();
    let image_path = cache_dir.join(format!("ocr-{}.png", timestamp));

    // Write image bytes to cache file
    fs::write(&image_path, image_bytes)
        .map_err(|e| OcrError::ImageConversion(format!("Failed to write image file: {}", e)))?;

    debug!(path = %image_path.display(), "Wrote image to cache file");

    // Find the Swift script path: try multiple locations
    let script_path = find_swift_script()
        .map_err(|e| OcrError::Vision(format!("Swift script not found: {}", e)))?;

    debug!(script = %script_path.display(), "Found Swift script for text extraction with positions");

    // find_swift_script already returns a canonicalized path, so we only need to canonicalize image_path
    // (which we just created)
    let image_path = image_path
        .canonicalize()
        .map_err(|e| OcrError::Vision(format!("Failed to canonicalize image path: {}", e)))?;

    debug!(
        script = %script_path.display(),
        image = %image_path.display(),
        "Executing Swift script with --json flag"
    );

    // Execute Swift script with --json flag
    let output = Command::new("swift")
        .arg(&script_path)
        .arg(&image_path)
        .arg("--json")
        .output()
        .map_err(|e| {
            error!(error = %e, "Failed to execute swift command");
            OcrError::Vision(format!("Failed to execute swift command: {}", e))
        })?;

    // Log command output for debugging
    if !output.stdout.is_empty() {
        debug!(stdout_len = output.stdout.len(), "Swift script stdout");
    }
    if !output.stderr.is_empty() {
        debug!(stderr = %String::from_utf8_lossy(&output.stderr), "Swift script stderr");
    }

    // Check if the command succeeded
    if !output.status.success() {
        let exit_code = output.status.code().unwrap_or(-1);
        let stderr = String::from_utf8_lossy(&output.stderr);

        // Exit code 1 might mean "no text found" (which is not an error)
        // Check if stderr contains an actual error message
        if exit_code == 1 && stderr.trim().is_empty() {
            warn!("No text found in image");
            return Err(OcrError::NoTextDetected);
        }

        error!(
            code = exit_code,
            stderr = %stderr.trim(),
            "Text extraction failed"
        );
        return Err(OcrError::Vision(format!(
            "Text extraction failed: {}",
            stderr.trim()
        )));
    }

    // Parse JSON output
    let json_output = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&json_output).map_err(|e| {
        let preview = json_output.chars().take(200).collect::<String>();
        OcrError::Vision(format!(
            "Failed to parse JSON output: {}. Preview: {}",
            e,
            if json_output.len() > 200 {
                format!("{}...", preview)
            } else {
                preview
            }
        ))
    })?;

    // Extract items and full_text from JSON
    let items_array = json
        .get("items")
        .and_then(|v| v.as_array())
        .ok_or_else(|| OcrError::Vision("Invalid JSON: missing 'items' array".to_string()))?;

    let mut ocr_items = Vec::new();
    for item in items_array {
        let text = item
            .get("text")
            .and_then(|v| v.as_str())
            .ok_or_else(|| OcrError::Vision("Invalid JSON: missing 'text' in item".to_string()))?
            .to_string();

        let bbox_obj = item
            .get("bounding_box")
            .and_then(|v| v.as_object())
            .ok_or_else(|| {
                OcrError::Vision("Invalid JSON: missing 'bounding_box' in item".to_string())
            })?;

        // Validate and clamp bounding box coordinates to valid range [0.0, 1.0]
        // Vision framework returns normalized coordinates (0-1), but we validate to be safe
        let x = bbox_obj
            .get("x")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0)
            .clamp(0.0, 1.0);
        let y = bbox_obj
            .get("y")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0)
            .clamp(0.0, 1.0);
        let width = bbox_obj
            .get("width")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0)
            .clamp(0.0, 1.0);
        let height = bbox_obj
            .get("height")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0)
            .clamp(0.0, 1.0);

        // Ensure x + width and y + height don't exceed 1.0
        let width = width.min(1.0 - x);
        let height = height.min(1.0 - y);

        let bbox = BoundingBox {
            x,
            y,
            width,
            height,
        };

        let confidence = item
            .get("confidence")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);

        ocr_items.push(OcrTextItem {
            text,
            bounding_box: bbox,
            confidence,
        });
    }

    if ocr_items.is_empty() {
        warn!("No text found in image");
        return Err(OcrError::NoTextDetected);
    }

    let full_text = json
        .get("full_text")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            // Fallback: combine all item texts
            ocr_items
                .iter()
                .map(|item| item.text.as_str())
                .collect::<Vec<_>>()
                .join(" ")
        });

    debug!(
        items = ocr_items.len(),
        chars = full_text.len(),
        "OCR with positions completed successfully"
    );

    // Clean up cache image file after successful OCR
    if let Err(e) = fs::remove_file(&image_path) {
        warn!(error = %e, path = %image_path.display(), "Failed to remove cache image file");
        // Don't fail the operation if cleanup fails
    } else {
        debug!(path = %image_path.display(), "Cleaned up cache image file");
    }

    Ok(OcrResult {
        items: ocr_items,
        full_text,
    })
}

/// Finds the Swift script in various possible locations.
/// Prioritizes the install/ directory (development) over system installation.
fn find_swift_script() -> Result<std::path::PathBuf, String> {
    // Strategy: Find project root by looking for install/ directory
    // Try multiple approaches to find the project root

    // 1. Try from executable path (most reliable for Tauri apps)
    if let Ok(exe_path) = env::current_exe() {
        // Navigate up from executable to find project root
        // Typical structure: target/debug/insight-reader-2 or target/release/insight-reader-2
        let mut current = exe_path.parent();
        while let Some(dir) = current {
            let install_script = dir.join("install/extract_text_from_image.swift");
            if install_script.exists() {
                return Ok(install_script
                    .canonicalize()
                    .map_err(|e| format!("Failed to canonicalize script path: {}", e))?);
            }
            let parent = dir.parent();
            // Stop if we've gone too far up (e.g., reached /)
            if parent.is_none() || parent == Some(dir) {
                break;
            }
            current = parent;
        }
    }

    // 2. Try from current working directory
    if let Ok(current_dir) = env::current_dir() {
        let script = current_dir.join("install/extract_text_from_image.swift");
        if script.exists() {
            return Ok(script
                .canonicalize()
                .map_err(|e| format!("Failed to canonicalize script path: {}", e))?);
        }
        // If we're in src-tauri, go up one level
        if current_dir.ends_with("src-tauri") {
            if let Some(project_root) = current_dir.parent() {
                let script = project_root.join("install/extract_text_from_image.swift");
                if script.exists() {
                    return Ok(script
                        .canonicalize()
                        .map_err(|e| format!("Failed to canonicalize script path: {}", e))?);
                }
            }
        }
    }

    // Try executable directory and app bundle locations (for development and distribution)
    if let Ok(exe_path) = env::current_exe() {
        // Try executable directory
        if let Some(dir) = exe_path.parent() {
            let script = dir.join("extract_text_from_image.swift");
            if script.exists() {
                return Ok(script
                    .canonicalize()
                    .map_err(|e| format!("Failed to canonicalize script path: {}", e))?);
            }
        }

        // Try parent of executable directory
        if let Some(dir) = exe_path.parent().and_then(|p| p.parent()) {
            let script = dir.join("extract_text_from_image.swift");
            if script.exists() {
                return Ok(script
                    .canonicalize()
                    .map_err(|e| format!("Failed to canonicalize script path: {}", e))?);
            }
        }

        // Try app bundle Resources directory (if running from app bundle)
        if let Some(macos_dir) = exe_path.parent() {
            if let Some(contents) = macos_dir.parent() {
                let script = contents
                    .join("Resources")
                    .join("extract_text_from_image.swift");
                if script.exists() {
                    return Ok(script
                        .canonicalize()
                        .map_err(|e| format!("Failed to canonicalize script path: {}", e))?);
                }
            }
        }
    }

    // Try standard installation directory (old version - may not have --json support)
    // Note: This is checked last to prefer the updated version in install/
    if let Ok(home) = env::var("HOME") {
        let script = Path::new(&home)
            .join(".local")
            .join("share")
            .join("insight-reader")
            .join("bin")
            .join("extract_text_from_image.swift");
        if script.exists() {
            warn!(path = %script.display(), "Using old script from system installation - may not support --json");
            return Ok(script
                .canonicalize()
                .map_err(|e| format!("Failed to canonicalize script path: {}", e))?);
        }
    }

    Err("extract_text_from_image.swift script not found in any expected location".to_string())
}
