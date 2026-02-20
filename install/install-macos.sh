#!/bin/bash

set -euo pipefail

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common-bash.sh"

log_info "Installing to: $INSTALL_DIR"
log_info "Binary will be installed to: $BIN_DIR"

# Add Homebrew path to shell config for future sessions
add_homebrew_to_shell_config() {
    local brew_path="$1"
    local config_file=""
    
    if [ -f "$HOME/.bash_profile" ]; then
        config_file="$HOME/.bash_profile"
    elif [ -f "$HOME/.bashrc" ]; then
        config_file="$HOME/.bashrc"
    fi
    
    if [ -n "$config_file" ] && ! grep -q "$brew_path" "$config_file"; then
        echo "export PATH=\"$brew_path:\$PATH\"" >> "$config_file"
    fi
}

# Check if Homebrew is installed
check_homebrew() {
    # First check if brew is in PATH
    if command_exists brew; then
        log_success "Homebrew found"
        return 0
    fi
    
    # Try to find brew in common locations and add to PATH
    local brew_path=""
    if [ -f "/opt/homebrew/bin/brew" ]; then
        brew_path="/opt/homebrew/bin"
    elif [ -f "/usr/local/bin/brew" ]; then
        brew_path="/usr/local/bin"
    fi
    
    if [ -n "$brew_path" ]; then
        export PATH="$brew_path:$PATH"
        if command_exists brew; then
            log_success "Homebrew found (added to PATH)"
            add_homebrew_to_shell_config "$brew_path"
            return 0
        fi
    fi
    
    # Homebrew not found, offer to install
    log_warn "Homebrew not found"
    log_info "Homebrew is required to install dependencies on macOS"
    log_info "Install it from: https://brew.sh"
    echo ""
    read -p "Install Homebrew now? [Y/n] " -r
    echo ""
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        log_error "Cannot continue without Homebrew"
        exit 1
    fi
    
    log_info "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH (Apple Silicon uses /opt/homebrew, Intel uses /usr/local)
    local brew_path=""
    if [ -d "/opt/homebrew/bin" ]; then
        brew_path="/opt/homebrew/bin"
    elif [ -d "/usr/local/bin" ]; then
        brew_path="/usr/local/bin"
    fi
    
    if [ -n "$brew_path" ]; then
        export PATH="$brew_path:$PATH"
        add_homebrew_to_shell_config "$brew_path"
    fi
    
    # Verify Homebrew installation
    if ! command_exists brew; then
        log_error "Homebrew installation failed or not in PATH"
        log_info "Please restart your terminal and run this script again"
        exit 1
    fi
    
    log_success "Homebrew installed successfully"
}

# Check all required dependencies and install if missing
check_and_install_dependencies() {
    local missing_deps=()
    
    log_info "Checking required dependencies..."
    
    # Check espeak-ng
    if ! command_exists espeak-ng; then
        missing_deps+=("espeak-ng")
        log_warn "espeak-ng not found (required)"
    else
        log_success "espeak-ng found"
    fi
    
    # Clipboard support is handled by arboard crate (no external dependencies needed)
    
    # Check Python3
    local python_missing=false
    local venv_missing=false
    if ! command_exists python3; then
        missing_deps+=("python3")
        python_missing=true
        log_warn "python3 not found (required)"
    else
        PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
        log_info "Python3 found: $PYTHON_VERSION"
        
        # Check venv module - try to actually use it, not just check help
        if ! python3 -m venv --help >/dev/null 2>&1; then
            missing_deps+=("python3-venv")
            venv_missing=true
            log_warn "python3-venv module not found (required)"
        else
            # Test if venv can actually create a venv (requires ensurepip)
            local test_venv_dir
            test_venv_dir=$(mktemp -d)
            if python3 -m venv "$test_venv_dir" >/dev/null 2>&1; then
                rm -rf "$test_venv_dir"
                log_success "Python3 venv module is available"
            else
                missing_deps+=("python3-venv")
                venv_missing=true
                log_warn "python3-venv module cannot create virtual environments (required)"
                rm -rf "$test_venv_dir" 2>/dev/null || true
            fi
        fi
    fi
    
    # If all dependencies are present, return
    if [ ${#missing_deps[@]} -eq 0 ]; then
        log_success "All required dependencies are installed"
        return 0
    fi
    
    # Show missing dependencies and ask user
    echo ""
    log_warn "Missing required dependencies:"
    for dep in "${missing_deps[@]}"; do
        echo "  - $dep"
    done
    echo ""
    read -p "Install missing dependencies via Homebrew? [Y/n] " -r
    echo ""
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        log_error "Cannot continue without required dependencies"
        exit 1
    fi
    
    # Ensure Homebrew is available
    check_homebrew
    
    # Install packages via Homebrew
    local packages_to_install=()
    
    if [ "$python_missing" = true ]; then
        packages_to_install+=("python@3.12")
    fi
    
    if [[ " ${missing_deps[@]} " =~ " espeak-ng " ]]; then
        packages_to_install+=("espeak-ng")
    fi
    
    if [ ${#packages_to_install[@]} -gt 0 ]; then
        log_info "Installing packages via Homebrew: ${packages_to_install[*]}"
        brew install "${packages_to_install[@]}"
    fi
    
    # Verify installations
    if ! command_exists python3; then
        log_error "Python3 installation failed or not found in PATH"
        log_info "You may need to add Homebrew's Python to your PATH"
        log_info "Add this to your ~/.bash_profile or ~/.bashrc:"
        log_info "  export PATH=\"\$(brew --prefix)/bin:\$PATH\""
        exit 1
    fi
    
    # Verify venv can actually create a venv
    local test_venv_dir
    test_venv_dir=$(mktemp -d)
    if ! python3 -m venv "$test_venv_dir" >/dev/null 2>&1; then
        rm -rf "$test_venv_dir" 2>/dev/null || true
        log_error "Python3 venv module cannot create virtual environments"
        log_error "Try: brew install python@3.12"
        exit 1
    fi
    rm -rf "$test_venv_dir"
    log_success "Python3 venv module verified"
    
    if ! command_exists espeak-ng; then
        log_warn "espeak-ng installation may have failed. Piper may not work correctly."
    fi
    
    log_success "Dependencies installed successfully"
}

# Create macOS app bundle and install to Applications
create_app_bundle() {
    log_info "Creating macOS app bundle..."
    
    # App bundle paths
    APP_NAME="insight-reader.app"
    APP_DIR="/Applications/$APP_NAME"
    APP_CONTENTS="$APP_DIR/Contents"
    APP_MACOS="$APP_CONTENTS/MacOS"
    APP_RESOURCES="$APP_CONTENTS/Resources"
    
    # Download logo from GitHub
    log_info "Downloading logo from GitHub..."
    local temp_logo
    temp_logo=$(mktemp)
    ICON_URL="https://raw.githubusercontent.com/$GITHUB_REPO/master/assets/logo.svg"
    if download_file "$ICON_URL" "$temp_logo"; then
        LOGO_FILE="$temp_logo"
        log_success "Logo downloaded from GitHub"
    else
        log_warn "Failed to download logo, app bundle will be created without icon"
        LOGO_FILE=""
        rm -f "$temp_logo" 2>/dev/null || true
    fi
    
    # Remove existing app bundle if it exists
    if [ -d "$APP_DIR" ]; then
        log_warn "Existing app bundle found at $APP_DIR. Removing..."
        rm -rf "$APP_DIR"
    fi
    
    # Create app bundle structure
    mkdir -p "$APP_MACOS"
    mkdir -p "$APP_RESOURCES"
    
    # Copy binary to app bundle
    if [ ! -f "$INSIGHT_READER_BIN" ]; then
        log_error "Binary not found at $INSIGHT_READER_BIN"
        log_error "Please run install_binary first"
        return 1
    fi
    
    log_info "Copying binary to app bundle (instead of symlink for proper permissions)..."
    cp "$INSIGHT_READER_BIN" "$APP_MACOS/insight-reader"
    chmod +x "$APP_MACOS/insight-reader"
    
    # Convert PNG logo to ICNS for macOS icon
    if [ -n "$LOGO_FILE" ] && [ -f "$LOGO_FILE" ]; then
        log_info "Processing logo for macOS icon format..."
        
        # Create temporary directory for icon conversion
        ICON_TEMP_DIR=$(mktemp -d)
        ICON_PNG="$ICON_TEMP_DIR/icon.png"
        ICON_ICNS="$APP_RESOURCES/insight-reader.icns"
        
        # Create iconset directory structure
        ICONSET_DIR="$ICON_TEMP_DIR/insight-reader.iconset"
        mkdir -p "$ICONSET_DIR"
        
        # Generate different sizes (required for ICNS)
        # macOS expects specific sizes: 16, 32, 128, 256, 512 (and @2x versions)
        if command_exists sips; then
            log_info "Creating iconset with multiple sizes..."
            
            # Detect file type and convert SVG to PNG if needed
            # sips can work with SVG directly on macOS 10.14+, but we'll try conversion first for compatibility
            local source_file="$LOGO_FILE"
            local file_type
            file_type=$(file -b --mime-type "$LOGO_FILE" 2>/dev/null || echo "")
            
            if [[ "$file_type" == "image/svg+xml" ]] || [[ "$ICON_URL" == *.svg ]]; then
                # Try to convert SVG to PNG first for better compatibility
                if command_exists rsvg-convert; then
                    rsvg-convert -w 512 -h 512 "$LOGO_FILE" -o "$ICON_PNG" 2>/dev/null && source_file="$ICON_PNG" || source_file="$LOGO_FILE"
                elif command_exists qlmanage; then
                    # Use qlmanage to convert SVG to PNG (macOS built-in)
                    qlmanage -t -s 512 -o "$ICON_TEMP_DIR" "$LOGO_FILE" >/dev/null 2>&1
                    local converted_png
                    converted_png=$(find "$ICON_TEMP_DIR" -name "*.png" -type f | head -1)
                    if [ -n "$converted_png" ] && [ -f "$converted_png" ]; then
                        mv "$converted_png" "$ICON_PNG"
                        source_file="$ICON_PNG"
                    fi
                fi
            else
                # Not SVG, copy to PNG path for consistency
                cp "$LOGO_FILE" "$ICON_PNG"
                source_file="$ICON_PNG"
            fi
            
            for size in 16 32 128 256 512; do
                # Create @1x version (sips can handle SVG directly on newer macOS)
                sips -z "$size" "$size" "$source_file" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null 2>&1 || true
                # Create @2x version
                local size2x=$((size * 2))
                sips -z "$size2x" "$size2x" "$source_file" --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" >/dev/null 2>&1 || true
            done
            
            # Check if iconset has required files
            local iconset_count
            iconset_count=$(find "$ICONSET_DIR" -name "*.png" 2>/dev/null | wc -l | tr -d ' ')
            
            # Convert iconset to ICNS using iconutil (macOS built-in)
            if command_exists iconutil && [ "$iconset_count" -ge 10 ]; then
                if iconutil -c icns "$ICONSET_DIR" -o "$ICON_ICNS" 2>/dev/null; then
                    log_success "Icon converted to ICNS format ($iconset_count sizes)"
                else
                    # Fallback: use PNG directly (copy 512x512 version)
                    if [ -f "$ICONSET_DIR/icon_512x512.png" ]; then
                        cp "$ICONSET_DIR/icon_512x512.png" "$APP_RESOURCES/insight-reader.png"
                    else
                        cp "$ICON_PNG" "$APP_RESOURCES/insight-reader.png"
                    fi
                    log_info "Using PNG icon (ICNS conversion failed, but PNG will work)"
                fi
            else
                # Not enough icons or no iconutil, use PNG directly
                cp "$ICON_PNG" "$APP_RESOURCES/insight-reader.png"
                log_info "Using PNG icon (iconset incomplete: $iconset_count files)"
            fi
        else
            # No sips, just copy the PNG
            cp "$ICON_PNG" "$APP_RESOURCES/insight-reader.png"
            log_info "Using PNG icon (sips not available for resizing)"
        fi
        
        # Cleanup temp directory and logo file
        rm -rf "$ICON_TEMP_DIR"
        rm -f "$temp_logo" 2>/dev/null || true
    else
        log_warn "No logo available, app bundle created without icon"
        rm -f "$temp_logo" 2>/dev/null || true
    fi
    
    # Create Info.plist
    log_info "Creating Info.plist..."
    cat > "$APP_CONTENTS/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>insight-reader</string>
    <key>CFBundleIconFile</key>
    <string>insight-reader</string>
    <key>CFBundleIdentifier</key>
    <string>com.insight-reader.app</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>Insight Reader</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${INSIGHT_READER_VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${INSIGHT_READER_VERSION}</string>
    <key>CFBundleGetInfoString</key>
    <string>Insight Reader - Text-to-Speech application</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.utilities</string>
</dict>
</plist>
EOF
    
    log_success "App bundle created at $APP_DIR"
    log_info "You can now launch Insight Reader from Applications or Spotlight"
}

# Main installation function
main() {
    echo "=========================================="
    echo "  Insight Reader Installation Script (macOS)"
    echo "=========================================="
    echo ""
    
    check_homebrew
    check_and_install_dependencies
    install_binary
    create_venv
    install_piper
    
    # Download model if not present (download_model checks if it exists first)
    echo ""
    download_model
    
    # Create and install app bundle
    echo ""
    create_app_bundle
    
    echo ""
    log_success "Installation complete!"
    echo ""
    echo "insight-reader binary: $INSIGHT_READER_BIN"
    echo "App bundle: /Applications/insight-reader.app"
    echo "Piper venv: $VENV_DIR/bin/piper"
    echo "Models directory: $MODELS_DIR"
    echo ""
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        log_warn "$HOME/.local/bin is not in your PATH"
        echo "Add this to your ~/.bash_profile or ~/.bashrc:"
        echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
        echo ""
    fi
    echo "Run insight-reader with: insight-reader"
    echo "Or launch from: /Applications/insight-reader.app"
    echo ""
}

# Run main function
main "$@"
