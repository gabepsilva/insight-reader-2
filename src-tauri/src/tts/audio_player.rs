//! Minimal audio playback for TTS: rodio sink, no position tracking or FFT.

use std::io::Cursor;
use std::time::Duration;

use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink, Source};
use tracing::{debug, error, trace, warn};

use super::TTSError;

/// Audio playback for TTS. Plays f32 samples via rodio; supports play and stop.
pub struct AudioPlayer {
    sample_rate: u32,
    _stream: Option<OutputStream>,
    stream_handle: Option<OutputStreamHandle>,
    sink: Option<Sink>,
    /// Current audio buffer (used by start_playback)
    audio_data: Vec<f32>,
    /// Total duration in milliseconds (for raw audio)
    total_duration_ms: u64,
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
            total_duration_ms: 0,
        })
    }

    /// Load audio data and start playback. Audio should be normalized f32, -1.0 to 1.0.
    pub fn play_audio(&mut self, audio_data: Vec<f32>) -> Result<(), TTSError> {
        debug!(samples = audio_data.len(), "AudioPlayer::play_audio");
        self.audio_data = audio_data;
        self.total_duration_ms = 0;
        self.start_playback()
    }

    /// Play raw encoded audio (MP3/Opus) - rodio will decode it automatically.
    pub fn play_audio_raw(
        &mut self,
        audio_data: Vec<u8>,
        sample_rate: u32,
    ) -> Result<(), TTSError> {
        debug!(samples = audio_data.len(), "AudioPlayer::play_audio_raw");
        if let Some(sink) = self.sink.take() {
            sink.stop();
        }

        let stream_handle = self
            .stream_handle
            .as_ref()
            .ok_or_else(|| TTSError::AudioError("No audio output available".into()))?;

        if audio_data.is_empty() {
            return Err(TTSError::AudioError("No audio data to play".into()));
        }

        // Clone audio_data to get a 'static lifetime for the Decoder
        let audio_bytes = audio_data.clone();
        let cursor = Cursor::new(audio_bytes);
        let source = Decoder::new(cursor).map_err(|e| {
            error!("Failed to decode audio: {}", e);
            TTSError::AudioError(format!("Failed to decode audio: {}", e))
        })?;

        // Calculate duration from the decoded source
        let duration: Option<Duration> = source.total_duration();
        let total_duration_ms = duration.map(|d| d.as_millis() as u64).unwrap_or_else(|| {
            // Fallback: estimate using 128 kbps bitrate for compressed audio
            let bytes_per_sec = 128 / 8; // 128 kbps = 16 KB/s
            (audio_data.len() as u64 * 1000) / bytes_per_sec
        });

        let sink = Sink::try_new(stream_handle).map_err(|e| {
            error!("Failed to create audio sink: {}", e);
            TTSError::AudioError(format!("Failed to create audio sink: {}", e))
        })?;

        sink.append(source);
        self.sink = Some(sink);
        self.total_duration_ms = total_duration_ms;
        self.audio_data.clear(); // Clear so get_position uses total_duration_ms
        Ok(())
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

    /// Pause playback if currently playing.
    pub fn pause(&mut self) -> Result<(), TTSError> {
        trace!("AudioPlayer::pause");
        if let Some(sink) = &self.sink {
            sink.pause();
        }
        Ok(())
    }

    /// Resume playback if currently paused.
    pub fn resume(&mut self) -> Result<(), TTSError> {
        trace!("AudioPlayer::resume");
        if let Some(sink) = &self.sink {
            sink.play();
        }
        Ok(())
    }

    /// Toggle pause state. Returns the new paused status (true if paused, false if playing).
    pub fn toggle_pause(&mut self) -> Result<bool, TTSError> {
        trace!("AudioPlayer::toggle_pause");
        if let Some(sink) = &self.sink {
            let was_paused = sink.is_paused();
            if was_paused {
                sink.play();
                Ok(false)
            } else {
                sink.pause();
                Ok(true)
            }
        } else {
            Ok(false)
        }
    }

    /// Get playback status. Returns (is_playing, is_paused).
    /// is_playing: true if sink exists and is not empty
    /// is_paused: true if sink exists and is paused
    pub fn get_status(&self) -> (bool, bool) {
        if let Some(sink) = &self.sink {
            let is_playing = !sink.empty();
            let is_paused = sink.is_paused();
            (is_playing, is_paused)
        } else {
            (false, false)
        }
    }

    /// Get current playback position and total duration in milliseconds.
    /// Returns (current_ms, total_ms). Returns (0, 0) if no audio is loaded.
    pub fn get_position(&self) -> (u64, u64) {
        let total_duration_ms = if !self.audio_data.is_empty() {
            self.calculate_duration_ms()
        } else {
            self.total_duration_ms
        };

        if total_duration_ms == 0 {
            return (0, 0);
        }

        if let Some(sink) = &self.sink {
            let current_pos = sink.get_pos();
            // Duration::as_millis() returns u128, clamp to u64::MAX to avoid truncation
            let current_ms = current_pos.as_millis().min(u64::MAX as u128) as u64;
            (current_ms.min(total_duration_ms), total_duration_ms)
        } else {
            (0, total_duration_ms)
        }
    }

    /// Seek by the given offset in milliseconds. Returns (success, at_start, at_end).
    /// Fails if audio is paused or if seeking is not supported.
    pub fn seek(&mut self, offset_ms: i64) -> Result<(bool, bool, bool), TTSError> {
        // Check if we have audio data (either f32 or raw)
        let has_audio = !self.audio_data.is_empty() || self.total_duration_ms > 0;
        if !has_audio {
            return Err(TTSError::AudioError("No audio data loaded".into()));
        }

        let sink = self
            .sink
            .as_ref()
            .ok_or_else(|| TTSError::AudioError("No active playback".into()))?;

        // Cannot seek if paused
        if sink.is_paused() {
            return Err(TTSError::AudioError("Cannot seek while paused".into()));
        }

        // Cannot seek if sink is empty (playback finished)
        if sink.empty() {
            return Err(TTSError::AudioError("Playback has finished".into()));
        }

        let total_duration_ms = if !self.audio_data.is_empty() {
            self.calculate_duration_ms()
        } else {
            self.total_duration_ms
        };

        let current_pos = sink.get_pos();
        let current_ms = current_pos.as_millis() as u64;

        // Calculate new position
        // Use unsigned_abs() to safely handle i64::MIN (which would panic on negation)
        let offset_abs = offset_ms.unsigned_abs();
        let new_ms = if offset_ms < 0 {
            current_ms.saturating_sub(offset_abs)
        } else {
            current_ms.saturating_add(offset_abs)
        };

        // Clamp to bounds
        let clamped_ms = new_ms.min(total_duration_ms);
        let at_start = clamped_ms == 0;
        let at_end = clamped_ms >= total_duration_ms;

        let seek_duration = Duration::from_millis(clamped_ms);

        match sink.try_seek(seek_duration) {
            Ok(()) => {
                trace!(
                    current_ms = current_ms,
                    new_ms = clamped_ms,
                    offset_ms = offset_ms,
                    "Seek successful"
                );
                Ok((true, at_start, at_end))
            }
            Err(e) => {
                warn!(error = %e, "Seek failed");
                Err(TTSError::AudioError(format!("Seek failed: {e}")))
            }
        }
    }

    /// Calculate total duration in milliseconds from audio_data and sample_rate.
    fn calculate_duration_ms(&self) -> u64 {
        if self.audio_data.is_empty() {
            return 0;
        }
        let duration_sec = self.audio_data.len() as f64 / self.sample_rate as f64;
        (duration_sec * 1000.0) as u64
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
