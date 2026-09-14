<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from '@/composables/useTheme'

const { initTheme } = useTheme()

onMounted(() => {
  initTheme()
})
</script>

<template>
  <router-view />
</template>

<style>
/* 全局样式重置 */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* 暗色主题变量 */
:root,
html.dark {
  /* 背景色 */
  --color-bg-primary: #010409;
  --color-bg-secondary: #0d1117;
  --color-bg-tertiary: #161b22;
  --color-bg-hover: rgba(255, 255, 255, 0.06);
  --color-border: rgba(255, 255, 255, 0.08);
  
  /* 组件使用的背景色别名（暗色主题） */
  --color-bg-1: #0d1117;
  --color-bg-2: #161b22;
  --color-bg-3: #21262d;
  
  /* 文字颜色 */
  --color-text-primary: #e6edf3;
  --color-text-secondary: #8b949e;
  --color-text-muted: #6e7681;
  
  /* 组件使用的文字色别名（暗色主题） */
  --color-text-1: #e6edf3;
  --color-text-2: #8b949e;
  --color-text-3: #6e7681;
  
  /* 强调色 */
  --color-accent-blue: #58a6ff;
  --color-accent-green: #3fb950;
  --color-accent-purple: #a371f7;
  --color-accent-orange: #f78166;
  --color-accent-red: #f85149;
  --color-accent-pink: #db61a2;
  --color-accent-cyan: #39c5cf;
  
  /* 主色调（暗色主题） */
  --color-primary: #58a6ff;
  --color-primary-light: rgba(88, 166, 255, 0.15);
  --color-primary-dark: #4a94e8;
  
  /* 功能色（暗色主题） */
  --color-success: #3fb950;
  --color-success-light: rgba(63, 185, 80, 0.15);
  --color-success-dark: #2ea043;
  --color-warning: #d29922;
  --color-warning-light: rgba(210, 153, 34, 0.15);
  --color-danger: #f85149;
  --color-danger-light: rgba(248, 81, 73, 0.15);
  --color-danger-dark: #da3633;
  
  /* 卡片 */
  --color-card-bg: rgba(22, 27, 34, 0.8);
  --color-card-border: rgba(255, 255, 255, 0.06);
  
  /* 滚动条 */
  --color-scrollbar: rgba(255, 255, 255, 0.1);
  --color-scrollbar-hover: rgba(255, 255, 255, 0.2);
}

/* 亮色主题变量 */
html.light {
  /* 背景色 */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f6f8fa;
  --color-bg-tertiary: #eef1f4;
  --color-bg-hover: rgba(0, 0, 0, 0.04);
  --color-border: #e2e8f0;
  
  /* 组件使用的背景色别名（亮色主题） */
  --color-bg-1: #f8fafc;
  --color-bg-2: #ffffff;
  --color-bg-3: #f1f5f9;
  
  /* 文字颜色 */
  --color-text-primary: #1f2328;
  --color-text-secondary: #656d76;
  --color-text-muted: #8c959f;
  
  /* 组件使用的文字色别名（亮色主题） */
  --color-text-1: #1e293b;
  --color-text-2: #64748b;
  --color-text-3: #94a3b8;
  
  /* 强调色 */
  --color-accent-blue: #0969da;
  --color-accent-green: #1a7f37;
  --color-accent-purple: #8250df;
  --color-accent-orange: #bc4c00;
  --color-accent-red: #cf222e;
  --color-accent-pink: #bf3989;
  --color-accent-cyan: #0891b2;
  
  /* 主色调（亮色主题） */
  --color-primary: #3b82f6;
  --color-primary-light: #dbeafe;
  --color-primary-dark: #2563eb;
  
  /* 功能色（亮色主题） */
  --color-success: #22c55e;
  --color-success-light: #dcfce7;
  --color-success-dark: #16a34a;
  --color-warning: #f59e0b;
  --color-warning-light: #fef3c7;
  --color-danger: #ef4444;
  --color-danger-light: #fee2e2;
  --color-danger-dark: #dc2626;
  
  /* 卡片 */
  --color-card-bg: #ffffff;
  --color-card-border: rgba(0, 0, 0, 0.1);
  
  /* 滚动条 */
  --color-scrollbar: rgba(0, 0, 0, 0.15);
  --color-scrollbar-hover: rgba(0, 0, 0, 0.25);
}

/* 根元素样式 */
:root {
  /* 字体 */
  --font-sans: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  font-weight: 400;
  
  color: var(--color-text-primary);
  background-color: var(--color-bg-primary);
  
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  overflow: hidden;
  transition: background-color 0.3s ease, color 0.3s ease;
}

/* 禁用全局选择（可拖拽区域需要） */
body {
  user-select: none;
  -webkit-user-select: none;
  background-color: var(--color-bg-primary);
}

/* 允许输入框和文本区域选择 */
input,
textarea,
[contenteditable="true"] {
  user-select: text;
  -webkit-user-select: text;
}

/* 链接样式 */
a {
  color: var(--color-accent-blue);
  text-decoration: none;
  transition: color 0.2s ease;
}

a:hover {
  opacity: 0.8;
}

/* 按钮基础样式 */
button {
  font-family: inherit;
  font-size: inherit;
  border: none;
  background: none;
  cursor: pointer;
  color: inherit;
}

button:focus-visible {
  outline: 2px solid var(--color-accent-blue);
  outline-offset: 2px;
}

/* 输入框基础样式（排除 Element Plus 组件和特殊组件的输入框） */
input:not(.el-input__inner):not(.el-select__input):not(.el-textarea__inner):not(.lock-mask-input):not(.password-dialog-input):not(.search-input):not(.label-input):not(.form-input),
textarea:not(.el-textarea__inner):not(.form-textarea),
select:not(.el-select__input):not(.form-select) {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 8px 12px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

input:not(.el-input__inner):not(.el-select__input):not(.el-textarea__inner):not(.lock-mask-input):not(.password-dialog-input):not(.search-input):not(.label-input):not(.form-input):focus,
textarea:not(.el-textarea__inner):not(.form-textarea):focus,
select:not(.el-select__input):not(.form-select):focus {
  outline: none;
  border-color: var(--color-accent-blue);
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 5px;
  border: 2px solid transparent;
  background-clip: content-box;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-scrollbar-hover);
  background-clip: content-box;
}

::-webkit-scrollbar-corner {
  background: transparent;
}

/* Element Plus 暗色主题适配 */
html.dark .el-message-box {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
}

html.dark .el-message-box__header {
  background: var(--color-bg-secondary);
}

html.dark .el-message-box__title {
  color: var(--color-text-primary);
}

html.dark .el-message-box__content {
  color: var(--color-text-secondary);
}

html.dark .el-message-box__headerbtn .el-message-box__close {
  color: var(--color-text-secondary);
}

html.dark .el-message-box__headerbtn:hover .el-message-box__close {
  color: var(--color-text-primary);
}

html.dark .el-button--default {
  background: var(--color-bg-tertiary);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

html.dark .el-button--default:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-accent-blue);
  color: var(--color-accent-blue);
}

html.dark .el-button--primary {
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
}

html.dark .el-button--primary:hover {
  background: #4a94e8;
  border-color: #4a94e8;
}

html.dark .el-overlay {
  background-color: rgba(0, 0, 0, 0.7);
}

/* Element Plus MessageBox 输入框暗色适配 */
html.dark .el-message-box__input .el-input__wrapper {
  background: var(--color-bg-tertiary);
  box-shadow: 0 0 0 1px var(--color-border) inset;
}

html.dark .el-message-box__input .el-input__wrapper:hover {
  box-shadow: 0 0 0 1px var(--color-text-muted) inset;
}

html.dark .el-message-box__input .el-input__wrapper.is-focus {
  box-shadow: 0 0 0 1px var(--color-accent-blue) inset;
}

html.dark .el-message-box__input .el-input__inner {
  color: var(--color-text-primary);
}

html.dark .el-message-box__input .el-input__inner::placeholder {
  color: var(--color-text-muted);
}

/* Element Plus Message 暗色适配 */
html.dark .el-message {
  background: var(--color-bg-secondary);
  border-color: var(--color-border);
}

html.dark .el-message__content {
  color: var(--color-text-primary);
}

/* 确保 Tailwind preflight 不影响 Element Plus 组件 */
/* 重置 ElSelect 可能被 Tailwind 影响的样式 */
.el-select,
.el-select__wrapper,
.el-input,
.el-input__wrapper {
  border: none !important;
}

/* Element Plus 使用 box-shadow 而不是 border 来显示边框 */
/* 确保不会有额外的边框叠加 */
</style>
