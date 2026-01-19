<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'

interface ProcessStep {
  id: number
  name: string
  desc: string
  pass: number
}

interface Props {
  step: ProcessStep
  canDelete?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  canDelete: true
})

const emit = defineEmits<{
  'delete': [id: number]
  'save': [id: number]
}>()

// 编辑状态
const isExpanded = ref(false)

// 直接使用 computed 进行双向绑定（因为 step 是响应式的父对象）
const stepName = computed({
  get: () => props.step.name,
  set: (value: string) => { props.step.name = value }
})

const stepDesc = computed({
  get: () => props.step.desc,
  set: (value: string) => { props.step.desc = value }
})

// 删除
function handleDelete() {
  emit('delete', props.step.id)
}

// 保存快捷
function handleSave() {
  emit('save', props.step.id)
}
</script>

<template>
  <div class="step-editor" :class="{ expanded: isExpanded }">
    <!-- 头部 -->
    <div class="step-header" @click="isExpanded = !isExpanded">
      <div class="step-info">
        <div class="step-number">{{ step.id }}</div>
        <div class="step-title">
          <span v-if="step.name" class="name">{{ step.name }}</span>
          <span v-else class="placeholder">未命名检测项</span>
        </div>
      </div>
      <div class="step-actions">
        <button 
          v-if="canDelete"
          class="action-btn delete" 
          @click.stop="handleDelete"
          title="删除"
        >
          <Icon icon="mdi:delete-outline" />
        </button>
        <button 
          class="action-btn save" 
          @click.stop="handleSave"
          title="保存为快捷"
        >
          <Icon icon="mdi:content-save-outline" />
        </button>
        <button class="action-btn expand" title="展开/收起">
          <Icon :icon="isExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'" />
        </button>
      </div>
    </div>
    
    <!-- 收起时显示描述预览 -->
    <div v-if="!isExpanded && step.desc" class="step-desc-preview">
      {{ step.desc }}
    </div>

    <!-- 展开内容 -->
    <Transition name="expand">
      <div v-show="isExpanded" class="step-content">
        <div class="form-group">
          <label class="form-label">
            <Icon icon="mdi:format-title" />
            检测项名称
          </label>
          <input 
            v-model="stepName"
            type="text"
            placeholder="请输入检测项名称"
            class="form-input"
          />
        </div>
        
        <div class="form-group">
          <label class="form-label">
            <Icon icon="mdi:text" />
            操作描述
          </label>
          <textarea 
            v-model="stepDesc"
            placeholder="请输入操作描述..."
            class="form-textarea"
            rows="4"
          />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.step-editor {
  background: var(--color-bg-tertiary);
  border-radius: 10px;

  transition: all 0.3s ease;
  border: 1px solid transparent;
}

.step-editor:hover {
  border-color: var(--color-border);
}

.step-editor.expanded {
  border-color: var(--color-accent-blue);
  box-shadow: 0 4px 12px rgba(88, 166, 255, 0.1);
}

.step-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.step-header:hover {
  background: var(--color-bg-hover);
}

.step-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--color-accent-blue);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: white;
}

.step-title .name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.step-title .placeholder {
  font-size: 14px;
  color: var(--color-text-tertiary);
  font-style: italic;
}

.step-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 16px;
}

.action-btn:hover {
  transform: scale(1.1);
}

.action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.action-btn.save:hover {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.action-btn.expand {
  background: transparent;
  color: var(--color-text-tertiary);
}

.action-btn.expand:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
}

.step-desc-preview {
  padding: 0 16px 14px;
  padding-left: 56px; /* 对齐标题 */
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 80px;
  overflow: hidden;
  position: relative;
}

.step-desc-preview::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 30px;
  background: linear-gradient(transparent, var(--color-bg-tertiary));
  pointer-events: none;
}

.step-content {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.form-input,
.form-textarea {
  padding: 12px 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
  transition: all 0.2s ease;
  font-family: inherit;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--color-accent-blue);
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--color-text-tertiary);
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
  max-height: 300px;
  line-height: 1.6;
}

/* 展开动画 - 使用 grid 实现平滑展开 */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
