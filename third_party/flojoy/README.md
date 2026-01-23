# Flojoy 源码集成说明

本目录用于存放 Flojoy 源码，支持源码级内嵌与二次开发。

## 重要更新：前端已与 Electron 解耦

我们已创建独立的 Web 构建配置，可以将 Flojoy Studio 前端构建为纯 Web 应用：

- **前端**: React SPA (通过 `vite.config.web.ts` 构建，无 Electron 依赖)
- **后端**: FastAPI Python 服务 (captain/)，端口 5392

### Web API 兼容层

`src/renderer/web-api-shim.ts` 提供了 `window.api` 的 Web 兼容实现，替代 Electron IPC。

## 目录结构

```
third_party/flojoy/
├── studio/              # Flojoy Studio 源码 (前端 + 后端)
│   ├── src/             # Electron + React 前端
│   ├── captain/         # FastAPI 后端 (核心服务)
│   ├── blocks/          # 节点定义
│   ├── pkgs/            # Python SDK
│   ├── main.py          # 后端入口 (uvicorn 启动)
│   └── pyproject.toml   # Python 依赖配置
├── backend/             # Flojoy Python SDK (可选)
├── nodes/
│   └── custom/          # 自定义节点目录
└── README.md
```

## 获取源码

### 方式一：Git 克隆（推荐）

```bash
# 在项目根目录执行
git clone --depth 1 https://github.com/flojoy-ai/studio.git third_party/flojoy/studio

# 可选：Flojoy Python SDK
git clone --depth 1 https://github.com/flojoy-ai/python.git third_party/flojoy/backend
```

### 方式二：Git 子模块

```bash
git submodule add https://github.com/flojoy-ai/studio.git third_party/flojoy/studio
git submodule update --init --recursive
```

## 版本信息

克隆后请记录版本号：

```bash
cd third_party/flojoy/studio
git log -1 --format="%H %s"
```

## 运行 Captain 后端

Captain 是 Flojoy 的核心后端服务，可以独立运行。

### 环境准备

```bash
cd third_party/flojoy/studio

# 安装 Python 依赖 (需要 Python 3.11 + Poetry)
poetry install

# 或使用 pip (从 pyproject.toml 提取依赖)
pip install uvicorn fastapi python-dotenv pyyaml ...
```

### 启动服务

```bash
# 使用 Poetry
poetry run python main.py

# 直接运行
python main.py
```

服务将在 `http://localhost:5392` 启动。

## 构建说明

### 方式一：手动构建 Web 前端

```bash
cd third_party/flojoy/studio

# 安装依赖
pnpm install

# 构建 Web 版本 (无 Electron 依赖)
pnpm build:web

# 开发模式
pnpm dev:web
```

构建产物位于 `dist-web/` 目录。

### 方式二：使用构建脚本

运行构建脚本将 captain 及相关文件复制到 Tauri 资源目录：

#### Windows

```powershell
# 构建全部 (前端 + 后端)
.\scripts\build-flojoy.ps1

# 仅构建后端
.\scripts\build-flojoy.ps1 -SkipUI

# 仅构建前端
.\scripts\build-flojoy.ps1 -SkipBackend

# 清理
.\scripts\build-flojoy.ps1 -Clean
```

#### Linux/macOS

```bash
chmod +x scripts/build-flojoy.sh
./scripts/build-flojoy.sh
```

## 使用模式

### 内嵌模式（推荐）

前端已与 Electron 解耦，可以完整内嵌到 Tauri 应用中：

1. 运行构建脚本：`.\scripts\build-flojoy.ps1`
2. 安装 Python 依赖（二选一）：
   ```bash
   # 方式一：使用 pip
   pip install -r src-tauri/resources/flojoy/backend/requirements.txt
   
   # 方式二：使用 Poetry（完整依赖）
   cd src-tauri/resources/flojoy/backend
   poetry install
   ```
3. 确保系统安装了 Python 3.11+
4. 在应用设置中选择"内嵌模式"

**注意**：内嵌模式会自动查找系统 Python，无需下载便携式运行时。

### 外部模式

使用独立安装的 Flojoy Studio：

1. 安装完整的 Flojoy Studio: https://github.com/flojoy-ai/studio/releases
2. 在应用设置中选择"外部模式"
3. 配置 Flojoy Studio 的可执行文件路径

## 自定义节点开发

1. 在 `nodes/custom/` 目录下创建节点文件
2. 遵循 Flojoy 节点开发规范
3. 重新运行构建脚本

## 注意事项

- Python 版本要求: 3.11
- 前端已通过 `web-api-shim.ts` 与 Electron 解耦
- Web 版本的文件操作使用浏览器原生 File API
- 部分功能（如系统 ping/netstat）需要后端 API 支持
- 修改源码后需重新运行构建脚本

## Web API 兼容层说明

`web-api-shim.ts` 实现了以下 Electron API 的 Web 替代：

| Electron API | Web 实现 |
|--------------|----------|
| `saveFile` | 浏览器下载 |
| `openFilePicker` | `<input type="file">` |
| `checkPythonInstallation` | Captain API |
| `spawnCaptain` | 外部管理 |
| `getUserProfiles` | localStorage |
| `openLink` | `window.open` |
