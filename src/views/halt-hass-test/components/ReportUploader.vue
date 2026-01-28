<script setup lang="ts">
/**
 * 报告上传组件
 * 处理测试报告的上传流程
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

// Props
const props = defineProps<{
  isUploading: boolean
  uploadProgress: number
  uploadError: string
  uploadSuccess: boolean
}>()

// Emits
const emit = defineEmits<{
  upload: []
  retry: []
  complete: []
}>()

// 计算属性
const statusText = computed(() => {
  if (props.isUploading) return '正在上传报告...'
  if (props.uploadSuccess) return '上传成功'
  if (props.uploadError) return '上传失败'
  return '准备上传'
})

const statusIcon = computed(() => {
  if (props.isUploading) return 'mdi:loading'
  if (props.uploadSuccess) return 'mdi:check-circle'
  if (props.uploadError) return 'mdi:alert-circle'
  return 'mdi:cloud-upload-outline'
})

const statusClass = computed(() => {
  if (props.uploadSuccess) return 'success'
  if (props.uploadError) return 'error'
  return ''
})
</script>

<template>
  <div class="report-uploader">
    <!-- 上传状态区域 -->
    <div class="upload-status" :class="statusClass">
      <!-- 状态图标 -->
      <div class="status-icon-wrapper">
        <Icon :icon="statusIcon" class="status-icon" :class="{ spin: isUploading }" />
        <svg v-if="isUploading" class="progress-ring" viewBox="0 0 60 60">
          <circle
            cx="30" cy="30" r="26"
            fill="none"
            stroke="currentColor"
            stroke-width="4"
            class="ring-bg"
          />
          <circle
            cx="30" cy="30" r="26"
            fill="none"
            stroke="currentColor"
            stroke-width="4"
            stroke-linecap="round"
            class="ring-progress"
            :stroke-dasharray="`${uploadProgress * 1.63} 163`"
          />
        </svg>
      </div>

      <!-- 状态文字 -->
      <div class="status-text">
        <span class="status-title">{{ statusText }}</span>
        <span v-if="isUploading" class="status-progress">{{ uploadProgress }}%</span>
      </div>
    </div>

    <!-- 进度条 -->
    <div v-if="isUploading" class="progress-bar-wrapper">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${uploadProgress}%` }"></div>
      </div>
    </div>

    <!-- 错误信息 -->
    <div v-if="uploadError" class="error-message">
      <Icon icon="mdi:information-outline" />
      <span>{{ uploadError }}</span>
    </div>

    <!-- 操作按钮 -->
    <div class="action-buttons">
      <template v-if="!uploadSuccess">
        <button
          v-if="!isUploading"
          class="btn-upload"
          @click="emit('upload')"
        >
          <Icon icon="mdi:cloud-upload" />
          上传报告
        </button>
        <button
          v-if="uploadError"
          class="btn-retry"
          @click="emit('retry')"
        >
          <Icon icon="mdi:refresh" />
          重试
        </button>
      </template>
      <button
        v-if="uploadSuccess"
        class="btn-complete"
        @click="emit('complete')"
      >
        <Icon icon="mdi:check" />
        完成测试
      </button>
    </div>

    <!-- 成功提示 -->
    <div v-if="uploadSuccess" class="success-message">
      <Icon icon="mdi:party-popper" />
      <span>报告已成功上传，请等待审核</span>
    </div>
  </div>
</template>

<style scoped>
.report-uploader {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  background: var(--color-bg-secondary, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 1rem;
}

/* 上传状态 */
.upload-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 1.5rem;
}

.status-icon-wrapper {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}

.status-icon {
  font-size: 2.5rem;
  color: var(--color-primary, #3b82f6);
  z-index: 1;
}

.upload-status.success .status-icon {
  color: rgb(34, 197, 94);
}

.upload-status.error .status-icon {
  color: rgb(239, 68, 68);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.progress-ring {
  position: absolute;
  width: 60px;
  height: 60px;
}

.ring-bg {
  color: var(--color-bg-tertiary, #f1f5f9);
}

.ring-progress {
  color: var(--color-primary, #3b82f6);
  transform: rotate(-90deg);
  transform-origin: center;
  transition: stroke-dasharray 0.3s ease;
}

.status-text {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.status-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
}

.status-progress {
  font-size: 0.875rem;
  color: var(--color-text-secondary, #64748b);
  margin-top: 0.25rem;
}

/* 进度条 */
.progress-bar-wrapper {
  width: 100%;
  max-width: 300px;
  margin-bottom: 1.5rem;
}

.progress-bar {
  height: 8px;
  background: var(--color-bg-tertiary, #f1f5f9);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary, #3b82f6), #60a5fa);
  border-radius: 4px;
  transition: width 0.3s ease;
}

/* 错误信息 */
.error-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 0.5rem;
  color: rgb(220, 38, 38);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

/* 操作按钮 */
.action-buttons {
  display: flex;
  gap: 0.75rem;
}

.btn-upload,
.btn-retry,
.btn-complete {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-upload {
  background: var(--color-primary, #3b82f6);
  color: white;
  border: none;
}

.btn-upload:hover {
  opacity: 0.9;
}

.btn-retry {
  background: var(--color-bg-tertiary, #f1f5f9);
  color: var(--color-text-secondary, #64748b);
  border: 1px solid var(--color-border, #e2e8f0);
}

.btn-retry:hover {
  background: var(--color-bg-hover, #e2e8f0);
}

.btn-complete {
  background: rgb(34, 197, 94);
  color: white;
  border: none;
}

.btn-complete:hover {
  background: rgb(22, 163, 74);
}

/* 成功提示 */
.success-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(34, 197, 94, 0.1);
  border-radius: 0.5rem;
  color: rgb(22, 163, 74);
  font-size: 0.875rem;
}

.success-message :deep(svg) {
  font-size: 1.125rem;
}
</style>
