# Flojoy 运行时设置脚本 (Windows PowerShell)
# 用途：下载并设置 Python 便携版运行时

param(
    [string]$PythonVersion = "3.11.7",
    [switch]$Force,         # 强制重新下载
    [switch]$Verbose        # 详细输出
)

$ErrorActionPreference = "Stop"

# 路径配置
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$BinariesDir = Join-Path $ProjectRoot "src-tauri\binaries"

# 获取目标三元组
$TargetTriple = "x86_64-pc-windows-msvc"
$PythonDir = Join-Path $BinariesDir "python-$TargetTriple"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Flojoy 运行时设置脚本 (Windows)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Python 版本: $PythonVersion"
Write-Host "目标平台: $TargetTriple"
Write-Host "安装目录: $PythonDir"
Write-Host ""

# 检查是否已存在
if ((Test-Path $PythonDir) -and -not $Force) {
    Write-Host "[信息] Python 运行时已存在: $PythonDir" -ForegroundColor Yellow
    Write-Host "使用 -Force 参数强制重新下载" -ForegroundColor Yellow
    exit 0
}

# 创建目录
if (-not (Test-Path $BinariesDir)) {
    New-Item -ItemType Directory -Path $BinariesDir -Force | Out-Null
}

# 下载 URL (python-build-standalone)
# 格式: cpython-{version}+{release}-{target}-{variant}.tar.gz
$ReleaseTag = "20240107"  # 可根据需要更新
$DownloadUrl = "https://github.com/indygreg/python-build-standalone/releases/download/$ReleaseTag/cpython-$PythonVersion+$ReleaseTag-$TargetTriple-shared-install_only.tar.gz"

$TempDir = Join-Path $env:TEMP "flojoy-python-setup"
$ArchiveFile = Join-Path $TempDir "python.tar.gz"

Write-Host "[下载] 正在下载 Python $PythonVersion..." -ForegroundColor Cyan
Write-Host "  URL: $DownloadUrl"

# 创建临时目录
if (-not (Test-Path $TempDir)) {
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
}

try {
    # 下载文件
    $ProgressPreference = 'SilentlyContinue'  # 加快下载速度
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ArchiveFile -UseBasicParsing
    $ProgressPreference = 'Continue'
    
    Write-Host "[解压] 正在解压..." -ForegroundColor Cyan
    
    # 清理旧目录
    if (Test-Path $PythonDir) {
        Remove-Item -Path $PythonDir -Recurse -Force
    }
    
    # 解压 (需要 tar 命令，Windows 10+ 自带)
    Push-Location $TempDir
    tar -xzf $ArchiveFile
    Pop-Location
    
    # 移动到目标位置
    $ExtractedDir = Join-Path $TempDir "python"
    if (Test-Path $ExtractedDir) {
        Move-Item -Path $ExtractedDir -Destination $PythonDir -Force
    } else {
        # 有些版本解压目录名不同
        $ExtractedDir = Get-ChildItem -Path $TempDir -Directory | Where-Object { $_.Name -like "python*" } | Select-Object -First 1
        if ($ExtractedDir) {
            Move-Item -Path $ExtractedDir.FullName -Destination $PythonDir -Force
        } else {
            throw "未找到解压后的 Python 目录"
        }
    }
    
    Write-Host "[验证] 验证安装..." -ForegroundColor Cyan
    
    $PythonExe = Join-Path $PythonDir "python.exe"
    if (Test-Path $PythonExe) {
        $Version = & $PythonExe --version
        Write-Host "  $Version" -ForegroundColor Green
    } else {
        throw "Python 可执行文件未找到"
    }
    
    Write-Host ""
    Write-Host "[完成] Python 运行时已安装到: $PythonDir" -ForegroundColor Green
    
    # 安装 pip 依赖（可选）
    Write-Host ""
    Write-Host "[提示] 安装 Flojoy 依赖:" -ForegroundColor Yellow
    Write-Host "  $PythonExe -m pip install -r src-tauri\resources\flojoy\backend\requirements.txt"
    
}
catch {
    Write-Host "[错误] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    # 清理临时文件
    if (Test-Path $TempDir) {
        Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
