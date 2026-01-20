<script setup lang="ts">
/**
 * 测试结果选择器组件
 * 
 * 用于选择测试结果（合格/缺陷/疑问），支持:
 * - 三种结果类型
 * - 自定义颜色主题
 * - 备注输入
 */
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'

// 结果类型
type ResultType = 1 | 2 | 3  // 1=合格, 2=缺陷, 3=疑问

// Props
const props = withDefaults(defineProps<{
  // 当前选中的结果
  modelValue: ResultType
  // 备注文本
  note?: string
  // 是否显示备注输入
  showNote?: boolean
  // 强调颜色
  accentColor?: 'green' | 'orange' | 'blue'
  // 是否禁用
  disabled?: boolean
}>(), {
  showNote: true,
  accentColor: 'green',
  disabled: false,
})

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: ResultType]
  'update:note': [value: string]
}>()

// 内部备注值
const internalNote = ref(props.note || '')

// 监听外部 note 变化
watch(() => props.note, (val) => {
  internalNote.value = val || ''
})

// 更新备注
function updateNote(e: Event) {
  const value = (e.target as HTMLTextAreaElement).value
  internalNote.value = value
  emit('update:note', value)
}

// 选择结果
function selectResult(result: ResultType) {
  if (props.disabled) return
  emit('update:modelValue', result)
}

// 颜色类
const colorClass = computed(() => `accent-${props.accentColor}`)
</script>

<template>
  <div class="result-selector" :class="[colorClass, { disabled }]">
    <!-- 结果按钮 -->
    <div class="result-buttons">
      <button 
        @click="selectResult(1)"
        class="result-btn pass"
        :class="{ active: modelValue === 1 }"
        :disabled="disabled"
      >
        <Icon icon="mdi:check-circle" />
        <span>合格</span>
      </button>
      <button 
        @click="selectResult(2)"
        class="result-btn fail"
        :class="{ active: modelValue === 2 }"
        :disabled="disabled"
      >
        <Icon icon="mdi:close-circle" />
        <span>缺陷</span>
      </button>
      <button 
        @click="selectResult(3)"
        class="result-btn question"
        :class="{ active: modelValue === 3 }"
        :disabled="disabled"
      >
        <Icon icon="mdi:help-circle" />
        <span>疑问</span>
      </button>
    </div>

    <!-- 备注输入 -->
    <textarea 
      v-if="showNote"
      :value="internalNote"
      @input="updateNote"
      placeholder="备注说明（可选）"
      class="note-input"
      :disabled="disabled"
    ></textarea>
  </div>
</template>

<style scoped>
.result-selector {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.result-selector.disabled {
  opacity: 0.6;
  pointer-events: none;
}

/* 结果按钮 */
.result-buttons {
  display: flex;
  gap: 0.75rem;
}

.result-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 1rem;
  border-radius: 0.625rem;
  border: 2px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.2s;
}

.result-btn:disabled {
  cursor: not-allowed;
}

.result-btn svg {
  font-size: 1.5rem;
}

.result-btn span {
  font-size: 0.8125rem;
  font-weight: 500;
}

/* 合格按钮 */
.result-btn.pass:hover,
.result-btn.pass.active {
  border-color: rgb(34, 197, 94);
  background: rgba(34, 197, 94, 0.1);
  color: rgb(74, 222, 128);
}

/* 缺陷按钮 */
.result-btn.fail:hover,
.result-btn.fail.active {
  border-color: rgb(239, 68, 68);
  background: rgba(239, 68, 68, 0.1);
  color: rgb(248, 113, 113);
}

/* 疑问按钮 */
.result-btn.question:hover,
.result-btn.question.active {
  border-color: rgb(249, 115, 22);
  background: rgba(249, 115, 22, 0.1);
  color: rgb(251, 146, 60);
}

/* 备注输入 */
.note-input {
  width: 100%;
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg-primary);
  color: var(--color-text);
  font-size: 0.8125rem;
  resize: none;
  min-height: 4rem;
  transition: border-color 0.2s;
}

.note-input:focus {
  outline: none;
}

.accent-green .note-input:focus { border-color: rgb(34, 197, 94); }
.accent-orange .note-input:focus { border-color: rgb(249, 115, 22); }
.accent-blue .note-input:focus { border-color: rgb(59, 130, 246); }

.note-input::placeholder {
  color: var(--color-text-secondary);
}

.note-input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
