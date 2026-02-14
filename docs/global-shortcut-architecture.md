# Global Shortcut Architecture (Most Reliable UX)

## Goal

Provide one consistent user experience across macOS, Windows, and Linux:

- Press a shortcut anywhere to read selected text.
- Keep behavior predictable and low-friction on every desktop stack.

## Current State (Observed)

- Hotkey config fields exist but are not wired to runtime registration in backend:
  - `src-tauri/src/config.rs`
  - `src/components/Settings/Settings.tsx`
- Settings currently shows static text implying `Ctrl+R` works everywhere:
  - `src/components/Settings/Settings.tsx`
- "Read Selected" action exists in tray handling and should be reused:
  - `src-tauri/src/lib.rs`
- Linux text acquisition path is already robust (PRIMARY selection, fallback clipboard):
  - `src-tauri/src/system/clipboard/linux.rs`

## Key Platform Constraint

Wayland compositors intentionally restrict generic app-level global key capture.

- macOS/Windows/Linux X11 can support app-owned global hotkeys.
- Linux Wayland should use compositor-owned keybinds that trigger app actions.

This is not a workaround; it is the correct architecture for reliability and UX on modern Linux desktops.

## Architecture Decision

Use a dual-path shortcut model with a single shared action engine:

- Path A (native app global hotkeys): macOS, Windows, Linux X11.
- Path B (external bridge): Linux Wayland compositors trigger app actions via a stable app entrypoint.

All entrypoints call the same internal actions to avoid behavior drift.

## Internal Action Engine

Create shared backend actions:

- `read_selected_action`
- `pause_resume_action`
- `stop_action`

Then route all triggers through these actions:

- tray menu
- native global hotkey
- external bridge command

Benefits:

- One behavior model across all platforms.
- Easier testing and fewer regressions.
- Better observability through consistent logging.

## Native Global Hotkeys (macOS, Windows, Linux X11)

Implement app-owned hotkeys on supported targets:

- Default read shortcut: `Ctrl+R` (or `Cmd+R` on macOS)
- Default secondary shortcut: `Ctrl+Shift+R` (or `Cmd+Shift+R`) for pause/resume or stop

Requirements:

- Add and initialize `tauri-plugin-global-shortcut` in backend.
- Register and unregister shortcuts based on saved config.
- Re-register when config changes.
- Surface conflicts and failures to the user in settings.

## Wayland Path (Hyprland now, GNOME later)

Use compositor-owned shortcuts and a reliable app bridge.

- Add stable action entrypoint, e.g. CLI command:
  - `insight-reader action read-selected`
  - `insight-reader action pause`
  - `insight-reader action stop`
- Ensure the command targets the running instance reliably (single-instance/IPC behavior).
- Configure compositor binds to call this entrypoint.

This gives Wayland users the same one-key UX while respecting platform security model.

### Hyprland Example Binds

Add these lines to `~/.config/hypr/bindings.conf`:

```conf
bindd = CTRL, R, Read selected text, exec, /home/gabriel/.local/bin/insight-reader action read-selected
bindd = CTRL SHIFT, R, Pause or resume speech, exec, /home/gabriel/.local/bin/insight-reader action pause
bindd = CTRL ALT, R, Stop speech, exec, /home/gabriel/.local/bin/insight-reader action stop
```

If you already have a broken legacy bind, remove/replace it. Then reload Hyprland:

```bash
hyprctl reload
```

Note: Plain `Ctrl+R` can override app refresh shortcuts in some applications. If preferred, remap these to a different combo (for example `SUPER+R`).

## Settings UX Requirements

Replace static hotkey messaging with runtime-aware status.

- For macOS/Windows/X11: show app-owned shortcut active state.
- For Wayland: show compositor-managed mode and setup status.
- Keep `hotkey_enabled`, `hotkey_modifiers`, and `hotkey_key` as canonical user preferences.

Provide guided setup text:

- Hyprland instructions first (current priority).
- GNOME instructions in next phase.

## Permissions and Capability Scope

For shortcut plugin integration:

- Add only required global-shortcut permissions in capabilities.
- Keep permissions minimal (`register`, `unregister`, `is-registered` as needed).
- Avoid widening authority beyond shortcut management.

## Reliability Hardening

- Debounce repeated hotkey triggers.
- Fail gracefully when no selected/clipboard text exists.
- Keep timeouts for text capture.
- Log trigger source (`tray`, `global_hotkey`, `cli`) and outcome.
- Make registration lifecycle idempotent on startup and config changes.

## Test and Verification Matrix

### Linux Wayland (Hyprland)

- Compositor shortcut invokes app action via bridge.
- Read/pause/stop all function with focus in other apps.

### Linux X11

- Native app hotkey captures globally.
- Same action behavior as tray and bridge.

### Windows and macOS

- Native global hotkeys work while app is backgrounded.
- Conflicts are surfaced clearly to users.

### Regression Checks

- Tray "Read Selected" still works.
- Selection fallback behavior unchanged.
- TTS stop/pause remains stable.
- No crash on app start minimized/backgrounded.

## Expected File Touchpoints (Implementation Phase)

- `src-tauri/src/lib.rs`
- `src-tauri/src/config.rs`
- `src-tauri/Cargo.toml`
- `src-tauri/capabilities/default.json`
- `src/components/Settings/Settings.tsx`
- new backend module(s) for action dispatch and shortcut management

## Acceptance Criteria

- One-key read flow works consistently across supported environments.
- Wayland behavior is explicit, reliable, and easy to configure.
- App-owned global hotkeys work out of the box on macOS/Windows/X11.
- Settings accurately reflects mode, health, and conflicts.
- No regressions in tray actions, TTS controls, or text capture behavior.
