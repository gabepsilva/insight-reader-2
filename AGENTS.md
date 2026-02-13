# Agent guidance for Insight Reader

**Insight Reader** is a cross-platform text-to-speech app (Tauri 2 + React/Vite). It reads from clipboard, images, and screenshots; offline voices via Piper, cloud via Microsoft Edge TTS.

---

## Quick reference

**Commands (from repo root):**
```bash
bun install
bun run tauri dev    # full app
bun run dev         # frontend only
bun run tauri build # bundles/installers
cd src-tauri && cargo fmt --all && cargo clippy --all-targets --all-features && cargo test
```

**Detailed guidelines (by topic):**
- [Rust & Tauri development](docs/ai-guidelines/rust-development.md) — standards, errors, Tauri patterns, platform notes
- [Code simplification](docs/ai-guidelines/code-simplification.md) — cleanup and simplification before commit
- [Code review](docs/ai-guidelines/code-review.md) — correctness, security, architecture review
- [Architecture decisions](docs/ai-guidelines/architecture-decisions.md) — when and how to write ADRs
- [Porting Iced → Tauri](docs/ai-guidelines/porting-iced-to-tauri.md) — reference for the migration
- [Test VMs](docs/ai-guidelines/test-vms.md) — VM access and copying debug binaries

---

## How to work

**Priority:** Maintainability > Simplicity > Elimination (no dead code by default).

- **Before coding:** Confirm the goal and approach. If a "small change" touches architecture, say so and ask before proceeding.
- **When proposing changes:** Explain *why* it helps; call out assumptions and trade-offs.
- **Push back when needed:** If a request would introduce `.unwrap()` in production, stringly-typed APIs, or other anti-patterns, name the concern and suggest an alternative instead of complying.
- **Work UI-first:** Work backwards from the UI to the backend — implement the frontend/UI first to verify it looks and feels right, then connect to the backend. This ensures the UX is correct before building the underlying functionality.

**Self-check before finishing:** Does this actually solve the problem? Would it work with different inputs?

---

## Boundaries

**Always:** Run `cargo fmt` after Rust changes; run `cargo test` after changes; use `tracing` for logging; handle `Result`/`Option` explicitly; give user-friendly error messages.

**Ask first:** New `Cargo.toml` deps; Tauri security/CSP changes; command permissions/capabilities; on-disk config format changes.

**Never:** `.unwrap()`/`.expect()` in production paths; `panic!()` for recoverable errors; commit credentials; premature `unsafe`; breaking backward compatibility without a migration path; blocking I/O in async code.

---

For full Rust idioms, Tauri commands/permissions, platform notes, and anti-patterns, see [docs/ai-guidelines/rust-development.md](docs/ai-guidelines/rust-development.md).
