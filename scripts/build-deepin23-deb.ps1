[CmdletBinding()]
param(
    [string]$Distro = "Ubuntu-22.04",
    [string]$ProjectPath = "",
    [string]$OutputPath = "",
    [string]$WslBuildDir = "~/cosl-operator-tauri",
    [string]$NodeVersion = "22.14.0",
    [string]$PnpmVersion = "9.15.9",
    [switch]$SkipApt
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-LastExitCode {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE"
    }
}

function Convert-ToWslPath {
    param([Parameter(Mandatory = $true)][string]$WindowsPath)

    # Do not pass a Windows path through bash/wslpath here. In Windows
    # PowerShell 5.1 its backslashes can be consumed as escape characters.
    $fullPath = [System.IO.Path]::GetFullPath($WindowsPath)
    $match = [System.Text.RegularExpressions.Regex]::Match(
        $fullPath,
        '^(?<drive>[A-Za-z]):\\(?<rest>.*)$'
    )
    if (-not $match.Success) {
        throw "Only local Windows drive paths are supported: $fullPath"
    }

    $drive = $match.Groups['drive'].Value.ToLowerInvariant()
    $rest = $match.Groups['rest'].Value.Replace('\', '/')
    if ([string]::IsNullOrEmpty($rest)) {
        return "/mnt/$drive"
    }
    return "/mnt/$drive/$rest"
}

Write-Host "========== 1. Check WSL ==========" -ForegroundColor Cyan
& wsl.exe --version
Assert-LastExitCode "wsl --version"

& wsl.exe -l -v
Assert-LastExitCode "wsl -l -v"

$distroNames = @(& wsl.exe -l -q) | ForEach-Object { ($_ -replace "`0", "").Trim() } | Where-Object { $_ }
if ($distroNames -notcontains $Distro) {
    throw "WSL distro '$Distro' was not found. Available distros: $($distroNames -join ', ')"
}

Write-Host "`n========== 2. Resolve paths ==========" -ForegroundColor Cyan
if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
    $ProjectPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
} else {
    $ProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
}

if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath "package.json"))) {
    throw "package.json is missing from the project directory: $ProjectPath"
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath "src-tauri\Cargo.toml"))) {
    throw "src-tauri/Cargo.toml is missing from the project directory: $ProjectPath"
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $ProjectPath "artifacts\deepin23"
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null

$wslProjectPath = Convert-ToWslPath $ProjectPath
$wslOutputPath = Convert-ToWslPath $OutputPath
$wslHome = ((& wsl.exe -d $Distro -- bash -lc 'printf "%s" "$HOME"') -join "`n").Trim()
Assert-LastExitCode "Read WSL HOME"
if ([string]::IsNullOrWhiteSpace($wslHome) -or -not $wslHome.StartsWith("/")) {
    throw "Unable to resolve the HOME directory for $Distro"
}

if ($WslBuildDir -eq "~") {
    $WslBuildDir = $wslHome
} elseif ($WslBuildDir.StartsWith("~/")) {
    $WslBuildDir = "$wslHome/$($WslBuildDir.Substring(2))"
}
if (-not $WslBuildDir.StartsWith("$wslHome/")) {
    throw "For safety, WSLBuildDir must be under $wslHome`: $WslBuildDir"
}

Write-Host "Windows source: $ProjectPath"
Write-Host "WSL source:     $wslProjectPath"
Write-Host "WSL build dir:  $WslBuildDir"
Write-Host "Output dir:     $OutputPath"

$linuxBuildScript = @'
#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  printf '\n\033[1;36m========== %s ==========\033[0m\n' "$1"
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 2
  fi
}

require_env SOURCE_DIR
require_env OUTPUT_DIR
require_env BUILD_DIR
require_env NODE_VERSION
require_env PNPM_VERSION

if [[ ! -f "$SOURCE_DIR/package.json" || ! -f "$SOURCE_DIR/src-tauri/Cargo.toml" ]]; then
  echo "Invalid WSL source path: $SOURCE_DIR" >&2
  exit 2
fi

case "$BUILD_DIR" in
  "$HOME"/*) ;;
  *)
    echo "BUILD_DIR must be located under HOME: $BUILD_DIR" >&2
    exit 2
    ;;
esac

log "3. Check Ubuntu build environment"
source /etc/os-release
echo "Distribution: ${PRETTY_NAME:-unknown}"
if [[ "${ID:-}" != "ubuntu" || "${VERSION_ID:-}" != "22.04" ]]; then
  echo "This build must run in Ubuntu 22.04 to preserve the intended GLIBC baseline." >&2
  exit 2
fi
ldd --version | head -n 1

if [[ "${SKIP_APT:-0}" != "1" ]]; then
  log "4. Install Tauri/Linux build dependencies"
  sudo -v
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential \
    binutils \
    ca-certificates \
    clang \
    curl \
    file \
    libayatana-appindicator3-dev \
    libclang-dev \
    libglib2.0-dev \
    libgtk-3-dev \
    librsvg2-dev \
    libssl-dev \
    libudev-dev \
    libusb-1.0-0-dev \
    libv4l-dev \
    libwebkit2gtk-4.1-dev \
    libxdo-dev \
    patchelf \
    pkg-config \
    rsync \
    wget \
    xz-utils
else
  log "4. Skip APT dependency installation"
fi

log "5. Prepare Node.js and pnpm"
case "$(uname -m)" in
  x86_64) NODE_ARCH="x64" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  *) echo "Unsupported Node.js architecture: $(uname -m)" >&2; exit 2 ;;
esac
NODE_DIST="node-v${NODE_VERSION}-linux-${NODE_ARCH}"
NODE_HOME="$HOME/.local/$NODE_DIST"
if [[ ! -x "$NODE_HOME/bin/node" ]]; then
  mkdir -p "$HOME/.local"
  NODE_ARCHIVE="/tmp/${NODE_DIST}.tar.xz"
  curl --fail --location --retry 3 \
    "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIST}.tar.xz" \
    --output "$NODE_ARCHIVE"
  tar -xJf "$NODE_ARCHIVE" -C "$HOME/.local"
  rm -f "$NODE_ARCHIVE"
fi
export PATH="$NODE_HOME/bin:$HOME/.cargo/bin:$PATH"
node --version
npm --version
if ! command -v pnpm >/dev/null 2>&1 || [[ "$(pnpm --version)" != "$PNPM_VERSION" ]]; then
  npm install --global "pnpm@$PNPM_VERSION"
fi
pnpm --version

log "6. Prepare Rust"
if [[ ! -f "$HOME/.cargo/env" ]]; then
  curl --proto '=https' --tlsv1.2 --fail --silent --show-error \
    https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
source "$HOME/.cargo/env"
rustup toolchain install stable --profile minimal
rustup default stable
rustc --version
cargo --version

log "7. Sync Windows source into the WSL filesystem"
mkdir -p "$BUILD_DIR"
rsync -a --delete --info=progress2 \
  --exclude '.cargo-target-temp/' \
  --exclude '.git/' \
  --exclude '.venv/' \
  --exclude '.venv-ocr/' \
  --exclude '**/__pycache__/' \
  --exclude '*.py[cod]' \
  --exclude '**/.pytest_cache/' \
  --exclude '**/.mypy_cache/' \
  --exclude '**/.ruff_cache/' \
  --exclude 'artifacts/' \
  --exclude 'dist/' \
  --exclude 'node_modules/' \
  --exclude 'src-tauri/target/' \
  "$SOURCE_DIR/" "$BUILD_DIR/"

test -f "$BUILD_DIR/package.json"
test -f "$BUILD_DIR/src-tauri/Cargo.toml"
cd "$BUILD_DIR"

log "8. Install frontend dependencies"
pnpm install --frozen-lockfile

log "9. Build the Debian package"
BUILD_LOG="$HOME/cosl-operator-tauri-build.log"
rm -f "$BUILD_LOG"
pnpm tauri build --bundles deb 2>&1 | tee "$BUILD_LOG"

log "10. Verify the binary and GLIBC symbols"
BINARY="$BUILD_DIR/src-tauri/target/release/cosl-operator-tauri"
if [[ ! -x "$BINARY" ]]; then
  echo "Release binary not found: $BINARY" >&2
  exit 3
fi
file "$BINARY"
echo "Highest referenced GLIBC symbols:"
objdump -T "$BINARY" \
  | grep -oE 'GLIBC_[0-9]+\.[0-9]+' \
  | sort -Vu \
  | tail -n 5

shopt -s nullglob
DEBS=("$BUILD_DIR"/src-tauri/target/release/bundle/deb/*.deb)
if (( ${#DEBS[@]} == 0 )); then
  echo "No .deb package was generated" >&2
  exit 3
fi

log "11. Inspect the DEB and copy it back to Windows"
mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR"/*.deb "$OUTPUT_DIR"/*.sha256 "$OUTPUT_DIR"/build.log
for deb in "${DEBS[@]}"; do
  echo "Package: $deb"
  dpkg-deb --info "$deb" | sed -n '1,40p'
  echo "Runtime dependencies: $(dpkg-deb -f "$deb" Depends)"
  cp -f "$deb" "$OUTPUT_DIR/"
done
cp -f "$BUILD_LOG" "$OUTPUT_DIR/build.log"
(
  cd "$OUTPUT_DIR"
  sha256sum ./*.deb | tee SHA256SUMS.sha256
)

log "Build complete"
ls -lh "$OUTPUT_DIR"/*.deb "$OUTPUT_DIR"/SHA256SUMS.sha256 "$OUTPUT_DIR"/build.log
echo "Deepin 23 install/upgrade command: sudo apt install ./$(basename "${DEBS[0]}")"
'@

Write-Host "`n========== 3. Stage the build script in WSL ==========" -ForegroundColor Cyan
$remoteScript = "/tmp/cosl-build-deepin23-deb.sh"
$scriptBytes = [System.Text.Encoding]::UTF8.GetBytes($linuxBuildScript)
$scriptBase64 = [Convert]::ToBase64String($scriptBytes)
$writeRemoteCommand = "printf '%s' '$scriptBase64' | base64 -d > '$remoteScript' && chmod 700 '$remoteScript' && bash -n '$remoteScript'"
& wsl.exe -d $Distro -- bash -lc $writeRemoteCommand
Assert-LastExitCode "Stage the WSL build script"

Write-Host "`n========== 4. Start build ==========" -ForegroundColor Cyan
$skipAptValue = if ($SkipApt) { "1" } else { "0" }
$wslArguments = @(
    "-d", $Distro,
    "--", "env",
    "SOURCE_DIR=$wslProjectPath",
    "OUTPUT_DIR=$wslOutputPath",
    "BUILD_DIR=$WslBuildDir",
    "NODE_VERSION=$NodeVersion",
    "PNPM_VERSION=$PnpmVersion",
    "SKIP_APT=$skipAptValue",
    "bash", $remoteScript
)
& wsl.exe @wslArguments
Assert-LastExitCode "Ubuntu 22.04 Tauri Debian build"

Write-Host "`n========== Complete ==========" -ForegroundColor Green
$packages = Get-ChildItem -LiteralPath $OutputPath -Filter "*.deb" -File
if (-not $packages) {
    throw "The build command succeeded but no .deb was found in: $OutputPath"
}
$packages | Select-Object FullName, Length, LastWriteTime | Format-Table -AutoSize
Write-Host "Build log: $(Join-Path $OutputPath 'build.log')"
Write-Host "Checksum file: $(Join-Path $OutputPath 'SHA256SUMS.sha256')"
