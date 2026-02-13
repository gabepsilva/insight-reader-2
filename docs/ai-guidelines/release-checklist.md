# Release Checklist

A lead DevOps agent must verify these items before any release (PR merge to main, version tag, or publish).

---

## 1. CI Pipeline Passes

All GitHub Actions workflows must pass:
- Frontend: `npm run build` + `npm run test`
- Backend: `cargo fmt`, `cargo clippy`, `cargo test`

---

## 2. Code Quality

### Frontend (TypeScript/React)
```bash
# Lint + format check
npm run lint  # if configured
npx prettier --check src/

# Type check
npx tsc --noEmit
```

### Backend (Rust)
```bash
cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

---

## 3. Security Checks

### Rust dependencies
```bash
cargo audit
cargo-outdated -R
```

### Frontend dependencies
```bash
npm audit
npm outdated
```

---

## 4. Build Verification

Test the actual build works:
```bash
bun run tauri build
```

Verify artifacts exist:
- Windows: `src-tauri/target/release/bundle/nsis/*.exe`
- Linux: `src-tauri/target/release/bundle/appimage/*.AppImage`

---

## 5. Pre-release Commands

Run these in order before releasing:

```bash
# 1. Update version in package.json and Cargo.toml
# 2. Build frontend
npm run build
# 3. Build Tauri app
bun run tauri build
# 4. Run security audits
cargo audit
# 5. Tag version
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

---

## 6. Tools to Add

| Tool | Command | Purpose |
|------|---------|---------|
| `eslint` | `npx eslint src/` | JS/TS linting |
| `prettier` | `npx prettier --check .` | Code formatting |
| `cargo-audit` | `cargo audit` | Vulnerability scanning |
| `cargo-outdated` | `cargo-outdated -R` | Outdated deps |
| `typos` | `typos` | Spell check in code |
