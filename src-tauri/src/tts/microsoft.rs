//! Microsoft Edge TTS provider: uses msedge-tts Rust crate for direct API calls.

use tracing::{debug, info, warn};

use super::audio_player::AudioPlayer;
use super::TTSError;

pub struct MicrosoftTTSProvider {
    player: AudioPlayer,
    voice: String,
}

impl MicrosoftTTSProvider {
    const WAV_HEADER_LEN: usize = 44;

    pub fn new(voice: Option<String>) -> Result<Self, TTSError> {
        info!("Initializing Microsoft Edge TTS provider");

        let player = AudioPlayer::new(24000)?;
        let voice = voice.unwrap_or_else(|| "en-US-AriaNeural".to_string());
        info!(voice = %voice, "Using Microsoft Edge TTS voice");
        Ok(Self { player, voice })
    }

    pub fn speak(&mut self, text: &str) -> Result<(), TTSError> {
        let text = text.trim();
        if text.is_empty() {
            warn!("Empty text provided to edge-tts, skipping synthesis");
            return Err(TTSError::ProcessError(
                "Cannot synthesize empty text".into(),
            ));
        }

        debug!(
            chars = text.len(),
            text_preview = %text.chars().take(50).collect::<String>(),
            voice = %self.voice,
            "Microsoft Edge: synthesizing speech"
        );

        self.player.stop()?;

        self.synthesize(text)?;

        info!("Microsoft Edge: audio generated and playing");

        Ok(())
    }

    fn synthesize(&mut self, text: &str) -> Result<(), TTSError> {
        let (audio_bytes, audio_format) = Self::synthesize_bytes(text, &self.voice)?;

        // Handle different audio formats
        if audio_format.starts_with("riff-") {
            // WAV format - skip header
            if audio_bytes.len() < Self::WAV_HEADER_LEN || &audio_bytes[0..4] != b"RIFF" {
                return Err(TTSError::ProcessError(
                    "Invalid WAV format from Edge TTS".into(),
                ));
            }
            let pcm_data = AudioPlayer::pcm_to_f32(&audio_bytes[Self::WAV_HEADER_LEN..]);
            self.player.play_audio(pcm_data)
        } else if Self::is_streaming_audio_format(&audio_format) {
            // MP3/Opus format - rodio will decode automatically
            self.player.play_audio_raw(audio_bytes, 24000)
        } else {
            Err(TTSError::ProcessError(format!(
                "Unsupported audio format: {}",
                audio_format
            )))
        }
    }

    fn is_streaming_audio_format(audio_format: &str) -> bool {
        audio_format.contains("mp3") || audio_format.contains("opus")
    }

    fn synthesize_bytes(text: &str, voice: &str) -> Result<(Vec<u8>, String), TTSError> {
        use msedge_tts::tts::client::connect;
        use msedge_tts::tts::SpeechConfig;

        let config = SpeechConfig {
            voice_name: voice.to_string(),
            audio_format: "audio-24khz-48kbitrate-mono-mp3".to_string(),
            pitch: 0,
            rate: 0,
            volume: 0,
        };

        debug!("Connecting to Edge TTS...");
        let mut client = connect()
            .map_err(|e| TTSError::ProcessError(format!("Failed to connect to Edge TTS: {}", e)))?;

        debug!("Synthesizing text: {}", text);
        let response = client
            .synthesize(text, &config)
            .map_err(|e| TTSError::ProcessError(format!("Edge TTS synthesis failed: {}", e)))?;

        debug!(
            "Response: audio_bytes len={}, format='{}'",
            response.audio_bytes.len(),
            response.audio_format
        );

        let audio_bytes = response.audio_bytes;
        let audio_format = response.audio_format;

        if audio_bytes.is_empty() {
            return Err(TTSError::ProcessError(
                "No audio data returned from Edge TTS".into(),
            ));
        }

        Ok((audio_bytes, audio_format))
    }

    pub fn stop(&mut self) -> Result<(), TTSError> {
        self.player.stop()
    }

    pub fn toggle_pause(&mut self) -> Result<bool, TTSError> {
        self.player.toggle_pause()
    }

    pub fn get_status(&self) -> (bool, bool) {
        self.player.get_status()
    }

    pub fn seek(&mut self, offset_ms: i64) -> Result<(bool, bool, bool), TTSError> {
        self.player.seek(offset_ms)
    }

    pub fn get_position(&self) -> (u64, u64) {
        self.player.get_position()
    }

    pub fn set_volume(&mut self, volume_percent: u8) {
        self.player.set_volume_percent(volume_percent);
    }

    pub fn set_speed(&mut self, speed: f32) {
        self.player.set_speed(speed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_edge_tts_synthesizes_audio_bytes() {
        let test_text = "Hello world, this is a test.";
        let (audio_bytes, audio_format) =
            MicrosoftTTSProvider::synthesize_bytes(test_text, "en-US-AriaNeural")
                .expect("Failed to synthesize speech");

        assert!(!audio_bytes.is_empty(), "Audio bytes should not be empty");
        assert!(
            audio_format.starts_with("riff-")
                || MicrosoftTTSProvider::is_streaming_audio_format(&audio_format),
            "Unexpected audio format from Edge TTS: {audio_format}"
        );
    }
}
