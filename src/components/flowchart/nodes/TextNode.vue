<script setup lang="ts">
/**
 * Text Node Component
 * For text annotations on the flowchart canvas
 */
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'

defineOptions({ inheritAttrs: false })

interface Props {
  id: string
  data: {
    text: string
    fontSize?: number
    fontWeight?: 'normal' | 'bold'
    color?: string
  }
  selected?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:text', text: string): void
}>()

const isEditing = ref(false)
const editText = ref('')

const textStyle = computed(() => ({
  fontSize: `${props.data.fontSize || 14}px`,
  fontWeight: props.data.fontWeight || 'normal',
  color: props.data.color || 'inherit',
}))

function startEditing() {
  editText.value = props.data.text
  isEditing.value = true
}

function finishEditing() {
  if (editText.value.trim()) {
    emit('update:text', editText.value.trim())
  }
  isEditing.value = false
}

function cancelEditing() {
  isEditing.value = false
  editText.value = ''
}
</script>

<template>
  <div
    class="text-node"
    :class="{ 'is-selected': selected, 'is-editing': isEditing }"
    @dblclick="startEditing"
  >
    <template v-if="isEditing">
      <textarea
        v-model="editText"
        class="text-input"
        :style="textStyle"
        placeholder="输入文本..."
        @blur="finishEditing"
        @keyup.enter.ctrl="finishEditing"
        @keyup.escape="cancelEditing"
      />
    </template>
    <template v-else>
      <div class="text-content" :style="textStyle">
        {{ data.text || '双击编辑文本' }}
      </div>
      <button class="edit-btn" @click.stop="startEditing">
        <Icon icon="mdi:pencil" />
      </button>
    </template>
  </div>
</template>

<style scoped>
.text-node {
  min-width: 100px;
  min-height: 40px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid transparent;
  border-radius: 8px;
  position: relative;
  transition: all 0.2s ease;
}

.text-node.is-selected {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.text-node:hover .edit-btn {
  opacity: 1;
}

.text-content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.text-input {
  width: 100%;
  min-height: 60px;
  padding: 0;
  border: none;
  background: transparent;
  resize: both;
  outline: none;
  font-family: inherit;
  line-height: 1.5;
}

.edit-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  border: none;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  font-size: 14px;
  color: #666;
}

.edit-btn:hover {
  background: rgba(0, 0, 0, 0.2);
}

.is-editing .edit-btn {
  display: none;
}
</style>
