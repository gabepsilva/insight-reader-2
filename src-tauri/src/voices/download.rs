//! Voice download functionality for Piper TTS.
//!
//! Downloads voice model files (.onnx and .onnx.json) from HuggingFace.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tokio::fs;
use tokio::io::AsyncWriteExt;
use tracing::{debug, info};

use crate::voices::VoiceInfo;

const HUGGINGFACE_BASE_URL: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main";

static DOWNLOAD_PROGRESS: Mutex<Option<DownloadProgress>> = Mutex::new(None);

#[derive(Debug, Clone, serde::Serialize)]
pub struct DownloadProgress {
    pub voice_key: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub current_file: String,
}

fn get_voices_base_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    Ok(home
        .join(".local")
        .join("share")
        .join("insight-reader")
        .join("voices"))
}

fn get_voice_directory(language: &str, voice_name: &str) -> Result<PathBuf, String> {
    Ok(get_voices_base_dir()?.join(language).join(voice_name))
}

pub fn get_current_progress() -> Option<DownloadProgress> {
    DOWNLOAD_PROGRESS
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
}

pub async fn download_voice(voice_key: &str, voice_info: &VoiceInfo) -> Result<PathBuf, String> {
    info!(voice_key = %voice_key, "Starting voice download");

    let voice_dir = get_voice_directory(&voice_info.language.code, voice_key)?;
    fs::create_dir_all(&voice_dir)
        .await
        .map_err(|e| format!("Failed to create voice directory: {}", e))?;

    let onnx_file = voice_info
        .files
        .iter()
        .find(|(path, _)| path.ends_with(".onnx") && !path.ends_with(".onnx.json"))
        .ok_or_else(|| format!("No .onnx file found for voice {voice_key}"))?;

    let json_file = voice_info
        .files
        .iter()
        .find(|(path, _)| path.ends_with(".onnx.json"))
        .ok_or_else(|| format!("No .onnx.json file found for voice {voice_key}"))?;

    download_file(
        &format!("{}/{}", HUGGINGFACE_BASE_URL, onnx_file.0),
        &voice_dir.join(format!("{}.onnx", voice_key)),
    )
    .await?;

    download_file(
        &format!("{}/{}", HUGGINGFACE_BASE_URL, json_file.0),
        &voice_dir.join(format!("{}.onnx.json", voice_key)),
    )
    .await?;

    info!(
        voice_key = %voice_key,
        path = %voice_dir.display(),
        "Voice download completed"
    );
    Ok(voice_dir)
}

async fn download_file(url: &str, path: &Path) -> Result<(), String> {
    debug!(url = %url, path = %path.display(), "Starting file download");

    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch {}: {}", url, e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch {}: HTTP {}",
            url,
            response.status()
        ));
    }

    let total_size = response.content_length().unwrap_or(0);

    let mut file = fs::File::create(path)
        .await
        .map_err(|e| format!("Failed to create file {}: {}", path.display(), e))?;

    let mut downloaded: u64 = 0;

    let mut stream = response.bytes_stream();

    use futures_util::stream::StreamExt;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write to file: {}", e))?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            if let Ok(mut guard) = DOWNLOAD_PROGRESS.lock() {
                if let Some(progress) = guard.as_mut() {
                    progress.downloaded_bytes = downloaded;
                    progress.total_bytes = total_size;
                }
            }
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush file: {}", e))?;

    debug!(
        path = %path.display(),
        bytes = downloaded,
        "File downloaded successfully"
    );

    Ok(())
}

pub fn list_downloaded_voices() -> Result<Vec<DownloadedVoice>, String> {
    use std::fs;

    let base_dir = get_voices_base_dir()?;
    let mut voices = Vec::new();

    if !base_dir.exists() {
        return Ok(voices);
    }

    let read_dir =
        fs::read_dir(&base_dir).map_err(|e| format!("Failed to read voices directory: {}", e))?;

    for lang_result in read_dir {
        let lang_entry = match lang_result {
            Ok(e) => e,
            Err(_) => continue,
        };
        let lang_path = lang_entry.path();
        if !lang_path.is_dir() {
            continue;
        }

        let language = lang_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("en");

        let voice_read_dir = match fs::read_dir(&lang_path) {
            Ok(r) => r,
            Err(_) => continue,
        };

        for voice_result in voice_read_dir {
            let voice_entry = match voice_result {
                Ok(e) => e,
                Err(_) => continue,
            };
            let voice_path = voice_entry.path();
            if !voice_path.is_dir() {
                continue;
            }

            let voice_name = voice_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");

            let onnx_path = voice_path.join(format!("{}.onnx", voice_name));
            let json_path = voice_path.join(format!("{}.onnx.json", voice_name));

            if onnx_path.exists() && json_path.exists() {
                voices.push(DownloadedVoice {
                    key: voice_name.to_string(),
                    language: language.to_string(),
                    path: voice_path,
                });
            }
        }
    }

    Ok(voices)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DownloadedVoice {
    pub key: String,
    pub language: String,
    pub path: PathBuf,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_voices_base_dir() {
        let result = get_voices_base_dir();
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_voice_directory() {
        let result = get_voice_directory("en", "en_US-lessac-medium");
        assert!(result.is_ok());
        let path = result.unwrap();
        assert!(path.to_string_lossy().ends_with("en/en_US-lessac-medium"));
    }
}
