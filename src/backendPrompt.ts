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
  "EXPLAIN1",
  "EXPLAIN2",
] as const;

export type BackendPromptTask = (typeof BACKEND_PROMPT_TASKS)[number];

/**
 * Calls the ReadingService backend with the given task and content.
 * Returns the response string on success; throws on network or backend error.
 */
export async function callBackendPrompt(
  task: BackendPromptTask,
  content: string
): Promise<string> {
  return invoke<string>("backend_prompt", { task, content });
}
