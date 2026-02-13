//! Persistent configuration handling for Insight Reader.
//!
//! Persists configuration in a JSON file:
//! `~/.config/insight-reader/config.json`.

use std::fs;
use std::path::PathBuf;

use dirs::config_dir;
use serde::{Deserialize, Serialize};
use tracing::debug;

const APP_CONFIG_DIR_NAME: &str = "insight-reader";
const CONFIG_FILE_NAME: &str = "config.json";

fn config_path() -> Option<PathBuf> {
    let path = config_dir()?
        .join(APP_CONFIG_DIR_NAME)
        .join(CONFIG_FILE_NAME);
    Some(path)
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct RawConfig {
    #[serde(default)]
    voice_provider: Option<String>,
    #[serde(default)]
    log_level: Option<String>,
    #[serde(default)]
    text_cleanup_enabled: Option<bool>,
    #[serde(default)]
    selected_voice: Option<String>,
    #[serde(default)]
    selected_polly_voice: Option<String>,
    #[serde(default)]
    selected_microsoft_voice: Option<String>,
    #[serde(default)]
    ocr_backend: Option<String>,
    #[serde(default)]
    hotkey_enabled: Option<bool>,
    #[serde(default)]
    hotkey_modifiers: Option<String>,
    #[serde(default)]
    hotkey_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FullConfig {
    pub voice_provider: Option<String>,
    pub log_level: Option<String>,
    pub text_cleanup_enabled: Option<bool>,
    pub selected_voice: Option<String>,
    pub selected_polly_voice: Option<String>,
    pub selected_microsoft_voice: Option<String>,
    pub ocr_backend: Option<String>,
    pub hotkey_enabled: Option<bool>,
    pub hotkey_modifiers: Option<String>,
    pub hotkey_key: Option<String>,
}

impl From<RawConfig> for FullConfig {
    fn from(raw: RawConfig) -> Self {
        Self {
            voice_provider: raw.voice_provider,
            log_level: raw.log_level,
            text_cleanup_enabled: raw.text_cleanup_enabled,
            selected_voice: raw.selected_voice,
            selected_polly_voice: raw.selected_polly_voice,
            selected_microsoft_voice: raw.selected_microsoft_voice,
            ocr_backend: raw.ocr_backend,
            hotkey_enabled: raw.hotkey_enabled,
            hotkey_modifiers: raw.hotkey_modifiers,
            hotkey_key: raw.hotkey_key,
        }
    }
}

impl From<FullConfig> for RawConfig {
    fn from(json: FullConfig) -> Self {
        Self {
            voice_provider: json.voice_provider,
            log_level: json.log_level,
            text_cleanup_enabled: json.text_cleanup_enabled,
            selected_voice: json.selected_voice,
            selected_polly_voice: json.selected_polly_voice,
            selected_microsoft_voice: json.selected_microsoft_voice,
            ocr_backend: json.ocr_backend,
            hotkey_enabled: json.hotkey_enabled,
            hotkey_modifiers: json.hotkey_modifiers,
            hotkey_key: json.hotkey_key,
        }
    }
}

pub fn load_full_config() -> Result<FullConfig, String> {
    let path = config_path().ok_or("No config directory available")?;
    if !path.exists() {
        return Ok(FullConfig::default());
    }
    let data = fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
    let raw: RawConfig =
        serde_json::from_str(&data).map_err(|e| format!("Failed to parse config: {}", e))?;
    Ok(raw.into())
}

pub fn save_full_config(config: FullConfig) -> Result<(), String> {
    let path = config_path().ok_or("No config directory available")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    let raw: RawConfig = config.into();
    let data = serde_json::to_string_pretty(&raw)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, data).map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}
