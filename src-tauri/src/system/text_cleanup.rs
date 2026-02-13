//! Natural Reading API integration
//!
//! Sends text to a cloud-powered text enhancement service before TTS synthesis.
//! This service intelligently processes and refines text to improve speech quality.

use pulldown_cmark::{Event, Parser, TagEnd};
use tracing::{debug, info, warn};

const CLEANUP_API_URL: &str = "http://insight-reader-backend.i.psilva.org/api/content-cleanup";

fn markdown_to_plain_text(markdown: &str) -> String {
    let parser = Parser::new(markdown);
    let mut text_parts = Vec::new();

    for event in parser {
        match event {
            Event::Text(text) | Event::Code(text) => {
                text_parts.push(text.to_string());
            }
            Event::SoftBreak | Event::HardBreak => {
                text_parts.push("\n".to_string());
            }
            Event::End(tag) => match tag {
                TagEnd::Paragraph | TagEnd::Heading(_) | TagEnd::Item => {
                    text_parts.push("\n\n".to_string());
                }
                _ => {
                    if text_parts.last().is_none_or(|s| !s.ends_with('\n')) {
                        text_parts.push("\n".to_string());
                    }
                }
            },
            _ => {}
        }
    }

    let result = text_parts.join("");

    result
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

#[derive(serde::Serialize)]
struct CleanupRequest<'a> {
    content: &'a str,
}

#[derive(serde::Deserialize)]
struct CleanupResponse {
    cleaned_content: String,
}

pub async fn cleanup_text(text: &str) -> Result<String, String> {
    info!(
        bytes = text.len(),
        "Sending text to Natural Reading service"
    );
    debug!(text = %text, "Text being sent to Natural Reading service");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let request_body = CleanupRequest { content: text };

    let response = client
        .post(CLEANUP_API_URL)
        .json(&request_body)
        .send()
        .await
        .map_err(|e| {
            warn!(error = %e, "Failed to connect to Natural Reading service");
            format!("Failed to connect to Natural Reading service: {e}")
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        warn!(?status, body = %body, "Natural Reading service returned error");
        return Err(format!(
            "Natural Reading service error ({}): {}",
            status, body
        ));
    }

    let cleanup_response: CleanupResponse = response.json().await.map_err(|e| {
        warn!(error = %e, "Failed to parse Natural Reading service response");
        format!("Failed to parse Natural Reading service response: {e}")
    })?;

    debug!(text = %cleanup_response.cleaned_content, "Text before markdown cleanup");

    let has_markdown_syntax = cleanup_response.cleaned_content.contains('#')
        || cleanup_response.cleaned_content.contains('*')
        || cleanup_response.cleaned_content.contains('[')
        || cleanup_response.cleaned_content.contains('`')
        || cleanup_response.cleaned_content.starts_with("```");

    let plain_text = if has_markdown_syntax {
        markdown_to_plain_text(&cleanup_response.cleaned_content)
    } else {
        cleanup_response
            .cleaned_content
            .lines()
            .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
    };

    info!(
        original_bytes = cleanup_response.cleaned_content.len(),
        plain_bytes = plain_text.len(),
        "Natural Reading completed, markdown stripped"
    );
    debug!(
        original_preview = %cleanup_response.cleaned_content.chars().take(100).collect::<String>(),
        plain_preview = %plain_text.chars().take(100).collect::<String>(),
        "Text preview (before and after markdown stripping)"
    );

    Ok(plain_text)
}
