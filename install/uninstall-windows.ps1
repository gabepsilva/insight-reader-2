Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$AppId = "insight-reader-2"
$BundleId = "com.gabriel.insight-reader-2"

function Write-Info([string]$Message) { Write-Host "[INFO] $Message" -ForegroundColor Blue }
function Write-Warn([string]$Message) { Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Ok([string]$Message) { Write-Host "[OK]   $Message" -ForegroundColor Green }

function Confirm-Uninstall {
    if ($env:INSIGHT_READER_UNINSTALL_YES -eq "1") { return }

    if (-not [Environment]::UserInteractive) {
        throw "Refusing to run destructive uninstall non-interactively without INSIGHT_READER_UNINSTALL_YES=1."
    }

    $reply = Read-Host "This removes Insight Reader and local runtime data (config/cache/voices). Continue? [y/N]"
    if ($reply -notmatch '^[Yy]$') {
        Write-Warn "Cancelled."
        exit 0
    }
}

function Remove-PathIfExists([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    if (Test-Path -LiteralPath $Path) {
        try {
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
            Write-Ok "Removed $Path"
        } catch {
            Write-Warn "Could not remove $Path ($($_.Exception.Message))"
        }
    }
}

function Get-UninstallCommand {
    $roots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )

    foreach ($root in $roots) {
        foreach ($item in (Get-ItemProperty -Path $root -ErrorAction SilentlyContinue)) {
            $displayName = $item.DisplayName
            if ($displayName -and ($displayName -like '*insight-reader-2*' -or $displayName -like '*Insight Reader*')) {
                if ($item.QuietUninstallString) { return $item.QuietUninstallString }
                if ($item.UninstallString) { return $item.UninstallString }
            }
        }
    }

    return $null
}

function Invoke-UninstallCommand([string]$CommandLine) {
    if ([string]::IsNullOrWhiteSpace($CommandLine)) {
        Write-Warn "No registered uninstaller command found. Proceeding with leftover file cleanup only."
        return
    }

    Write-Info "Running registered uninstaller"

    $cmd = $CommandLine.Trim()
    if ($cmd -notmatch '(^| )/S($| )' -and $cmd -match '\.exe("?)(\s|$)') {
        $cmd = "$cmd /S"
    }

    $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd -Wait -PassThru
    if ($p.ExitCode -ne 0) {
        Write-Warn "Registered uninstaller exited with code $($p.ExitCode). Continuing with file cleanup."
    } else {
        Write-Ok "Registered uninstaller completed"
    }
}

function Get-HomeDir {
    if ($env:HOME) { return $env:HOME }
    if ($env:USERPROFILE) { return $env:USERPROFILE }
    throw "Could not determine home directory"
}

function Main {
    if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
        throw "This uninstaller is for Windows only."
    }

    Write-Host "=============================================="
    Write-Host " Insight Reader Windows Uninstaller"
    Write-Host "=============================================="
    Write-Host ""

    Confirm-Uninstall

    Invoke-UninstallCommand -CommandLine (Get-UninstallCommand)

    $home = Get-HomeDir
    $paths = @(
        (Join-Path $home ".insight-reader-2"),
        (Join-Path $home ".config\insight-reader"),
        (Join-Path $home ".cache\insight-reader"),
        (Join-Path $home ".local\share\insight-reader"),
        (Join-Path $home ".config\$BundleId"),
        (Join-Path $home ".cache\$BundleId"),
        (Join-Path $home ".local\share\$BundleId")
    )

    if ($env:APPDATA) {
        $paths += (Join-Path $env:APPDATA "insight-reader")
        $paths += (Join-Path $env:APPDATA $BundleId)
    }
    if ($env:LOCALAPPDATA) {
        $paths += (Join-Path $env:LOCALAPPDATA "insight-reader")
        $paths += (Join-Path $env:LOCALAPPDATA $BundleId)
        $paths += (Join-Path $env:LOCALAPPDATA "Programs\$AppId")
    }
    if ($env:ProgramFiles) {
        $paths += (Join-Path $env:ProgramFiles $AppId)
    }
    if (${env:ProgramFiles(x86)}) {
        $paths += (Join-Path ${env:ProgramFiles(x86)} $AppId)
    }

    foreach ($path in $paths) {
        Remove-PathIfExists -Path $path
    }

    Write-Host ""
    Write-Ok "Uninstall complete."
}

Main
