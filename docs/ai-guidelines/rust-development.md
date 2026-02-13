# Rust and Tauri development

Reference for Rust style, Tauri patterns, and platform notes. See [AGENTS.md](../../AGENTS.md) for high-level boundaries and commands.

---

## Project overview

**Insight Reader** is a cross-platform text-to-speech application that reads text from clipboard, images, or screenshots. It supports offline voices via Piper and cloud voices via Microsoft Edge TTS.

### Tech stack

| Component | Technology |
|-----------|------------|
| Desktop shell | Tauri 2 |
| Backend | Rust (edition 2021 in `src-tauri/Cargo.toml`) |
| Frontend | React + TypeScript + Vite |
| JS runtime | Bun (wired in `src-tauri/tauri.conf.json`) |
| Audio | rodio |
| Local TTS | Piper |
| Cloud TTS | Microsoft Edge TTS (via `msedge-tts`), AWS Polly (planned/optional) |
| OCR | Windows Media OCR / macOS Vision / EasyOCR (Linux) |
| Errors | thiserror (typed errors); keep error chains user-actionable at command boundaries |
| Logging | tracing |
| Config | serde, serde_json |

### Code organization

The codebase is evolving. Create new files and folders when it improves clarity.

**Splitting code:**
- One module per major concern (TTS, system integration, OCR, window orchestration, config)
- Split files when they exceed ~300–400 lines
- Group related types: `mod.rs` + submodules (e.g. `tts/piper.rs`, `tts/microsoft.rs`)
- Platform-specific code in dedicated modules with `#[cfg(target_os)]`

**When to create new modules:**
- New TTS provider → new file in `src-tauri/src/tts/`
- New system integration (clipboard, selection, screenshot) → new module under `src-tauri/src/system/`
- New OCR backend → under `src-tauri/src/system/` (or `src-tauri/src/ocr/` if it grows)
- Frontend UI growing complex → split into `src/components/`, `src/pages/`, `src/hooks/`

**Key directories:**
- `src-tauri/` — Tauri backend, capabilities, permissions, config
- `src-tauri/src/` — Rust modules (`lib.rs`, `tts/`, `system/`, `paths.rs`)
- `src/` — React/TypeScript frontend
- `src/components/` — React components (e.g. `LiveTextViewer`)
- `src-tauri/capabilities/` — Tauri 2 capability definitions
- `src-tauri/permissions/` — Permission definitions for custom commands
- `install/` — Platform installers (modify carefully)
- `qa-docs/` — QA documentation

---

## Rust development standards

### Modern Rust (stable)

- Use modern features where they help: let-else bindings, iterator combinators, `std::sync::LazyLock`
- Prefer `std::sync::LazyLock` over `lazy_static`/`once_cell`
- Iterator combinators over manual loops when clearer
- Derive macros and procedural macros where appropriate

### Type system

- Use newtypes, marker traits, PhantomData where they add safety or clarity
- Newtype pattern for type safety and API boundaries
- Type-state pattern for compile-time state machines
- Avoid stringly-typed APIs; use enums and newtypes instead

### Clippy

```rust
#![warn(clippy::all, clippy::pedantic)]
#![deny(clippy::unwrap_used, clippy::expect_used)] // production code
```

### Error handling

- `thiserror` for library error types
- `anyhow` with `.context()` for application-level errors
- Never use `.unwrap()` / `.expect()` in production paths

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum InsightError {
    #[error("TTS synthesis failed: {0}")]
    Tts(#[from] TtsError),
    #[error("Audio playback error: {0}")]
    Audio(#[from] AudioError),
    #[error("OCR failed: {0}")]
    Ocr(#[from] OcrError),
}
```

### Idiomatic patterns

```rust
// Prefer if-let over .is_some() + .unwrap()
if let Some(value) = optional {
    use_value(value);
}

// Prefer let-else for early returns
let Some(value) = optional else {
    return Err(MyError::Missing);
};

// Use ? with .context() for clear error chains
let config = fs::read_to_string(&path)
    .context("Failed to read config file")?;
```

### Unsafe code

- Only when necessary; exhaust safe alternatives first
- Always document with `// SAFETY:` comments explaining invariants
- Prefer FFI with `#[repr(C)]` for interop

---

## Tauri 2 architecture and patterns

- **Rust backend:** `src-tauri/src/` (commands, state, system integrations, TTS)
- **React frontend:** `src/` (UI, invokes, window APIs)

### Backend commands (`#[tauri::command]`)

- Put handlers in `src-tauri/src/lib.rs` (or a dedicated module, re-exported from `lib.rs`).
- Prefer typed inputs/outputs with `serde::{Serialize, Deserialize}`.
- Prefer `Result<T, String>` at command boundaries; keep richer error types internally and convert at the edge.
- Keep commands thin: validate inputs → call domain module → map errors to a user-friendly string.

### Managed state (`.manage()` + `State<T>`)

- Use `.manage(...)` for long-lived state (workers, caches, initial text payloads, per-window data).
- Avoid `Arc<Mutex<...>>` unless state is truly shared and mutation is required; prefer channels or single-thread ownership when practical.
- Never `.unwrap()` a lock; map poison errors to a clear error string.

### Events (Rust → frontend)

- Use `Window::emit` / `AppHandle::emit` for push-style updates (e.g. "editor-set-text").
- Define event names as constants if reused.
- Treat event payloads as a stable API.

### Window management

- Window creation lives in the backend (`src-tauri/src/lib.rs`) with `WebviewWindowBuilder`.
- Frontend uses `@tauri-apps/api/window` for per-window UI and should fail gracefully when not running under Tauri (e.g. HMR / browser preview).

### Permissions and capabilities (Tauri 2)

When adding a new command:

1. **Backend:** add `#[tauri::command]` and include it in `tauri::generate_handler![...]`.
2. **Permissions:** add or extend a permission in `src-tauri/permissions/*.toml`.
3. **Capabilities:** ensure the relevant window capability in `src-tauri/capabilities/*.json` includes that permission (otherwise invokes are blocked).
4. **Frontend:** call via `invoke("command_name", { ...args })`.

---

## Async patterns (Tokio)

- Use `select!` for cancellation safety.
- Avoid blocking I/O in async contexts.
- Structured concurrency: spawn tasks that clean up properly.

```rust
pub async fn synthesize_with_cancel(
    &self,
    text: &str,
    cancel: CancellationToken,
) -> Result<AudioBuffer, TtsError> {
    tokio::select! {
        result = self.synthesize(text) => result,
        _ = cancel.cancelled() => Err(TtsError::Cancelled),
    }
}
```

---

## Platform-specific code

**Targets:** macOS (Apple Silicon, Intel), Windows 11, Ubuntu/Fedora (GNOME Wayland), Manjaro (KDE Wayland), Arch (Hyprland Wayland).

**Conditional compilation:** use `#[cfg(target_os = "windows")]`, `macos`, `linux` in dedicated modules (e.g. OCR engine selection).

**Linux notes:**
- System tray may require `libappindicator-gtk3` on some distros.
- Global hotkeys not supported on Wayland (use compositor config).
- Clipboard: `wl-clipboard` on Wayland, `xclip` on X11.

---

## TTS providers

**Piper (local):** Models under app data dir (`src-tauri/src/paths.rs`, typically `~/.insight-reader-2/models`). Files: `.onnx` + `.json`. Fully offline.

**Microsoft Edge TTS (cloud):** Implemented in `src-tauri/src/tts/microsoft.rs`. Treat network/service failures as expected; return user-actionable errors and keep the UI responsive (no long blocking work on the command thread).

---

## Performance

- Profile before optimizing (`cargo-flamegraph`, `samply`).
- Use `Cow<str>`, `Vec` over `LinkedList`, and `Box`/`Rc`/`Arc` intentionally; avoid `.clone()` spam.
- Overuse of `Arc<Mutex<T>>` → consider channels or ownership redesign.

---

## Configuration and logging

**Paths:** Centralize filesystem locations in `src-tauri/src/paths.rs`. Add new path helpers there; do not scatter `${HOME}/...` joins. Path helpers should return `Result<PathBuf, String>` with actionable error messages.

**Logging:** Use `tracing` (e.g. `tracing::info!(...)`, `tracing::error!(...)`), not `println!`.

---

## Git workflow

**Commit format:** `(<scope>): <description>` with types like `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf` and scopes like `tts`, `audio`, `ocr`, `ui`, `config`, `hotkeys`, `installer`.

**Before committing:** Run `cargo fmt --all`, `cargo clippy --all-targets`, `cargo test`; run a cleanup review (see [code-simplification.md](code-simplification.md)); test cross-platform when relevant.

---

## Anti-patterns to avoid

- `.unwrap()` / `.expect()` in library or production paths
- Stringly-typed APIs (use enums and newtypes)
- `Arc<Mutex<T>>` overuse when channels would be cleaner
- Premature `unsafe`
- Excessive `.clone()` instead of proper ownership
- Manual loops when iterator combinators are clearer
- Expensive work in React render instead of hooks/memoization
- `.is_some()` followed by `.unwrap()` — use `if let` or `let-else`

---

## Environment variables

```bash
RUST_LOG=info,insight_reader=debug
RUST_BACKTRACE=1
```
