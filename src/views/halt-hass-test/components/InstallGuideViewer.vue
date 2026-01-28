<script setup lang="ts">
/**
 * 安装指导展示组件
 * 展示多步骤安装指导，支持图片和视频
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { HaltHassProcessJson } from '@/views/process-halt-hass/types'

// Props
const props = defineProps<{
  processJson: HaltHassProcessJson | null
  currentStep: number
}>()

// Emits
const emit = defineEmits<{
  'update:currentStep': [step: number]
  prev: []
  next: []
  start: []
}>()

// 计算属性
const steps = computed(() => props.processJson?.installGuide?.steps ?? [])
const totalSteps = computed(() => steps.value.length)
const currentStepData = computed(() => steps.value[props.currentStep] ?? null)
const isFirstStep = computed(() => props.currentStep === 0)
const isLastStep = computed(() => props.currentStep >= totalSteps.value - 1)
const progress = computed(() => {
  if (totalSteps.value === 0) return 0
  return Math.round(((props.currentStep + 1) / totalSteps.value) * 100)
})

// 方法
function goToStep(index: number): void {
  if (index >= 0 && index < totalSteps.value) {
    emit('update:currentStep', index)
  }
}
</script>

<template>
  <div class="install-guide-viewer">
    <!-- 顶部进度区域 -->
    <div class="guide-header">
      <div class="header-info">
        <Icon icon="mdi:clipboard-list-outline" class="header-icon" />
        <div class="header-text">
          <h3>安装指导</h3>
          <p>步骤 {{ currentStep + 1 }} / {{ totalSteps }}</p>
        </div>
      </div>
      <div class="progress-indicator">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
        </div>
        <span class="progress-text">{{ progress }}%</span>
      </div>
    </div>

    <!-- 步骤导航 -->
    <div class="step-nav">
      <div
        v-for="(step, index) in steps"
        :key="index"
        class="step-dot"
        :class="{
          active: index === currentStep,
          completed: index < currentStep,
        }"
        @click="goToStep(index)"
      >
        <span class="dot-number">{{ index + 1 }}</span>
        <Icon v-if="index < currentStep" icon="mdi:check" class="dot-check" />
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="guide-content">
      <template v-if="currentStepData">
        <!-- 步骤标题 -->
        <div class="step-header">
          <span class="step-badge">步骤 {{ currentStep + 1 }}</span>
          <h4 class="step-title">{{ currentStepData.title }}</h4>
        </div>

        <!-- 媒体区域 -->
        <div v-if="currentStepData.images?.length || currentStepData.video" class="media-section">
          <!-- 视频优先 -->
          <div v-if="currentStepData.video" class="video-wrapper">
            <video
              :src="currentStepData.video"
              controls
              class="step-video"
            ></video>
          </div>

          <!-- 图片列表 -->
          <div v-else-if="currentStepData.images?.length" class="images-wrapper">
            <div
              v-for="(image, imgIndex) in currentStepData.images"
              :key="imgIndex"
              class="image-item"
            >
              <img :src="image" :alt="`步骤 ${currentStep + 1} 图片 ${imgIndex + 1}`" />
            </div>
          </div>
        </div>

        <!-- 文字说明 -->
        <div class="step-content">
          <p>{{ currentStepData.content }}</p>
        </div>
      </template>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <Icon icon="mdi:file-document-outline" class="empty-icon" />
        <p>暂无安装指导内容</p>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="guide-footer">
      <button
        class="btn-secondary"
        :disabled="isFirstStep"
        @click="emit('prev')"
      >
        <Icon icon="mdi:arrow-left" />
        上一步
      </button>

      <div class="step-indicator">
        {{ currentStep + 1 }} / {{ totalSteps }}
      </div>

      <button
        v-if="!isLastStep"
        class="btn-primary"
        @click="emit('next')"
      >
        下一步
        <Icon icon="mdi:arrow-right" />
      </button>
      <button
        v-else
        class="btn-success"
        @click="emit('start')"
      >
        <Icon icon="mdi:play" />
        开始测试
      </button>
    </div>
  </div>
</template>

<style scoped>
.install-guide-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-secondary, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 1rem;
  overflow: hidden;
}

/* 头部 */
.guide-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.header-info {
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

.progress-indicator {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.progress-bar {
  width: 120px;
  height: 6px;
  background: var(--color-bg-tertiary, #f1f5f9);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary, #3b82f6);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-secondary, #64748b);
}

/* 步骤导航 */
.step-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  background: var(--color-bg-tertiary, #f8fafc);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.step-dot {
  position: relative;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-bg-secondary, #fff);
  border: 2px solid var(--color-border, #e2e8f0);
  cursor: pointer;
  transition: all 0.2s;
}

.step-dot:hover {
  border-color: var(--color-primary, #3b82f6);
}

.step-dot.active {
  background: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
}

.step-dot.completed {
  background: rgb(34, 197, 94);
  border-color: rgb(34, 197, 94);
}

.dot-number {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
}

.step-dot.active .dot-number,
.step-dot.completed .dot-number {
  color: white;
}

.dot-check {
  position: absolute;
  font-size: 1rem;
  color: white;
}

.step-dot.completed .dot-number {
  display: none;
}

/* 内容区域 */
.guide-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.step-header {
  margin-bottom: 1rem;
}

.step-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: rgba(59, 130, 246, 0.1);
  color: var(--color-primary, #3b82f6);
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.step-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
  margin: 0;
}

/* 媒体区域 */
.media-section {
  margin-bottom: 1.5rem;
}

.video-wrapper {
  border-radius: 0.75rem;
  overflow: hidden;
  background: #000;
}

.step-video {
  width: 100%;
  max-height: 400px;
  display: block;
}

.images-wrapper {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.image-item {
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--color-bg-tertiary, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
}

.image-item img {
  width: 100%;
  height: auto;
  display: block;
}

/* 文字说明 */
.step-content {
  padding: 1rem;
  background: var(--color-bg-tertiary, #f8fafc);
  border-radius: 0.75rem;
}

.step-content p {
  font-size: 0.9375rem;
  line-height: 1.75;
  color: var(--color-text-primary, #1e293b);
  margin: 0;
  white-space: pre-wrap;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--color-text-tertiary, #94a3b8);
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 0.75rem;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: 0.875rem;
}

/* 底部操作栏 */
.guide-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg-tertiary, #f8fafc);
}

.step-indicator {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary, #64748b);
}

/* 按钮样式 */
.btn-primary,
.btn-secondary,
.btn-success {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--color-primary, #3b82f6);
  color: white;
  border: none;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-secondary {
  background: var(--color-bg-secondary, #fff);
  color: var(--color-text-secondary, #64748b);
  border: 1px solid var(--color-border, #e2e8f0);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-primary, #1e293b);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-success {
  background: rgb(34, 197, 94);
  color: white;
  border: none;
}

.btn-success:hover {
  background: rgb(22, 163, 74);
}
</style>
