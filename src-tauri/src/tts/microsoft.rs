//! Microsoft Edge TTS provider: uses msedge-tts Rust crate for direct API calls.

use tracing::{debug, info, warn};

use super::audio_player::AudioPlayer;
use super::TTSError;

pub struct MicrosoftTTSProvider {
    player: AudioPlayer,
    voice: String,
    rate: String,
    volume: String,
}

impl MicrosoftTTSProvider {
    pub fn new() -> Result<Self, TTSError> {
        info!("Initializing Microsoft Edge TTS provider");

        let player = AudioPlayer::new(24000)?;
        Ok(Self {
            player,
            voice: "en-US-AriaNeural".to_string(),
            rate: "+0%".to_string(),
            volume: "+0%".to_string(),
        })
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
        use msedge_tts::tts::client::connect;
        use msedge_tts::tts::SpeechConfig;

        let config = SpeechConfig {
            voice_name: self.voice.clone(),
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

        if audio_bytes.is_empty() {
            return Err(TTSError::ProcessError(
                "No audio data returned from Edge TTS".into(),
            ));
        }

        // Handle different audio formats
        if response.audio_format.starts_with("riff-") {
            // WAV format - skip header
            if audio_bytes.len() < 44 || &audio_bytes[0..4] != b"RIFF" {
                return Err(TTSError::ProcessError(
                    "Invalid WAV format from Edge TTS".into(),
                ));
            }
            let pcm_data = AudioPlayer::pcm_to_f32(&audio_bytes[44..]);
            self.player.play_audio(pcm_data)
        } else if response.audio_format.contains("mp3") || response.audio_format.contains("opus") {
            // MP3/Opus format - rodio will decode automatically
            self.player.play_audio_raw(audio_bytes, 24000)
        } else {
            Err(TTSError::ProcessError(format!(
                "Unsupported audio format: {}",
                response.audio_format
            )))
        }
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_edge_tts_synthesizes_audio() {
        // Initialize provider
        let mut provider = MicrosoftTTSProvider::new().expect("Failed to create provider");

        // Speak short text (~3 seconds)
        let test_text = "Hello world, this is a test.";
        provider
            .speak(test_text)
            .expect("Failed to synthesize speech");

        // Check status indicates playing
        let (is_playing, _) = provider.get_status();
        assert!(is_playing, "Audio should be playing");
    }
}
