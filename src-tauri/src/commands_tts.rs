//! Tauri commands for TTS: speak, stop, pause, seek, volume, speed, provider.

use tauri::State;

use crate::tts;

/// Speaks the given text (Piper, Microsoft, or Polly). Fails if TTS is unavailable or text is empty.
/// Runs send+recv in spawn_blocking so the command thread does not block while synthesis runs.
#[tauri::command]
pub async fn tts_speak(state: State<'_, tts::TtsState>, text: String) -> Result<(), String> {
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::Speak(text, resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())?
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

/// Stops any ongoing TTS playback. No-op if TTS is unavailable.
#[tauri::command]
pub fn tts_stop(state: State<tts::TtsState>) -> Result<(), String> {
    state
        .inner()
        .send(tts::TtsRequest::Stop)
        .map_err(|e| format!("TTS channel: {e}"))?;
    Ok(())
}

/// Toggles pause state of TTS playback. Returns true if paused, false if playing.
#[tauri::command]
pub async fn tts_toggle_pause(state: State<'_, tts::TtsState>) -> Result<bool, String> {
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::TogglePause(resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())?
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

/// Gets the current TTS playback status. Returns (is_playing, is_paused).
#[tauri::command]
pub async fn tts_get_status(state: State<'_, tts::TtsState>) -> Result<(bool, bool), String> {
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::GetStatus(resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

/// Seeks TTS playback by the given offset in milliseconds.
/// Returns (success, at_start, at_end). Fails if paused or seeking is not supported.
#[tauri::command]
pub async fn tts_seek(
    state: State<'_, tts::TtsState>,
    offset_ms: i64,
) -> Result<(bool, bool, bool), String> {
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::Seek(offset_ms, resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())?
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

/// Gets the current playback position and total duration in milliseconds.
/// Returns (current_ms, total_ms).
#[tauri::command]
pub async fn tts_get_position(state: State<'_, tts::TtsState>) -> Result<(u64, u64), String> {
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::GetPosition(resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

/// Sets TTS playback volume as percentage from 0 to 100.
#[tauri::command]
pub async fn tts_set_volume(
    state: State<'_, tts::TtsState>,
    volume_percent: u8,
) -> Result<(), String> {
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::SetVolume(volume_percent, resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())?
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

/// Sets TTS playback speed (1.0 = normal). Takes effect immediately. Clamped to 0.25..=4.0.
#[tauri::command]
pub async fn tts_set_speed(state: State<'_, tts::TtsState>, speed: f64) -> Result<(), String> {
    let raw = speed as f32;
    let speed_f32 = if raw.is_finite() {
        raw.clamp(0.25, 4.0)
    } else {
        1.0
    };
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::SetSpeed(speed_f32, resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())?
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}

/// Switches the TTS provider. provider should be "piper", "microsoft", or "polly".
#[tauri::command]
pub async fn tts_switch_provider(
    state: State<'_, tts::TtsState>,
    provider: String,
) -> Result<(), String> {
    let provider = match provider.to_lowercase().as_str() {
        "piper" => tts::TtsProvider::Piper,
        "microsoft" => tts::TtsProvider::Microsoft,
        "polly" => tts::TtsProvider::Polly,
        _ => {
            return Err(format!(
                "Unknown provider: {}. Use 'piper', 'microsoft', or 'polly'.",
                provider
            ))
        }
    };
    let tx = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let (resp_tx, resp_rx) = std::sync::mpsc::sync_channel(0);
        tx.send(tts::TtsRequest::SwitchProvider(provider, resp_tx))
            .map_err(|e| format!("TTS channel: {e}"))?;
        resp_rx
            .recv()
            .map_err(|_| "TTS worker disconnected".to_string())?
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {e}"))?
}
