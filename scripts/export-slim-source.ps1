[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
    [string]$SourcePath = "",
    [string]$DestinationPath = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-NormalizedFullPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    return $fullPath.TrimEnd([char]92, [char]47)
}

function Test-IsSameOrChildPath {
    param(
        [Parameter(Mandatory = $true)][string]$Candidate,
        [Parameter(Mandatory = $true)][string]$Parent
    )

    if ($Candidate.Equals($Parent, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }
    $prefix = $Parent + [System.IO.Path]::DirectorySeparatorChar
    return $Candidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-RequiredFile {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$RelativePath
    )

    $path = Join-Path $Root $RelativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required build file is missing: $RelativePath"
    }
}

if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    $SourcePath = Join-Path $PSScriptRoot ".."
}
$SourcePath = Get-NormalizedFullPath $SourcePath

if (-not (Test-Path -LiteralPath $SourcePath -PathType Container)) {
    throw "Source project directory does not exist: $SourcePath"
}

if ([string]::IsNullOrWhiteSpace($DestinationPath)) {
    $desktop = [Environment]::GetFolderPath("Desktop")
    if ([string]::IsNullOrWhiteSpace($desktop)) {
        throw "Unable to resolve the Windows Desktop directory. Pass -DestinationPath explicitly."
    }
    $DestinationPath = Join-Path $desktop "11\shoushen"
}
$DestinationPath = Get-NormalizedFullPath $DestinationPath

if (Test-IsSameOrChildPath -Candidate $DestinationPath -Parent $SourcePath) {
    throw "Destination cannot be inside the source project: $DestinationPath"
}
if (Test-IsSameOrChildPath -Candidate $SourcePath -Parent $DestinationPath) {
    throw "Destination cannot contain the source project: $DestinationPath"
}

$requiredFiles = @(
    "package.json",
    "pnpm-lock.yaml",
    "src-tauri\Cargo.toml",
    "src-tauri\Cargo.lock",
    "src-tauri\tauri.conf.json",
    "src-tauri\resources\flojoy\app.asar",
    "src-tauri\resources\models\det.onnx",
    "src-tauri\resources\models\rec.onnx"
)
foreach ($relativePath in $requiredFiles) {
    Assert-RequiredFile -Root $SourcePath -RelativePath $relativePath
}

$destinationParent = Split-Path -Parent $DestinationPath
$destinationName = Split-Path -Leaf $DestinationPath
$existingDestinationHasContent = $false
if (Test-Path -LiteralPath $DestinationPath) {
    if (-not (Test-Path -LiteralPath $DestinationPath -PathType Container)) {
        throw "Destination exists and is not a directory: $DestinationPath"
    }
    $existingDestinationHasContent = $null -ne (
        Get-ChildItem -LiteralPath $DestinationPath -Force | Select-Object -First 1
    )
    if ($existingDestinationHasContent -and -not $Force) {
        throw "Destination is not empty. Pass -Force to replace it: $DestinationPath"
    }
}

if (-not $PSCmdlet.ShouldProcess($DestinationPath, "Export slim client source")) {
    return
}

New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
$stagingPath = Join-Path $destinationParent (
    ".{0}.staging-{1}" -f $destinationName, [Guid]::NewGuid().ToString("N")
)
$backupPath = $null

$topLevelExcludedDirectories = @(
    ".git",
    ".codegraph",
    ".cargo-target-temp",
    ".specstory",
    ".vscode",
    ".claude",
    ".cursor",
    ".idea",
    "node_modules",
    "dist",
    "artifacts"
)
$excludeDirectories = @(
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache"
)
foreach ($directoryName in $topLevelExcludedDirectories) {
    $excludeDirectories += Join-Path $SourcePath $directoryName
}
$excludeDirectories += @(
    Get-ChildItem -LiteralPath $SourcePath -Directory -Force |
        Where-Object { $_.Name -like ".venv*" } |
        ForEach-Object { $_.FullName }
)
$tauriRoot = Join-Path $SourcePath "src-tauri"
$excludeDirectories += @(
    Get-ChildItem -LiteralPath $tauriRoot -Directory -Force |
        Where-Object { $_.Name -like "target*" } |
        ForEach-Object { $_.FullName }
)
$excludeDirectories = @($excludeDirectories | Select-Object -Unique)

$excludeFiles = @(
    "*.pyc",
    "*.pyo",
    "*.log",
    "*.deb",
    "*.rpm",
    "*.AppImage",
    ".DS_Store",
    "Thumbs.db",
    "npm-debug.log*",
    "pnpm-debug.log*",
    "yarn-debug.log*",
    "yarn-error.log*",
    "april-log.txt"
)

try {
    New-Item -ItemType Directory -Path $stagingPath | Out-Null

    Write-Host "Source:      $SourcePath" -ForegroundColor Cyan
    Write-Host "Staging:     $stagingPath" -ForegroundColor Cyan
    Write-Host "Destination: $DestinationPath" -ForegroundColor Cyan
    Write-Host "Copying source and required runtime resources..." -ForegroundColor Cyan

    $robocopyArguments = @(
        $SourcePath,
        $stagingPath,
        "/E",
        "/COPY:DAT",
        "/DCOPY:DAT",
        "/R:1",
        "/W:1",
        "/XJ",
        "/NFL",
        "/NDL",
        "/NP",
        "/XD"
    )
    $robocopyArguments += $excludeDirectories
    $robocopyArguments += "/XF"
    $robocopyArguments += $excludeFiles

    & robocopy.exe @robocopyArguments
    $robocopyExitCode = $LASTEXITCODE
    if ($robocopyExitCode -gt 7) {
        throw "Robocopy failed with exit code $robocopyExitCode"
    }

    Write-Host "Validating required files and hashes..." -ForegroundColor Cyan
    foreach ($relativePath in $requiredFiles) {
        Assert-RequiredFile -Root $stagingPath -RelativePath $relativePath
        $sourceHash = (Get-FileHash -LiteralPath (Join-Path $SourcePath $relativePath) -Algorithm SHA256).Hash
        $exportHash = (Get-FileHash -LiteralPath (Join-Path $stagingPath $relativePath) -Algorithm SHA256).Hash
        if ($sourceHash -ne $exportHash) {
            throw "Hash validation failed: $relativePath"
        }
    }

    $unexpectedPaths = @(
        "node_modules",
        "dist",
        ".git",
        ".codegraph",
        ".cargo-target-temp",
        ".venv-ocr",
        ".specstory",
        "src-tauri\target"
    )
    foreach ($relativePath in $unexpectedPaths) {
        if (Test-Path -LiteralPath (Join-Path $stagingPath $relativePath)) {
            throw "Excluded directory was copied unexpectedly: $relativePath"
        }
    }

    $gitCommit = "unavailable"
    $gitBranch = "unavailable"
    $gitStatus = @()
    if (Get-Command git.exe -ErrorAction SilentlyContinue) {
        $gitCommit = ((& git.exe -C $SourcePath rev-parse HEAD 2>$null) -join "").Trim()
        $gitBranch = ((& git.exe -C $SourcePath branch --show-current 2>$null) -join "").Trim()
        $gitStatus = @(& git.exe -C $SourcePath status --short 2>$null)
    }

    $exportFiles = @(Get-ChildItem -LiteralPath $stagingPath -Recurse -File -Force)
    $exportBytes = ($exportFiles | Measure-Object Length -Sum).Sum
    $statusText = if ($gitStatus.Count -eq 0) {
        "clean"
    } else {
        "Includes current uncommitted changes:`r`n" + ($gitStatus -join "`r`n")
    }
    $manifest = @"
COSL slim source export
=======================
Exported at: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz")
Source: $SourcePath
Git branch: $gitBranch
Git commit: $gitCommit
Working tree: $statusText
File count before manifest: $($exportFiles.Count)
Total bytes before manifest: $exportBytes

Excluded: Git history, node_modules, dist, Rust target, virtual environments,
build caches, logs, and existing installer packages.
Preserved: Vue/TypeScript source, Tauri/Rust source, lock files, Flojoy,
OCR services, and model resources.

For WSL builds, copy this directory into the Linux HOME filesystem first.
Do not build directly under /mnt/c unless necessary.
"@
    Set-Content -LiteralPath (Join-Path $stagingPath "SOURCE_EXPORT_INFO.txt") -Value $manifest -Encoding UTF8

    if (Test-Path -LiteralPath $DestinationPath) {
        if ($existingDestinationHasContent) {
            $backupPath = Join-Path $destinationParent (
                ".{0}.backup-{1}" -f $destinationName, (Get-Date -Format "yyyyMMdd-HHmmss")
            )
            if (Test-Path -LiteralPath $backupPath) {
                $backupPath += "-" + [Guid]::NewGuid().ToString("N").Substring(0, 8)
            }
            Move-Item -LiteralPath $DestinationPath -Destination $backupPath
        } else {
            Remove-Item -LiteralPath $DestinationPath -Force
        }
    }

    try {
        Move-Item -LiteralPath $stagingPath -Destination $DestinationPath
    } catch {
        if ($backupPath -and (Test-Path -LiteralPath $backupPath) -and -not (Test-Path -LiteralPath $DestinationPath)) {
            Move-Item -LiteralPath $backupPath -Destination $DestinationPath
            $backupPath = $null
        }
        throw
    }

    $finalFiles = @(Get-ChildItem -LiteralPath $DestinationPath -Recurse -File -Force)
    $finalBytes = ($finalFiles | Measure-Object Length -Sum).Sum
    Write-Host ""
    Write-Host "Slim source export completed." -ForegroundColor Green
    Write-Host "Destination: $DestinationPath" -ForegroundColor Green
    Write-Host ("File count: {0}" -f $finalFiles.Count)
    Write-Host ("Total size: {0:N2} MB" -f ($finalBytes / 1MB))
    if ($backupPath) {
        Write-Host "Previous export was preserved at: $backupPath" -ForegroundColor Yellow
    }
} catch {
    if (Test-Path -LiteralPath $stagingPath) {
        Remove-Item -LiteralPath $stagingPath -Recurse -Force
    }
    throw
}
