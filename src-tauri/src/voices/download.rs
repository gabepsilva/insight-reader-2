//! Voice download functionality for Piper TTS.
//!
//! Downloads voice model files (.onnx and .onnx.json) from GitHub releases.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tokio::fs;
use tokio::io::AsyncWriteExt;
use tracing::{debug, error, info};

use crate::voices::VoiceInfo;

const GITHUB_BASE_URL: &str = "https://github.com/rhasspy/piper-voices/releases/download";
const PIPER_RELEASES_VERSION: &str = "v1.1.0";

static DOWNLOAD_PROGRESS: Mutex<Option<DownloadProgress>> = Mutex::new(None);

#[derive(Debug, Clone, serde::Serialize)]
pub struct DownloadProgress {
    pub voice_key: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub current_file: String,
}

impl DownloadProgress {
    pub fn percentage(&self) -> f64 {
        if self.total_bytes == 0 {
            0.0
        } else {
            (self.downloaded_bytes as f64 / self.total_bytes as f64) * 100.0
        }
    }
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

pub fn set_download_progress(progress: DownloadProgress) {
    if let Ok(mut guard) = DOWNLOAD_PROGRESS.lock() {
        *guard = Some(progress);
    }
}

pub fn clear_download_progress() {
    if let Ok(mut guard) = DOWNLOAD_PROGRESS.lock() {
        *guard = None;
    }
}

pub fn get_current_progress() -> Option<DownloadProgress> {
    DOWNLOAD_PROGRESS
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
}

pub async fn download_voice(voice_key: &str, voice_info: &VoiceInfo) -> Result<PathBuf, String> {
    info!(voice_key = %voice_key, "Starting voice download");

    let language = voice_info.language.code.split('-').next().unwrap_or("en");
    let voice_dir = get_voice_directory(language, voice_key)?;

    fs::create_dir_all(&voice_dir)
        .await
        .map_err(|e| format!("Failed to create voice directory: {}", e))?;

    let files_to_download = vec![
        format!("{}.onnx", voice_key),
        format!("{}.onnx.json", voice_key),
    ];

    let total_files = files_to_download.len();
    let mut total_bytes: u64 = 0;
    let mut downloaded_bytes: u64 = 0;

    for filename in &files_to_download {
        let github_path = format!(
            "{}/{}/{}/{}",
            language, voice_key, PIPER_RELEASES_VERSION, filename
        );
        let url = format!("{}/{}", GITHUB_BASE_URL, github_path);
        let dest_path = voice_dir.join(filename);

        info!(
            file = %filename,
            url = %url,
            "Downloading voice file"
        );

        set_download_progress(DownloadProgress {
            voice_key: voice_key.to_string(),
            downloaded_bytes,
            total_bytes: 0,
            current_file: filename.clone(),
        });

        match download_file(&url, &dest_path).await {
            Ok(bytes) => {
                downloaded_bytes += bytes;
                total_bytes += bytes;
                debug!(file = %filename, bytes = bytes, "Downloaded file");
            }
            Err(e) => {
                error!(file = %filename, error = %e, "Failed to download file");
                clear_download_progress();
                return Err(format!("Failed to download {}: {}", filename, e));
            }
        }
    }

    clear_download_progress();

    info!(
        voice_key = %voice_key,
        path = %voice_dir.display(),
        files = total_files,
        total_bytes = total_bytes,
        "Voice download completed"
    );

    Ok(voice_dir)
}

async fn download_file(url: &str, path: &Path) -> Result<u64, String> {
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

    Ok(downloaded)
}

pub fn is_voice_downloaded(voice_key: &str, language_code: &str) -> bool {
    let language = language_code.split('-').next().unwrap_or("en");
    let voice_dir = match get_voice_directory(language, voice_key) {
        Ok(dir) => dir,
        Err(_) => return false,
    };

    let onnx_path = voice_dir.join(format!("{}.onnx", voice_key));
    let json_path = voice_dir.join(format!("{}.onnx.json", voice_key));

    onnx_path.exists() && json_path.exists()
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
