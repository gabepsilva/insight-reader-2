//! High-level execution of user-triggered actions: read selected text, toggle pause, stop.
//!
//! Invoked by the global hotkey handler, the tray menu, and the Unix action socket when the user
//! requests "read", "pause", or "stop". Each action maps to TTS requests (speak, toggle pause, stop);
//! "Read Selected" also pulls text from text_capture and sends it to the TTS worker. This module
//! does not handle "Summarize Selected" or "Insight Editor" (those are tray-specific and use
//! backend and windows from lib's setup).

use std::sync::mpsc;

use tauri::Manager;
use tracing::{debug, warn};

use crate::hotkeys;
use crate::text_capture;
use crate::tts;

/// Runs the given action using TtsState and text_capture. Called from hotkeys, tray, and action socket.
pub fn execute_action<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    action: hotkeys::AppAction,
    source: &'static str,
) {
    match action {
        hotkeys::AppAction::ReadSelected => {
            let Some(tts_tx) = app
                .try_state::<tts::TtsState>()
                .map(|state| state.inner().clone())
            else {
                warn!(source, "Read Selected: TtsState not found");
                return;
            };

            std::thread::spawn(move || {
                let text = text_capture::get_text_or_clipboard_impl();
                if text.is_empty() {
                    warn!(source, "Read Selected: no text available");
                    return;
                }
                text_capture::log_selected_text(&Some(text.clone()));

                let (resp_tx, resp_rx) = mpsc::sync_channel(0);
                if let Err(e) = tts_tx.send(tts::TtsRequest::Speak(text, resp_tx)) {
                    warn!(source, error = %e, "Read Selected: failed to send speak request");
                    return;
                }

                match resp_rx.recv() {
                    Ok(Ok(())) => {}
                    Ok(Err(e)) => {
                        warn!(source, error = %e, "Read Selected: tts_speak failed");
                    }
                    Err(_) => {
                        warn!(source, "Read Selected: TTS worker disconnected");
                    }
                }
            });
        }
        hotkeys::AppAction::TogglePause => {
            let Some(tts_tx) = app
                .try_state::<tts::TtsState>()
                .map(|state| state.inner().clone())
            else {
                warn!(source, "Toggle Pause: TtsState not found");
                return;
            };

            let (resp_tx, resp_rx) = mpsc::sync_channel(0);
            if let Err(e) = tts_tx.send(tts::TtsRequest::TogglePause(resp_tx)) {
                warn!(source, error = %e, "Toggle Pause: failed to send request");
                return;
            }

            match resp_rx.recv() {
                Ok(Ok(paused)) => {
                    debug!(source, paused, "Toggle Pause: updated playback state");
                }
                Ok(Err(e)) => {
                    warn!(source, error = %e, "Toggle Pause: request failed");
                }
                Err(_) => {
                    warn!(source, "Toggle Pause: TTS worker disconnected");
                }
            }
        }
        hotkeys::AppAction::Stop => {
            if let Some(tts_tx) = app
                .try_state::<tts::TtsState>()
                .map(|state| state.inner().clone())
            {
                if let Err(e) = tts_tx.send(tts::TtsRequest::Stop) {
                    warn!(source, error = %e, "Stop: failed to send request");
                }
            } else {
                warn!(source, "Stop: TtsState not found");
            }
        }
    }
}
