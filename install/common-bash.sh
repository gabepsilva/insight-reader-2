# Common functions and variables for insight-reader installation scripts
# This file is sourced by platform-specific install scripts

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Installation directories (all in ${HOME}/.insight-reader-2)
INSTALL_DIR="$HOME/.insight-reader-2"
BIN_DIR="$HOME/.local/bin"
VENV_DIR="$INSTALL_DIR/venv"
MODELS_DIR="$INSTALL_DIR/models"
CACHE_DIR="$INSTALL_DIR/cache"
INSIGHT_READER_BIN="$BIN_DIR/insight-reader"

# Ensure all directories exist
mkdir -p "$INSTALL_DIR"
mkdir -p "$VENV_DIR"
mkdir -p "$MODELS_DIR"
mkdir -p "$CACHE_DIR"
mkdir -p "$BIN_DIR"

# GitHub repository
GITHUB_REPO="${GITHUB_REPO:-gabepsilva/insight-reader}"
GITHUB_API="https://api.github.com/repos/$GITHUB_REPO"
INSIGHT_READER_VERSION="${INSIGHT_READER_VERSION:-1.0.0}"

# Model to download (default)
# Note: Models are downloaded from HuggingFace main branch (always latest)
MODEL_NAME="en_US-lessac-medium"

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if script is being piped (e.g., curl | bash)
# Returns true if piped, false if run directly
is_piped() {
    # Check if IS_PIPED is set (from install.sh)
    if [ "${IS_PIPED:-false}" = "true" ]; then
        return 0
    fi
    # Fallback: check if stdin is not a terminal
    if [ ! -t 0 ]; then
        return 0
    fi
    # Not piped
    return 1
}

# Download file using curl or wget (whichever is available)
download_file() {
    local url="$1"
    local output="$2"
    
    if command_exists curl; then
        curl -fsSL -o "$output" "$url"
    elif command_exists wget; then
        wget -q -O "$output" "$url"
    else
        return 1
    fi
}

# Create virtual environment
create_venv() {
    log_info "Creating virtual environment at $VENV_DIR..."
    
    # Remove existing venv if it exists
    if [ -d "$VENV_DIR" ]; then
        log_warn "Existing venv found at $VENV_DIR. Removing..."
        rm -rf "$VENV_DIR"
    fi
    
    # Ensure parent directory exists (already created above, but ensure it)
    mkdir -p "$INSTALL_DIR"
    
    # Create venv
    python3 -m venv "$VENV_DIR"
    
    if [ ! -f "$VENV_DIR/bin/activate" ]; then
        log_error "Failed to create virtual environment"
        exit 1
    fi
    
    log_success "Virtual environment created"
}

# Install piper-tts in venv
install_piper() {
    log_info "Installing piper-tts in virtual environment..."
    
    # Activate venv and install
    source "$VENV_DIR/bin/activate"
    
    # Upgrade pip first
    log_info "Upgrading pip..."
    pip install --quiet --upgrade pip
    
    # Clear pip cache to avoid dependency conflicts (especially on Fedora)
    log_info "Clearing pip cache..."
    pip cache purge 2>/dev/null || true
    
    # Install onnxruntime first (required dependency for piper-tts)
    # This helps with dependency resolution, especially on Python 3.14+
    log_info "Installing onnxruntime (required dependency)..."
    if ! pip install --quiet "onnxruntime<2,>=1"; then
        log_warn "Standard onnxruntime installation failed, trying nightly build..."
        log_info "Nightly builds support newer Python versions (e.g., 3.14+)"
        if ! pip install --quiet --pre onnxruntime \
            --extra-index-url=https://aiinfra.pkgs.visualstudio.com/PublicPackages/_packaging/ORT-Nightly/pypi/simple/; then
            log_error "Failed to install onnxruntime (required by piper-tts)"
            log_error "This may be due to Python version incompatibility"
            deactivate
            exit 1
        else
            log_success "onnxruntime nightly build installed successfully"
        fi
    else
        log_success "onnxruntime installed successfully"
    fi
    
    # Install piper-tts
    # Since we already have onnxruntime installed, try installing piper-tts
    # First try normal installation, then try without dependency checks
    log_info "Installing piper-tts package..."
    if ! pip install --quiet --upgrade --force-reinstall piper-tts; then
        log_warn "Standard installation failed, trying without dependency checks..."
        log_info "Installing piper-tts without dependency resolution (deps already installed)..."
        # Install piper-tts without checking dependencies since we have onnxruntime
        if ! pip install --quiet --upgrade --force-reinstall --no-deps piper-tts; then
            log_error "Failed to install piper-tts"
            deactivate
            exit 1
        fi
        # Install other piper-tts dependencies that might be missing
        log_info "Installing piper-tts dependencies..."
        pip install --quiet piper-phonemize || true
    fi
    
    # Verify installation
    if [ ! -f "$VENV_DIR/bin/piper" ]; then
        log_error "piper binary not found after installation"
        deactivate
        exit 1
    fi
    
    # Test piper (--help is more reliable than --version)
    if "$VENV_DIR/bin/piper" --help >/dev/null 2>&1; then
        # Try to get version, but don't fail if it doesn't work
        PIPER_VERSION=$("$VENV_DIR/bin/piper" --version 2>&1 | head -1 2>/dev/null || echo "installed")
        log_success "piper-tts installed successfully"
        if [ "$PIPER_VERSION" != "installed" ]; then
            log_info "Piper version: $PIPER_VERSION"
        fi
    else
        log_error "piper binary found but doesn't respond to --help"
        deactivate
        exit 1
    fi
    
    deactivate
}

# Download Piper model
download_model() {
    log_info "Checking for model: $MODEL_NAME..."
    
    MODEL_ONNX="$MODELS_DIR/$MODEL_NAME.onnx"
    MODEL_JSON="$MODELS_DIR/$MODEL_NAME.onnx.json"
    
    # Check if model already exists
    if [ -f "$MODEL_ONNX" ] && [ -f "$MODEL_JSON" ]; then
        log_success "Model already exists at $MODELS_DIR"
        return 0
    fi
    
    log_info "Model not found. Downloading from HuggingFace..."
    
    # Create models directory
    mkdir -p "$MODELS_DIR"
    
    # Use the correct HuggingFace URL structure (from dad project)
    # Format: https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
    MODEL_BASE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium"
    
    cd "$MODELS_DIR" || {
        log_error "Failed to change to models directory: $MODELS_DIR"
        return 1
    }
    
    # Download model files
    log_info "Downloading $MODEL_NAME.onnx..."
    if download_file "$MODEL_BASE_URL/$MODEL_NAME.onnx" "$MODEL_NAME.onnx"; then
        log_info "Downloading $MODEL_NAME.onnx.json..."
        if download_file "$MODEL_BASE_URL/$MODEL_NAME.onnx.json" "$MODEL_NAME.onnx.json"; then
            if [ -f "$MODEL_NAME.onnx" ] && [ -f "$MODEL_NAME.onnx.json" ]; then
                log_success "Model downloaded successfully to $MODELS_DIR"
                cd - >/dev/null || true
                return 0
            fi
        fi
    fi
    # Cleanup on failure
    rm -f "$MODEL_NAME.onnx" "$MODEL_NAME.onnx.json"
    cd - >/dev/null || true
    
    if ! command_exists curl && ! command_exists wget; then
        log_error "Neither wget nor curl found. Please install one to download models."
    else
        log_error "Failed to download model files"
    fi
    
    # Provide manual instructions
    log_warn "Automatic model download failed"
    log_info "Please download the model manually from:"
    log_info "  $MODEL_BASE_URL/$MODEL_NAME.onnx"
    log_info "  $MODEL_BASE_URL/$MODEL_NAME.onnx.json"
    log_info ""
    log_info "Or visit: https://huggingface.co/rhasspy/piper-voices"
    log_info ""
    log_info "Place the files in: $MODELS_DIR"
    log_info "  - $MODEL_NAME.onnx"
    log_info "  - $MODEL_NAME.onnx.json"
    return 1
}

# Detect system OS
detect_os() {
    local os
    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    case "$os" in
        linux)
            OS="linux"
            ;;
        darwin)
            OS="macos"
            ;;
        *)
            OS="linux"  # Default fallback
            log_warn "Unknown OS $os, defaulting to linux"
            ;;
    esac
    log_info "Detected OS: $OS"
}

# Detect system architecture
detect_arch() {
    local arch
    arch=$(uname -m)
    case "$arch" in
        x86_64|amd64)
            ARCH="x86_64"
            ;;
        aarch64|arm64)
            ARCH="aarch64"
            ;;
        armv7l|armv7)
            ARCH="armv7"
            ;;
        *)
            ARCH="x86_64"  # Default fallback
            log_warn "Unknown architecture $arch, defaulting to x86_64"
            ;;
    esac
    log_info "Detected architecture: $ARCH"
}

# Get latest release version from GitHub
get_latest_release() {
    log_info "Fetching latest release from GitHub..."
    
    local temp_file
    temp_file=$(mktemp)
    
    if download_file "$GITHUB_API/releases/latest" "$temp_file" 2>/dev/null; then
        LATEST_RELEASE=$(grep '"tag_name":' "$temp_file" 2>/dev/null | sed -E 's/.*"([^"]+)".*/\1/' || echo "")
    else
        LATEST_RELEASE=""
    fi
    
    rm -f "$temp_file" 2>/dev/null || true
    
    if [ -z "$LATEST_RELEASE" ]; then
        log_warn "Failed to fetch latest release. Using 'latest' tag."
        LATEST_RELEASE="latest"
    else
        log_info "Latest release: $LATEST_RELEASE"
    fi
}

# Download and install insight-reader binary from GitHub
download_and_install_binary() {
    log_info "Downloading insight-reader binary from GitHub..."
    
    # Ensure bin directory exists
    mkdir -p "$BIN_DIR"
    
    # Detect OS and architecture
    detect_os
    detect_arch
    
    # Construct binary name: insight-reader-linux-x86_64 or insight-reader-macos-aarch64 (no version in filename)
    BINARY_NAME="insight-reader-${OS}-${ARCH}"
    
    # Determine release tag to use
    if [ -n "${RELEASE_TAG:-}" ]; then
        # Use specific release tag if provided
        ACTUAL_TAG="$RELEASE_TAG"
        DOWNLOAD_URL="https://github.com/$GITHUB_REPO/releases/download/$ACTUAL_TAG/$BINARY_NAME"
        log_info "Using release tag: $ACTUAL_TAG"
    else
        # Get latest release tag for logging, but use /latest/download/ for actual download
        get_latest_release
        ACTUAL_TAG="$LATEST_RELEASE"
        DOWNLOAD_URL="https://github.com/$GITHUB_REPO/releases/latest/download/$BINARY_NAME"
        if [ "$ACTUAL_TAG" != "latest" ]; then
            log_info "Downloading from latest release: $ACTUAL_TAG"
        else
            log_info "Downloading from latest release (tag detection failed, using redirect)"
        fi
    fi
    
    # Download binary
    if download_file "$DOWNLOAD_URL" "$INSIGHT_READER_BIN"; then
        chmod +x "$INSIGHT_READER_BIN"
        if [ "$ACTUAL_TAG" != "latest" ]; then
            log_success "Binary downloaded and installed to $INSIGHT_READER_BIN (release: $ACTUAL_TAG)"
        else
            log_success "Binary downloaded and installed to $INSIGHT_READER_BIN"
        fi
        return 0
    else
        if ! command_exists curl && ! command_exists wget; then
            log_error "Neither curl nor wget found. Please install one."
        else
            log_error "Failed to download binary from $DOWNLOAD_URL"
        fi
        return 1
    fi
}

# Install insight-reader binary (try local first, then download from GitHub)
install_binary() {
    log_info "Installing insight-reader binary..."
    
    # Ensure bin directory exists
    mkdir -p "$BIN_DIR"
    
    # Skip local checks if script is being piped (curl | bash)
    if is_piped; then
        log_info "Script is being piped, skipping local file checks and downloading from GitHub..."
        if download_and_install_binary; then
            return 0
        else
            log_error "Failed to download binary from GitHub"
            return 1
        fi
    fi
    
    # Try to copy from local target/release directory
    local local_binary=""
    local local_binary_full=""
    
    # Check if we're in the project directory
    if [ -f "Cargo.toml" ] && [ -d "target/release" ] && [ -f "target/release/insight-reader" ]; then
        local_binary="target/release/insight-reader"
        # Get full absolute path
        if command_exists realpath; then
            local_binary_full=$(realpath "$local_binary")
        else
            local_binary_full="$(cd "$(dirname "$local_binary")" && pwd)/$(basename "$local_binary")"
        fi
        log_info "Found local build in target/release/insight-reader"
    # Also check current directory
    elif [ -f "insight-reader" ] && [ -x "insight-reader" ]; then
        local_binary="insight-reader"
        # Get full absolute path
        if command_exists realpath; then
            local_binary_full=$(realpath "$local_binary")
        else
            local_binary_full="$(cd "$(dirname "$local_binary")" && pwd)/$(basename "$local_binary")"
        fi
        log_info "Found insight-reader binary in current directory"
    fi
    
    # If local binary found, copy it
    if [ -n "$local_binary" ]; then
        log_info "Copying binary from $local_binary_full to $INSIGHT_READER_BIN"
        cp "$local_binary" "$INSIGHT_READER_BIN"
        chmod +x "$INSIGHT_READER_BIN"
        log_success "Binary copied and installed to $INSIGHT_READER_BIN"
        return 0
    fi
    
    # No local binary found, try downloading from GitHub
    log_info "No local binary found. Attempting to download from GitHub..."
    if download_and_install_binary; then
        return 0
    fi
    
    # Both methods failed
    log_error "Failed to install binary"
    log_info "Please build the binary first: cargo build --release"
    log_info "Or place an insight-reader binary in the current directory"
    return 1
}

