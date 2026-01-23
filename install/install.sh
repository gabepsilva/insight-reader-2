#!/bin/bash
# Detect OS and call appropriate installer
# This script downloads required install scripts from GitHub if they don't exist locally

set -euo pipefail

OS=$(uname -s)
# Handle case where script is piped from curl (BASH_SOURCE[0] may be unbound)
# Detect if script is being piped (stdin is not a terminal)
if [ -t 0 ]; then
    # Not piped - stdin is a terminal
    IS_PIPED=false
    if [ -n "${BASH_SOURCE[0]:-}" ]; then
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    else
        SCRIPT_DIR="${PWD:-$HOME}"
    fi
else
    # Piped - stdin is not a terminal (e.g., curl | bash)
    IS_PIPED=true
    SCRIPT_DIR="${PWD:-$HOME}"
fi
GITHUB_REPO="${GITHUB_REPO:-gabepsilva/insight-reader}"

# Export IS_PIPED so platform scripts can use it
export IS_PIPED

# Use cache directory for downloaded scripts (or local install directory if in repo)
# Check if we're in the install/ folder itself, or in the repo root
# Note: Using INSTALL_SCRIPT_DIR to avoid conflict with INSTALL_DIR in common-bash.sh
if [ -f "$SCRIPT_DIR/common-bash.sh" ]; then
    # We're in the install/ folder, use local scripts
    INSTALL_SCRIPT_DIR="$SCRIPT_DIR"
elif [ -d "$SCRIPT_DIR/install" ] && [ -f "$SCRIPT_DIR/install/common-bash.sh" ]; then
    # We're in the repository root, use install/ folder
    INSTALL_SCRIPT_DIR="$SCRIPT_DIR/install"
else
    # Download to cache directory
    INSTALL_SCRIPT_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/insight-reader-install"
    mkdir -p "$INSTALL_SCRIPT_DIR"
fi

# Function to download file from GitHub
download_file() {
    local url="$1"
    local output="$2"
    
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL -o "$output" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O "$output" "$url"
    else
        return 1
    fi
}

# Ensure install directory exists (already created above if using cache)

# Download required scripts from GitHub if they don't exist locally
GITHUB_BASE="https://raw.githubusercontent.com/$GITHUB_REPO/master/install"

# Helper function to download script if missing
download_script_if_missing() {
    local script_name="$1"
    if [ ! -f "$INSTALL_SCRIPT_DIR/$script_name" ]; then
        echo "Downloading $script_name from GitHub..."
        if ! download_file "$GITHUB_BASE/$script_name" "$INSTALL_SCRIPT_DIR/$script_name"; then
            echo "Error: Failed to download $script_name from GitHub"
            exit 1
        fi
        chmod +x "$INSTALL_SCRIPT_DIR/$script_name"
    fi
}

# Download required scripts
download_script_if_missing "common-bash.sh"

# Check and download platform-specific install script
case "$OS" in
    Linux)
        download_script_if_missing "install-linux.sh"
        exec "$INSTALL_SCRIPT_DIR/install-linux.sh" "$@"
        ;;
    Darwin)
        download_script_if_missing "install-macos.sh"
        exec "$INSTALL_SCRIPT_DIR/install-macos.sh" "$@"
        ;;
    *)
        echo "Unsupported OS: $OS"
        echo "Please use the appropriate installer script directly:"
        echo "  - Linux: install/install-linux.sh"
        echo "  - macOS: install/install-macos.sh"
        exit 1
        ;;
esac

