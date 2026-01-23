# Flojoy 集成构建脚本

本目录包含 Flojoy 源码级内嵌所需的构建脚本。

## 脚本说明

| 脚本 | 平台 | 功能 |
|------|------|------|
| `build-flojoy.ps1` | Windows | 构建 Flojoy 前端 UI 和后端依赖 |
| `build-flojoy.sh` | Linux/macOS | 构建 Flojoy 前端 UI 和后端依赖 |
| `setup-runtime.ps1` | Windows | 下载并设置 Python 便携版运行时 |
| `setup-runtime.sh` | Linux/macOS | 下载并设置 Python 便携版运行时 |

## 快速开始

### 1. 获取 Flojoy 源码

首先需要获取 Flojoy 源码到 `third_party/flojoy/` 目录。

#### 方式一：Git 子模块（推荐）

```bash
# 在项目根目录执行
git submodule add https://github.com/flojoy-ai/studio.git third_party/flojoy/studio
git submodule add https://github.com/flojoy-ai/python.git third_party/flojoy/backend

# 初始化子模块
git submodule update --init --recursive
```

#### 方式二：直接克隆

```bash
git clone https://github.com/flojoy-ai/studio.git third_party/flojoy/studio
git clone https://github.com/flojoy-ai/python.git third_party/flojoy/backend
```

### 2. 构建 Flojoy

#### Windows

```powershell
# 构建所有组件
.\scripts\build-flojoy.ps1

# 仅构建前端
.\scripts\build-flojoy.ps1 -SkipBackend

# 仅构建后端
.\scripts\build-flojoy.ps1 -SkipUI

# 清理构建产物
.\scripts\build-flojoy.ps1 -Clean
```

#### Linux/macOS

```bash
# 添加执行权限
chmod +x scripts/build-flojoy.sh

# 构建所有组件
./scripts/build-flojoy.sh

# 仅构建前端
./scripts/build-flojoy.sh --skip-backend

# 仅构建后端
./scripts/build-flojoy.sh --skip-ui

# 清理构建产物
./scripts/build-flojoy.sh --clean
```

### 3. 设置 Python 运行时（可选，用于内嵌模式）

#### Windows

```powershell
# 下载并设置 Python 3.11.7
.\scripts\setup-runtime.ps1

# 指定 Python 版本
.\scripts\setup-runtime.ps1 -PythonVersion "3.10.11"

# 强制重新下载
.\scripts\setup-runtime.ps1 -Force
```

#### Linux/macOS

```bash
# 添加执行权限
chmod +x scripts/setup-runtime.sh

# 下载并设置 Python 3.11.7
./scripts/setup-runtime.sh

# 指定 Python 版本
./scripts/setup-runtime.sh --python-version "3.10.11"

# 强制重新下载
./scripts/setup-runtime.sh --force
```

## 构建产物目录

构建完成后，产物将位于以下目录：

```
src-tauri/
├── resources/
│   └── flojoy/
│       ├── ui/           # Flojoy 前端静态资源
│       └── backend/      # Flojoy 后端源码
└── binaries/
    └── python-{target}/  # Python 运行时（按平台区分）
```

## 运行模式

### 内嵌模式（Embedded）

- 使用打包在应用内的 Python 运行时和 Flojoy 后端
- 需要先运行构建脚本生成产物
- 无需用户手动安装 Python 或 Flojoy

### 外部模式（External）

- 使用用户系统中已安装的 Flojoy
- 需要在设置中配置 Flojoy 可执行文件路径
- 适合开发调试或已有 Flojoy 安装的用户

## 验证清单

### 开发环境验证

- [ ] Rust 代码编译通过 (`cargo check`)
- [ ] 前端代码编译通过 (`pnpm build`)
- [ ] 设置页面能正确显示 Flojoy 配置选项
- [ ] 模式切换（内嵌/外部）功能正常

### 内嵌模式验证

- [ ] Flojoy 源码已正确放置到 `third_party/flojoy/`
- [ ] 构建脚本执行成功
- [ ] Python 运行时已下载（如需打包）
- [ ] 启动应用后，HALT-HASS 页面能加载 Flojoy

### 打包验证

- [ ] Windows 安装包生成成功
- [ ] Linux 安装包生成成功
- [ ] 安装后应用能正常启动
- [ ] Flojoy 服务能正常运行
- [ ] 关闭应用时子进程正确回收

## 故障排除

### 构建脚本报错"源码未找到"

确保 Flojoy 源码已正确获取：

```bash
ls third_party/flojoy/
# 应该看到 studio/ 和 backend/ 目录
```

### Python 运行时下载失败

手动下载 Python 便携版：
- 访问 https://github.com/indygreg/python-build-standalone/releases
- 选择对应平台的 `install_only` 版本
- 解压到 `src-tauri/binaries/python-{target}/`

### Flojoy 服务启动超时

- 检查端口是否被占用
- 增加启动超时时间（设置中配置）
- 查看日志输出排查问题
