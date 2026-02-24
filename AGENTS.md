# Agent guidance for Insight Reader

**Insight Reader** is a cross-platform text-to-speech app (Tauri 2 + React/Vite). It reads from clipboard selections; offline voices via Piper, cloud via Microsoft Edge TTS.


THIS IS A CROSS-PLATFORM DESKTOP APP, ALWAYS CHECK WITH THE USER WHEN CHANGES IMPACT THE UI OR EXPERIENCE OF OTHER OS

---

## Quick reference

**Commands (from repo root):**
```bash
bun install
bun run tauri dev    # full app
bun run dev         # frontend only
bun run tauri build # bundles/installers
bun run build       # frontend build only
bun run test        # vitest tests

# Rust (from src-tauri)
cd src-tauri && cargo fmt --all && cargo clippy --all-targets --all-features && cargo test
```

**Bundle workflow / runners (GitHub Actions):**
- Bundle builds run from `.github/workflows/ci.yml` (manual `workflow_dispatch`) and are separate from `.github/workflows/test.yml`.
- Check runner availability before changing bundle jobs or assuming all OS builds can run:
  ```bash
  gh api repos/gabepsilva/insight-reader-2/actions/runners
  ```
- Runner snapshot (checked on 2026-02-24): Linux self-hosted runners online (`github`, `github-runner-vm108-02`, `github-runner-vm108-03`); macOS self-hosted runner present but offline (`github-runner-vm106-01`); Windows self-hosted runner present but offline (`github-runner-vm111-01`).
- Runner SSH access (local aliases):
  - Linux runner alias: `ssh gitrunner` (`github@github.i.psilva.org`)
  - macOS runner alias: `ssh gitrunner-mac` (`gitbuilder@gitbuildersipro.i.psilva.org`)
  - Keep these aliases in `~/.ssh/config` aligned with actual runner hostnames/users when infra changes.
  
- The bundle workflow uses per-OS dispatch inputs (`linux`, `windows`, `macos`) so you can avoid queueing jobs on offline self-hosted runners.
- Self-hosted runners keep workspace state between runs. Bundle jobs should upload artifacts and then clean `src-tauri/target/release/bundle` to avoid stale outputs contaminating later builds.
- If future bundle changes require signing/notarization/secrets, ask first and document the required runner-side tools/certs in this file.

**Detailed guidelines (by topic):**
- [Rust & Tauri development](docs/ai-guidelines/rust-development.md) — standards, errors, Tauri patterns, platform notes
- [Code simplification](docs/ai-guidelines/code-simplification.md) — cleanup and simplification before commit
- [Code review](docs/ai-guidelines/code-review.md) — correctness, security, architecture review
- [Architecture decisions](docs/ai-guidelines/architecture-decisions.md) — when and how to write ADRs
- [Release checklist](docs/ai-guidelines/release-checklist.md) — what to verify before releases (CI, linting, security, builds)
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
