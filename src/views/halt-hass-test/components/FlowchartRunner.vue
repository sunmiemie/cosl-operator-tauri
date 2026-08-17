<script setup lang="ts">
/**
 * 流程图运行组件
 * 展示流程图运行状态和节点结果
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import HaltHassTelemetryPanel from './HaltHassTelemetryPanel.vue'
import type {
  HaltHassFlowType,
  HaltHassProcessJson,
} from '@/views/process-halt-hass/types'
import type { NodeRunResult } from '../types'
import type { WorkerJobResponse } from '@/composables/useFlojoySocket'
import type {
  HassHardwarePreflightResponse,
} from '@/services/flojoy-api'

// Props
const props = defineProps<{
  processJson: HaltHassProcessJson | null
  activeFlowType: HaltHassFlowType
  testFlowPassed: boolean
  isRunning: boolean
  cycleTotalSeconds: number | null
  cycleRemainingSeconds: number | null
  cycleFinishState: 'idle' | 'running' | 'finishing' | 'recovering'
  currentNodeId: string
  completedNodes: string[]
  nodeResults: NodeRunResult[]
  serverStatus: string
  preflightResult: HassHardwarePreflightResponse | null
  isPreflightChecking: boolean
  preflightReady: boolean
  lastSocketMessage: WorkerJobResponse | null
}>()

// Emits
const emit = defineEmits<{
  run: []
  stop: []
  preflight: []
}>()

// 计算属性
const nodes = computed(() => {
  if (!props.processJson) return []
  return props.activeFlowType === 'test'
    ? props.processJson.testFlow.nodes
    : props.processJson.cycleFlow.nodes
})
const activeFlowLabel = computed(() =>
  props.activeFlowType === 'test' ? '测试流' : '循环流'
)
const totalNodes = computed(() => nodes.value.length)
const completedCount = computed(() => props.completedNodes.length)
const progress = computed(() => {
  if (totalNodes.value === 0) return 0
  return Math.round((completedCount.value / totalNodes.value) * 100)
})

const successCount = computed(() =>
  props.nodeResults.filter(r => r.status === 'success').length
)
const failedCount = computed(() =>
  props.nodeResults.filter(r => r.status === 'error').length
)

const isComplete = computed(() =>
  completedCount.value >= totalNodes.value && totalNodes.value > 0
)
const hasError = computed(() => failedCount.value > 0)

// 获取节点状态
function getNodeStatus(nodeId: string): 'pending' | 'running' | 'success' | 'error' {
  if (props.isRunning && props.currentNodeId === nodeId) return 'running'
  const result = props.nodeResults.find(r => r.nodeId === nodeId)
  if (!result || result.status === 'skipped') return 'pending'
  return result.status
}

// 获取节点名称
function getNodeName(nodeId: string): string {
  const node = nodes.value.find(n => n.id === nodeId)
  return node?.data?.label ?? nodeId
}

// 运行时间
const runningTime = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

watch(() => props.isRunning, (running) => {
  if (running) {
    if (timer) clearInterval(timer)
    runningTime.value = 0
    timer = setInterval(() => {
      runningTime.value++
    }, 1000)
  } else if (timer) {
    clearInterval(timer)
    timer = null
  }
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
  }
})

// 格式化时间
function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const mins = Math.floor((safeSeconds % 3600) / 60)
  const secs = safeSeconds % 60
  const minuteText = mins.toString().padStart(2, '0')
  const secondText = secs.toString().padStart(2, '0')
  return hours > 0
    ? `${hours.toString().padStart(2, '0')}:${minuteText}:${secondText}`
    : `${minuteText}:${secondText}`
}

const isCycleFlow = computed(() => props.activeFlowType === 'cycle')
const timeValue = computed(() => formatTime(runningTime.value))
const runningStatusText = computed(() => {
  if (props.cycleFinishState === 'recovering') {
    return '正常结束超时，正在执行安全收尾兜底'
  }
  if (props.cycleFinishState === 'finishing') {
    return '循环时长已到，正在停止工作台、关闭输出并释放连接'
  }
  return getNodeName(props.currentNodeId)
})
</script>

<template>
  <div class="flowchart-runner">
    <!-- 头部状态栏 -->
    <div v-if="!isCycleFlow" class="runner-header">
      <div class="header-left">
        <Icon icon="mdi:sitemap" class="header-icon" />
        <div class="header-text">
          <h3>{{ activeFlowLabel }}运行</h3>
          <p>{{ serverStatus }}</p>
        </div>
      </div>

      <div class="header-right">
        <!-- 运行时间 -->
        <div
          class="time-display"
          :class="{
            finishing: cycleFinishState === 'finishing',
            recovering: cycleFinishState === 'recovering',
          }"
        >
          <Icon icon="mdi:timer-outline" />
          <span class="time-label">已运行</span>
          <span>{{ timeValue }}</span>
        </div>

        <!-- 控制按钮 -->
        <div class="control-buttons">
          <button
            v-if="!isRunning"
            class="btn-run"
            :disabled="!processJson || !preflightReady"
            :title="!preflightReady ? '请先完成设备通信检测' : `运行${activeFlowLabel}`"
            @click="emit('run')"
          >
            <Icon icon="mdi:play" />
            运行{{ activeFlowLabel }}
          </button>
          <button
            v-else
            class="btn-stop"
            :disabled="cycleFinishState === 'recovering'"
            @click="emit('stop')"
          >
            <Icon icon="mdi:stop" />
            停止
          </button>
        </div>
      </div>
    </div>

    <!-- 正式流程前的设备通信门禁 -->
    <div
      v-if="activeFlowType === 'test'"
      class="preflight-section"
      :class="{
        ready: preflightReady,
        failed: preflightResult && !preflightReady,
      }"
    >
      <div class="preflight-heading">
        <div class="preflight-title">
          <Icon
            :icon="preflightReady ? 'mdi:shield-check' : 'mdi:shield-search'"
          />
          <div>
            <strong>设备通信检测</strong>
            <p>先检测 6723G 并输出 48 V / 1 A，等待 20 秒后检测脉冲器、IFBOX 和其余设备</p>
          </div>
        </div>
        <button
          class="btn-preflight"
          :disabled="isRunning || isPreflightChecking"
          @click="emit('preflight')"
        >
          <Icon
            :icon="isPreflightChecking ? 'mdi:loading' : 'mdi:access-point-check'"
            :class="{ spin: isPreflightChecking }"
          />
          {{
            isPreflightChecking
              ? '检测中...'
              : preflightResult
                ? '重新检测'
                : '开始检测'
          }}
        </button>
      </div>

      <div v-if="preflightResult" class="preflight-results">
        <div
          v-for="item in preflightResult.results"
          :key="item.role"
          class="preflight-item"
          :class="{ success: item.success, error: !item.success }"
        >
          <Icon :icon="item.success ? 'mdi:check-circle' : 'mdi:close-circle'" />
          <span class="preflight-device">{{ item.displayName }}</span>
          <span class="preflight-message">{{ item.message }}</span>
        </div>
      </div>
      <p v-else class="preflight-empty">
        未检测时“运行”按钮保持禁用，检测连接会在完成后立即释放。
      </p>
    </div>

    <div v-if="activeFlowType === 'test'" class="flow-stage-strip">
      <span class="stage" :class="{ active: activeFlowType === 'test', done: testFlowPassed }">
        <Icon :icon="testFlowPassed ? 'mdi:check-circle' : 'mdi:numeric-1-circle'" />
        测试流
      </span>
      <Icon icon="mdi:chevron-right" />
      <span class="stage">
        <Icon icon="mdi:numeric-2-circle" />
        循环流
      </span>
    </div>

    <HaltHassTelemetryPanel
      v-if="activeFlowType === 'cycle'"
      :process-json="processJson"
      :last-message="lastSocketMessage"
      :is-running="isRunning"
      :can-run="Boolean(processJson && preflightReady)"
      :cycle-total-seconds="cycleTotalSeconds"
      :cycle-remaining-seconds="cycleRemainingSeconds"
      :cycle-finish-state="cycleFinishState"
      :server-status="serverStatus"
      :preflight-result="preflightResult"
      @run="emit('run')"
      @stop="emit('stop')"
    />

    <template v-else>
      <!-- 测试流保留节点执行视图；循环流将主体空间全部交给实时曲线。 -->
      <div class="progress-section">
        <div class="progress-header">
          <span class="progress-label">运行进度</span>
          <span class="progress-value">{{ completedCount }} / {{ totalNodes }}</span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :class="{ error: hasError }"
            :style="{ width: `${progress}%` }"
          ></div>
        </div>
        <div class="progress-stats">
          <span class="stat-item success">
            <Icon icon="mdi:check-circle" />
            {{ successCount }} 成功
          </span>
          <span class="stat-item error">
            <Icon icon="mdi:close-circle" />
            {{ failedCount }} 失败
          </span>
        </div>
      </div>

      <!-- 运行状态指示 -->
      <div v-if="isRunning" class="running-indicator">
        <div class="pulse-ring"></div>
        <div class="running-info">
          <span class="running-label">正在执行</span>
          <span class="running-node">{{ runningStatusText }}</span>
        </div>
      </div>

      <!-- 完成状态 -->
      <div v-else-if="isComplete" class="complete-indicator" :class="{ error: hasError }">
        <Icon :icon="hasError ? 'mdi:alert-circle' : 'mdi:check-circle'" />
        <span>{{ hasError ? '运行完成，存在异常' : '运行完成' }}</span>
      </div>

      <!-- 节点列表 -->
      <div class="node-list">
        <div class="list-header">
          <span>节点列表</span>
          <span class="node-count">{{ totalNodes }} 个节点</span>
        </div>
        <div class="node-items">
          <div
            v-for="node in nodes"
            :key="node.id"
            class="node-item"
            :class="getNodeStatus(node.id)"
          >
            <div class="node-status-icon">
              <Icon v-if="getNodeStatus(node.id) === 'running'" icon="mdi:loading" class="spin" />
              <Icon v-else-if="getNodeStatus(node.id) === 'success'" icon="mdi:check" />
              <Icon v-else-if="getNodeStatus(node.id) === 'error'" icon="mdi:close" />
              <Icon v-else icon="mdi:circle-outline" />
            </div>
            <div class="node-info">
              <span class="node-name">{{ node.data?.label || node.id }}</span>
              <span class="node-type">{{ node.data?.type || 'Unknown' }}</span>
            </div>
            <div class="node-result" v-if="getNodeStatus(node.id) === 'error'">
              {{ nodeResults.find(r => r.nodeId === node.id)?.error || '执行失败' }}
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.flowchart-runner {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-secondary, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 1rem;
  overflow: hidden;
}

/* 头部 */
.runner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-icon {
  font-size: 1.5rem;
  color: var(--color-primary, #3b82f6);
}

.header-text h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
  margin: 0;
}

.header-text p {
  font-size: 0.75rem;
  color: var(--color-text-tertiary, #94a3b8);
  margin: 0.125rem 0 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.time-display {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-tertiary, #f8fafc);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-family: monospace;
  color: var(--color-text-secondary, #64748b);
}

.time-display.finishing {
  background: rgba(245, 158, 11, 0.12);
  color: rgb(180, 83, 9);
}

.time-display.recovering {
  background: rgba(239, 68, 68, 0.1);
  color: rgb(185, 28, 28);
}

.time-label {
  font-family: inherit;
  font-size: 0.75rem;
}

.control-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn-run,
.btn-stop {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-run {
  background: rgb(34, 197, 94);
  color: white;
  border: none;
}

.btn-run:hover:not(:disabled) {
  background: rgb(22, 163, 74);
}

.btn-run:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-stop {
  background: rgb(239, 68, 68);
  color: white;
  border: none;
}

.btn-stop:hover {
  background: rgb(220, 38, 38);
}

.btn-stop:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.flow-stage-strip {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1.5rem;
  color: var(--color-text-tertiary, #94a3b8);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.flow-stage-strip .stage {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.flow-stage-strip .stage.active {
  color: var(--color-primary, #3b82f6);
}

.flow-stage-strip .stage.done {
  color: rgb(22, 163, 74);
}

/* 设备通信预检 */
.preflight-section {
  padding: 1rem 1.5rem;
  background: rgba(245, 158, 11, 0.06);
  border-bottom: 1px solid rgba(245, 158, 11, 0.22);
}

.preflight-section.ready {
  background: rgba(34, 197, 94, 0.06);
  border-bottom-color: rgba(34, 197, 94, 0.22);
}

.preflight-section.failed {
  background: rgba(239, 68, 68, 0.05);
  border-bottom-color: rgba(239, 68, 68, 0.2);
}

.preflight-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.preflight-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.preflight-title > svg {
  flex: 0 0 auto;
  font-size: 1.5rem;
  color: rgb(217, 119, 6);
}

.preflight-section.ready .preflight-title > svg {
  color: rgb(22, 163, 74);
}

.preflight-title strong {
  display: block;
  color: var(--color-text-primary, #1e293b);
  font-size: 0.875rem;
}

.preflight-title p {
  margin: 0.2rem 0 0;
  color: var(--color-text-secondary, #64748b);
  font-size: 0.75rem;
}

.btn-preflight {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 0 0 auto;
  padding: 0.55rem 0.9rem;
  border: 1px solid rgba(245, 158, 11, 0.45);
  border-radius: 0.5rem;
  background: #fff;
  color: rgb(180, 83, 9);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-preflight:hover:not(:disabled) {
  background: rgba(245, 158, 11, 0.1);
}

.btn-preflight:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.preflight-results {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0.5rem;
  margin-top: 0.8rem;
}

.preflight-item {
  display: grid;
  grid-template-columns: auto minmax(90px, auto) 1fr;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  padding: 0.5rem 0.65rem;
  border-radius: 0.45rem;
  background: rgba(255, 255, 255, 0.72);
  font-size: 0.75rem;
}

.preflight-item.success > svg {
  color: rgb(22, 163, 74);
}

.preflight-item.error > svg {
  color: rgb(220, 38, 38);
}

.preflight-device {
  color: var(--color-text-primary, #1e293b);
  font-weight: 600;
}

.preflight-message {
  overflow: hidden;
  color: var(--color-text-secondary, #64748b);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preflight-empty {
  margin: 0.7rem 0 0;
  color: var(--color-text-tertiary, #94a3b8);
  font-size: 0.75rem;
}

/* 进度区域 */
.progress-section {
  padding: 1rem 1.5rem;
  background: var(--color-bg-tertiary, #f8fafc);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.progress-label {
  font-size: 0.75rem;
  color: var(--color-text-tertiary, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.progress-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
}

.progress-bar {
  height: 8px;
  background: var(--color-bg-secondary, #fff);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary, #3b82f6), #60a5fa);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-fill.error {
  background: linear-gradient(90deg, rgb(239, 68, 68), rgb(248, 113, 113));
}

.progress-stats {
  display: flex;
  gap: 1rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
}

.stat-item.success {
  color: rgb(22, 163, 74);
}

.stat-item.error {
  color: rgb(220, 38, 38);
}

/* 运行状态指示 */
.running-indicator {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: rgba(59, 130, 246, 0.05);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.pulse-ring {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-primary, #3b82f6);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

.running-info {
  display: flex;
  flex-direction: column;
}

.running-label {
  font-size: 0.75rem;
  color: var(--color-text-tertiary, #94a3b8);
}

.running-node {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-primary, #3b82f6);
}

/* 完成状态 */
.complete-indicator {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: rgba(34, 197, 94, 0.05);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(22, 163, 74);
}

.complete-indicator.error {
  background: rgba(239, 68, 68, 0.05);
  color: rgb(220, 38, 38);
}

.complete-indicator :deep(svg) {
  font-size: 1.25rem;
}

/* 节点列表 */
.node-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 1rem 1.5rem;
}

.list-header {
  display: flex;
  justify-content: space-between;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  margin-bottom: 0.75rem;
}

.list-header span {
  font-size: 0.75rem;
  color: var(--color-text-tertiary, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.node-count {
  font-weight: 600;
}

.node-items {
  flex: 1;
  overflow-y: auto;
}

.node-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin-bottom: 0.5rem;
  background: var(--color-bg-tertiary, #f8fafc);
  transition: all 0.2s;
}

.node-item.running {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.node-item.success {
  background: rgba(34, 197, 94, 0.05);
}

.node-item.error {
  background: rgba(239, 68, 68, 0.05);
}

.node-status-icon {
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 0.875rem;
}

.node-item.pending .node-status-icon {
  color: var(--color-text-tertiary, #94a3b8);
}

.node-item.running .node-status-icon {
  color: var(--color-primary, #3b82f6);
}

.node-item.success .node-status-icon {
  color: rgb(22, 163, 74);
}

.node-item.error .node-status-icon {
  color: rgb(220, 38, 38);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.node-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.node-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-primary, #1e293b);
}

.node-type {
  font-size: 0.75rem;
  color: var(--color-text-tertiary, #94a3b8);
}

.node-result {
  font-size: 0.75rem;
  color: rgb(220, 38, 38);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
