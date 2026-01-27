# COSL Operator Tauri - 桌面客户端

## 项目概述
COSL 测试系统的 Tauri 2.0 桌面客户端，集成 Flojoy 流程图编辑器，支持工艺编辑和测试执行。

## 技术栈
- **桌面框架**: Tauri 2.0 (Rust 后端)
- **前端框架**: Vue 3.5 + TypeScript 5.6
- **流程图**: Vue Flow 1.48
- **UI 组件**: Element Plus 2.13
- **CSS**: Tailwind CSS 4.1
- **图表**: ECharts 6.0 + Plotly.js
- **图像编辑**: TUI Image Editor + Fabric.js

## 项目结构
```
cosl-operator-tauri/
├── src/                        # Vue 前端源码
│   ├── components/             # 公共组件
│   │   ├── flowchart/         # 流程图编辑器组件
│   │   ├── common/            # 通用组件
│   │   └── plotly/            # Plotly 图表组件
│   ├── composables/           # 组合式函数
│   │   ├── useFlojoyBackend.ts  # Flojoy 后端控制
│   │   ├── useFlojoySocket.ts   # WebSocket 连接
│   │   └── useAuth.ts           # 认证管理
│   ├── services/              # 服务层
│   │   ├── http.ts            # HTTP 请求
│   │   ├── flojoy-api.ts      # Flojoy API
│   │   └── flojoy-adapter.ts  # 数据适配器
│   ├── views/                 # 页面视图
│   │   ├── process-halt-hass/ # HALT-HASS 工艺编辑
│   │   └── process-visual/    # 目检工艺编辑
│   └── types/                 # 类型定义
├── src-tauri/                 # Tauri/Rust 后端
│   ├── src/
│   │   ├── main.rs           # 入口文件
│   │   └── flojoy.rs         # Flojoy 进程管理
│   └── resources/
│       └── flojoy/           # Flojoy Python 运行时
└── public/                    # 静态资源
```

## 启动命令
```bash
# 安装依赖
pnpm install

# 开发模式
pnpm tauri dev

# 构建应用
pnpm tauri build
```

## 核心功能模块

### HALT-HASS 工艺编辑 (`src/views/process-halt-hass/`)
- 电路板组多选
- 版本管理
- 安装指导编辑（多步骤，支持图片/视频）
- Flojoy 流程图编辑

### 流程图编辑器 (`src/components/flowchart/`)
- `FlowchartEditor.vue` - 主编辑器
- `BlockSidebar.vue` - Block 侧边栏
- `ControlBar.vue` - 控制工具栏
- `nodes/` - 自定义节点组件

### Flojoy 集成
- Python 后端通过 Tauri sidecar 管理
- WebSocket 实时通信
- 节点状态同步

## 数据结构
- `HaltHassProcessJson` - HALT-HASS 工艺数据
- `InstallationGuide` - 安装指导
- `BoardGroupItem` - 电路板组

## API 对接
- `/equipment/instrument/list?isTree=true` - 电路板型号树
- Flojoy API: `http://127.0.0.1:{port}/api/`

## 开发规范
- 使用中文注释
- 组件使用 `<script setup lang="ts">` 语法
- 类型定义放在各模块的 `types.ts`
- 使用 Composition API + Composables 模式
- 样式使用 scoped CSS + CSS 变量

## 相关项目
- cnooc-backend: Django 后端服务（API 数据源）
- cosl-front-rebuild: Web 前端（共享部分设计）
