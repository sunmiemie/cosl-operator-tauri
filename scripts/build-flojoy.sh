#!/bin/bash
# Flojoy 构建脚本 (Linux/macOS)
# 用途：构建 Flojoy 前端 UI 和后端依赖，并复制到 Tauri 资源目录

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 参数解析
SKIP_UI=false
SKIP_BACKEND=false
CLEAN=false
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-ui)
            SKIP_UI=true
            shift
            ;;
        --skip-backend)
            SKIP_BACKEND=true
            shift
            ;;
        --clean)
            CLEAN=true
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
            echo "  --skip-ui      跳过前端构建"
            echo "  --skip-backend 跳过后端依赖安装"
            echo "  --clean        清理构建产物"
            echo "  --verbose, -v  详细输出"
            echo "  --help, -h     显示帮助"
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
FLOJOY_ROOT="$PROJECT_ROOT/third_party/flojoy"
TAURI_RESOURCES="$PROJECT_ROOT/src-tauri/resources/flojoy"

FLOJOY_STUDIO="$FLOJOY_ROOT/studio"
FLOJOY_BACKEND="$FLOJOY_ROOT/backend"

UI_OUTPUT="$TAURI_RESOURCES/ui"
BACKEND_OUTPUT="$TAURI_RESOURCES/backend"

echo -e "${CYAN}========================================"
echo -e "Flojoy 构建脚本 (Linux/macOS)"
echo -e "========================================${NC}"
echo ""

# 清理模式
if [ "$CLEAN" = true ]; then
    echo -e "${YELLOW}[清理] 删除构建产物...${NC}"
    
    if [ -d "$UI_OUTPUT" ]; then
        find "$UI_OUTPUT" -mindepth 1 ! -name '.gitkeep' -delete 2>/dev/null || true
        echo "  已清理: $UI_OUTPUT"
    fi
    
    if [ -d "$BACKEND_OUTPUT" ]; then
        find "$BACKEND_OUTPUT" -mindepth 1 ! -name '.gitkeep' -delete 2>/dev/null || true
        echo "  已清理: $BACKEND_OUTPUT"
    fi
    
    echo -e "${GREEN}[清理] 完成${NC}"
    exit 0
fi

# 检查 Flojoy 源码
check_flojoy_source() {
    if [ ! -d "$FLOJOY_STUDIO" ]; then
        echo -e "${RED}[错误] Flojoy Studio 源码未找到:${NC}"
        echo -e "${RED}  - third_party/flojoy/studio${NC}"
        echo ""
        echo -e "${YELLOW}请先获取 Flojoy 源码:${NC}"
        echo -e "${YELLOW}  git clone --depth 1 https://github.com/flojoy-ai/studio.git third_party/flojoy/studio${NC}"
        echo ""
        echo -e "${YELLOW}参考 third_party/flojoy/README.md${NC}"
        exit 1
    fi
}

# 构建前端 UI (Web 版本 - 无 Electron 依赖)
build_flojoy_ui() {
    echo ""
    echo -e "${CYAN}[前端] 开始构建 Flojoy Studio Web UI...${NC}"
    
    pushd "$FLOJOY_STUDIO" > /dev/null
    
    # 检查 package.json
    if [ ! -f "package.json" ]; then
        echo -e "${RED}[错误] 未找到 package.json${NC}"
        exit 1
    fi
    
    # 安装依赖
    echo "[前端] 安装依赖 (pnpm install)..."
    if [ "$VERBOSE" = true ]; then
        pnpm install
    else
        pnpm install > /dev/null 2>&1
    fi
    
    # 构建 Web 版本
    echo "[前端] 构建 Web 版本 (pnpm build:web)..."
    export VITE_CAPTAIN_URL="http://localhost:5392"
    if [ "$VERBOSE" = true ]; then
        pnpm build:web
    else
        pnpm build:web > /dev/null 2>&1
    fi
    
    # 复制产物
    local dist_dir="$FLOJOY_STUDIO/dist-web"
    if [ ! -d "$dist_dir" ]; then
        echo -e "${RED}[错误] 构建产物未找到: $dist_dir${NC}"
        echo -e "${YELLOW}请确保 vite 和依赖已正确安装${NC}"
        echo -e "${YELLOW}运行: cd third_party/flojoy/studio && pnpm install && pnpm build:web${NC}"
        exit 1
    fi
    
    echo "[前端] 复制产物到 $UI_OUTPUT..."
    
    # 确保目标目录存在
    mkdir -p "$UI_OUTPUT"
    
    # 清理旧文件（保留 .gitkeep）
    find "$UI_OUTPUT" -mindepth 1 ! -name '.gitkeep' -delete 2>/dev/null || true
    
    # 复制新文件
    cp -r "$dist_dir"/* "$UI_OUTPUT/"
    
    # 重命名 index-web.html 为 index.html
    if [ -f "$UI_OUTPUT/index-web.html" ]; then
        mv "$UI_OUTPUT/index-web.html" "$UI_OUTPUT/index.html"
        echo "  重命名: index-web.html -> index.html"
    fi
    
    popd > /dev/null
    
    echo -e "${GREEN}[前端] 构建完成${NC}"
}

# 处理后端 (从 studio 目录提取 captain 等)
build_flojoy_backend() {
    echo ""
    echo -e "${CYAN}[后端] 开始处理 Flojoy Backend (captain)...${NC}"
    
    pushd "$FLOJOY_STUDIO" > /dev/null
    
    # 确保目标目录存在
    mkdir -p "$BACKEND_OUTPUT"
    
    # 清理旧文件（保留 .gitkeep）
    find "$BACKEND_OUTPUT" -mindepth 1 ! -name '.gitkeep' -delete 2>/dev/null || true
    
    # 复制后端源码
    echo "[后端] 复制 captain 源码到 $BACKEND_OUTPUT..."
    
    # 复制 captain 目录
    if [ -d "$FLOJOY_STUDIO/captain" ]; then
        cp -r "$FLOJOY_STUDIO/captain" "$BACKEND_OUTPUT/"
        echo "  复制: captain/"
    fi
    
    # 复制 pkgs 目录 (包含 flojoy SDK)
    if [ -d "$FLOJOY_STUDIO/pkgs" ]; then
        cp -r "$FLOJOY_STUDIO/pkgs" "$BACKEND_OUTPUT/"
        echo "  复制: pkgs/"
    fi
    
    # 复制 blocks 目录 (节点定义)
    if [ -d "$FLOJOY_STUDIO/blocks" ]; then
        cp -r "$FLOJOY_STUDIO/blocks" "$BACKEND_OUTPUT/"
        echo "  复制: blocks/"
    fi
    
    # 复制 PYTHON 目录 (工具)
    if [ -d "$FLOJOY_STUDIO/PYTHON" ]; then
        cp -r "$FLOJOY_STUDIO/PYTHON" "$BACKEND_OUTPUT/"
        echo "  复制: PYTHON/"
    fi
    
    # 复制入口文件
    if [ -f "$FLOJOY_STUDIO/main.py" ]; then
        cp "$FLOJOY_STUDIO/main.py" "$BACKEND_OUTPUT/"
        echo "  复制: main.py"
    fi
    
    # 复制配置文件
    for file in pyproject.toml poetry.lock poetry.toml pytest.ini; do
        if [ -f "$FLOJOY_STUDIO/$file" ]; then
            cp "$FLOJOY_STUDIO/$file" "$BACKEND_OUTPUT/"
            echo "  复制: $file"
        fi
    done
    
    # 复制自定义节点
    local custom_nodes="$FLOJOY_ROOT/nodes/custom"
    if [ -d "$custom_nodes" ]; then
        mkdir -p "$BACKEND_OUTPUT/blocks/custom"
        find "$custom_nodes" -mindepth 1 -maxdepth 1 ! -name '.gitkeep' -exec cp -r {} "$BACKEND_OUTPUT/blocks/custom/" \; 2>/dev/null || true
        if [ "$(ls -A "$BACKEND_OUTPUT/blocks/custom" 2>/dev/null)" ]; then
            echo "  复制: 自定义节点"
        fi
    fi
    
    popd > /dev/null
    
    echo -e "${GREEN}[后端] 处理完成${NC}"
}

# 主流程
check_flojoy_source

if [ "$SKIP_UI" = false ]; then
    build_flojoy_ui
else
    echo -e "${YELLOW}[跳过] 前端构建${NC}"
fi

if [ "$SKIP_BACKEND" = false ]; then
    build_flojoy_backend
else
    echo -e "${YELLOW}[跳过] 后端处理${NC}"
fi

echo ""
echo -e "${CYAN}========================================"
echo -e "${GREEN}构建完成!"
echo -e "${CYAN}========================================${NC}"
echo ""
echo "产物位置:"
echo "  前端: $UI_OUTPUT"
echo "  后端: $BACKEND_OUTPUT"
echo ""
