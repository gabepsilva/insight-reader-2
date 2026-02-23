# Backend API — Features & Task Values

Features and buttons that call `POST /api/prompt`, with their expected `task` values.
See [backend-protocol.md](backend-protocol.md) and [backend-api.md](../backend-api.md) for the full API spec.

---

## Features that call the backend

| Feature / Button | Location | `task` value | Notes |
|------------------|----------|--------------|-------|
| Format doc for reading | Editor toolbar (book icon) | `"TTS"` | Cleans content for TTS; replaces editor text with result |
| Summarize | Editor toolbar (✦) | `"SUMMARIZE_PROMPT"` when speaker muted, `"SUMMARIZE_AND_READ_PROMPT"` when not | Only these two tasks (no SUMMARIZE). Replaces content with summary; reads aloud when unmuted |
| Explain | Editor toolbar (split button) | `"EXPLAIN1"` or `"EXPLAIN2"` | Split: main runs current mode. Modes: "Like I missed the meeting" (EXPLAIN1, capable professionals), "Like high school" (EXPLAIN2, plain language). Choice persisted in config |
| Summary | Player ActionRow (main card) | `"SUMMARIZE_PROMPT"` when speaker muted, `"SUMMARIZE_AND_READ_PROMPT"` when not | Summarizes clipboard/selection, opens editor with result; triggers read when unmuted |
| Summarize Selected | Tray menu | `"SUMMARIZE_PROMPT"` when summary muted, `"SUMMARIZE_AND_READ_PROMPT"` when not | Uses shared preference (config); summarizes selection/clipboard, opens editor with result; triggers read when unmuted |
| Rewrite (tone + format) | Editor Assistant panel footer | `"REWRITE"` | Sends content plus `tone` and `format` fields for rewrite using REWRITE task |
| Quick edits (Make shorter, Simplify language, etc.) | Editor Assistant panel → Edits tab | `"QUICK_EDIT"` | Sends content plus a quick-edit instruction string; tone/format settings are preserved but not sent |
| Apply instruction (custom prompt) | Editor Assistant panel → Prompt tab | `"PROMPT"` | Sends content plus an `instruction` string (user’s free-form prompt). Backend should apply the instruction to the text and return the full replacement text. |

### `"PROMPT"` task — frontend expectations

- **Trigger:** User types a short instruction in the Prompt tab (e.g. "Make this 20% shorter and more casual") and clicks **Apply instruction** (or presses Enter).
- **Request to `POST /api/prompt`:**
  - `task`: `"PROMPT"`
  - `content`: current full editor contents (string)
  - `instruction`: the free-form instruction text from the Prompt tab (string)
- **Response handling on frontend:** The backend’s response body is treated as the **entire new editor contents** and fully replaces the existing text. No TTS is triggered automatically.
- **Behavioral intent:** Similar to `REWRITE`, but the model should follow the free-form `instruction` instead of only tone/format presets. The instruction may ask for style, structure, or content-level changes, but the default expectation is to keep the original meaning unless explicitly told otherwise.

---

## Tasks supported by backend but not used in UI

Currently none; every task value listed in `BACKEND_PROMPT_TASKS` is wired to at least one UI feature.

---

## Features that do NOT call the backend

| Feature | Reason |
|---------|--------|
| Read aloud (toolbar) | Uses local `tts_speak` (Piper) |
| Editor (ActionRow) | Opens editor window only |
| Quick Replay | Disabled ("Coming soon") |
| Read Selected (tray) | Uses text capture + local TTS |
| Insight Editor (tray) | Opens editor with clipboard text |
