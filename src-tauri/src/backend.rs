//! ReadingService HTTP API client.
//!
//! Calls the backend POST /api/prompt for tasks (SUMMARIZE, SUMMARIZE_PROMPT, SUMMARIZE_AND_READ_PROMPT, TTS, EXPLAIN1, EXPLAIN2, PROMPT).
//! URL precedence: config.backend_url, then INSIGHT_READER_BACKEND_URL env, then default.
//! See backend-api.md in the repo root for task semantics. Used by the frontend and by the
//! tray "Summarize Selected" flow.

use std::sync::OnceLock;

use nanoid::nanoid;

use crate::config;
use crate::machine_id;

/// Default backend base URL when not set in config or env.
const BACKEND_BASE_URL: &str = "http://grars-backend.i.psilva.org:8080";

/// Base URL for backend (config, then INSIGHT_READER_BACKEND_URL env, then default). Trimmed.
fn backend_base_url() -> String {
    config::load_full_config()
        .ok()
        .and_then(|c| c.backend_url)
        .filter(|s| !s.trim().is_empty())
        .or_else(|| std::env::var("INSIGHT_READER_BACKEND_URL").ok())
        .unwrap_or_else(|| BACKEND_BASE_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

/// Session ID: generated once per app launch, kept in memory only. Sent with backend requests.
static SESSION_ID: OnceLock<String> = OnceLock::new();

fn get_session_id() -> &'static str {
    SESSION_ID.get_or_init(|| nanoid!(5)).as_str()
}

/// Format for X-Installation-ID header: "<install_id>+<machine_id>" when machine ID is available.
fn installation_header_value(install_id: &str) -> String {
    match machine_id::get_machine_id() {
        Some(m) if !m.is_empty() => format!("{}+{}", install_id, m),
        _ => install_id.to_string(),
    }
}

/// Calls the ReadingService backend POST /api/prompt. Returns the response string on success.
/// Async so the command does not block the app; long-running HTTP runs on the async runtime.
#[tauri::command]
pub async fn backend_prompt(task: String, content: String) -> Result<String, String> {
    let base = backend_base_url();
    let url = format!("{}/api/prompt", base);

    #[derive(serde::Serialize)]
    struct Request {
        task: String,
        content: String,
    }
    #[derive(serde::Deserialize)]
    struct SuccessResponse {
        response: String,
    }
    #[derive(serde::Deserialize)]
    struct ErrorResponse {
        error: Option<String>,
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let install_id = config::get_or_create_installation_id().unwrap_or_default();
    let installation_header = installation_header_value(&install_id);
    let resp = client
        .post(&url)
        .header("X-Installation-ID", &installation_header)
        .header("X-Session-ID", get_session_id())
        .json(&Request { task, content })
        .send()
        .await
        .map_err(|e| {
            format!(
                "Could not reach the backend at {}. Check Settings → General → Backend URL. \
                 Ensure the server is running and reachable. ({})",
                base, e
            )
        })?;

    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if status.is_success() {
        let parsed: SuccessResponse =
            serde_json::from_str(&body).map_err(|e| format!("Invalid response: {}", e))?;
        Ok(parsed.response)
    } else {
        let err_msg = serde_json::from_str::<ErrorResponse>(&body)
            .ok()
            .and_then(|r| r.error)
            .unwrap_or_else(|| format!("HTTP {}: {}", status, body));
        Err(err_msg)
    }
}

/// Pings the ReadingService backend GET /health. Returns true if reachable.
/// Uses same URL precedence as backend_prompt. Used by status bar health indicator.
#[tauri::command]
pub async fn backend_health_check() -> Result<bool, String> {
    let base = backend_base_url();
    let url = format!("{}/health", base);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let install_id = config::get_or_create_installation_id().unwrap_or_default();
    let installation_header = installation_header_value(&install_id);
    match client
        .get(&url)
        .header("X-Installation-ID", &installation_header)
        .header("X-Session-ID", get_session_id())
        .send()
        .await
    {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Returns true if Polly credentials are configured and valid. Used by settings UI.
#[tauri::command]
pub fn check_polly_credentials() -> Result<bool, String> {
    match crate::tts::check_polly_credentials() {
        Ok(()) => Ok(true),
        Err(_) => Ok(false),
    }
}
