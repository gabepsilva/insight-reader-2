/**
 * ReadingService backend /api/prompt — reusable for all LLM tasks.
 * See backend-api.md. Requests are sent via Tauri (backend_prompt) to avoid CORS.
 */

import { invoke } from "@tauri-apps/api/core";

/** Task values accepted by POST /api/prompt (case-sensitive). */
export const BACKEND_PROMPT_TASKS = [
  "PROMPT",
  "TTS",
  "SUMMARIZE",
  "SUMMARIZE_PROMPT",
  "SUMMARIZE_AND_READ_PROMPT",
  "EXPLAIN1",
  "EXPLAIN2",
  "REWRITE",
  "QUICK_EDIT",
] as const;

export type BackendPromptTask = (typeof BACKEND_PROMPT_TASKS)[number];

/**
 * Calls the ReadingService backend with the given task and content.
 * Returns the response string on success; throws on network or backend error.
 */
export async function callBackendPrompt(
  task: BackendPromptTask,
  content: string,
  options?: { tone?: string; format?: string; instruction?: string },
): Promise<string> {
  return invoke<string>("backend_prompt", { task, content, ...options });
}
