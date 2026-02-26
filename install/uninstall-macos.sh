#!/usr/bin/env bash

set -euo pipefail

APP_BUNDLE_NAME="${APP_BUNDLE_NAME:-insight-reader-2.app}"
APP_SYSTEM_PATH="/Applications/${APP_BUNDLE_NAME}"
APP_USER_PATH="${HOME}/Applications/${APP_BUNDLE_NAME}"
BIN_LINK="${HOME}/.local/bin/insight-reader-2"

PURGE_PATHS=(
  "${HOME}/.insight-reader-2"
  "${HOME}/.config/insight-reader"
  "${HOME}/.cache/insight-reader"
  "${HOME}/.local/share/insight-reader"
  "${HOME}/.config/com.gabriel.insight-reader-2"
  "${HOME}/.cache/com.gabriel.insight-reader-2"
  "${HOME}/.local/share/com.gabriel.insight-reader-2"
  "${HOME}/Library/Application Support/com.gabriel.insight-reader-2"
  "${HOME}/Library/Caches/com.gabriel.insight-reader-2"
  "${HOME}/Library/WebKit/com.gabriel.insight-reader-2"
  "${HOME}/Library/Saved Application State/com.gabriel.insight-reader-2.savedState"
  "${HOME}/Library/Preferences/com.gabriel.insight-reader-2.plist"
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
    rm -rf "$path" 2>/dev/null || {
      log_warn "Could not remove ${path} (permission denied?)"
      return 0
    }
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

main() {
  if [ "$(uname -s)" != "Darwin" ]; then
    log_err "This uninstaller is for macOS only."
    exit 1
  fi

  echo "=============================================="
  echo " Insight Reader macOS Uninstaller"
  echo "=============================================="
  echo

  confirm_uninstall "${1:-}"

  remove_path "$BIN_LINK"
  remove_path "$APP_USER_PATH"
  remove_path "$APP_SYSTEM_PATH"

  for p in "${PURGE_PATHS[@]}"; do
    remove_path "$p"
  done

  echo
  log_ok "Uninstall complete."
}

main "$@"
