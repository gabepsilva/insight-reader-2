//! Voice listing functionality for Piper and Polly TTS providers.
//!
//! This module handles fetching and managing available voices from:
//! - Piper: Fetches from piper-voices.com API with local caching
//! - Polly: Uses AWS SDK to list available voices

pub mod download;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, error, trace};

const PIPER_VOICES_API_URL: &str = "https://piper-voices.com/api/v1";
const CACHE_FILE_NAME: &str = "voices.json";
const CACHE_TTL_SECS: u64 = 24 * 60 * 60; // 24 hours

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceInfo {
    pub key: String,
    pub name: String,
    pub language: LanguageInfo,
    pub quality: String,
    pub num_speakers: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageInfo {
    pub code: String,
    pub family: String,
    pub region: String,
    pub name_english: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PollyVoiceInfo {
    pub id: String,
    pub name: String,
    pub language_code: String,
    pub gender: String,
    pub engine: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MicrosoftVoiceInfo {
    pub name: String,
    pub short_name: String,
    pub gender: String,
    pub language: String,
    pub language_code: String,
    pub status: String,
    pub voice_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CacheMetadata {
    fetched_at: u64,
}

fn get_cache_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    Ok(home.join(".cache").join("insight-reader"))
}

fn get_cache_path() -> Result<PathBuf, String> {
    Ok(get_cache_dir()?.join(CACHE_FILE_NAME))
}

fn ensure_cache_dir() -> Result<(), String> {
    let cache_dir = get_cache_dir()?;
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to create cache directory: {}", e))?;
    }
    Ok(())
}

fn get_current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn is_cache_valid(metadata: &CacheMetadata) -> bool {
    let now = get_current_timestamp();
    now.saturating_sub(metadata.fetched_at) < CACHE_TTL_SECS
}

pub async fn fetch_piper_voices() -> Result<HashMap<String, VoiceInfo>, String> {
    debug!("Fetching Piper voices from piper-voices.com API");

    // Check cache first
    if let Ok(Some(v)) = get_cached_voices() {
        debug!("Using cached Piper voices");
        return Ok(v);
    }

    // Fetch from API
    let response = reqwest::get(PIPER_VOICES_API_URL)
        .await
        .map_err(|e| format!("Failed to fetch Piper voices: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch Piper voices: HTTP {}",
            response.status()
        ));
    }

    let json_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    debug!(bytes = json_text.len(), "Received Piper voices response");

    let voices: HashMap<String, VoiceInfo> = serde_json::from_str(&json_text)
        .map_err(|e| format!("Failed to parse voices JSON: {}", e))?;

    // Cache the response
    if let Err(e) = cache_voices(&voices) {
        error!("Failed to cache Piper voices: {}", e);
    }

    debug!(count = voices.len(), "Parsed Piper voices");
    Ok(voices)
}

fn get_cached_voices() -> Result<Option<HashMap<String, VoiceInfo>>, String> {
    let cache_path = get_cache_path()?;

    if !cache_path.exists() {
        return Ok(None);
    }

    let content =
        fs::read_to_string(&cache_path).map_err(|e| format!("Failed to read cache file: {}", e))?;

    let cached: HashMap<String, VoiceInfo> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse cached voices: {}", e))?;

    Ok(Some(cached))
}

fn cache_voices(voices: &HashMap<String, VoiceInfo>) -> Result<(), String> {
    ensure_cache_dir()?;

    let cache_path = get_cache_path()?;
    let json = serde_json::to_string_pretty(voices)
        .map_err(|e| format!("Failed to serialize voices for cache: {}", e))?;

    fs::write(&cache_path, json).map_err(|e| format!("Failed to write cache file: {}", e))?;

    debug!("Cached Piper voices to {:?}", cache_path);
    Ok(())
}

pub async fn fetch_polly_voices() -> Result<Vec<PollyVoiceInfo>, String> {
    debug!("Fetching Polly voices from AWS");

    let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(aws_config::Region::new(detect_aws_region()))
        .load()
        .await;

    let client = aws_sdk_polly::Client::new(&config);

    let response = client
        .describe_voices()
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Polly voices: {}", e))?;

    let aws_voices = response.voices();
    let mut voices: Vec<PollyVoiceInfo> = Vec::new();

    for voice in aws_voices {
        let voice_id = voice.id().map(|v| v.as_str().to_string());
        let name = voice.name().map(|n| n.to_string());
        let language_code = voice.language_code().map(|l| l.as_str().to_string());
        let gender = voice.gender().map(|g| format!("{:?}", g));
        let supported_engines = voice.supported_engines();

        trace!(
            id = voice_id.as_deref().unwrap_or("<none>"),
            name = name.as_deref().unwrap_or("<none>"),
            language_code = language_code.as_deref().unwrap_or("<none>"),
            gender = gender.as_deref().unwrap_or("<none>"),
            engines = ?supported_engines,
            "AWS Polly: raw voice from DescribeVoices"
        );

        if let (Some(id), Some(lang_code)) = (voice_id, language_code) {
            for engine in supported_engines {
                let engine_str = format!("{:?}", engine);

                voices.push(PollyVoiceInfo {
                    id: id.clone(),
                    name: name.clone().unwrap_or_else(|| id.clone()),
                    language_code: lang_code.clone(),
                    gender: gender.clone().unwrap_or_else(|| "Unknown".to_string()),
                    engine: engine_str,
                });
            }
        }
    }

    debug!(count = voices.len(), "Fetched Polly voices");
    Ok(voices)
}

pub async fn fetch_microsoft_voices() -> Result<Vec<MicrosoftVoiceInfo>, String> {
    debug!("Fetching Microsoft Edge TTS voices");

    let voices = msedge_tts::voice::get_voices_list()
        .map_err(|e| format!("Failed to fetch Microsoft voices: {}", e))?;

    debug!(count = voices.len(), "Raw Microsoft voices fetched");

    let result: Vec<MicrosoftVoiceInfo> = voices
        .into_iter()
        .map(|v| MicrosoftVoiceInfo {
            name: v.name,
            short_name: v.short_name.unwrap_or_default(),
            gender: v.gender.unwrap_or_default(),
            language: v.locale.clone().unwrap_or_default(),
            language_code: v
                .locale
                .unwrap_or_default()
                .replace("en-US", "English (US)")
                .replace("en-GB", "English (UK)")
                .replace("es-ES", "Spanish (Spain)")
                .replace("es-MX", "Spanish (Mexico)")
                .replace("pt-BR", "Portuguese (Brazil)")
                .replace("pt-PT", "Portuguese (Portugal)")
                .replace("zh-CN", "Chinese (Simplified)")
                .replace("zh-TW", "Chinese (Traditional)"),
            status: v.status.unwrap_or_default(),
            voice_type: format!("{:?}", v.voice_tag),
        })
        .collect();

    debug!(count = result.len(), "Fetched Microsoft voices");
    Ok(result)
}

fn detect_aws_region() -> String {
    if let Ok(region) = std::env::var("AWS_REGION") {
        if !region.is_empty() {
            return region;
        }
    }
    if let Ok(region) = std::env::var("AWS_DEFAULT_REGION") {
        if !region.is_empty() {
            return region;
        }
    }

    if let Some(home) = dirs::home_dir() {
        let config_path = home.join(".aws").join("config");
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Some(region) = parse_aws_config_region(&content) {
                return region;
            }
        }
    }

    "us-east-1".to_string()
}

fn parse_aws_config_region(content: &str) -> Option<String> {
    let profile = std::env::var("AWS_PROFILE").unwrap_or_else(|_| "default".to_string());
    let section_header = if profile == "default" {
        "[default]".to_string()
    } else {
        format!("[profile {}]", profile)
    };

    let mut in_section = false;
    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_section = line.eq_ignore_ascii_case(&section_header);
            continue;
        }
        if in_section && line.starts_with("region") {
            if let Some(value) = line.split('=').nth(1) {
                let region = value.trim();
                if !region.is_empty() {
                    return Some(region.to_string());
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_ttl() {
        let old_timestamp = get_current_timestamp() - CACHE_TTL_SECS - 1;
        let metadata = CacheMetadata {
            fetched_at: old_timestamp,
        };
        assert!(!is_cache_valid(&metadata));

        let recent_timestamp = get_current_timestamp() - 3600;
        let metadata = CacheMetadata {
            fetched_at: recent_timestamp,
        };
        assert!(is_cache_valid(&metadata));
    }
}
