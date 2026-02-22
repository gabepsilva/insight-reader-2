//! Minimal audio playback for TTS: rodio sink, pitch-preserving speed via SoundTouch.

use std::io::Cursor;
use std::time::Duration;

use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink, Source};
use soundtouch::{Setting, SoundTouch};
use tracing::{debug, error, trace, warn};

use super::TTSError;

/// Audio playback for TTS. Plays f32 samples via rodio; supports play and stop.
/// Speed changes use SoundTouch time-stretching (pitch-preserving). Original PCM is kept
/// so speed can be changed while playing (re-stretch + seek).
pub struct AudioPlayer {
    sample_rate: u32,
    _stream: Option<OutputStream>,
    stream_handle: Option<OutputStreamHandle>,
    sink: Option<Sink>,
    volume: f32,
    /// Playback speed factor (1.0 = normal). Applied via time-stretch; content position = get_pos() * speed.
    speed: f32,
    /// Original PCM (mono f32) for the current utterance. Kept so we can re-stretch on speed change.
    original_pcm: Vec<f32>,
    /// Content duration in ms from original_pcm length and sample_rate.
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
            volume: 1.0,
            speed: 1.0,
            original_pcm: Vec::new(),
            total_duration_ms: 0,
        })
    }

    /// Load audio data and start playback. Audio should be normalized f32, -1.0 to 1.0.
    pub fn play_audio(&mut self, audio_data: Vec<f32>) -> Result<(), TTSError> {
        debug!(
            samples = audio_data.len(),
            sample_rate = self.sample_rate,
            "AudioPlayer::play_audio"
        );
        self.original_pcm = audio_data;
        self.total_duration_ms = self.content_duration_ms_from_len(self.original_pcm.len());
        debug!(
            total_duration_ms = self.total_duration_ms,
            "Calculated duration"
        );
        self.start_playback()
    }

    /// Play raw encoded audio (MP3/Opus). Decodes to PCM once, stores as original, then uses common play path.
    pub fn play_audio_raw(
        &mut self,
        audio_data: Vec<u8>,
        _sample_rate: u32,
    ) -> Result<(), TTSError> {
        debug!(bytes = audio_data.len(), "AudioPlayer::play_audio_raw");
        if audio_data.is_empty() {
            return Err(TTSError::AudioError("No audio data to play".into()));
        }

        let cursor = Cursor::new(audio_data);
        let decoder = Decoder::new(cursor).map_err(|e| {
            error!("Failed to decode audio: {}", e);
            TTSError::AudioError(format!("Failed to decode audio: {}", e))
        })?;

        let sample_rate = decoder.sample_rate();
        let channels = decoder.channels();
        self.sample_rate = sample_rate;

        let samples_i16: Vec<i16> = decoder.collect();
        let pcm_f32: Vec<f32> = if channels == 2 {
            samples_i16
                .chunks_exact(2)
                .map(|lr| (lr[0] as f32 + lr[1] as f32) / 2.0 / 32768.0)
                .collect()
        } else {
            samples_i16
                .into_iter()
                .map(|s| s as f32 / 32768.0)
                .collect()
        };

        self.original_pcm = pcm_f32;
        self.total_duration_ms = self.content_duration_ms_from_len(self.original_pcm.len());
        self.start_playback()
    }

    /// Set playback speed (1.0 = normal). Pitch-preserving. If playing, re-stretches and seeks to same content position.
    pub fn set_speed(&mut self, value: f32) {
        let (was_playing, was_paused, content_ms) = self
            .sink
            .as_ref()
            .map(|s| {
                (
                    !s.empty(),
                    s.is_paused(),
                    (s.get_pos().as_secs_f64() * self.speed as f64 * 1000.0) as u64,
                )
            })
            .unwrap_or((false, false, 0));

        self.speed = value;

        if was_playing && !self.original_pcm.is_empty() {
            if let Some(sink) = self.sink.take() {
                sink.stop();
            }
            if let Err(e) = self.start_playback() {
                warn!(error = %e, "set_speed: start_playback failed");
                return;
            }
            if let Some(sink) = &self.sink {
                let seek_output_secs = content_ms as f64 / 1000.0 / self.speed as f64;
                let seek_duration = Duration::from_secs_f64(seek_output_secs);
                if let Err(e) = sink.try_seek(seek_duration) {
                    warn!(error = %e, "set_speed: seek failed");
                }
                if was_paused {
                    sink.pause();
                }
            }
        }
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
        self.original_pcm.clear();
        self.total_duration_ms = 0;
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

    /// Set playback volume as percentage [0..=100].
    pub fn set_volume_percent(&mut self, volume_percent: u8) {
        let normalized = (volume_percent as f32 / 100.0).clamp(0.0, 1.0);
        self.volume = normalized;
        if let Some(sink) = &self.sink {
            sink.set_volume(normalized);
        }
    }

    /// Get playback status. Returns (is_playing, is_paused).
    pub fn get_status(&self) -> (bool, bool) {
        if let Some(sink) = &self.sink {
            let is_playing = !sink.empty();
            let is_paused = sink.is_paused();
            (is_playing, is_paused)
        } else {
            (false, false)
        }
    }

    /// Get current playback position and total duration in milliseconds (content time).
    pub fn get_position(&self) -> (u64, u64) {
        if self.total_duration_ms == 0 {
            return (0, 0);
        }
        if let Some(sink) = &self.sink {
            let output_secs = sink.get_pos().as_secs_f64();
            let current_content_ms = (output_secs * self.speed as f64 * 1000.0) as u64;
            (
                current_content_ms.min(self.total_duration_ms),
                self.total_duration_ms,
            )
        } else {
            (0, self.total_duration_ms)
        }
    }

    /// Seek by the given offset in milliseconds. Returns (success, at_start, at_end).
    pub fn seek(&mut self, offset_ms: i64) -> Result<(bool, bool, bool), TTSError> {
        if self.original_pcm.is_empty() || self.total_duration_ms == 0 {
            return Err(TTSError::AudioError("No audio data loaded".into()));
        }

        let sink = self
            .sink
            .as_ref()
            .ok_or_else(|| TTSError::AudioError("No active playback".into()))?;

        if sink.is_paused() {
            return Err(TTSError::AudioError("Cannot seek while paused".into()));
        }
        if sink.empty() {
            return Err(TTSError::AudioError("Playback has finished".into()));
        }

        let output_secs = sink.get_pos().as_secs_f64();
        let current_content_ms = (output_secs * self.speed as f64 * 1000.0) as u64;

        let offset_abs = offset_ms.unsigned_abs();
        let new_content_ms = if offset_ms < 0 {
            current_content_ms.saturating_sub(offset_abs)
        } else {
            current_content_ms.saturating_add(offset_abs)
        };

        let clamped_ms = new_content_ms.min(self.total_duration_ms);
        let at_start = clamped_ms == 0;
        let at_end = clamped_ms >= self.total_duration_ms;

        let seek_duration = Duration::from_secs_f64(clamped_ms as f64 / 1000.0 / self.speed as f64);

        match sink.try_seek(seek_duration) {
            Ok(()) => {
                trace!(current_content_ms, clamped_ms, offset_ms, "Seek successful");
                Ok((true, at_start, at_end))
            }
            Err(e) => {
                warn!(error = %e, "Seek failed");
                Err(TTSError::AudioError(format!("Seek failed: {e}")))
            }
        }
    }

    fn content_duration_ms_from_len(&self, num_samples: usize) -> u64 {
        if num_samples == 0 || self.sample_rate == 0 {
            return 0;
        }
        (num_samples as f64 / self.sample_rate as f64 * 1000.0) as u64
    }

    /// Build playback buffer (time-stretch if speed != 1.0), then create sink and play at 1.0x.
    fn start_playback(&mut self) -> Result<(), TTSError> {
        trace!("AudioPlayer::start_playback");
        if let Some(sink) = self.sink.take() {
            sink.stop();
        }

        if self.original_pcm.is_empty() {
            return Err(TTSError::AudioError("No audio data to play".into()));
        }

        let stream_handle = self
            .stream_handle
            .as_ref()
            .ok_or_else(|| TTSError::AudioError("No audio output available".into()))?;

        let to_play: Vec<f32> = if (self.speed - 1.0).abs() < 1e-6 {
            self.original_pcm.clone()
        } else {
            let mut st = SoundTouch::new();
            st.set_channels(1)
                .set_sample_rate(self.sample_rate)
                .set_tempo(self.speed as f64)
                .set_setting(Setting::UseQuickseek, 1);
            st.generate_audio(&self.original_pcm)
        };

        if to_play.is_empty() {
            return Err(TTSError::AudioError(
                "Time-stretch produced no samples".into(),
            ));
        }

        let samples_i16: Vec<i16> = to_play
            .iter()
            .map(|&s| (s * 32767.0).clamp(-32768.0, 32767.0) as i16)
            .collect();

        let wav_data = Self::create_wav(&samples_i16, self.sample_rate);
        let cursor = Cursor::new(wav_data);
        let source = Decoder::new(cursor).map_err(|e| {
            error!("Failed to decode WAV: {e}");
            TTSError::AudioError(format!("Failed to decode WAV: {e}"))
        })?;

        let sink = Sink::try_new(stream_handle).map_err(|e| {
            error!("Failed to create audio sink: {e}");
            TTSError::AudioError(format!("Failed to create audio sink: {e}"))
        })?;

        sink.set_volume(self.volume);
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
