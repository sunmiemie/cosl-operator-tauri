#!/bin/bash
# Flojoy 运行时设置脚本 (Linux/macOS)
# 用途：下载并设置 Python 便携版运行时

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# 默认配置
PYTHON_VERSION="3.11.7"
FORCE=false
VERBOSE=false

# 参数解析
while [[ $# -gt 0 ]]; do
    case $1 in
        --python-version)
            PYTHON_VERSION="$2"
            shift 2
            ;;
        --force|-f)
            FORCE=true
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --python-version VERSION  Python 版本 (默认: 3.11.7)"
            echo "  --force, -f               强制重新下载"
            echo "  --verbose, -v             详细输出"
            echo "  --help, -h                显示帮助"
            exit 0
            ;;
        *)
            echo "未知选项: $1"
            exit 1
            ;;
    esac
done

# 路径配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BINARIES_DIR="$PROJECT_ROOT/src-tauri/binaries"

# 检测平台
detect_platform() {
    local os=$(uname -s)
    local arch=$(uname -m)
    
    case "$os" in
        Linux)
            case "$arch" in
                x86_64) echo "x86_64-unknown-linux-gnu" ;;
                aarch64) echo "aarch64-unknown-linux-gnu" ;;
                *) echo "不支持的架构: $arch" >&2; exit 1 ;;
            esac
            ;;
        Darwin)
            case "$arch" in
                x86_64) echo "x86_64-apple-darwin" ;;
                arm64) echo "aarch64-apple-darwin" ;;
                *) echo "不支持的架构: $arch" >&2; exit 1 ;;
            esac
            ;;
        *)
            echo "不支持的操作系统: $os" >&2
            exit 1
            ;;
    esac
}

TARGET_TRIPLE=$(detect_platform)
PYTHON_DIR="$BINARIES_DIR/python-$TARGET_TRIPLE"

echo -e "${CYAN}========================================"
echo -e "Flojoy 运行时设置脚本 (Linux/macOS)"
echo -e "========================================${NC}"
echo ""
echo "Python 版本: $PYTHON_VERSION"
echo "目标平台: $TARGET_TRIPLE"
echo "安装目录: $PYTHON_DIR"
echo ""

# 检查是否已存在
if [ -d "$PYTHON_DIR" ] && [ "$FORCE" = false ]; then
    echo -e "${YELLOW}[信息] Python 运行时已存在: $PYTHON_DIR${NC}"
    echo -e "${YELLOW}使用 --force 参数强制重新下载${NC}"
    exit 0
fi

# 创建目录
mkdir -p "$BINARIES_DIR"

# 下载 URL (python-build-standalone)
RELEASE_TAG="20240107"
DOWNLOAD_URL="https://github.com/indygreg/python-build-standalone/releases/download/$RELEASE_TAG/cpython-$PYTHON_VERSION+$RELEASE_TAG-$TARGET_TRIPLE-install_only.tar.gz"

TEMP_DIR=$(mktemp -d)
ARCHIVE_FILE="$TEMP_DIR/python.tar.gz"

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo -e "${CYAN}[下载] 正在下载 Python $PYTHON_VERSION...${NC}"
echo "  URL: $DOWNLOAD_URL"

# 下载文件
if command -v curl &> /dev/null; then
    curl -L -o "$ARCHIVE_FILE" "$DOWNLOAD_URL"
elif command -v wget &> /dev/null; then
    wget -O "$ARCHIVE_FILE" "$DOWNLOAD_URL"
else
    echo -e "${RED}[错误] 需要 curl 或 wget${NC}"
    exit 1
fi

echo -e "${CYAN}[解压] 正在解压...${NC}"

# 清理旧目录
rm -rf "$PYTHON_DIR"

# 解压
cd "$TEMP_DIR"
tar -xzf "$ARCHIVE_FILE"

# 移动到目标位置
if [ -d "$TEMP_DIR/python" ]; then
    mv "$TEMP_DIR/python" "$PYTHON_DIR"
else
    # 有些版本解压目录名不同
    EXTRACTED_DIR=$(find "$TEMP_DIR" -maxdepth 1 -type d -name "python*" | head -1)
    if [ -n "$EXTRACTED_DIR" ]; then
        mv "$EXTRACTED_DIR" "$PYTHON_DIR"
    else
        echo -e "${RED}[错误] 未找到解压后的 Python 目录${NC}"
        exit 1
    fi
fi

echo -e "${CYAN}[验证] 验证安装...${NC}"

PYTHON_EXE="$PYTHON_DIR/bin/python3"
if [ -f "$PYTHON_EXE" ]; then
    VERSION=$("$PYTHON_EXE" --version)
    echo -e "  ${GREEN}$VERSION${NC}"
else
    echo -e "${RED}[错误] Python 可执行文件未找到${NC}"
    exit 1
fi

# 设置可执行权限
chmod +x "$PYTHON_EXE"
chmod +x "$PYTHON_DIR/bin/pip3" 2>/dev/null || true

echo ""
echo -e "${GREEN}[完成] Python 运行时已安装到: $PYTHON_DIR${NC}"

echo ""
echo -e "${YELLOW}[提示] 安装 Flojoy 依赖:${NC}"
echo "  $PYTHON_EXE -m pip install -r src-tauri/resources/flojoy/backend/requirements.txt"
