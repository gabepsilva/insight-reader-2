//! Path utilities for cross-platform home directory resolution.

use std::env;
use std::path::PathBuf;

/// Gets the user's home directory.
///
/// On Unix-like systems (macOS, Linux), uses the `HOME` environment variable.
/// On Windows, tries `HOME` first (available on Windows 10+), then falls back to `USERPROFILE`.
///
/// # Returns
/// `Ok(PathBuf)` with the home directory path, or `Err(String)` if neither variable is set.
pub fn get_home_dir() -> Result<PathBuf, String> {
    // Try HOME first (works on all modern platforms including Windows 10+)
    if let Ok(home) = env::var("HOME") {
        return Ok(PathBuf::from(home));
    }

    // Windows fallback
    #[cfg(target_os = "windows")]
    {
        if let Ok(profile) = env::var("USERPROFILE") {
            return Ok(PathBuf::from(profile));
        }
    }

    Err("Could not determine home directory: HOME and USERPROFILE are not set".to_string())
}

/// Gets the base application data directory: `${HOME}/.insight-reader-2`
pub fn get_app_data_dir() -> Result<PathBuf, String> {
    Ok(get_home_dir()?.join(".insight-reader-2"))
}

/// Gets the OCR cache directory: `${HOME}/.insight-reader-2/cache`
pub fn get_cache_dir() -> Result<PathBuf, String> {
    Ok(get_app_data_dir()?.join("cache"))
}

/// Gets the Piper venv directory: `${HOME}/.insight-reader-2/venv`
pub fn get_venv_dir() -> Result<PathBuf, String> {
    Ok(get_app_data_dir()?.join("venv"))
}

/// Gets the Piper models directory: `${HOME}/.insight-reader-2/models`
pub fn get_models_dir() -> Result<PathBuf, String> {
    Ok(get_app_data_dir()?.join("models"))
}
