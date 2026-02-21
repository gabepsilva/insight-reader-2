//! Unix domain socket used for single-instance action dispatch.
//!
//! When a second process is started (e.g. `insight-reader action read-selected`), it tries to
//! connect to a running instance via this socket and send an action string instead of starting
//! a new app. The path is chosen in order: `XDG_RUNTIME_DIR`, then `/run/user/{uid}`, then
//! `/tmp/insight-reader-{uid}.sock`. On non-Unix platforms the socket is not used; `main.rs`
//! still calls `send_action_to_running_instance` and falls back to setting
//! `INSIGHT_READER_START_ACTION` for the next run.
//!
//! The listener runs in a background thread; each incoming connection sends a single action
//! string (e.g. "read-selected") which is parsed and executed via the actions module.

#[cfg(unix)]
use std::io::{Read, Write};
#[cfg(unix)]
use std::os::unix::net::{UnixListener, UnixStream};
#[cfg(unix)]
use std::path::PathBuf;

use tracing::warn;

// --- Path selection (Unix) ---

/// Returns the path where the action socket is bound.
/// Prefers XDG_RUNTIME_DIR, then /run/user/{uid}, then /tmp/insight-reader-{uid}.sock.
#[cfg(unix)]
pub fn action_socket_path() -> PathBuf {
    if let Ok(runtime_dir) = std::env::var("XDG_RUNTIME_DIR") {
        let candidate = PathBuf::from(runtime_dir).join("insight-reader.sock");
        if let Some(parent) = candidate.parent() {
            if parent.exists() {
                return candidate;
            }
        }
    }

    let uid = std::fs::metadata("/proc/self")
        .map(|meta| std::os::unix::fs::MetadataExt::uid(&meta))
        .unwrap_or(0);
    let run_user = PathBuf::from(format!("/run/user/{uid}"));
    if run_user.exists() {
        return run_user.join("insight-reader.sock");
    }

    PathBuf::from(format!("/tmp/insight-reader-{uid}.sock"))
}

#[cfg(not(unix))]
pub fn action_socket_path() -> std::path::PathBuf {
    std::path::PathBuf::from("insight-reader.sock")
}

// --- Sending action to running instance (used by main.rs) ---

#[cfg(unix)]
pub fn send_action_to_running_instance(action: &str) -> Result<(), String> {
    let uid = std::fs::metadata("/proc/self")
        .map(|meta| std::os::unix::fs::MetadataExt::uid(&meta))
        .unwrap_or(0);

    let mut candidates = Vec::new();
    if let Ok(runtime_dir) = std::env::var("XDG_RUNTIME_DIR") {
        candidates.push(PathBuf::from(runtime_dir).join("insight-reader.sock"));
    }
    candidates.push(PathBuf::from(format!(
        "/run/user/{uid}/insight-reader.sock"
    )));
    candidates.push(PathBuf::from(format!("/tmp/insight-reader-{uid}.sock")));
    candidates.sort();
    candidates.dedup();

    for path in candidates {
        let mut stream = match UnixStream::connect(&path) {
            Ok(stream) => stream,
            Err(_) => continue,
        };

        stream
            .write_all(action.trim().as_bytes())
            .map_err(|e| format!("failed to send action to running instance: {e}"))?;
        return Ok(());
    }

    Err("could not connect to a running instance action socket".to_string())
}

#[cfg(not(unix))]
pub fn send_action_to_running_instance(_action: &str) -> Result<(), String> {
    Err("action bridge is not supported on this platform".to_string())
}

// --- Listener (Unix only): bound in setup, dispatches to actions ---

/// Starts a background thread that binds the action socket and dispatches incoming actions.
/// Called from lib's setup. On Unix only.
pub fn start_action_socket_listener<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    #[cfg(unix)]
    {
        let path = action_socket_path();
        std::thread::spawn(move || {
            let listener = match UnixListener::bind(&path) {
                Ok(listener) => listener,
                Err(bind_err) => {
                    if path.exists() {
                        match UnixStream::connect(&path) {
                            Ok(_) => {
                                warn!(path = %path.display(), "Action socket already in use by another instance");
                                return;
                            }
                            Err(_) => {
                                let _ = std::fs::remove_file(&path);
                                match UnixListener::bind(&path) {
                                    Ok(listener) => listener,
                                    Err(e) => {
                                        warn!(error = %e, path = %path.display(), "Failed to bind action socket after cleanup");
                                        return;
                                    }
                                }
                            }
                        }
                    } else {
                        warn!(error = %bind_err, path = %path.display(), "Failed to bind action socket");
                        return;
                    }
                }
            };

            for stream_result in listener.incoming() {
                let mut stream = match stream_result {
                    Ok(stream) => stream,
                    Err(e) => {
                        warn!(error = %e, "Action socket accept failed");
                        continue;
                    }
                };

                let mut payload = String::new();
                if let Err(e) = stream.read_to_string(&mut payload) {
                    warn!(error = %e, "Action socket read failed");
                    continue;
                }

                let action_raw = payload.trim();
                match crate::hotkeys::parse_app_action(action_raw) {
                    Some(action) => crate::actions::execute_action(&app, action, "socket"),
                    None => warn!(action = %action_raw, "Unknown action command"),
                }
            }
        });
    }
}
