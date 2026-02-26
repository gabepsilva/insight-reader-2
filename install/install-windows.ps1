Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$AppId = "insight-reader-2"
$BucketPublicBase = if ($env:BUCKET_PUBLIC_BASE) { $env:BUCKET_PUBLIC_BASE } else { "https://f005.backblazeb2.com/file/insight-reader2" }
$BundlePrefix = if ($env:BUNDLE_PREFIX) { $env:BUNDLE_PREFIX } else { "bundles/latest/main" }
$WindowsPayloadPrefix = (($BucketPublicBase.TrimEnd('/')) + "/" + ($BundlePrefix.TrimStart('/')) + "/windows-installer")
$InstallerUrl = if ($env:INSTALLER_URL) { $env:INSTALLER_URL } else { "$WindowsPayloadPrefix/insight-reader-2-windows-x64-setup.exe" }

function Write-Info([string]$Message) { Write-Host "[INFO] $Message" -ForegroundColor Blue }
function Write-Warn([string]$Message) { Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Ok([string]$Message) { Write-Host "[OK]   $Message" -ForegroundColor Green }

function Get-InstallerPath {
    $tmpDir = Join-Path $env:TEMP "insight-reader-2-install"
    New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
    return Join-Path $tmpDir "insight-reader-2-windows-x64-setup.exe"
}

function Download-Installer([string]$Url, [string]$OutFile) {
    Write-Info "Downloading Windows installer from $Url"
    Invoke-WebRequest -Uri $Url -OutFile $OutFile
    Write-Ok "Downloaded installer to $OutFile"
}

function Start-Installer([string]$InstallerPath) {
    $silent = $true
    if ($env:INSIGHT_READER_INSTALL_SILENT -match '^(0|false|no)$') {
        $silent = $false
    }

    $args = @()
    if ($silent) {
        # Tauri NSIS installer supports /S for silent mode.
        $args += "/S"
    }

    Write-Info ("Launching installer" + ($(if ($silent) { " (silent)" } else { "" })))
    $process = Start-Process -FilePath $InstallerPath -ArgumentList $args -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "Installer exited with code $($process.ExitCode)"
    }

    Write-Ok "Installer completed successfully"
}

function Main {
    if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
        throw "This installer is for Windows only."
    }

    Write-Host "==============================================" 
    Write-Host " Insight Reader Windows Installer (NSIS)" 
    Write-Host "==============================================" 
    Write-Host ""

    $installerPath = Get-InstallerPath
    Download-Installer -Url $InstallerUrl -OutFile $installerPath
    Start-Installer -InstallerPath $installerPath

    Write-Host ""
    Write-Ok "Installation complete."
    Write-Host "If the app does not start immediately, launch 'Insight Reader' from the Start menu."
}

Main
