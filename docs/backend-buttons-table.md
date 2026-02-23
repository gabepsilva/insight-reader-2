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
| Rewrite (tone + format) | Editor Assistant panel footer | `"SUMMARIZE"` | Currently uses SUMMARIZE; tone/format not sent (Phase 3: `{ "tone": "...", "format": "..." }`) |
| Quick edits (Make shorter, Simplify language, etc.) | Editor Assistant panel → Edits tab | `"SUMMARIZE"` | All use handleAssistantRewrite → SUMMARIZE |

---

## Tasks supported by backend but not used in UI

| `task` | Semantics | Used by any button? |
|--------|-----------|---------------------|
| `"PROMPT"` | Free-form user prompt to LLM | No |

---

## Features that do NOT call the backend

| Feature | Reason |
|---------|--------|
| Read aloud (toolbar) | Uses local `tts_speak` (Piper) |
| Editor (ActionRow) | Opens editor window only |
| Apply instruction (custom prompt) | Only updates local state; does not call backend |
| Quick Replay | Disabled ("Coming soon") |
| Read Selected (tray) | Uses text capture + local TTS |
| Insight Editor (tray) | Opens editor with clipboard text |
