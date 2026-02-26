#!/usr/bin/env bash

set -euo pipefail

APP_ID="insight-reader-2"
APP_BUNDLE_NAME="${APP_BUNDLE_NAME:-insight-reader-2.app}"
APP_EXECUTABLE_NAME="${APP_EXECUTABLE_NAME:-insight-reader-2}"

BIN_DIR="${HOME}/.local/bin"
BIN_LINK="${BIN_DIR}/${APP_ID}"
DEFAULT_APPS_DIR="/Applications"
FALLBACK_APPS_DIR="${HOME}/Applications"

BUCKET_PUBLIC_BASE="${BUCKET_PUBLIC_BASE:-https://f005.backblazeb2.com/file/insight-reader2}"
BUNDLE_PREFIX="${BUNDLE_PREFIX:-bundles/latest/main}"
MACOS_PAYLOAD_PREFIX="${BUCKET_PUBLIC_BASE%/}/${BUNDLE_PREFIX#/}/macos-installer"
DMG_URL="${DMG_URL:-${MACOS_PAYLOAD_PREFIX}/insight-reader-2-macos.dmg}"

BLUE=$'\033[0;34m'
YELLOW=$'\033[1;33m'
GREEN=$'\033[0;32m'
RED=$'\033[0;31m'
NC=$'\033[0m'
log_info() { printf "%s[INFO]%s %s\n" "$BLUE" "$NC" "$1"; }
log_warn() { printf "%s[WARN]%s %s\n" "$YELLOW" "$NC" "$1"; }
log_ok() { printf "%s[OK]%s %s\n" "$GREEN" "$NC" "$1"; }
log_err() { printf "%s[ERROR]%s %s\n" "$RED" "$NC" "$1" >&2; }

download_file() {
  local url="$1"
  local output="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 --retry-delay 2 -o "$output" "$url"
    return 0
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -q -O "$output" "$url"
    return 0
  fi
  log_err "Neither curl nor wget is available."
  return 1
}

require_tools() {
  local missing=()
  for tool in hdiutil ditto; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      missing+=("$tool")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    log_err "Missing required macOS tools: ${missing[*]}"
    exit 1
  fi
}

cleanup() {
  if [ -n "${MOUNT_POINT:-}" ] && [ -d "${MOUNT_POINT}" ]; then
    hdiutil detach "${MOUNT_POINT}" -quiet >/dev/null 2>&1 || true
  fi
  if [ -n "${TMP_DMG:-}" ]; then
    rm -f "${TMP_DMG}" >/dev/null 2>&1 || true
  fi
}

download_dmg() {
  TMP_DMG="$(mktemp -t insight-reader-2.XXXXXX.dmg)"
  log_info "Downloading macOS DMG from ${DMG_URL}"
  if ! download_file "$DMG_URL" "$TMP_DMG"; then
    rm -f "$TMP_DMG"
    log_err "Failed to download DMG."
    exit 1
  fi
  log_ok "Downloaded DMG to ${TMP_DMG}"
}

mount_dmg() {
  local attach_output
  log_info "Mounting DMG"
  if ! attach_output="$(hdiutil attach -nobrowse -readonly "$TMP_DMG" 2>/dev/null)"; then
    log_err "Failed to mount DMG."
    exit 1
  fi

  MOUNT_POINT="$(printf '%s\n' "$attach_output" | awk '/\/Volumes\// { mp=$NF } END { print mp }')"
  if [ -z "${MOUNT_POINT}" ] || [ ! -d "${MOUNT_POINT}" ]; then
    log_err "Could not determine mounted volume path."
    exit 1
  fi

  log_ok "Mounted at ${MOUNT_POINT}"
}

find_app_in_volume() {
  APP_SOURCE_PATH="$(find "$MOUNT_POINT" -maxdepth 2 -type d -name '*.app' | sort | head -n1 || true)"
  if [ -z "${APP_SOURCE_PATH}" ] || [ ! -d "${APP_SOURCE_PATH}" ]; then
    log_err "No .app bundle found inside mounted DMG."
    exit 1
  fi
  log_ok "Found app bundle: ${APP_SOURCE_PATH}"
}

install_app_bundle() {
  local preferred_dir target_dir target_path

  preferred_dir="${APP_DEST_DIR:-$DEFAULT_APPS_DIR}"
  target_dir="$preferred_dir"
  target_path="${target_dir}/${APP_BUNDLE_NAME}"

  rm -rf "$target_path" 2>/dev/null || true
  if mkdir -p "$target_dir" 2>/dev/null && ditto "$APP_SOURCE_PATH" "$target_path" 2>/dev/null; then
    INSTALLED_APP_PATH="$target_path"
    log_ok "Installed app bundle to ${INSTALLED_APP_PATH}"
    return 0
  fi

  if [ "$target_dir" = "$DEFAULT_APPS_DIR" ]; then
    log_warn "Could not write to ${DEFAULT_APPS_DIR}; installing to ${FALLBACK_APPS_DIR} instead."
    mkdir -p "$FALLBACK_APPS_DIR"
    target_dir="$FALLBACK_APPS_DIR"
    target_path="${target_dir}/${APP_BUNDLE_NAME}"
    rm -rf "$target_path"
    ditto "$APP_SOURCE_PATH" "$target_path"
    INSTALLED_APP_PATH="$target_path"
    log_ok "Installed app bundle to ${INSTALLED_APP_PATH}"
    return 0
  fi

  log_err "Failed to install app bundle to ${target_path}"
  exit 1
}

install_cli_symlink() {
  local app_executable
  app_executable="${INSTALLED_APP_PATH}/Contents/MacOS/${APP_EXECUTABLE_NAME}"
  if [ ! -x "$app_executable" ]; then
    log_warn "App executable not found at ${app_executable}; skipping CLI symlink."
    return 0
  fi

  mkdir -p "$BIN_DIR"
  ln -sfn "$app_executable" "$BIN_LINK"
  log_ok "Installed command link: ${BIN_LINK}"
}

print_summary() {
  echo
  log_ok "Installation complete."
  echo "App bundle: ${INSTALLED_APP_PATH}"
  echo "Command: ${BIN_LINK}"
  echo

  if [[ ":$PATH:" != *":${BIN_DIR}:"* ]]; then
    log_warn "${BIN_DIR} is not in PATH. Add it to run '${APP_ID}' from the terminal."
  fi

  cat <<EOF

If macOS blocks the app on first launch (Gatekeeper/quarantine), you can run:
  xattr -dr com.apple.quarantine "${INSTALLED_APP_PATH}"

EOF
}

main() {
  if [ "$(uname -s)" != "Darwin" ]; then
    log_err "This installer is for macOS only."
    exit 1
  fi

  echo "=============================================="
  echo " Insight Reader macOS Installer (DMG)"
  echo "=============================================="
  echo

  require_tools
  trap cleanup EXIT

  download_dmg
  mount_dmg
  find_app_in_volume
  install_app_bundle
  install_cli_symlink
  cleanup
  trap - EXIT
  print_summary
}

main "$@"
