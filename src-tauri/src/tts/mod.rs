//! TTS (text-to-speech) module: Piper provider and audio playback.
//!
//! Piper/rodio are !Send on some platforms, so we run a dedicated worker thread
//! that owns the provider and receive commands via a channel. TtsState is the
//! Sender, which is Send.

mod audio_player;
mod microsoft;
mod piper;
mod polly;

use std::sync::mpsc;

use microsoft::MicrosoftTTSProvider;
use piper::PiperTTSProvider;
use polly::PollyTTSProvider;

/// Errors that can occur during TTS operations.
#[derive(Debug)]
pub enum TTSError {
    ProcessError(String),
    AudioError(String),
}

impl std::fmt::Display for TTSError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TTSError::ProcessError(s) => write!(f, "TTS process error: {s}"),
            TTSError::AudioError(s) => write!(f, "Audio error: {s}"),
        }
    }
}

impl std::error::Error for TTSError {}

/// Request to the TTS worker thread.
pub enum TtsRequest {
    Speak(String, mpsc::SyncSender<Result<(), TTSError>>),
    Stop,
    TogglePause(mpsc::SyncSender<Result<bool, TTSError>>),
    GetStatus(mpsc::SyncSender<(bool, bool)>),
    Seek(i64, mpsc::SyncSender<Result<(bool, bool, bool), TTSError>>),
    GetPosition(mpsc::SyncSender<(u64, u64)>),
    SetVolume(u8, mpsc::SyncSender<Result<(), TTSError>>),
    SetSpeed(f32, mpsc::SyncSender<Result<(), TTSError>>),
    SwitchProvider(TtsProvider, mpsc::SyncSender<Result<(), TTSError>>),
    Shutdown,
}

/// Sender to the TTS worker. The worker owns PiperTTSProvider (and rodio) on its thread.
pub type TtsState = mpsc::Sender<TtsRequest>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum TtsProvider {
    Piper,
    #[default]
    Microsoft,
    Polly,
}

#[derive(Clone, Debug, Default)]
struct TtsConfigSnapshot {
    provider: TtsProvider,
    selected_voice: Option<String>,
    selected_polly_voice: Option<String>,
    selected_microsoft_voice: Option<String>,
}

fn normalize_voice(value: Option<String>) -> Option<String> {
    value
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string())
}

fn load_tts_config() -> TtsConfigSnapshot {
    match crate::config::load_full_config() {
        Ok(cfg) => {
            let provider = match cfg.voice_provider.as_deref() {
                Some("piper") => TtsProvider::Piper,
                Some("polly") => TtsProvider::Polly,
                Some("microsoft") => TtsProvider::Microsoft,
                _ => TtsProvider::default(),
            };
            TtsConfigSnapshot {
                provider,
                selected_voice: normalize_voice(cfg.selected_voice),
                selected_polly_voice: normalize_voice(cfg.selected_polly_voice),
                selected_microsoft_voice: normalize_voice(cfg.selected_microsoft_voice),
            }
        }
        Err(err) => {
            tracing::warn!(error = %err, "Failed to load config, using default TTS settings");
            TtsConfigSnapshot::default()
        }
    }
}

pub fn check_polly_credentials() -> Result<(), String> {
    PollyTTSProvider::check_credentials()
}

enum TtsProviderImpl {
    Piper(PiperTTSProvider),
    Microsoft(MicrosoftTTSProvider),
    Polly(PollyTTSProvider),
}

impl TtsProviderImpl {
    fn new(provider: TtsProvider, config: &TtsConfigSnapshot) -> Result<Self, TTSError> {
        match provider {
            TtsProvider::Piper => Ok(Self::Piper(PiperTTSProvider::new(
                config.selected_voice.clone(),
            )?)),
            TtsProvider::Microsoft => Ok(Self::Microsoft(MicrosoftTTSProvider::new(
                config.selected_microsoft_voice.clone(),
            )?)),
            TtsProvider::Polly => {
                if let Err(e) = PollyTTSProvider::check_credentials() {
                    return Err(TTSError::ProcessError(e));
                }
                Ok(Self::Polly(PollyTTSProvider::new(
                    config.selected_polly_voice.clone(),
                )?))
            }
        }
    }

    fn speak(&mut self, text: &str) -> Result<(), TTSError> {
        match self {
            Self::Piper(p) => p.speak(text),
            Self::Microsoft(p) => p.speak(text),
            Self::Polly(p) => p.speak(text),
        }
    }

    fn stop(&mut self) -> Result<(), TTSError> {
        match self {
            Self::Piper(p) => p.stop(),
            Self::Microsoft(p) => p.stop(),
            Self::Polly(p) => p.stop(),
        }
    }

    fn toggle_pause(&mut self) -> Result<bool, TTSError> {
        match self {
            Self::Piper(p) => p.toggle_pause(),
            Self::Microsoft(p) => p.toggle_pause(),
            Self::Polly(p) => p.toggle_pause(),
        }
    }

    fn get_status(&self) -> (bool, bool) {
        match self {
            Self::Piper(p) => p.get_status(),
            Self::Microsoft(p) => p.get_status(),
            Self::Polly(p) => p.get_status(),
        }
    }

    fn seek(&mut self, offset_ms: i64) -> Result<(bool, bool, bool), TTSError> {
        match self {
            Self::Piper(p) => p.seek(offset_ms),
            Self::Microsoft(p) => p.seek(offset_ms),
            Self::Polly(p) => p.seek(offset_ms),
        }
    }

    fn get_position(&self) -> (u64, u64) {
        match self {
            Self::Piper(p) => p.get_position(),
            Self::Microsoft(p) => p.get_position(),
            Self::Polly(p) => p.get_position(),
        }
    }

    fn set_volume(&mut self, volume_percent: u8) {
        match self {
            Self::Piper(p) => p.set_volume(volume_percent),
            Self::Microsoft(p) => p.set_volume(volume_percent),
            Self::Polly(p) => p.set_volume(volume_percent),
        }
    }

    fn set_speed(&mut self, speed: f32) {
        match self {
            Self::Piper(p) => p.set_speed(speed),
            Self::Microsoft(p) => p.set_speed(speed),
            Self::Polly(p) => p.set_speed(speed),
        }
    }
}

/// Spawn the TTS worker and return the channel sender to manage.
pub fn create_tts_state() -> TtsState {
    let (tx, rx) = mpsc::channel();
    let mut config_snapshot = load_tts_config();
    let default_provider = config_snapshot.provider;

    std::thread::spawn(move || {
        tracing::info!(provider = ?default_provider, "Initializing TTS worker");
        let mut current_volume_percent: u8 = 100;
        let mut provider = match TtsProviderImpl::new(default_provider, &config_snapshot) {
            Ok(p) => {
                tracing::info!("TTS worker initialized successfully");
                p
            }
            Err(e) => {
                tracing::warn!(error = %e, "TTS not available: provider init failed");
                loop {
                    match rx.recv() {
                        Ok(TtsRequest::Speak(_, resp)) => {
                            let _ = resp.send(Err(TTSError::ProcessError(
                                "TTS not available: provider could not be initialized.".into(),
                            )));
                        }
                        Ok(TtsRequest::Stop) => {}
                        Ok(TtsRequest::TogglePause(resp)) => {
                            let _ = resp.send(Err(TTSError::ProcessError(
                                "TTS not available: provider could not be initialized.".into(),
                            )));
                        }
                        Ok(TtsRequest::GetStatus(resp)) => {
                            let _ = resp.send((false, false));
                        }
                        Ok(TtsRequest::Seek(_, resp)) => {
                            let _ = resp.send(Err(TTSError::ProcessError(
                                "TTS not available: provider could not be initialized.".into(),
                            )));
                        }
                        Ok(TtsRequest::GetPosition(resp)) => {
                            let _ = resp.send((0, 0));
                        }
                        Ok(TtsRequest::SetVolume(_, resp)) => {
                            let _ = resp.send(Err(TTSError::ProcessError(
                                "TTS not available: provider could not be initialized.".into(),
                            )));
                        }
                        Ok(TtsRequest::SetSpeed(_, resp)) => {
                            let _ = resp.send(Err(TTSError::ProcessError(
                                "TTS not available: provider could not be initialized.".into(),
                            )));
                        }
                        Ok(TtsRequest::SwitchProvider(_, resp)) => {
                            let _ = resp.send(Err(TTSError::ProcessError(
                                "TTS not available: provider could not be initialized.".into(),
                            )));
                        }
                        Ok(TtsRequest::Shutdown) => break,
                        Err(_) => break,
                    }
                }
                return;
            }
        };
        while let Ok(req) = rx.recv() {
            match req {
                TtsRequest::Speak(text, resp) => {
                    let new_config = load_tts_config();
                    let current_provider = new_config.provider;
                    let provider_variant = match provider {
                        TtsProviderImpl::Piper(_) => TtsProvider::Piper,
                        TtsProviderImpl::Microsoft(_) => TtsProvider::Microsoft,
                        TtsProviderImpl::Polly(_) => TtsProvider::Polly,
                    };
                    let provider_changed = current_provider != provider_variant;
                    let voice_changed = match current_provider {
                        TtsProvider::Piper => {
                            new_config.selected_voice != config_snapshot.selected_voice
                        }
                        TtsProvider::Polly => {
                            new_config.selected_polly_voice != config_snapshot.selected_polly_voice
                        }
                        TtsProvider::Microsoft => {
                            new_config.selected_microsoft_voice
                                != config_snapshot.selected_microsoft_voice
                        }
                    };

                    if provider_changed || voice_changed {
                        tracing::info!(
                            old = ?provider_variant,
                            new = ?current_provider,
                            provider_changed,
                            voice_changed,
                            "TTS config changed, reloading provider"
                        );
                        match TtsProviderImpl::new(current_provider, &new_config) {
                            Ok(mut new_provider) => {
                                new_provider.set_volume(current_volume_percent);
                                provider = new_provider;
                                config_snapshot = new_config;
                            }
                            Err(e) => {
                                let _ = resp.send(Err(e));
                                continue;
                            }
                        }
                    }
                    let result = provider.speak(&text);
                    if let Err(ref e) = result {
                        tracing::error!(error = %e, "TTS speak failed");
                    }
                    let _ = resp.send(result);
                }
                TtsRequest::Stop => {
                    let _ = provider.stop();
                }
                TtsRequest::TogglePause(resp) => {
                    let _ = resp.send(provider.toggle_pause());
                }
                TtsRequest::GetStatus(resp) => {
                    let _ = resp.send(provider.get_status());
                }
                TtsRequest::Seek(offset_ms, resp) => {
                    let _ = resp.send(provider.seek(offset_ms));
                }
                TtsRequest::GetPosition(resp) => {
                    let _ = resp.send(provider.get_position());
                }
                TtsRequest::SetVolume(volume_percent, resp) => {
                    current_volume_percent = volume_percent;
                    provider.set_volume(volume_percent);
                    let _ = resp.send(Ok(()));
                }
                TtsRequest::SetSpeed(speed, resp) => {
                    provider.set_speed(speed);
                    let _ = resp.send(Ok(()));
                }
                TtsRequest::SwitchProvider(new_provider, resp) => {
                    let _ = provider.stop();
                    let new_config = load_tts_config();
                    match TtsProviderImpl::new(new_provider, &new_config) {
                        Ok(mut new_provider) => {
                            new_provider.set_volume(current_volume_percent);
                            provider = new_provider;
                            config_snapshot = new_config;
                            let _ = resp.send(Ok(()));
                        }
                        Err(e) => {
                            let _ = resp.send(Err(e));
                        }
                    }
                }
                TtsRequest::Shutdown => {
                    let _ = provider.stop();
                    break;
                }
            }
        }
    });

    tx
}
