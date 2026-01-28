<script setup lang="ts">
/**
 * 多板扫码进度组件
 * 显示扫码进度和已扫描的电路板列表
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { HaltHassOrder, ScannedBoard } from '../types'

// Props
const props = defineProps<{
  order: HaltHassOrder | null
  scannedBoards: readonly ScannedBoard[]
  isScanning: boolean
  lastError?: string
}>()

// Emits
const emit = defineEmits<{
  remove: [serial: string]
  retry: []
}>()

// 计算属性
const requiredCount = computed(() => props.order?.boardCount ?? 0)
const scannedCount = computed(() => props.scannedBoards.length)
const remainingCount = computed(() => Math.max(0, requiredCount.value - scannedCount.value))
const progress = computed(() => {
  if (requiredCount.value === 0) return 0
  return Math.round((scannedCount.value / requiredCount.value) * 100)
})
const isComplete = computed(() => scannedCount.value >= requiredCount.value)

// 格式化时间
function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
</script>

<template>
  <div class="scan-progress">
    <!-- 头部信息 -->
    <div class="progress-header">
      <div class="header-left">
        <Icon icon="mdi:barcode-scan" class="header-icon" />
        <div class="header-text">
          <h3>扫码进度</h3>
          <p v-if="order">工单: {{ order.orderNo }}</p>
        </div>
      </div>
      <div class="progress-badge" :class="{ complete: isComplete }">
        {{ scannedCount }} / {{ requiredCount }}
      </div>
    </div>

    <!-- 进度条 -->
    <div class="progress-bar-wrapper">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
      </div>
      <span class="progress-text">{{ progress }}%</span>
    </div>

    <!-- 提示文字 -->
    <div v-if="!isComplete" class="scan-hint">
      <Icon icon="mdi:information-outline" />
      <span>还需扫描 <strong>{{ remainingCount }}</strong> 块电路板</span>
    </div>
    <div v-else class="scan-complete">
      <Icon icon="mdi:check-circle" />
      <span>所有电路板已扫描完成</span>
    </div>

    <!-- 错误提示 -->
    <div v-if="lastError" class="scan-error">
      <Icon icon="mdi:alert-circle-outline" />
      <span>{{ lastError }}</span>
      <button class="retry-btn" @click="emit('retry')">
        <Icon icon="mdi:refresh" />
      </button>
    </div>

    <!-- 扫描状态指示器 -->
    <div v-if="isScanning && !isComplete" class="scanning-indicator">
      <div class="pulse-dot"></div>
      <span>等待扫码...</span>
    </div>

    <!-- 已扫描列表 -->
    <div v-if="scannedBoards.length > 0" class="scanned-list">
      <div class="list-header">
        <span>已扫描电路板</span>
        <span class="count">{{ scannedCount }} 块</span>
      </div>
      <div class="board-items">
        <div
          v-for="(board, index) in scannedBoards"
          :key="board.serial"
          class="board-item"
        >
          <div class="item-left">
            <span class="item-index">{{ index + 1 }}</span>
            <Icon icon="mdi:chip" class="item-icon" />
            <div class="item-info">
              <span class="serial">{{ board.serial }}</span>
              <span v-if="board.boardModelName" class="model">{{ board.boardModelName }}</span>
            </div>
          </div>
          <div class="item-right">
            <span class="scan-time">{{ formatTime(board.scannedAt) }}</span>
            <button class="remove-btn" @click="emit('remove', board.serial)">
              <Icon icon="mdi:close" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <Icon icon="mdi:barcode" class="empty-icon" />
      <p>请使用扫码枪扫描电路板</p>
    </div>
  </div>
</template>

<style scoped>
.scan-progress {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 头部 */
.progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  font-size: 24px;
  color: rgb(249, 115, 22);
}

.header-text h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary, #f1f5f9);
  margin: 0;
}

.header-text p {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
  margin: 2px 0 0;
  font-family: 'JetBrains Mono', monospace;
}

.progress-badge {
  padding: 6px 14px;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 600;
  background: var(--color-bg-tertiary, #0f172a);
  color: var(--color-text-secondary, #94a3b8);
}

.progress-badge.complete {
  background: rgba(34, 197, 94, 0.15);
  color: rgb(74, 222, 128);
}

/* 进度条 */
.progress-bar-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--color-bg-tertiary, #0f172a);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, rgb(249, 115, 22), rgb(251, 146, 60));
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary, #94a3b8);
  min-width: 45px;
  text-align: right;
}

/* 提示文字 */
.scan-hint,
.scan-complete,
.scan-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 16px;
}

.scan-hint {
  background: rgba(249, 115, 22, 0.1);
  border: 1px solid rgba(249, 115, 22, 0.2);
  color: rgb(251, 146, 60);
}

.scan-hint strong {
  font-weight: 600;
}

.scan-complete {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.2);
  color: rgb(74, 222, 128);
}

.scan-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: rgb(248, 113, 113);
}

.retry-btn {
  margin-left: auto;
  padding: 4px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  transition: opacity 0.2s;
}

.retry-btn:hover {
  opacity: 1;
}

/* 扫描状态指示器 */
.scanning-indicator {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-bg-tertiary, #0f172a);
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--color-text-secondary, #94a3b8);
}

.pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgb(249, 115, 22);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

/* 已扫描列表 */
.scanned-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border, #334155);
  margin-bottom: 10px;
}

.list-header span {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.list-header .count {
  font-weight: 600;
  color: var(--color-text-secondary, #94a3b8);
}

.board-items {
  flex: 1;
  overflow-y: auto;
}

.board-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 8px;
  background: var(--color-bg-tertiary, #0f172a);
  transition: background 0.2s;
}

.board-item:hover {
  background: var(--color-bg-hover, #1e3a5f);
}

.item-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.item-index {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgb(249, 115, 22);
  color: white;
  font-size: 12px;
  font-weight: 600;
}

.item-icon {
  font-size: 20px;
  color: rgb(249, 115, 22);
}

.item-info {
  display: flex;
  flex-direction: column;
}

.serial {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary, #f1f5f9);
  font-family: 'JetBrains Mono', monospace;
}

.model {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
}

.item-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.scan-time {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
}

.remove-btn {
  padding: 4px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: var(--color-text-muted, #64748b);
  cursor: pointer;
  transition: all 0.2s;
}

.remove-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: rgb(248, 113, 113);
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--color-text-muted, #64748b);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.4;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
}
</style>
