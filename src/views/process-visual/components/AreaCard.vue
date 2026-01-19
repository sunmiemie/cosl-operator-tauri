<script setup lang="ts">
import { Icon } from '@iconify/vue'

interface Props {
  id: number
  url: string
  isSelected?: boolean
  index: number  // 用于拖拽排序
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false
})

const emit = defineEmits<{
  'select': [id: number]
  'replace': [id: number]
  'delete': [id: number]
  'drag-start': [index: number]
  'drag-over': [index: number]
  'drag-end': []
}>()

// 拖拽事件处理
function handleDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', String(props.index))
  emit('drag-start', props.index)
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  emit('drag-over', props.index)
}

function handleDragEnd() {
  emit('drag-end')
}
</script>

<template>
  <div 
    class="area-card" 
    :class="{ selected: isSelected }"
    draggable="true"
    @click="$emit('select', id)"
    @dragstart="handleDragStart"
    @dragover="handleDragOver"
    @dragend="handleDragEnd"
  >
    <!-- 拖拽手柄 -->
    <div class="drag-handle" @mousedown.stop>
      <Icon icon="mdi:drag" />
    </div>
    
    <!-- 序号标签 -->
    <div class="area-badge">{{ id }}</div>
    
    <!-- 图片预览 -->
    <div class="area-image">
      <img v-if="url" :src="url" alt="分区预览" />
      <div v-else class="placeholder">
        <Icon icon="mdi:image-off-outline" />
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="area-actions">
      <button 
        class="action-btn" 
        @click.stop="$emit('replace', id)"
        title="替换图片"
      >
        <Icon icon="mdi:refresh" />
      </button>
      <button 
        class="action-btn delete" 
        @click.stop="$emit('delete', id)"
        title="删除分区"
      >
        <Icon icon="mdi:delete" />
      </button>
    </div>

    <!-- 选中指示器 -->
    <div v-if="isSelected" class="selected-indicator">
      <Icon icon="mdi:check-circle" />
    </div>
  </div>
</template>

<style scoped>
.area-card {
  position: relative;
  width: 180px;
  height: 120px;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  flex-shrink: 0;
}

.area-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.area-card.selected {
  border-color: var(--color-accent-blue);
  box-shadow: 0 0 0 4px rgba(88, 166, 255, 0.2);
}

.area-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--color-accent-blue);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  color: white;
  z-index: 2;
  box-shadow: 0 2px 8px rgba(88, 166, 255, 0.2);
}

.area-image {
  width: 100%;
  height: 100%;
  background: var(--color-bg-tertiary);
}

.area-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 32px;
  color: var(--color-text-tertiary);
}

.area-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transform: translateY(-4px);
  transition: all 0.2s ease;
  z-index: 2;
}

.area-card:hover .area-actions {
  opacity: 1;
  transform: translateY(0);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: var(--color-accent-blue);
  transform: scale(1.1);
}

.action-btn.delete:hover {
  background: #ef4444;
}

.drag-handle {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 16px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  border-radius: 4px;
  color: white;
  font-size: 16px;
  cursor: grab;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 3;
}

.area-card:hover .drag-handle {
  opacity: 1;
}

.area-card[draggable="true"]:active {
  cursor: grabbing;
  opacity: 0.7;
  transform: scale(1.02);
}

.selected-indicator {
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 24px;
  color: var(--color-accent-blue);
  z-index: 2;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}
</style>
