<script setup lang="ts">
/**
 * File Upload Widget Component
 * A file picker for file-type parameters
 */
import { ref, computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Icon } from '@iconify/vue'
import type { WidgetProps, FileUploadConfig } from '@/types'
import { useWidgetValue } from '@/composables/useControl'

const props = defineProps<WidgetProps<FileUploadConfig>>()

const config = computed(() => props.data.config || {
  type: 'file upload' as const,
  allowedExtensions: [{ ext: '' }],
})

const { value } = useWidgetValue(
  props.data.blockId,
  props.data.blockParameter,
  ''
)

const fileInputRef = ref<HTMLInputElement | null>(null)

const fileName = computed(() => {
  const path = value.value as string
  if (!path) return ''
  return path.split(/[/\\]/).pop() || path
})

const acceptTypes = computed(() => {
  return config.value.allowedExtensions
    .map((e) => e.ext)
    .filter((e) => e)
    .join(',')
})

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    value.value = file.name
  }
}

function clearFile() {
  value.value = ''
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}
</script>

<template>
  <div
    class="file-upload-widget"
    :class="{ selected }"
  >
    <Handle
      type="target"
      :position="Position.Left"
      class="handle"
    />

    <div class="content">
      <label class="widget-label">
        {{ data.label || data.blockParameter }}
      </label>

      <input
        ref="fileInputRef"
        type="file"
        :accept="acceptTypes"
        class="hidden-input"
        @change="handleFileChange"
      />

      <div v-if="fileName" class="file-display">
        <Icon icon="mdi:file-outline" class="file-icon" />
        <span class="file-name">{{ fileName }}</span>
        <button class="clear-btn" @click="clearFile">
          <Icon icon="mdi:close" />
        </button>
      </div>

      <button
        v-else
        class="upload-btn"
        @click="triggerFileInput"
      >
        <Icon icon="mdi:upload" class="btn-icon" />
        选择文件
      </button>
    </div>

    <Handle
      type="source"
      :position="Position.Right"
      class="handle"
    />
  </div>
</template>

<style scoped>
.file-upload-widget {
  min-width: 180px;
  padding: 16px;
  background: var(--card, white);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.file-upload-widget.selected {
  ring: 2px solid var(--primary);
}

.handle {
  width: 12px !important;
  height: 12px !important;
  background: var(--primary, #3b82f6) !important;
  border: 2px solid var(--background, white) !important;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.widget-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted-foreground);
}

.hidden-input {
  display: none;
}

.file-display {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--muted);
  border-radius: 6px;
}

.file-icon {
  width: 16px;
  height: 16px;
  color: var(--muted-foreground);
  flex-shrink: 0;
}

.file-name {
  font-size: 13px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clear-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.clear-btn:hover {
  background: var(--destructive, #ef4444);
  color: white;
}

.upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 8px 16px;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn:hover {
  background: var(--muted);
}

.btn-icon {
  width: 16px;
  height: 16px;
}
</style>
