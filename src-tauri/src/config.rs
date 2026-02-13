//! Persistent configuration handling for Insight Reader.
//!
//! Persists configuration in a JSON file:
//! `~/.config/insight-reader/config.json`.

use std::fs;
use std::io;
use std::path::PathBuf;

use dirs::config_dir;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{debug, error, warn};

use crate::tts::TtsProvider;

const APP_CONFIG_DIR_NAME: &str = "insight-reader";
const CONFIG_FILE_NAME: &str = "config.json";

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("IO error: {0}")]
    Io(#[from] io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("No config directory available on this platform")]
    NoConfigDir,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    #[default]
    Info,
    Debug,
    Trace,
}

impl LogLevel {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_ascii_uppercase().as_str() {
            "ERROR" => Some(Self::Error),
            "WARN" | "WARNING" => Some(Self::Warn),
            "INFO" => Some(Self::Info),
            "DEBUG" => Some(Self::Debug),
            "TRACE" => Some(Self::Trace),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Error => "ERROR",
            Self::Warn => "WARN",
            Self::Info => "INFO",
            Self::Debug => "DEBUG",
            Self::Trace => "TRACE",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OcrBackend {
    #[default]
    Default,
    #[serde(rename = "better_ocr")]
    BetterOcr,
}

impl OcrBackend {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "default" => Some(Self::Default),
            "better_ocr" => Some(Self::BetterOcr),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::BetterOcr => "better_ocr",
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HotkeyConfig {
    pub modifiers: String,
    pub key: String,
}

impl HotkeyConfig {
    pub fn default_modifiers() -> Self {
        #[cfg(target_os = "macos")]
        let modifiers = "command".to_string();
        #[cfg(not(target_os = "macos"))]
        let modifiers = "control".to_string();

        Self {
            modifiers,
            key: "r".to_string(),
        }
    }
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
    ocr_backend: Option<String>,
    #[serde(default)]
    hotkey_enabled: Option<bool>,
    #[serde(default)]
    hotkey_modifiers: Option<String>,
    #[serde(default)]
    hotkey_key: Option<String>,
}

fn config_path() -> Option<PathBuf> {
    let path = config_dir()?
        .join(APP_CONFIG_DIR_NAME)
        .join(CONFIG_FILE_NAME);
    Some(path)
}

fn ensure_config_dir_exists(path: &std::path::Path) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(())
}

fn load_raw_config() -> Result<RawConfig, ConfigError> {
    let Some(path) = config_path() else {
        debug!("No config_dir available, using defaults only");
        return Ok(RawConfig::default());
    };

    if !path.exists() {
        debug!(?path, "Config file does not exist, using defaults");
        return Ok(RawConfig::default());
    }

    let data = fs::read_to_string(&path)?;
    let cfg = serde_json::from_str(&data)?;
    debug!(?path, "Config loaded");
    Ok(cfg)
}

fn save_raw_config(mut cfg: RawConfig) -> Result<(), ConfigError> {
    let Some(path) = config_path() else {
        warn!("No config_dir available, skipping save");
        return Ok(());
    };

    ensure_config_dir_exists(&path)?;
    cfg.selected_polly_voice = cfg.selected_polly_voice.filter(|s| !s.is_empty());
    cfg.voice_provider = cfg.voice_provider.filter(|s| !s.is_empty());
    cfg.log_level = cfg.log_level.filter(|s| !s.is_empty());
    cfg.selected_voice = cfg.selected_voice.filter(|s| !s.is_empty());
    cfg.ocr_backend = cfg.ocr_backend.filter(|s| !s.is_empty());
    cfg.hotkey_modifiers = cfg.hotkey_modifiers.filter(|s| !s.is_empty());
    cfg.hotkey_key = cfg.hotkey_key.filter(|s| !s.is_empty());

    let data = serde_json::to_string_pretty(&cfg)?;
    fs::write(&path, data)?;
    debug!(?path, "Config saved");
    Ok(())
}

fn load_or_default_config() -> RawConfig {
    match load_raw_config() {
        Ok(cfg) => cfg,
        Err(err) => {
            warn!(error = ?err, "Failed to load existing config, starting fresh");
            RawConfig::default()
        }
    }
}

fn provider_from_str(s: &str) -> Option<TtsProvider> {
    match s {
        "piper" => Some(TtsProvider::Piper),
        "microsoft" => Some(TtsProvider::Microsoft),
        "polly" => Some(TtsProvider::Polly),
        _ => None,
    }
}

fn provider_to_str(provider: TtsProvider) -> &'static str {
    match provider {
        TtsProvider::Piper => "piper",
        TtsProvider::Microsoft => "microsoft",
        TtsProvider::Polly => "polly",
    }
}

pub fn load_voice_provider() -> TtsProvider {
    match load_raw_config() {
        Ok(cfg) => cfg
            .voice_provider
            .as_deref()
            .and_then(provider_from_str)
            .unwrap_or(TtsProvider::default()),
        Err(err) => {
            warn!(error = ?err, "Failed to load config, using default voice provider");
            TtsProvider::default()
        }
    }
}

pub fn save_voice_provider(provider: TtsProvider) {
    debug!(?provider, "Saving voice provider");
    let mut cfg = load_or_default_config();
    cfg.voice_provider = Some(provider_to_str(provider).to_string());
    if let Err(err) = save_raw_config(cfg) {
        error!(error = ?err, "Failed to save config");
    }
}

pub fn load_log_level() -> LogLevel {
    match load_raw_config() {
        Ok(cfg) => cfg
            .log_level
            .as_deref()
            .and_then(LogLevel::from_str)
            .unwrap_or(LogLevel::Info),
        Err(err) => {
            eprintln!("Config: failed to load config, using default log level: {err:?}");
            LogLevel::Info
        }
    }
}

pub fn save_log_level(level: LogLevel) {
    debug!(?level, "Saving log level");
    let mut cfg = load_or_default_config();
    cfg.log_level = Some(level.as_str().to_string());
    if let Err(err) = save_raw_config(cfg) {
        error!(error = ?err, "Failed to save config");
    }
}

pub fn load_text_cleanup_enabled() -> bool {
    match load_raw_config() {
        Ok(cfg) => cfg.text_cleanup_enabled.unwrap_or(false),
        Err(err) => {
            warn!(error = ?err, "Failed to load config, text cleanup disabled by default");
            false
        }
    }
}

pub fn save_text_cleanup_enabled(enabled: bool) {
    debug!(enabled, "Saving text cleanup enabled");
    let mut cfg = load_or_default_config();
    cfg.text_cleanup_enabled = Some(enabled);
    if let Err(err) = save_raw_config(cfg) {
        error!(error = ?err, "Failed to save config");
    }
}

pub fn load_selected_voice() -> Option<String> {
    match load_raw_config() {
        Ok(cfg) => cfg.selected_voice.filter(|s| !s.is_empty()),
        Err(err) => {
            warn!(error = ?err, "Failed to load config, no voice selected");
            None
        }
    }
}

pub fn save_selected_voice(voice_key: String) {
    debug!(voice_key = %voice_key, "Saving selected voice");
    let mut cfg = load_or_default_config();
    cfg.selected_voice = Some(voice_key);
    if let Err(err) = save_raw_config(cfg) {
        error!(error = ?err, "Failed to save config");
    }
}

pub fn load_selected_polly_voice() -> Option<String> {
    match load_raw_config() {
        Ok(cfg) => cfg.selected_polly_voice.filter(|s| !s.is_empty()),
        Err(err) => {
            warn!(error = ?err, "Failed to load config, no AWS voice selected");
            None
        }
    }
}

pub fn save_selected_polly_voice(voice_id: String) {
    debug!(voice_id = %voice_id, "Saving selected AWS Polly voice");
    let mut cfg = load_or_default_config();
    cfg.selected_polly_voice = Some(voice_id);
    if let Err(err) = save_raw_config(cfg) {
        error!(error = ?err, "Failed to save config");
    }
}

pub fn load_ocr_backend() -> OcrBackend {
    match load_raw_config() {
        Ok(cfg) => cfg
            .ocr_backend
            .and_then(|s| OcrBackend::from_str(&s))
            .unwrap_or(OcrBackend::Default),
        Err(err) => {
            warn!(error = ?err, "Failed to load config, using default OCR backend");
            OcrBackend::Default
        }
    }
}

pub fn save_ocr_backend(backend: OcrBackend) {
    debug!(?backend, "Saving OCR backend");
    let mut cfg = load_or_default_config();
    cfg.ocr_backend = Some(backend.as_str().to_string());
    if let Err(err) = save_raw_config(cfg) {
        error!(error = ?err, "Failed to save config");
    }
}

pub fn load_hotkey_config() -> (HotkeyConfig, bool) {
    match load_raw_config() {
        Ok(cfg) => {
            let enabled = cfg.hotkey_enabled.unwrap_or(true);
            let default = HotkeyConfig::default_modifiers();
            let modifiers = cfg
                .hotkey_modifiers
                .as_deref()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .unwrap_or(default.modifiers);
            let key = cfg
                .hotkey_key
                .as_deref()
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .unwrap_or(default.key);
            (HotkeyConfig { modifiers, key }, enabled)
        }
        Err(err) => {
            warn!(error = ?err, "Failed to load hotkey config, using defaults");
            (HotkeyConfig::default_modifiers(), true)
        }
    }
}

pub fn save_hotkey_config(config: &HotkeyConfig, enabled: bool) {
    debug!(?config, enabled, "Saving hotkey config");
    let mut cfg = load_or_default_config();
    cfg.hotkey_enabled = Some(enabled);
    cfg.hotkey_modifiers = Some(config.modifiers.clone());
    cfg.hotkey_key = Some(config.key.clone());
    if let Err(err) = save_raw_config(cfg) {
        error!(error = ?err, "Failed to save hotkey config");
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FullConfig {
    pub voice_provider: Option<String>,
    pub log_level: Option<String>,
    pub text_cleanup_enabled: Option<bool>,
    pub selected_voice: Option<String>,
    pub selected_polly_voice: Option<String>,
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
