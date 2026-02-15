//! AWS Polly TTS provider using the official AWS SDK.

use aws_config::BehaviorVersion;
use aws_sdk_polly::types::{Engine, OutputFormat, VoiceId};
use tracing::{debug, info, warn};

use super::audio_player::AudioPlayer;
use super::TTSError;

const CREDENTIALS_ERROR_MSG: &str = "AWS credentials not found. Please configure credentials via:\n  - Environment variables: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY\n  - Or credentials file: ~/.aws/credentials";

pub struct PollyTTSProvider {
    client: aws_sdk_polly::Client,
    player: AudioPlayer,
    runtime: tokio::runtime::Runtime,
    voice_id: String,
    engine: Engine,
}

impl PollyTTSProvider {
    pub fn new(selected_voice: Option<String>) -> Result<Self, TTSError> {
        info!("Initializing AWS Polly TTS provider");

        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .map_err(|e| TTSError::ProcessError(format!("Failed to create tokio runtime: {e}")))?;

        let region = Self::detect_aws_region();
        debug!(region = %region, "Using AWS region");

        let config = runtime.block_on(async {
            aws_config::defaults(BehaviorVersion::latest())
                .region(aws_config::Region::new(region))
                .load()
                .await
        });

        let client = aws_sdk_polly::Client::new(&config);
        debug!("AWS Polly client created");

        let player = AudioPlayer::new(16000)?;

        let voice_id = selected_voice
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "Matthew".to_string());

        Ok(Self {
            client,
            player,
            runtime,
            voice_id,
            engine: Engine::Neural,
        })
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
            if let Ok(content) = std::fs::read_to_string(&config_path) {
                for line in content.lines() {
                    let line = line.trim();
                    if line.starts_with("region") {
                        if let Some(region) = line.split('=').nth(1) {
                            let region = region.trim().to_string();
                            if !region.is_empty() {
                                return region;
                            }
                        }
                    }
                }
            }
        }
        "us-east-1".to_string()
    }

    pub fn check_credentials() -> Result<(), String> {
        if std::env::var("AWS_ACCESS_KEY_ID").is_ok()
            && std::env::var("AWS_SECRET_ACCESS_KEY").is_ok()
        {
            return Ok(());
        }

        if let Some(home) = dirs::home_dir() {
            let credentials_path = home.join(".aws").join("credentials");
            if credentials_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&credentials_path) {
                    let profile =
                        std::env::var("AWS_PROFILE").unwrap_or_else(|_| "default".to_string());
                    let section_header = if profile == "default" {
                        "[default]".to_string()
                    } else {
                        format!("[profile {}]", profile)
                    };

                    if Self::parse_credentials_from_section(&content, &section_header) {
                        return Ok(());
                    }
                }
            }
        }

        Err(CREDENTIALS_ERROR_MSG.to_string())
    }

    fn parse_credentials_from_section(content: &str, section_header: &str) -> bool {
        let mut in_section = false;
        let mut has_access_key = false;
        let mut has_secret_key = false;

        for line in content.lines() {
            let line = line.trim();
            if line.starts_with('[') {
                in_section = line.eq_ignore_ascii_case(section_header);
                continue;
            }
            if in_section {
                if line.starts_with("aws_access_key_id") {
                    if let Some(value) = line.split('=').nth(1) {
                        if !value.trim().is_empty() {
                            has_access_key = true;
                        }
                    }
                } else if line.starts_with("aws_secret_access_key") {
                    if let Some(value) = line.split('=').nth(1) {
                        if !value.trim().is_empty() {
                            has_secret_key = true;
                        }
                    }
                }
            }
        }

        has_access_key && has_secret_key
    }

    pub fn speak(&mut self, text: &str) -> Result<(), TTSError> {
        let text = text.trim();
        if text.is_empty() {
            warn!("Empty text provided to Polly, skipping synthesis");
            return Err(TTSError::ProcessError(
                "Cannot synthesize empty text".into(),
            ));
        }

        debug!(
            chars = text.len(),
            text_preview = %text.chars().take(50).collect::<String>(),
            "Polly: synthesizing speech"
        );

        self.player.stop()?;

        let audio_bytes = self.runtime.block_on(async {
            let response = self
                .client
                .synthesize_speech()
                .text(text)
                .output_format(OutputFormat::Pcm)
                .voice_id(VoiceId::from(self.voice_id.as_str()))
                .engine(self.engine.clone())
                .sample_rate("16000")
                .send()
                .await
                .map_err(|_| TTSError::ProcessError("AWS Polly API error".to_string()))?;

            let audio_stream = response.audio_stream;
            let bytes = audio_stream
                .collect()
                .await
                .map_err(|e| TTSError::ProcessError(format!("Failed to read audio stream: {e}")))?;

            Ok::<_, TTSError>(bytes.into_bytes().to_vec())
        })?;

        if audio_bytes.is_empty() {
            return Err(TTSError::ProcessError(
                "No audio data generated by AWS Polly".into(),
            ));
        }

        let audio_data = AudioPlayer::pcm_to_f32(&audio_bytes);
        let duration_sec = audio_data.len() as f32 / 16000.0;
        info!(
            samples = audio_data.len(),
            duration_sec = format!("{:.1}", duration_sec),
            "Polly: audio generated and playing"
        );

        self.player.play_audio(audio_data)
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
