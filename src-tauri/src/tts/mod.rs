//! TTS (text-to-speech) module: Piper provider and audio playback.
//!
//! Piper/rodio are !Send on some platforms, so we run a dedicated worker thread
//! that owns the provider and receive commands via a channel. TtsState is the
//! Sender, which is Send.

mod audio_player;
mod microsoft;
mod piper;

use std::sync::mpsc;

use microsoft::MicrosoftTTSProvider;
use piper::PiperTTSProvider;

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
}

enum TtsProviderImpl {
    Piper(PiperTTSProvider),
    Microsoft(MicrosoftTTSProvider),
}

impl TtsProviderImpl {
    fn new(provider: TtsProvider) -> Result<Self, TTSError> {
        match provider {
            TtsProvider::Piper => Ok(Self::Piper(PiperTTSProvider::new()?)),
            TtsProvider::Microsoft => Ok(Self::Microsoft(MicrosoftTTSProvider::new()?)),
        }
    }

    fn speak(&mut self, text: &str) -> Result<(), TTSError> {
        match self {
            Self::Piper(p) => p.speak(text),
            Self::Microsoft(p) => p.speak(text),
        }
    }

    fn stop(&mut self) -> Result<(), TTSError> {
        match self {
            Self::Piper(p) => p.stop(),
            Self::Microsoft(p) => p.stop(),
        }
    }

    fn toggle_pause(&mut self) -> Result<bool, TTSError> {
        match self {
            Self::Piper(p) => p.toggle_pause(),
            Self::Microsoft(p) => p.toggle_pause(),
        }
    }

    fn get_status(&self) -> (bool, bool) {
        match self {
            Self::Piper(p) => p.get_status(),
            Self::Microsoft(p) => p.get_status(),
        }
    }

    fn seek(&mut self, offset_ms: i64) -> Result<(bool, bool, bool), TTSError> {
        match self {
            Self::Piper(p) => p.seek(offset_ms),
            Self::Microsoft(p) => p.seek(offset_ms),
        }
    }

    fn get_position(&self) -> (u64, u64) {
        match self {
            Self::Piper(p) => p.get_position(),
            Self::Microsoft(p) => p.get_position(),
        }
    }
}

/// Spawn the TTS worker and return the channel sender to manage.
pub fn create_tts_state() -> TtsState {
    let (tx, rx) = mpsc::channel();
    let default_provider = TtsProvider::default();

    std::thread::spawn(move || {
        tracing::info!(provider = ?default_provider, "Initializing TTS worker");
        let mut provider = match TtsProviderImpl::new(default_provider) {
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
                TtsRequest::SwitchProvider(new_provider, resp) => {
                    let _ = provider.stop();
                    match TtsProviderImpl::new(new_provider) {
                        Ok(new_provider) => {
                            provider = new_provider;
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
