<script setup lang="ts">
/**
 * 安装指导编辑器
 * 管理多个安装步骤的添加、删除、排序
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import InstallStepCard from './InstallStepCard.vue'

interface InstallationStep {
  id: number
  title: string
  content: string
  images: string[]
  video?: string
}

interface InstallationGuide {
  steps: InstallationStep[]
}

interface Props {
  modelValue: InstallationGuide
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: InstallationGuide]
  addStep: []
  updateStep: [stepId: number, step: InstallationStep]
  deleteStep: [stepId: number]
  moveStep: [fromIndex: number, toIndex: number]
}>()

// 步骤列表
const steps = computed(() => props.modelValue.steps)

// 添加新步骤
function handleAddStep() {
  const newId = steps.value.length > 0 ? Math.max(...steps.value.map((s) => s.id)) + 1 : 1
  const newStep: InstallationStep = {
    id: newId,
    title: '',
    content: '',
    images: [],
    video: undefined,
  }
  const newGuide: InstallationGuide = {
    steps: [...steps.value, newStep],
  }
  emit('update:modelValue', newGuide)
  emit('addStep')
}

// 更新步骤
function handleUpdateStep(updatedStep: InstallationStep) {
  const newSteps = steps.value.map((s) => (s.id === updatedStep.id ? updatedStep : s))
  emit('update:modelValue', { steps: newSteps })
  emit('updateStep', updatedStep.id, updatedStep)
}

// 删除步骤
function handleDeleteStep(stepId: number) {
  const newSteps = steps.value.filter((s) => s.id !== stepId)
  emit('update:modelValue', { steps: newSteps })
  emit('deleteStep', stepId)
}

// 上移步骤
function handleMoveUp(index: number) {
  if (index > 0) {
    const newSteps = [...steps.value]
    const temp = newSteps[index]
    newSteps[index] = newSteps[index - 1]
    newSteps[index - 1] = temp
    emit('update:modelValue', { steps: newSteps })
    emit('moveStep', index, index - 1)
  }
}

// 下移步骤
function handleMoveDown(index: number) {
  if (index < steps.value.length - 1) {
    const newSteps = [...steps.value]
    const temp = newSteps[index]
    newSteps[index] = newSteps[index + 1]
    newSteps[index + 1] = temp
    emit('update:modelValue', { steps: newSteps })
    emit('moveStep', index, index + 1)
  }
}
</script>

<template>
  <div class="install-guide-editor">
    <!-- 头部 -->
    <div class="editor-header">
      <div class="header-info">
        <h3 class="header-title">
          <Icon icon="mdi:book-open-page-variant" />
          电路板安装指导
        </h3>
        <p class="header-desc">添加安装步骤，每个步骤可包含标题、说明文字、图片和视频</p>
      </div>
      <button class="add-step-btn" @click="handleAddStep">
        <Icon icon="mdi:plus" />
        添加步骤
      </button>
    </div>

    <!-- 步骤列表 -->
    <div class="steps-list">
      <template v-if="steps.length > 0">
        <InstallStepCard
          v-for="(step, index) in steps"
          :key="step.id"
          :step="step"
          :index="index"
          :can-delete="steps.length > 0"
          :can-move-up="index > 0"
          :can-move-down="index < steps.length - 1"
          @update="handleUpdateStep"
          @delete="handleDeleteStep"
          @move-up="handleMoveUp"
          @move-down="handleMoveDown"
        />
      </template>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <div class="empty-icon">
          <Icon icon="mdi:clipboard-list-outline" />
        </div>
        <h4 class="empty-title">暂无安装步骤</h4>
        <p class="empty-desc">点击上方"添加步骤"按钮开始创建安装指导</p>
        <button class="add-first-btn" @click="handleAddStep">
          <Icon icon="mdi:plus-circle" />
          添加第一个步骤
        </button>
      </div>
    </div>

    <!-- 统计信息 -->
    <div v-if="steps.length > 0" class="stats-bar">
      <span class="stat-item">
        <Icon icon="mdi:format-list-numbered" />
        共 {{ steps.length }} 个步骤
      </span>
      <span class="stat-item">
        <Icon icon="mdi:image-multiple" />
        {{ steps.reduce((sum, s) => sum + s.images.length, 0) }} 张图片
      </span>
      <span class="stat-item">
        <Icon icon="mdi:video" />
        {{ steps.filter((s) => s.video).length }} 个视频
      </span>
    </div>
  </div>
</template>

<style scoped>
.install-guide-editor {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
  max-height: calc(100vh - 200px);
  overflow: hidden;
}

/* 头部 */
.editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 24px;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.header-title :deep(svg) {
  color: var(--color-accent-blue);
}

.header-desc {
  font-size: 14px;
  color: var(--color-text-tertiary);
  margin: 0;
}

.add-step-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: var(--color-accent-blue);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.add-step-btn:hover {
  background: #4c9aed;
  transform: translateY(-1px);
}

/* 步骤列表 */
.steps-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 4px;
  overflow-y: auto;
}

.steps-list::-webkit-scrollbar {
  width: 4px;
}

.steps-list::-webkit-scrollbar-track {
  background: transparent;
}

.steps-list::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 2px;
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 40px;
  background: var(--color-bg-secondary);
  border: 2px dashed var(--color-border);
  border-radius: 12px;
  text-align: center;
}

.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  background: var(--color-bg-tertiary);
  border-radius: 50%;
  margin-bottom: 20px;
}

.empty-icon :deep(svg) {
  font-size: 40px;
  color: var(--color-text-tertiary);
  opacity: 0.5;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
}

.empty-desc {
  font-size: 14px;
  color: var(--color-text-tertiary);
  margin: 0 0 24px 0;
}

.add-first-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: var(--color-accent-blue);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-first-btn:hover {
  background: #4c9aed;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(88, 166, 255, 0.3);
}

/* 统计栏 */
.stats-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 20px;
  background: var(--color-bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.stat-item :deep(svg) {
  font-size: 16px;
  color: var(--color-text-tertiary);
}
</style>
