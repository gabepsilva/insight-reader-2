# ReadingService Backend — REST API for LLM Integration

This document describes the REST API of the ReadingService backend so an LLM (or app using an LLM) can correctly call its endpoints. Use it when building or prompting an app that consumes this service.

**Base URL:** The server runs on port **8080**. Example base: `http://localhost:8080` or `http://<host>:8080`.

**Content-Type:** Send JSON with `Content-Type: application/json` where a request body is required.

**Body size limit:** Request bodies are limited to **1 MB**. Larger payloads return **413 Payload Too Large** with a JSON body like `{ "error": "..." }`.

---

## Endpoints

### 1. Root — Greeting

- **Method:** `GET`
- **Path:** `/`
- **Request body:** None
- **Success (200):** JSON with a greeting.

**Example response:**
```json
{ "message": "Hello, World!" }
```

**Use case:** Check that the service is reachable or show a simple welcome in the app.

---

### 2. Health check

- **Method:** `GET`
- **Path:** `/health`
- **Request body:** None
- **Success (200):** JSON indicating the service is healthy.

**Example response:**
```json
{ "status": "healthy" }
```

**Use case:** Liveness/readiness probes, or deciding whether to call other endpoints (e.g. before calling `/api/prompt`).

---

### 3. Prompt / LLM task

- **Method:** `POST`
- **Path:** `/api/prompt`
- **Request body:** JSON object with two required fields.

**Request body schema:**

| Field     | Type   | Required | Description |
|----------|--------|----------|-------------|
| `task`   | string | Yes      | One of: `PROMPT`, `TTS`, `SUMMARIZE`, `EXPLAIN1`, `EXPLAIN2` (case-sensitive). |
| `content`| string | Yes      | Input text: raw content for TTS/Summarize/Explain, or the user prompt for `PROMPT`. |

**Task semantics:**

- **`PROMPT`** — Send `content` as the user message to the LLM and return the raw reply. No built-in system prompt; use for free-form prompting.
- **`TTS`** — Clean raw social/media content (e.g. Reddit, Discord) for text-to-speech: remove UI clutter, format for narration, convert URLs/emojis to spoken form. Output is Markdown suitable for reading aloud.
- **`SUMMARIZE`** — Turn `content` into a concise, high-signal summary for reading (not verbatim TTS). The model should:
  - **Ignore** UI chrome and metadata: timestamps, vote counts, permalinks, “share / reply” buttons, flair tags, pagination, boilerplate signatures, and tracking/query parameters in URLs.
  - **Keep** the actual substance: arguments, conclusions, decisions, important caveats, numbers, and named entities that matter for understanding.
  - **Preserve nuance:** avoid oversimplifying technical/nuanced points; briefly call out disagreements or key alternatives instead of flattening them.
  - **Be factual:** do not invent information or speculate beyond what appears in `content`.
  - **Output format:** plain text or Markdown only (no JSON). For short inputs (a few sentences), a single short paragraph is fine. For longer threads/articles, prefer:
    - A short one–two sentence overview, then
    - A bulleted list of 3–8 key points, and
    - An optional `Action items:` or `Open questions:` sub-list if the text clearly implies tasks or unresolved issues.
- **`EXPLAIN1`** — Explain the substance for capable professionals who “missed the point”: clearer wording, brief clarifications, same rigor; not oversimplified.
- **`EXPLAIN2`** — Stronger simplification: plain language, short sentences, concrete examples, minimal jargon; still professional and respectful.

**Success (200):** JSON with the LLM’s reply.

**Example request:**
```json
{
  "task": "SUMMARIZE",
  "content": "Paste here the raw text from a webpage or thread..."
}
```

**Example response:**
```json
{
  "response": "The main points are: ..."
}
```

**Error responses:** All error bodies use the shape `{ "error": "<human-readable message>" }`.

| HTTP status | When it happens |
|-------------|------------------|
| **400**     | Invalid `task` (not one of the five allowed values). |
| **413**     | Request body larger than 1 MB. |
| **502**     | Upstream LLM API error (e.g. 4xx/5xx from the provider). |
| **504**     | Request to the LLM timed out. |
| **500**     | Internal error (e.g. connection failure, parse error, empty LLM response). |

**Use case:** From an app (or an LLM deciding what to do), call this endpoint with the appropriate `task` and the user’s content to get cleaned/summarized/explained text or a free-form LLM reply.

---

## Summary for LLM / app logic

1. **Reachability:** `GET /` or `GET /health` to confirm the service is up.
2. **LLM work:** `POST /api/prompt` with JSON `{ "task": "<PROMPT|TTS|SUMMARIZE|EXPLAIN1|EXPLAIN2>", "content": "<user text>" }`. Response is `{ "response": "<LLM output>" }`.
3. **Errors:** Always check HTTP status; on 4xx/5xx, read `error` in the JSON body for the message.
4. **Size:** Keep request bodies under 1 MB.

**OpenAPI/Swagger:** If the server is running, interactive docs are at `/swagger-ui/` and the OpenAPI JSON at `/api-docs/openapi.json` (same contract as above).
