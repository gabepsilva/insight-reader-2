//! Tauri commands for voice listing and Piper voice download.

use crate::voices;
use crate::voices::download::{
    get_current_progress, list_downloaded_voices as list_local_downloaded_voices, DownloadProgress,
    DownloadedVoice,
};

#[tauri::command]
pub async fn list_piper_voices() -> Result<Vec<voices::VoiceInfo>, String> {
    let voices = voices::fetch_piper_voices(false).await?;
    Ok(voices.into_values().collect())
}

#[tauri::command]
pub async fn refresh_piper_voices() -> Result<Vec<voices::VoiceInfo>, String> {
    let voices = voices::fetch_piper_voices(true).await?;
    Ok(voices.into_values().collect())
}

#[tauri::command]
pub async fn list_polly_voices() -> Result<Vec<voices::PollyVoiceInfo>, String> {
    voices::fetch_polly_voices().await
}

#[tauri::command]
pub async fn list_microsoft_voices() -> Result<Vec<voices::MicrosoftVoiceInfo>, String> {
    voices::fetch_microsoft_voices().await
}

#[tauri::command]
pub async fn download_voice(voice_key: String) -> Result<String, String> {
    let voices = voices::fetch_piper_voices(false).await?;
    let voice_info = voices
        .get(&voice_key)
        .ok_or_else(|| format!("Voice not found: {}", voice_key))?;

    // If files are empty, force refresh to get the full data with files
    if voice_info.files.is_empty() {
        let voices = voices::fetch_piper_voices(true).await?;
        let voice_info = voices
            .get(&voice_key)
            .ok_or_else(|| format!("Voice not found: {}", voice_key))?;
        let path = voices::download::download_voice(&voice_key, voice_info).await?;
        return Ok(path.to_string_lossy().to_string());
    }

    let path = voices::download::download_voice(&voice_key, voice_info).await?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_download_progress() -> Option<DownloadProgress> {
    get_current_progress()
}

#[tauri::command]
pub fn list_downloaded_voices() -> Result<Vec<DownloadedVoice>, String> {
    list_local_downloaded_voices()
}
