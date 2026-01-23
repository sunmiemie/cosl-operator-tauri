# 运行时二进制文件目录

本目录用于存放 Flojoy 所需的运行时二进制文件（Python、Node.js 等）。

## 文件命名规范

Tauri sidecar 要求按目标三元组命名：

### Python 运行时

| 平台 | 文件名 |
|------|--------|
| Windows x64 | `python-x86_64-pc-windows-msvc.exe` |
| Linux x64 | `python-x86_64-unknown-linux-gnu` |
| macOS x64 | `python-x86_64-apple-darwin` |
| macOS ARM | `python-aarch64-apple-darwin` |

### 获取目标三元组

```bash
rustc --print target-triple
```

## 获取便携式 Python

### Windows

1. 下载 [python-build-standalone](https://github.com/indygreg/python-build-standalone/releases)
2. 选择 `cpython-*-x86_64-pc-windows-msvc-shared-install_only.tar.gz`
3. 解压并重命名为 `python-x86_64-pc-windows-msvc/`

### Linux

1. 下载 [python-build-standalone](https://github.com/indygreg/python-build-standalone/releases)
2. 选择 `cpython-*-x86_64-unknown-linux-gnu-install_only.tar.gz`
3. 解压并重命名为 `python-x86_64-unknown-linux-gnu/`

## 目录结构示例

```
binaries/
├── python-x86_64-pc-windows-msvc/
│   ├── python.exe
│   ├── python311.dll
│   ├── Lib/
│   └── ...
├── python-x86_64-unknown-linux-gnu/
│   ├── bin/
│   │   └── python3
│   ├── lib/
│   └── ...
└── README.md
```

## 注意事项

- 二进制文件体积较大，建议使用 Git LFS 或单独下载
- 开发时可使用系统 Python，打包时使用便携版
- 确保 Python 版本与 Flojoy 依赖兼容（推荐 3.10+）
