# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Commands

Use `bun` or `npm` (the project uses `bun run` in `tauri.conf.json`).

### Development

```bash
bun run tauri dev
# or: npm run tauri dev
```

Runs the app in development mode with hot reload (Vite + Tauri, debug Rust build).

### Build – release (distributions)

```bash
bun run tauri build
# or: npm run tauri build
```

Builds the frontend, compiles Rust in **release** mode, and produces installers in `src-tauri/target/release/bundle/`:

- **macOS**: `.app`, `.dmg`
- **Windows**: `.msi`, `.exe` (NSIS)
- **Linux**: `.deb`, `.AppImage`, etc. (depends on bundle targets)

### macOS: ARM (Apple Silicon) and x86 (Intel)

You can build a **universal binary** (one `.app` that runs on both) or separate builds per architecture.

**1. Install Rust targets (one-time):**

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

**2. Universal binary (ARM + x86 in one .app / .dmg):**

```bash
bun run tauri build --target universal-apple-darwin
# or: npm run tauri build --target universal-apple-darwin
```

Bundles: `src-tauri/target/universal-apple-darwin/release/bundle/macos/`, `.../bundle/dmg/`

**3. Single architecture only:**

```bash
# Apple Silicon only
bun run tauri build --target aarch64-apple-darwin

# Intel only
bun run tauri build --target x86_64-apple-darwin
```

Bundles:

- **ARM**: `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/insight-reader-2.app`, `.../bundle/dmg/insight-reader-2_0.1.0_aarch64.dmg`
- **Intel**: `src-tauri/target/x86_64-apple-darwin/release/bundle/macos/insight-reader-2.app`, `.../bundle/dmg/insight-reader-2_0.1.0_x64.dmg`

**If `tauri build` fails with `invalid value '1' for '--ci'`** (e.g. in Cursor/CI when `CI=1`): run with `CI` unset:

```bash
CI= bun run tauri build --target x86_64-apple-darwin
```

Cross-compiling (e.g. ARM→Intel on Apple Silicon) works; the universal target builds both on the host and combines them.

### Debug / release (Rust only)

From `src-tauri/`:

```bash
cargo build              # debug (faster compile, unoptimized)
cargo build --release    # release (optimized)
```

### Frontend only

```bash
bun run dev     # Vite dev server (no Tauri window)
bun run build   # Vite production build → dist/
bun run preview # Preview production build
```

---

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
