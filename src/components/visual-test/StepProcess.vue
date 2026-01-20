<script setup lang="ts">
/**
 * StepProcess 组件 - 检测步骤展示与操作
 * 
 * 参考原程序 gui/src/components/Tools/StepProcess.vue
 * 
 * 功能:
 * - 显示检测步骤列表
 * - 支持合格/缺陷/疑问选择
 * - 缺陷/疑问时支持添加图片和描述
 */
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'

// ==================== 类型定义 ====================

// 检测步骤
export interface StepItem {
  id: number
  name: string
  desc?: string          // 步骤描述
  pass: 0 | 1 | 2 | 3 | 4   // 0=未检测, 1=合格, 2=缺陷, 3=疑问, 4=缺陷+疑问
  error?: {              // 缺陷信息
    url: string[]
    desc: string
  }
  question?: {           // 疑问信息
    url: string[]
    desc: string
  }
  warn?: {               // 制程警示
    url: string[]
    desc: string
  }
}

// 测试模式
type TestMode = 'normal' | 'feedback' | 'question'

// Props
const props = withDefaults(defineProps<{
  // 步骤数据列表
  stepData: StepItem[]
  // 参考图片 URL
  image?: string
  // 测试模式: normal=正常测试, feedback=反馈测试, question=疑问测试
  mode?: TestMode
}>(), {
  mode: 'normal'
})

// Emits
const emit = defineEmits<{
  'update:stepData': [data: StepItem[]]
  'click:save': [stepId: number]           // 拍照保存缺陷图
  'click:saveQuestion': [stepId: number]   // 拍照保存疑问图
  'click:saveWarn': [stepId: number]       // 拍照保存警示图
  'click:upload': [stepId: number]         // 上传缺陷图（用于反馈测试）
  'click:uploadQuestion': [stepId: number] // 上传疑问图
  'click:uploadWarn': [stepId: number]     // 上传警示图
}>()

// ==================== 状态 ====================

// 当前展开的缺陷弹窗
const errorExpandedIndex = ref<number | null>(null)
// 当前展开的疑问弹窗
const questionExpandedIndex = ref<number | null>(null)
// 图片预览
const previewVisible = ref(false)
const previewUrl = ref('')

// 计算属性 - 本地步骤数据
const localSteps = computed({
  get: () => props.stepData,
  set: (value) => emit('update:stepData', value)
})

// ==================== 方法 ====================

// 设置步骤为合格
function setStepCorrect(step: StepItem) {
  step.pass = 1
  // 清除缺陷和疑问数据
  delete step.error
  delete step.question
  resetPopovers()
}

// 设置步骤为缺陷
function setStepError(step: StepItem) {
  if (step.question) {
    step.pass = 4  // 缺陷+疑问
  } else {
    step.pass = 2
  }
  if (!step.error) {
    step.error = { url: [], desc: '' }
  }
}

// 设置步骤为疑问
function setStepQuestion(step: StepItem) {
  if (step.error) {
    step.pass = 4  // 缺陷+疑问
  } else {
    step.pass = 3
  }
  if (!step.question) {
    step.question = { url: [], desc: '' }
  }
}

// 添加制程警示
function setStepWarn(step: StepItem) {
  if (!step.warn) {
    step.warn = { url: [], desc: '' }
  }
}

// 删除缺陷
function deleteStepError(step: StepItem) {
  if (confirm('确定删除该缺陷项吗？')) {
    if (step.question) {
      step.pass = 3
    } else {
      step.pass = 1
    }
    delete step.error
    resetPopovers()
  }
}

// 删除疑问
function deleteStepQuestion(step: StepItem) {
  if (confirm('确定删除该疑问项吗？')) {
    if (step.error) {
      step.pass = 2
    } else {
      step.pass = 1
    }
    delete step.question
    resetPopovers()
  }
}

// 删除制程警示
function deleteStepWarn(step: StepItem) {
  if (confirm('确定删除该制程警示吗？')) {
    delete step.warn
  }
}

// 删除图片
function deleteImage(images: string[], index: number) {
  if (confirm('确定删除该图片吗？')) {
    images.splice(index, 1)
  }
}

// 预览图片
function previewImage(url: string) {
  previewUrl.value = url
  previewVisible.value = true
}

// 重置弹窗状态
function resetPopovers() {
  errorExpandedIndex.value = null
  questionExpandedIndex.value = null
}

// 切换缺陷弹窗
function toggleErrorPopover(index: number) {
  if (errorExpandedIndex.value === index) {
    errorExpandedIndex.value = null
  } else {
    errorExpandedIndex.value = index
    questionExpandedIndex.value = null
  }
}

// 切换疑问弹窗
function toggleQuestionPopover(index: number) {
  if (questionExpandedIndex.value === index) {
    questionExpandedIndex.value = null
  } else {
    questionExpandedIndex.value = index
    errorExpandedIndex.value = null
  }
}

// 获取步骤状态样式类
function getStepStatusClass(pass: number): string {
  switch (pass) {
    case 1: return 'status-pass'
    case 2: return 'status-error'
    case 3: return 'status-question'
    case 4: return 'status-both'
    default: return 'status-pending'
  }
}

// 获取步骤状态文字
function getStepStatusText(pass: number): string {
  switch (pass) {
    case 1: return '合格'
    case 2: return '缺陷'
    case 3: return '疑问'
    case 4: return '缺陷+疑问'
    default: return '待检测'
  }
}

// 发射拍照事件
function emitSave(stepId: number) {
  emit('click:save', stepId)
}

function emitSaveQuestion(stepId: number) {
  emit('click:saveQuestion', stepId)
}

function emitSaveWarn(stepId: number) {
  emit('click:saveWarn', stepId)
}
</script>

<template>
  <div class="step-process">
    <!-- 头部 -->
    <div class="step-header">
      <Icon icon="mdi:clipboard-check-outline" class="header-icon" />
      <span class="header-title">检测步骤项</span>
      <span class="header-count">{{ localSteps.length }} 项</span>
    </div>

    <!-- 步骤列表 -->
    <div class="step-list">
      <div 
        v-for="(step, index) in localSteps" 
        :key="step.id"
        class="step-item"
        :class="getStepStatusClass(step.pass)"
      >
        <!-- 步骤基本信息 -->
        <div class="step-info">
          <div class="step-index">{{ index + 1 }}</div>
          <div class="step-content">
            <div class="step-name">{{ step.name }}</div>
            <div v-if="step.desc" class="step-desc">{{ step.desc }}</div>
          </div>
          <div class="step-status">
            <span class="status-badge" :class="getStepStatusClass(step.pass)">
              {{ getStepStatusText(step.pass) }}
            </span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="step-actions">
          <!-- 合格按钮 -->
          <button 
            class="action-btn pass-btn"
            :class="{ active: step.pass === 1 }"
            @click="setStepCorrect(step)"
            title="标记为合格"
          >
            <Icon icon="mdi:check-circle" />
          </button>

          <!-- 缺陷按钮 -->
          <button 
            class="action-btn error-btn"
            :class="{ active: step.pass === 2 || step.pass === 4 }"
            @click="setStepError(step)"
            title="标记为缺陷"
          >
            <Icon icon="mdi:close-circle" />
          </button>

          <!-- 疑问按钮 -->
          <button 
            class="action-btn question-btn"
            :class="{ active: step.pass === 3 || step.pass === 4 }"
            @click="setStepQuestion(step)"
            title="标记为疑问"
          >
            <Icon icon="mdi:help-circle" />
          </button>

          <!-- 警示按钮 -->
          <button 
            class="action-btn warn-btn"
            :class="{ active: !!step.warn }"
            @click="setStepWarn(step)"
            title="添加制程警示"
          >
            <Icon icon="mdi:alert-circle" />
          </button>
        </div>

        <!-- 缺陷详情 (pass=2 或 4 时显示) -->
        <div v-if="step.error" class="detail-panel error-panel">
          <div class="panel-header">
            <Icon icon="mdi:close-circle" class="panel-icon error" />
            <span>缺陷详情</span>
            <button class="delete-btn" @click="deleteStepError(step)">
              <Icon icon="mdi:trash-can" />
            </button>
          </div>
          
          <!-- 缺陷图片 -->
          <div class="image-gallery">
            <div 
              v-for="(img, imgIdx) in step.error.url" 
              :key="imgIdx"
              class="image-item"
            >
              <img :src="img" @click="previewImage(img)" />
              <button class="img-delete" @click="deleteImage(step.error!.url, imgIdx)">
                <Icon icon="mdi:close" />
              </button>
            </div>
            <button 
              v-if="step.error.url.length < 5"
              class="add-image-btn"
              @click="emitSave(step.id)"
            >
              <Icon icon="mdi:camera-plus" />
              <span>拍照</span>
            </button>
          </div>

          <!-- 缺陷描述 -->
          <textarea 
            v-model="step.error.desc"
            class="desc-input"
            placeholder="请输入缺陷描述..."
            rows="3"
          />
        </div>

        <!-- 疑问详情 (pass=3 或 4 时显示) -->
        <div v-if="step.question" class="detail-panel question-panel">
          <div class="panel-header">
            <Icon icon="mdi:help-circle" class="panel-icon question" />
            <span>疑问详情</span>
            <button class="delete-btn" @click="deleteStepQuestion(step)">
              <Icon icon="mdi:trash-can" />
            </button>
          </div>
          
          <!-- 疑问图片 -->
          <div class="image-gallery">
            <div 
              v-for="(img, imgIdx) in step.question.url" 
              :key="imgIdx"
              class="image-item"
            >
              <img :src="img" @click="previewImage(img)" />
              <button class="img-delete" @click="deleteImage(step.question!.url, imgIdx)">
                <Icon icon="mdi:close" />
              </button>
            </div>
            <button 
              v-if="step.question.url.length < 5"
              class="add-image-btn"
              @click="emitSaveQuestion(step.id)"
            >
              <Icon icon="mdi:camera-plus" />
              <span>拍照</span>
            </button>
          </div>

          <!-- 疑问描述 -->
          <textarea 
            v-model="step.question.desc"
            class="desc-input"
            placeholder="请输入疑问描述..."
            rows="3"
            :disabled="mode === 'question'"
          />
        </div>

        <!-- 制程警示 (有 warn 时显示) -->
        <div v-if="step.warn" class="detail-panel warn-panel">
          <div class="panel-header">
            <Icon icon="mdi:alert-circle" class="panel-icon warn" />
            <span>制程警示</span>
            <button class="delete-btn" @click="deleteStepWarn(step)">
              <Icon icon="mdi:trash-can" />
            </button>
          </div>
          
          <!-- 警示图片 -->
          <div class="image-gallery">
            <div 
              v-for="(img, imgIdx) in step.warn.url" 
              :key="imgIdx"
              class="image-item"
            >
              <img :src="img" @click="previewImage(img)" />
              <button class="img-delete" @click="deleteImage(step.warn!.url, imgIdx)">
                <Icon icon="mdi:close" />
              </button>
            </div>
            <button 
              v-if="step.warn.url.length < 5"
              class="add-image-btn"
              @click="emitSaveWarn(step.id)"
            >
              <Icon icon="mdi:camera-plus" />
              <span>拍照</span>
            </button>
          </div>

          <!-- 警示描述 -->
          <textarea 
            v-model="step.warn.desc"
            class="desc-input"
            placeholder="请输入警示描述..."
            rows="2"
          />
        </div>
      </div>
    </div>

    <!-- 图片预览弹窗 -->
    <Teleport to="body">
      <div v-if="previewVisible" class="image-preview-overlay" @click="previewVisible = false">
        <div class="preview-container" @click.stop>
          <img :src="previewUrl" />
          <button class="close-btn" @click="previewVisible = false">
            <Icon icon="mdi:close" />
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.step-process {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-secondary);
  border-radius: 0.75rem;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.header-icon {
  font-size: 1.25rem;
  color: rgb(96, 165, 250);
}

.header-title {
  font-size: 0.9375rem;
  font-weight: 600;
}

.header-count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  padding: 0.125rem 0.5rem;
  border-radius: 0.625rem;
}

.step-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
}

.step-item {
  background: var(--color-bg-tertiary);
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-border);
  transition: all 0.2s;
}

.step-item.status-pass {
  border-left-color: #22c55e;
}

.step-item.status-error {
  border-left-color: #ef4444;
}

.step-item.status-question {
  border-left-color: #f59e0b;
}

.step-item.status-both {
  border-left-color: #a855f7;
}

.step-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
}

.step-index {
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-hover);
  border-radius: 50%;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.step-content {
  flex: 1;
}

.step-name {
  font-size: 0.875rem;
  font-weight: 500;
}

.step-desc {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
}

.step-status {
  flex-shrink: 0;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.625rem;
  border-radius: 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
}

.status-badge.status-pass {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.status-badge.status-error {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.status-badge.status-question {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.status-badge.status-both {
  background: rgba(168, 85, 247, 0.2);
  color: #a855f7;
}

.step-actions {
  display: flex;
  gap: 0.5rem;
  padding: 0 0.75rem 0.75rem;
}

.action-btn {
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 1.125rem;
  transition: all 0.2s;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.action-btn:hover {
  background: var(--color-bg-hover);
}

.action-btn.pass-btn:hover,
.action-btn.pass-btn.active {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.action-btn.error-btn:hover,
.action-btn.error-btn.active {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.action-btn.question-btn:hover,
.action-btn.question-btn.active {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.action-btn.warn-btn:hover,
.action-btn.warn-btn.active {
  background: rgba(99, 102, 241, 0.2);
  color: #6366f1;
}

.detail-panel {
  margin: 0 0.75rem 0.75rem;
  padding: 0.75rem;
  background: var(--color-bg-primary);
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.panel-icon {
  font-size: 1.125rem;
}

.panel-icon.error {
  color: #ef4444;
}

.panel-icon.question {
  color: #f59e0b;
}

.panel-icon.warn {
  color: #6366f1;
}

.delete-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 1rem;
  padding: 0.25rem;
  border-radius: 0.25rem;
}

.delete-btn:hover {
  color: rgb(239, 68, 68);
  background: rgba(239, 68, 68, 0.1);
}

.image-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.image-item {
  position: relative;
  width: 5rem;
  height: 5rem;
  border-radius: 0.375rem;
  border: 1px solid var(--color-border);
  overflow: hidden;
  cursor: pointer;
}

.image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.img-delete {
  position: absolute;
  top: 0.125rem;
  right: 0.125rem;
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.9);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  font-size: 0.75rem;
  opacity: 0;
  transition: opacity 0.2s;
}

.image-item:hover .img-delete {
  opacity: 1;
}

.add-image-btn {
  width: 5rem;
  height: 5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  background: var(--color-bg-tertiary);
  border: 2px dashed var(--color-border);
  border-radius: 0.375rem;
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  transition: all 0.2s;
}

.add-image-btn:hover {
  background: rgba(96, 165, 250, 0.1);
  border-color: rgb(96, 165, 250);
  color: rgb(96, 165, 250);
}

.add-image-btn svg {
  font-size: 1.5rem;
}

.desc-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  color: var(--color-text-primary);
  font-size: 0.8125rem;
  resize: none;
}

.desc-input::placeholder {
  color: var(--color-text-secondary);
}

.desc-input:focus {
  outline: none;
  border-color: rgb(96, 165, 250);
}

.desc-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 图片预览遮罩 */
.image-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.preview-container {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
}

.preview-container img {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
}

.close-btn {
  position: absolute;
  top: -40px;
  right: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  font-size: 20px;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* 滚动条样式 */
.step-list::-webkit-scrollbar {
  width: 0.375rem;
}

.step-list::-webkit-scrollbar-track {
  background: transparent;
}

.step-list::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 0.1875rem;
}

.step-list::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-secondary);
}
</style>
