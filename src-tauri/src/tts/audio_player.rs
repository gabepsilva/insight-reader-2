//! Minimal audio playback for TTS: rodio sink, no position tracking or FFT.

use std::io::Cursor;

use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};
use tracing::{debug, error, trace};

use super::TTSError;

/// Audio playback for TTS. Plays f32 samples via rodio; supports play and stop.
pub struct AudioPlayer {
    sample_rate: u32,
    _stream: Option<OutputStream>,
    stream_handle: Option<OutputStreamHandle>,
    sink: Option<Sink>,
    /// Current audio buffer (used by start_playback)
    audio_data: Vec<f32>,
}

impl AudioPlayer {
    /// Create a new audio player with the given sample rate.
    pub fn new(sample_rate: u32) -> Result<Self, TTSError> {
        trace!(sample_rate, "AudioPlayer::new");
        let (stream, stream_handle) = OutputStream::try_default().map_err(|e| {
            error!("Failed to open audio output: {e}");
            TTSError::AudioError(format!("Failed to open audio output: {e}"))
        })?;
        debug!(sample_rate, "Audio output stream initialized");
        Ok(Self {
            sample_rate,
            _stream: Some(stream),
            stream_handle: Some(stream_handle),
            sink: None,
            audio_data: Vec::new(),
        })
    }

    /// Load audio data and start playback. Audio should be normalized f32, -1.0 to 1.0.
    pub fn play_audio(&mut self, audio_data: Vec<f32>) -> Result<(), TTSError> {
        debug!(samples = audio_data.len(), "AudioPlayer::play_audio");
        self.audio_data = audio_data;
        self.start_playback()
    }

    /// Convert raw PCM bytes (16-bit signed LE mono) to normalized f32 samples.
    pub fn pcm_to_f32(pcm_bytes: &[u8]) -> Vec<f32> {
        pcm_bytes
            .chunks_exact(2)
            .map(|chunk| {
                let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                sample as f32 / 32768.0
            })
            .collect()
    }

    /// Stop playback and clear buffer.
    pub fn stop(&mut self) -> Result<(), TTSError> {
        trace!("AudioPlayer::stop");
        if let Some(sink) = self.sink.take() {
            sink.stop();
        }
        self.audio_data.clear();
        Ok(())
    }

    fn start_playback(&mut self) -> Result<(), TTSError> {
        trace!("AudioPlayer::start_playback");
        if let Some(sink) = self.sink.take() {
            sink.stop();
        }

        let stream_handle = self
            .stream_handle
            .as_ref()
            .ok_or_else(|| TTSError::AudioError("No audio output available".into()))?;

        if self.audio_data.is_empty() {
            return Err(TTSError::AudioError("No audio data to play".into()));
        }

        let samples_i16: Vec<i16> = self
            .audio_data
            .iter()
            .map(|&s| (s * 32767.0).clamp(-32768.0, 32767.0) as i16)
            .collect();

        let wav_data = Self::create_wav(&samples_i16, self.sample_rate);
        let cursor = Cursor::new(wav_data);
        let source = Decoder::new(cursor).map_err(|e| {
            error!("Failed to decode audio: {e}");
            TTSError::AudioError(format!("Failed to decode audio: {e}"))
        })?;

        let sink = Sink::try_new(stream_handle).map_err(|e| {
            error!("Failed to create audio sink: {e}");
            TTSError::AudioError(format!("Failed to create audio sink: {e}"))
        })?;

        sink.append(source);
        self.sink = Some(sink);
        Ok(())
    }

    fn create_wav(samples: &[i16], sample_rate: u32) -> Vec<u8> {
        let num_samples = samples.len();
        let data_size = num_samples * 2;
        let file_size = 36 + data_size;

        let mut wav = Vec::with_capacity(44 + data_size);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(file_size as u32).to_le_bytes());
        wav.extend_from_slice(b"WAVE");
        wav.extend_from_slice(b"fmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&sample_rate.to_le_bytes());
        wav.extend_from_slice(&(sample_rate * 2).to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&(data_size as u32).to_le_bytes());
        for &s in samples {
            wav.extend_from_slice(&s.to_le_bytes());
        }
        wav
    }
}
