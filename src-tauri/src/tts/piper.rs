//! Piper TTS provider: runs the Piper binary and plays audio via rodio.

use crate::paths;
use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use tracing::{debug, error, info, warn};

use super::audio_player::AudioPlayer;
use super::TTSError;

/// Piper TTS provider using the local Piper binary and ONNX models.
pub struct PiperTTSProvider {
    piper_bin: PathBuf,
    /// Model path without .onnx (for --model)
    model_path: PathBuf,
    player: AudioPlayer,
}

impl PiperTTSProvider {
    /// Create a new Piper TTS provider. Finds piper binary and any installed model.
    pub fn new() -> Result<Self, TTSError> {
        let piper_bin = Self::find_piper_binary();
        let model_path = Self::find_any_model()?;

        if !piper_bin.is_file() {
            error!(?piper_bin, "Piper binary not found");
            return Err(TTSError::ProcessError(format!(
                "Piper binary not found at {}",
                piper_bin.display()
            )));
        }
        if !model_with_extension(&model_path).is_file() {
            error!(?model_path, "Piper model (.onnx) not found");
            return Err(TTSError::ProcessError(format!(
                "Piper model (.onnx) not found at {}",
                model_with_extension(&model_path).display()
            )));
        }

        info!("Initializing Piper TTS provider");
        debug!(?piper_bin, ?model_path, "Piper configuration");

        let player = AudioPlayer::new(22050)?;
        Ok(Self {
            piper_bin,
            model_path,
            player,
        })
    }

    /// Speak the given text. Stops any current playback first.
    pub fn speak(&mut self, text: &str) -> Result<(), TTSError> {
        let text = text.trim();
        if text.is_empty() {
            warn!("Empty text provided to piper, skipping synthesis");
            return Err(TTSError::ProcessError(
                "Cannot synthesize empty text".into(),
            ));
        }

        debug!(
            chars = text.len(),
            text_preview = %text.chars().take(50).collect::<String>(),
            "Piper: synthesizing speech"
        );

        self.player.stop()?;

        let model_arg = self.model_path.to_str().unwrap_or("");
        debug!(
            piper_bin = %self.piper_bin.display(),
            model_path = %model_arg,
            "Executing piper command"
        );

        #[cfg(target_os = "windows")]
        let audio_data = self.run_piper_windows(text, model_arg)?;

        #[cfg(not(target_os = "windows"))]
        let audio_data = self.run_piper_unix(text, model_arg)?;

        info!(
            samples = audio_data.len(),
            duration_sec = format!("{:.1}", audio_data.len() as f32 / 22050.0),
            "Piper: audio generated"
        );

        self.player.play_audio(audio_data)
    }

    /// Stop current playback.
    pub fn stop(&mut self) -> Result<(), TTSError> {
        self.player.stop()
    }

    /// Pause current playback.
    pub fn pause(&mut self) -> Result<(), TTSError> {
        self.player.pause()
    }

    /// Resume current playback.
    pub fn resume(&mut self) -> Result<(), TTSError> {
        self.player.resume()
    }

    /// Toggle pause state. Returns the new paused status (true if paused, false if playing).
    pub fn toggle_pause(&mut self) -> Result<bool, TTSError> {
        self.player.toggle_pause()
    }

    /// Get playback status. Returns (is_playing, is_paused).
    pub fn get_status(&self) -> (bool, bool) {
        self.player.get_status()
    }

    /// Seek by the given offset in milliseconds. Returns (success, at_start, at_end).
    pub fn seek(&mut self, offset_ms: i64) -> Result<(bool, bool, bool), TTSError> {
        self.player.seek(offset_ms)
    }

    /// Get current playback position and total duration in milliseconds.
    /// Returns (current_ms, total_ms).
    pub fn get_position(&self) -> (u64, u64) {
        self.player.get_position()
    }

    #[cfg(target_os = "windows")]
    fn run_piper_windows(&self, text: &str, model_arg: &str) -> Result<Vec<f32>, TTSError> {
        use std::fs;
        use std::io::Write;

        let temp_file = env::temp_dir().join("insight-reader-2-piper-output.wav");
        let temp_file_str = temp_file.to_string_lossy().to_string();

        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut child = Command::new(&self.piper_bin)
            .args(["--model", model_arg, "--output_file", &temp_file_str])
            .env("PYTHONIOENCODING", "utf-8")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| TTSError::ProcessError(format!("Failed to start piper: {e}")))?;

        if let Some(ref mut stdin) = child.stdin {
            stdin
                .write_all(text.as_bytes())
                .map_err(|e| TTSError::ProcessError(format!("Failed to write to piper: {e}")))?;
        }

        let output = child
            .wait_with_output()
            .map_err(|e| TTSError::ProcessError(format!("Piper process failed: {e}")))?;

        if !output.status.success() {
            let _ = fs::remove_file(&temp_file);
            return Err(TTSError::ProcessError(format!(
                "Piper failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            )));
        }

        let wav_data = fs::read(&temp_file)
            .map_err(|e| TTSError::ProcessError(format!("Failed to read piper output: {e}")))?;
        let _ = fs::remove_file(&temp_file);

        if wav_data.len() < 44 || &wav_data[0..4] != b"RIFF" {
            return Err(TTSError::ProcessError(
                "Invalid audio format from piper".into(),
            ));
        }

        Ok(AudioPlayer::pcm_to_f32(&wav_data[44..]))
    }

    #[cfg(not(target_os = "windows"))]
    fn run_piper_unix(&self, text: &str, model_arg: &str) -> Result<Vec<f32>, TTSError> {
        use std::io::Write;

        let mut child = Command::new(&self.piper_bin)
            .args(["--model", model_arg, "--output_file", "-"])
            .env("PYTHONIOENCODING", "utf-8")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| TTSError::ProcessError(format!("Failed to start piper: {e}")))?;

        if let Some(ref mut stdin) = child.stdin {
            stdin
                .write_all(text.as_bytes())
                .map_err(|e| TTSError::ProcessError(format!("Failed to write to piper: {e}")))?;
        }

        let output = child
            .wait_with_output()
            .map_err(|e| TTSError::ProcessError(format!("Piper process failed: {e}")))?;

        if !output.status.success() {
            return Err(TTSError::ProcessError(format!(
                "Piper failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            )));
        }

        if output.stdout.is_empty() {
            return Err(TTSError::ProcessError(
                "No audio data generated by piper".into(),
            ));
        }

        Ok(AudioPlayer::pcm_to_f32(&output.stdout))
    }


    fn find_piper_binary() -> PathBuf {
        #[cfg(target_os = "windows")]
        const VENV_BIN_DIR: &str = "Scripts";
        #[cfg(target_os = "windows")]
        const PIPER_BIN_NAME: &str = "piper.exe";

        #[cfg(not(target_os = "windows"))]
        const VENV_BIN_DIR: &str = "bin";
        #[cfg(not(target_os = "windows"))]
        const PIPER_BIN_NAME: &str = "piper";

        // 1. Check development venv in current directory
        if let Ok(cwd) = env::current_dir() {
            let p = cwd.join("venv").join(VENV_BIN_DIR).join(PIPER_BIN_NAME);
            if p.exists() {
                return p;
            }
        }

        // 2. Check production venv in ${HOME}/.insight-reader-2/venv
        if let Ok(venv_dir) = paths::get_venv_dir() {
            let p = venv_dir.join(VENV_BIN_DIR).join(PIPER_BIN_NAME);
            if p.exists() {
                return p;
            }
        }

        // 3. Check system PATH (which/where)
        #[cfg(target_os = "windows")]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            if let Ok(out) = Command::new("where")
                .arg("piper")
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            {
                if out.status.success() {
                    if let Ok(s) = String::from_utf8(out.stdout) {
                        let t = s.lines().next().unwrap_or("").trim();
                        if !t.is_empty() {
                            return PathBuf::from(t);
                        }
                    }
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            if let Ok(out) = Command::new("which").arg("piper").output() {
                if out.status.success() {
                    if let Ok(s) = String::from_utf8(out.stdout) {
                        let t = s.trim();
                        if !t.is_empty() {
                            return PathBuf::from(t);
                        }
                    }
                }
            }
        }

        // 4. Default to production venv path (even if it doesn't exist yet)
        paths::get_venv_dir()
            .unwrap_or_else(|_| PathBuf::from("/tmp/.insight-reader-2"))
            .join(VENV_BIN_DIR)
            .join(PIPER_BIN_NAME)
    }

    /// Find any installed Piper model. Prefers en_US-lessac-medium, else first .onnx in model dirs.
    fn find_any_model() -> Result<PathBuf, TTSError> {
        const PREFERRED: &str = "en_US-lessac-medium";

        let mut dirs_to_check: Vec<PathBuf> = Vec::new();
        
        // 1. Check development models in current directory
        if let Ok(c) = env::current_dir() {
            dirs_to_check.push(c.join("models"));
        }
        
        // 2. Check production models in ${HOME}/.insight-reader-2/models
        if let Ok(models_dir) = paths::get_models_dir() {
            dirs_to_check.push(models_dir);
        }

        // First pass: look for preferred model
        for base in &dirs_to_check {
            let preferred = base.join(PREFERRED);
            if preferred.with_extension("onnx").is_file() {
                debug!(path = %preferred.display(), "Using preferred Piper model");
                return Ok(preferred);
            }
        }

        // Second pass: find any .onnx model
        for base in &dirs_to_check {
            if let Ok(entries) = std::fs::read_dir(base) {
                for e in entries.flatten() {
                    let p = e.path();
                    if p.extension().is_some_and(|e| e == "onnx") {
                        let stem = p.with_extension("");
                        debug!(path = %stem.display(), "Using first found Piper model");
                        return Ok(stem);
                    }
                }
            }
        }

        Err(TTSError::ProcessError(
            "No Piper model (.onnx) found. Install a voice to ~/.insight-reader-2/models/".into(),
        ))
    }
}

fn model_with_extension(path: &Path) -> PathBuf {
    path.with_extension("onnx")
}
