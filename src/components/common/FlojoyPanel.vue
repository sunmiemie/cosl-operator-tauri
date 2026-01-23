<script setup lang="ts">
/**
 * FlojoyPanel.vue - Flojoy 服务嵌入面板
 * 
 * 功能：
 * - 显示 Flojoy 服务状态
 * - 启动/停止/重启服务
 * - 通过 iframe 嵌入 Flojoy UI
 */
import { ref, computed, onMounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useFlojoy, type FlojoyConfig } from '@/composables/useFlojoy'
import { useConfig } from '@/composables/useConfig'

const props = defineProps<{
  /** 是否自动启动 */
  autoStart?: boolean
  /** 自定义配置（覆盖设置中的配置） */
  config?: Partial<FlojoyConfig>
}>()

const { config: appConfig } = useConfig()

const emit = defineEmits<{
  (e: 'ready', url: string): void
  (e: 'error', message: string): void
  (e: 'statusChange', status: string): void
}>()

const {
  status,
  mode,
  url,
  error,
  isRunning,
  isStarting,
  isStopped,
  hasFailed,
  canStart,
  embeddedAvailable,
  startFlojoy,
  stopFlojoy,
  restartFlojoy,
  initialize,
  checkEmbeddedResources
} = useFlojoy()

// 检查是否已配置
// 内嵌模式：检查内嵌资源可用性
// 外部模式：检查外部路径配置
const isConfigured = computed(() => {
  if (appConfig.value.flojoyMode === 'embedded') {
    return embeddedAvailable.value
  } else {
    return !!(appConfig.value.flojoyPath && appConfig.value.flojoyPath.length > 0)
  }
})

// 是否为内嵌模式
const isEmbeddedMode = computed(() => appConfig.value.flojoyMode === 'embedded')

// iframe 引用
const iframeRef = ref<HTMLIFrameElement | null>(null)

// iframe 加载状态
const iframeLoading = ref(true)
const iframeError = ref(false)

// 状态图标映射
const statusIcon = computed(() => {
  switch (status.value) {
    case 'running': return 'mdi:check-circle'
    case 'starting': return 'mdi:loading'
    case 'stopping': return 'mdi:loading'
    case 'failed': return 'mdi:alert-circle'
    default: return 'mdi:stop-circle'
  }
})

// 状态颜色映射
const statusColor = computed(() => {
  switch (status.value) {
    case 'running': return 'var(--color-accent-green)'
    case 'starting': return 'var(--color-accent-orange)'
    case 'stopping': return 'var(--color-accent-orange)'
    case 'failed': return 'var(--color-accent-red)'
    default: return 'var(--color-text-muted)'
  }
})

// 状态文本映射
const statusText = computed(() => {
  switch (status.value) {
    case 'running': return '运行中'
    case 'starting': return '启动中...'
    case 'stopping': return '停止中...'
    case 'failed': return '启动失败'
    default: return '未启动'
  }
})

// 处理 iframe 加载完成
function handleIframeLoad() {
  iframeLoading.value = false
  iframeError.value = false
}

// 处理 iframe 加载错误
function handleIframeError() {
  iframeLoading.value = false
  iframeError.value = true
}

// 刷新 iframe
function refreshIframe() {
  if (iframeRef.value && url.value) {
    iframeLoading.value = true
    iframeError.value = false
    iframeRef.value.src = url.value
  }
}

// 启动服务
async function handleStart() {
  // 从应用配置中获取 Flojoy 配置，props.config 可覆盖
  const configFromSettings: Partial<FlojoyConfig> = {
    mode: appConfig.value.flojoyMode || 'embedded',
    executable_path: appConfig.value.flojoyPath || '',
    port: appConfig.value.flojoyPort || 5392,
    startup_timeout: appConfig.value.flojoyTimeout || 30,
    args: []
  }
  
  const mergedConfig = {
    ...configFromSettings,
    ...props.config
  }
  
  const success = await startFlojoy(mergedConfig)
  if (!success && error.value) {
    emit('error', error.value)
  }
}

// 停止服务
async function handleStop() {
  await stopFlojoy()
}

// 重启服务
async function handleRestart() {
  iframeLoading.value = true
  await restartFlojoy()
}

// 监听状态变化
watch(status, (newStatus) => {
  emit('statusChange', newStatus)
})

// 监听 URL 变化
watch(url, (newUrl) => {
  if (newUrl) {
    iframeLoading.value = true
    emit('ready', newUrl)
  }
})

// 监听错误变化
watch(error, (newError) => {
  if (newError) {
    emit('error', newError)
  }
})

// 初始化
onMounted(async () => {
  await initialize()
  
  // 检查内嵌资源可用性
  if (appConfig.value.flojoyMode === 'embedded') {
    await checkEmbeddedResources()
  }
  
  // 自动启动
  if (props.autoStart && canStart.value && isConfigured.value) {
    await handleStart()
  }
})
</script>

<template>
  <div class="flojoy-panel">
    <!-- 状态栏 -->
    <div class="flojoy-toolbar">
      <div class="status-indicator" :style="{ color: statusColor }">
        <Icon :icon="statusIcon" :class="{ spin: isStarting || status === 'stopping' }" />
        <span class="status-text">{{ statusText }}</span>
      </div>
      
      <div class="toolbar-actions">
        <!-- 刷新按钮 -->
        <button
          v-if="isRunning"
          class="toolbar-btn"
          @click="refreshIframe"
          title="刷新"
        >
          <Icon icon="mdi:refresh" />
        </button>
        
        <!-- 启动按钮 -->
        <button
          v-if="canStart"
          class="toolbar-btn start"
          @click="handleStart"
          :disabled="!isConfigured"
          :title="isConfigured ? '启动 Flojoy' : '请先配置 Flojoy 路径'"
        >
          <Icon icon="mdi:play" />
          <span>启动</span>
        </button>
        
        <!-- 重启按钮 -->
        <button
          v-if="isRunning"
          class="toolbar-btn"
          @click="handleRestart"
          title="重启"
        >
          <Icon icon="mdi:restart" />
        </button>
        
        <!-- 停止按钮 -->
        <button
          v-if="isRunning || isStarting"
          class="toolbar-btn stop"
          @click="handleStop"
          title="停止"
        >
          <Icon icon="mdi:stop" />
          <span>停止</span>
        </button>
      </div>
    </div>
    
    <!-- 内容区 -->
    <div class="flojoy-content">
      <!-- 未配置提示 -->
      <div v-if="!isConfigured && isStopped" class="placeholder-state">
        <Icon icon="mdi:cog-outline" class="placeholder-icon" />
        <p class="placeholder-title">Flojoy 未配置</p>
        <p v-if="isEmbeddedMode" class="placeholder-desc">
          请确保已安装 Python 并运行构建脚本
        </p>
        <p v-if="isEmbeddedMode" class="placeholder-hint">
          1. 安装依赖: pip install -r src-tauri/resources/flojoy/backend/requirements.txt<br>
          2. 或切换到设置页面使用"外部模式"
        </p>
        <p v-else class="placeholder-desc">
          请在设置中配置 Flojoy 可执行文件路径
        </p>
      </div>
      
      <!-- 未启动提示 -->
      <div v-else-if="isStopped" class="placeholder-state">
        <Icon icon="mdi:play-circle-outline" class="placeholder-icon" />
        <p class="placeholder-title">Flojoy 未启动</p>
        <p class="placeholder-desc">点击上方"启动"按钮启动服务</p>
      </div>
      
      <!-- 启动中 -->
      <div v-else-if="isStarting" class="placeholder-state">
        <Icon icon="mdi:loading" class="placeholder-icon spin" />
        <p class="placeholder-title">正在启动 Flojoy...</p>
        <p class="placeholder-desc">请稍候</p>
      </div>
      
      <!-- 启动失败 -->
      <div v-else-if="hasFailed" class="placeholder-state error">
        <Icon icon="mdi:alert-circle-outline" class="placeholder-icon" />
        <p class="placeholder-title">启动失败</p>
        <p class="placeholder-desc">{{ error || '未知错误' }}</p>
        <button class="retry-btn" @click="handleStart">
          <Icon icon="mdi:refresh" />
          重试
        </button>
      </div>
      
      <!-- 运行中 - 显示 iframe -->
      <template v-else-if="isRunning && url">
        <!-- 加载遮罩 -->
        <div v-if="iframeLoading" class="iframe-loading">
          <Icon icon="mdi:loading" class="loading-icon spin" />
          <p>加载中...</p>
        </div>
        
        <!-- iframe 错误 -->
        <div v-if="iframeError" class="iframe-error">
          <Icon icon="mdi:alert-circle-outline" />
          <p>页面加载失败</p>
          <button @click="refreshIframe">重试</button>
        </div>
        
        <!-- Flojoy iframe -->
        <iframe
          ref="iframeRef"
          :src="url"
          class="flojoy-iframe"
          @load="handleIframeLoad"
          @error="handleIframeError"
          allow="clipboard-read; clipboard-write"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.flojoy-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.flojoy-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  gap: 12px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.status-indicator .iconify {
  font-size: 16px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar-btn.start {
  color: var(--color-accent-green);
  border-color: var(--color-accent-green);
}

.toolbar-btn.start:hover:not(:disabled) {
  background: rgba(63, 185, 80, 0.1);
}

.toolbar-btn.stop {
  color: var(--color-accent-red);
  border-color: var(--color-accent-red);
}

.toolbar-btn.stop:hover {
  background: rgba(248, 81, 73, 0.1);
}

.flojoy-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.placeholder-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
  text-align: center;
}

.placeholder-state.error {
  color: var(--color-accent-red);
}

.placeholder-icon {
  font-size: 64px;
  color: var(--color-text-muted);
  margin-bottom: 16px;
  opacity: 0.6;
}

.placeholder-state.error .placeholder-icon {
  color: var(--color-accent-red);
  opacity: 1;
}

.placeholder-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
}

.placeholder-desc {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

.placeholder-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 12px;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
  text-align: left;
  line-height: 1.6;
}

.retry-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  padding: 8px 16px;
  font-size: 14px;
  color: #fff;
  background: var(--color-accent-blue);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.retry-btn:hover {
  background: #4a94e8;
}

.iframe-loading,
.iframe-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-primary);
  z-index: 10;
}

.loading-icon {
  font-size: 48px;
  color: var(--color-accent-blue);
  margin-bottom: 16px;
}

.iframe-error {
  color: var(--color-accent-red);
}

.iframe-error .iconify {
  font-size: 48px;
  margin-bottom: 16px;
}

.iframe-error button {
  margin-top: 16px;
  padding: 8px 16px;
  background: var(--color-accent-blue);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.flojoy-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

/* 加载动画 */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
