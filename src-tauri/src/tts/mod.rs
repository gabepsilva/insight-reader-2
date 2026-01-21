//! TTS (text-to-speech) module: Piper provider and audio playback.
//!
//! Piper/rodio are !Send on some platforms, so we run a dedicated worker thread
//! that owns the provider and receive commands via a channel. TtsState is the
//! Sender, which is Send.

mod audio_player;
mod piper;

use std::sync::mpsc;

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
}

/// Sender to the TTS worker. The worker owns PiperTTSProvider (and rodio) on its thread.
pub type TtsState = mpsc::Sender<TtsRequest>;

/// Spawn the TTS worker and return the channel sender to manage.
pub fn create_tts_state() -> TtsState {
    let (tx, rx) = mpsc::channel();

    std::thread::spawn(move || {
        let mut provider = match PiperTTSProvider::new() {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!(error = %e, "TTS not available: Piper init failed");
                loop {
                    match rx.recv() {
                        Ok(TtsRequest::Speak(_, resp)) => {
                            let _ = resp.send(Err(TTSError::ProcessError(
                                "TTS not available: Piper could not be initialized.".into(),
                            )));
                        }
                        Ok(TtsRequest::Stop) => {}
                        Err(_) => break,
                    }
                }
                return;
            }
        };
        while let Ok(req) = rx.recv() {
            match req {
                TtsRequest::Speak(text, resp) => {
                    let _ = resp.send(provider.speak(&text));
                }
                TtsRequest::Stop => {
                    let _ = provider.stop();
                }
            }
        }
    });

    tx
}
