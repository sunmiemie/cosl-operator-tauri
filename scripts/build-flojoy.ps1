# Flojoy Build Script (Windows PowerShell)
# Purpose: Build Flojoy frontend UI and backend dependencies, copy to Tauri resources

param(
    [switch]$SkipUI,        # Skip frontend build
    [switch]$SkipBackend,   # Skip backend processing
    [switch]$Clean,         # Clean build artifacts
    [switch]$Verbose        # Verbose output
)

$ErrorActionPreference = "Stop"

# Path configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$FlojoyRoot = Join-Path $ProjectRoot "third_party\flojoy"
$TauriResources = Join-Path $ProjectRoot "src-tauri\resources\flojoy"

# Flojoy Studio contains both frontend and backend
$FlojoyStudio = Join-Path $FlojoyRoot "studio"

$UIOutput = Join-Path $TauriResources "ui"
$BackendOutput = Join-Path $TauriResources "backend"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Flojoy Build Script (Windows)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Clean mode
if ($Clean) {
    Write-Host "[Clean] Removing build artifacts..." -ForegroundColor Yellow
    
    if (Test-Path $UIOutput) {
        Get-ChildItem $UIOutput -Exclude ".gitkeep" | Remove-Item -Recurse -Force
        Write-Host "  Cleaned: $UIOutput"
    }
    
    if (Test-Path $BackendOutput) {
        Get-ChildItem $BackendOutput -Exclude ".gitkeep" | Remove-Item -Recurse -Force
        Write-Host "  Cleaned: $BackendOutput"
    }
    
    Write-Host "[Clean] Done" -ForegroundColor Green
    exit 0
}

# Check Flojoy source
function Test-FlojoySource {
    if (-not (Test-Path $FlojoyStudio)) {
        Write-Host "[Error] Flojoy Studio source not found:" -ForegroundColor Red
        Write-Host "  - third_party/flojoy/studio" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please get Flojoy source first, see third_party/flojoy/README.md" -ForegroundColor Yellow
        exit 1
    }
}

# Build frontend UI (Web version - decoupled from Electron)
function Build-FlojoyUI {
    Write-Host ""
    Write-Host "[Frontend] Building Flojoy Studio Web UI..." -ForegroundColor Cyan
    
    Push-Location $FlojoyStudio
    try {
        # Check package.json
        if (-not (Test-Path "package.json")) {
            Write-Host "[Error] package.json not found" -ForegroundColor Red
            exit 1
        }
        
        # Install dependencies
        Write-Host "[Frontend] Installing dependencies (pnpm install)..."
        if ($Verbose) {
            pnpm install
        } else {
            pnpm install 2>&1 | Out-Null
        }
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[Error] Dependency installation failed" -ForegroundColor Red
            exit 1
        }
        
        # Build Web version using custom vite config
        Write-Host "[Frontend] Building Web version (vite build)..."
        $env:VITE_CAPTAIN_URL = "http://localhost:5392"
        
        if ($Verbose) {
            npx vite build --config vite.config.web.ts
        } else {
            npx vite build --config vite.config.web.ts 2>&1 | Out-Null
        }
        
        $distDir = Join-Path $FlojoyStudio "dist-web"
        
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $distDir)) {
            Write-Host "[Error] Web build failed!" -ForegroundColor Red
            Write-Host "[Info] Please ensure vite and dependencies are properly installed" -ForegroundColor Yellow
            Write-Host "[Info] Run: cd third_party/flojoy/studio && pnpm install && pnpm build:web" -ForegroundColor Yellow
            exit 1
        }
        
        Write-Host "[Frontend] Copying artifacts to $UIOutput..."
        
        # Ensure target directory exists
        if (-not (Test-Path $UIOutput)) {
            New-Item -ItemType Directory -Path $UIOutput -Force | Out-Null
        }
        
        # Clean old files (keep .gitkeep)
        Get-ChildItem $UIOutput -Exclude ".gitkeep" | Remove-Item -Recurse -Force
        
        # Copy new files
        xcopy /E /I /Y $distDir $UIOutput | Out-Null
        
        # Rename index-web.html to index.html
        $indexWebHtml = Join-Path $UIOutput "index-web.html"
        $indexHtml = Join-Path $UIOutput "index.html"
        if (Test-Path $indexWebHtml) {
            Move-Item -Path $indexWebHtml -Destination $indexHtml -Force
            Write-Host "  Renamed: index-web.html -> index.html"
        }
        
        Write-Host "[Frontend] Build complete" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

# Process backend
function Build-FlojoyBackend {
    Write-Host ""
    Write-Host "[Backend] Processing Flojoy Backend (captain)..." -ForegroundColor Cyan
    
    Push-Location $FlojoyStudio
    try {
        # Ensure target directory exists
        if (-not (Test-Path $BackendOutput)) {
            New-Item -ItemType Directory -Path $BackendOutput -Force | Out-Null
        }
        
        # Clean old files (keep .gitkeep)
        Get-ChildItem $BackendOutput -Exclude ".gitkeep" | Remove-Item -Recurse -Force
        
        # Copy backend source
        Write-Host "[Backend] Copying captain source to $BackendOutput..."
        
        # Copy captain directory
        $captainDir = Join-Path $FlojoyStudio "captain"
        if (Test-Path $captainDir) {
            Copy-Item -Path $captainDir -Destination $BackendOutput -Recurse -Force
            Write-Host "  Copied: captain/"
        }
        
        # Copy pkgs directory (contains flojoy SDK)
        $pkgsDir = Join-Path $FlojoyStudio "pkgs"
        if (Test-Path $pkgsDir) {
            Copy-Item -Path $pkgsDir -Destination $BackendOutput -Recurse -Force
            Write-Host "  Copied: pkgs/"
        }
        
        # Copy blocks directory (node definitions)
        $blocksDir = Join-Path $FlojoyStudio "blocks"
        if (Test-Path $blocksDir) {
            Copy-Item -Path $blocksDir -Destination $BackendOutput -Recurse -Force
            Write-Host "  Copied: blocks/"
        }
        
        # Copy PYTHON directory (utilities)
        $pythonDir = Join-Path $FlojoyStudio "PYTHON"
        if (Test-Path $pythonDir) {
            Copy-Item -Path $pythonDir -Destination $BackendOutput -Recurse -Force
            Write-Host "  Copied: PYTHON/"
        }
        
        # Copy entry file
        $mainPy = Join-Path $FlojoyStudio "main.py"
        if (Test-Path $mainPy) {
            Copy-Item -Path $mainPy -Destination $BackendOutput -Force
            Write-Host "  Copied: main.py"
        }
        
        # Copy config files
        $configFiles = @("pyproject.toml", "poetry.lock", "poetry.toml", "pytest.ini")
        foreach ($file in $configFiles) {
            $srcPath = Join-Path $FlojoyStudio $file
            if (Test-Path $srcPath) {
                Copy-Item -Path $srcPath -Destination $BackendOutput -Force
                Write-Host "  Copied: $file"
            }
        }
        
        # Copy custom nodes
        $customNodes = Join-Path $FlojoyRoot "nodes\custom"
        if (Test-Path $customNodes) {
            $customNodesDest = Join-Path $BackendOutput "blocks\custom"
            if (-not (Test-Path $customNodesDest)) {
                New-Item -ItemType Directory -Path $customNodesDest -Force | Out-Null
            }
            $customContent = Get-ChildItem $customNodes -Exclude ".gitkeep" -ErrorAction SilentlyContinue
            if ($customContent) {
                Copy-Item -Path "$customNodes\*" -Destination $customNodesDest -Recurse -Force -ErrorAction SilentlyContinue
                Write-Host "  Copied: custom nodes"
            }
        }
        
        Write-Host "[Backend] Processing complete" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

# Main flow
Test-FlojoySource

if (-not $SkipUI) {
    Build-FlojoyUI
} else {
    Write-Host "[Skip] Frontend build" -ForegroundColor Yellow
}

if (-not $SkipBackend) {
    Build-FlojoyBackend
} else {
    Write-Host "[Skip] Backend processing" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Output locations:"
Write-Host "  Frontend: $UIOutput"
Write-Host "  Backend: $BackendOutput"
Write-Host ""
Write-Host "Notes:" -ForegroundColor Yellow
Write-Host "  - Flojoy Studio is an Electron app, frontend is tightly coupled"
Write-Host "  - Recommend testing with external mode first"
Write-Host "  - Backend (captain) can run standalone: python main.py"
Write-Host ""
