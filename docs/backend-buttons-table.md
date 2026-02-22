# Backend API — Features & Task Values

Features and buttons that call `POST /api/prompt`, with their expected `task` values.
See [backend-protocol.md](backend-protocol.md) and [backend-api.md](../backend-api.md) for the full API spec.

---

## Features that call the backend

| Feature / Button | Location | `task` value | Notes |
|------------------|----------|--------------|-------|
| Format doc for reading | Editor toolbar (book icon) | `"TTS"` | Cleans content for TTS; replaces editor text with result |
| Summarize | Editor toolbar (✦) | `"SUMMARIZE"` | Replaces content with concise summary |
| Explain | Editor toolbar (?) | `"EXPLAIN1"` | Explains content for capable professionals |
| Summary | Player ActionRow (main card) | `"SUMMARIZE"` | Summarizes clipboard/selection, opens editor with result |
| Summarize Selected | Tray menu | `"SUMMARIZE"` | Summarizes selected text, opens editor with result |
| Rewrite (tone + format) | Editor Assistant panel footer | `"SUMMARIZE"` | Currently uses SUMMARIZE; tone/format not sent (Phase 3: `{ "tone": "...", "format": "..." }`) |
| Quick edits (Make shorter, Simplify language, etc.) | Editor Assistant panel → Edits tab | `"SUMMARIZE"` | All use handleAssistantRewrite → SUMMARIZE |

---

## Tasks supported by backend but not used in UI

| `task` | Semantics | Used by any button? |
|--------|-----------|---------------------|
| `"PROMPT"` | Free-form user prompt to LLM | No |
| `"EXPLAIN2"` | Stronger simplification (plain language, short sentences) | No |

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
