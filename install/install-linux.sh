#!/usr/bin/env bash

set -euo pipefail

APP_NAME="Insight Reader"
APP_ID="insight-reader-2"
INSTALL_ROOT="${HOME}/.local/share/insight-reader"
APPIMAGE_PATH="${INSTALL_ROOT}/insight-reader.AppImage"
BIN_DIR="${HOME}/.local/bin"
BIN_LINK="${BIN_DIR}/insight-reader-2"
DESKTOP_DIR="${HOME}/.local/share/applications"
DESKTOP_FILE="${DESKTOP_DIR}/insight-reader-2.desktop"
ICON_DIR="${HOME}/.local/share/icons/hicolor/128x128/apps"
ICON_PATH="${ICON_DIR}/insight-reader-2.png"

# Public bucket base; override if using Cloudflare or a mirror.
BUCKET_PUBLIC_BASE="${BUCKET_PUBLIC_BASE:-https://f005.backblazeb2.com/file/insight-reader2}"
BUNDLE_PREFIX="${BUNDLE_PREFIX:-bundles/latest/main}"
LINUX_PAYLOAD_PREFIX="${BUCKET_PUBLIC_BASE%/}/${BUNDLE_PREFIX#/}/linux-installer"

APPIMAGE_URL="${APPIMAGE_URL:-${LINUX_PAYLOAD_PREFIX}/insight-reader-2-linux-x86_64.AppImage}"
ICON_URL="${ICON_URL:-${LINUX_PAYLOAD_PREFIX}/insight-reader-2.png}"
DESKTOP_TEMPLATE_URL="${DESKTOP_TEMPLATE_URL:-${LINUX_PAYLOAD_PREFIX}/linux.desktop.template}"

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

detect_arch() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64)
      ARCH="x86_64"
      ;;
    *)
      log_err "Unsupported Linux architecture: ${arch}. This installer currently publishes x86_64 AppImage only."
      exit 1
      ;;
  esac
}

print_fuse_warning_box() {
  cat <<'EOF'
+----------------------------------------------------------------------------+
| WARNING: FUSE runtime compatibility (libfuse.so.2) was not detected.       |
|                                                                            |
| The AppImage was installed anyway, but it may fail to launch until your    |
| system has FUSE 2 compatibility libraries available.                       |
|                                                                            |
| Common packages (examples):                                                |
|   Ubuntu/Debian/Mint/Pop!_OS: libfuse2   (or libfuse2t64 on newer Ubuntu) |
|   Fedora:                   fuse-libs                                      |
|   Arch/Manjaro:             fuse2                                          |
|                                                                            |
| If launch fails, install the package for your distro and try again.        |
+----------------------------------------------------------------------------+
EOF
}

has_fuse2_runtime() {
  if command -v ldconfig >/dev/null 2>&1; then
    if ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
      return 0
    fi
  fi

  if find /lib /lib64 /usr/lib /usr/lib64 /usr/lib/x86_64-linux-gnu \
      -maxdepth 2 -type f -name 'libfuse.so.2*' 2>/dev/null | grep -q .; then
    return 0
  fi

  return 1
}

ensure_dirs() {
  mkdir -p "$INSTALL_ROOT" "$BIN_DIR" "$DESKTOP_DIR" "$ICON_DIR"
}

download_appimage() {
  local tmp_file
  tmp_file="$(mktemp)"
  log_info "Downloading AppImage from ${APPIMAGE_URL}"
  if ! download_file "$APPIMAGE_URL" "$tmp_file"; then
    rm -f "$tmp_file"
    log_err "Failed to download AppImage."
    exit 1
  fi
  install -m 0755 "$tmp_file" "$APPIMAGE_PATH"
  rm -f "$tmp_file"
  log_ok "Installed AppImage to ${APPIMAGE_PATH}"
}

install_cli_symlink() {
  ln -sfn "$APPIMAGE_PATH" "$BIN_LINK"
  log_ok "Installed command link: ${BIN_LINK}"
}

install_icon() {
  local tmp_icon
  tmp_icon="$(mktemp)"
  log_info "Downloading icon from ${ICON_URL}"
  if ! download_file "$ICON_URL" "$tmp_icon"; then
    rm -f "$tmp_icon"
    log_err "Failed to download icon."
    exit 1
  fi
  install -m 0644 "$tmp_icon" "$ICON_PATH"
  rm -f "$tmp_icon"
  log_ok "Installed icon to ${ICON_PATH}"
}

render_desktop_file() {
  local tmp_template tmp_desktop
  tmp_template="$(mktemp)"
  tmp_desktop="$(mktemp)"

  log_info "Downloading desktop template from ${DESKTOP_TEMPLATE_URL}"
  if ! download_file "$DESKTOP_TEMPLATE_URL" "$tmp_template"; then
    rm -f "$tmp_template" "$tmp_desktop"
    log_err "Failed to download desktop template."
    exit 1
  fi

  sed \
    -e "s|{{categories}}|Utility;AudioVideo;Accessibility;|g" \
    -e "s|{{comment}}|Read clipboard text aloud with offline and cloud voices.|g" \
    -e "s|{{exec}}|${APPIMAGE_PATH}|g" \
    -e "s|{{icon}}|${APP_ID}|g" \
    -e "s|{{name}}|${APP_NAME}|g" \
    "$tmp_template" | sed -e "s|^StartupWMClass=.*|StartupWMClass=${APP_ID}|" > "$tmp_desktop"

  install -m 0644 "$tmp_desktop" "$DESKTOP_FILE"
  rm -f "$tmp_template" "$tmp_desktop"
  log_ok "Installed desktop entry to ${DESKTOP_FILE}"
}

refresh_desktop_caches() {
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" >/dev/null 2>&1 || true
  fi
  if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t "${HOME}/.local/share/icons/hicolor" >/dev/null 2>&1 || true
  fi
}

main() {
  if [ "$(uname -s)" != "Linux" ]; then
    log_err "This installer is for Linux only."
    exit 1
  fi

  detect_arch
  if [ "$ARCH" != "x86_64" ]; then
    log_err "No AppImage URL configured for architecture: ${ARCH}"
    exit 1
  fi

  echo "=============================================="
  echo " Insight Reader Linux Installer (AppImage)"
  echo "=============================================="
  echo

  ensure_dirs
  if ! has_fuse2_runtime; then
    print_fuse_warning_box
    echo
  fi

  download_appimage
  install_cli_symlink
  install_icon
  render_desktop_file
  refresh_desktop_caches

  echo
  log_ok "Installation complete."
  echo "Command: ${BIN_LINK}"
  echo "Desktop entry: ${DESKTOP_FILE}"
  echo "AppImage: ${APPIMAGE_PATH}"
  echo
  if [[ ":$PATH:" != *":${BIN_DIR}:"* ]]; then
    log_warn "${BIN_DIR} is not in PATH. Add it to run '${APP_ID}' from the terminal."
  fi
}

main "$@"
