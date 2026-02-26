#!/usr/bin/env bash

set -euo pipefail

APP_ID="insight-reader-2"
INSTALL_ROOT="${HOME}/.local/share/insight-reader"
APPIMAGE_PATH="${INSTALL_ROOT}/insight-reader.AppImage"
BIN_LINK="${HOME}/.local/bin/${APP_ID}"
DESKTOP_FILE="${HOME}/.local/share/applications/${APP_ID}.desktop"
ICON_PATH="${HOME}/.local/share/icons/hicolor/128x128/apps/${APP_ID}.png"

PURGE_PATHS=(
  "${HOME}/.insight-reader-2"
  "${HOME}/.config/insight-reader"
  "${HOME}/.cache/insight-reader"
  "${HOME}/.local/share/insight-reader"
  "${HOME}/.config/com.gabriel.insight-reader-2"
  "${HOME}/.cache/com.gabriel.insight-reader-2"
  "${HOME}/.local/share/com.gabriel.insight-reader-2"
)

BLUE=$'\033[0;34m'
YELLOW=$'\033[1;33m'
GREEN=$'\033[0;32m'
RED=$'\033[0;31m'
NC=$'\033[0m'
log_info() { printf "%s[INFO]%s %s\n" "$BLUE" "$NC" "$1"; }
log_warn() { printf "%s[WARN]%s %s\n" "$YELLOW" "$NC" "$1"; }
log_ok() { printf "%s[OK]%s %s\n" "$GREEN" "$NC" "$1"; }
log_err() { printf "%s[ERROR]%s %s\n" "$RED" "$NC" "$1" >&2; }

remove_path() {
  local path="$1"
  if [ -L "$path" ] || [ -e "$path" ]; then
    rm -rf "$path"
    log_ok "Removed ${path}"
  fi
}

confirm_uninstall() {
  if [ "${1:-}" = "--yes" ] || [ "${INSIGHT_READER_UNINSTALL_YES:-}" = "1" ]; then
    return 0
  fi

  if [ ! -t 0 ]; then
    log_err "Refusing to run destructive uninstall non-interactively without --yes (or INSIGHT_READER_UNINSTALL_YES=1)."
    exit 1
  fi

  echo "This will remove Insight Reader and local runtime data, including config and downloaded voices."
  read -r -p "Continue? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    log_warn "Cancelled."
    exit 0
  fi
}

refresh_desktop_caches() {
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${HOME}/.local/share/applications" >/dev/null 2>&1 || true
  fi
  if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t "${HOME}/.local/share/icons/hicolor" >/dev/null 2>&1 || true
  fi
}

main() {
  if [ "$(uname -s)" != "Linux" ]; then
    log_err "This uninstaller is for Linux only."
    exit 1
  fi

  echo "=============================================="
  echo " Insight Reader Linux Uninstaller"
  echo "=============================================="
  echo

  confirm_uninstall "${1:-}"

  remove_path "$BIN_LINK"
  remove_path "$DESKTOP_FILE"
  remove_path "$ICON_PATH"
  remove_path "$APPIMAGE_PATH"
  remove_path "$INSTALL_ROOT"

  for p in "${PURGE_PATHS[@]}"; do
    remove_path "$p"
  done

  refresh_desktop_caches

  echo
  log_ok "Uninstall complete."
}

main "$@"
