<script setup lang="ts">
/**
 * 扫描显示组件
 * 显示当前扫描的序列号/二维码
 */
import { ref, watch } from 'vue'
import { Icon } from '@iconify/vue'

// Props
const props = withDefaults(defineProps<{
  value: string
  isScanning?: boolean
  hint?: string
  title?: string
}>(), {
  isScanning: false,
  hint: '等待扫描...',
  title: '电路板扫描'
})

// 动画状态
const animating = ref(false)

// 监听值变化触发动画
watch(() => props.value, (newVal, oldVal) => {
  if (newVal && newVal !== oldVal) {
    animating.value = true
    setTimeout(() => {
      animating.value = false
    }, 300)
  }
})
</script>

<template>
  <div class="card">
    <div class="card-header">
      <Icon 
        icon="mdi:qrcode-scan" 
        :class="{ 'animate-pulse text-blue-400': isScanning }"
      />
      <span>{{ title }}</span>
    </div>
    <div class="card-body text-center py-8">
      <div 
        v-if="value" 
        class="scan-value"
        :class="{ 'scale-110': animating }"
      >
        {{ value }}
      </div>
      <div v-else class="empty-hint">
        <Icon icon="mdi:barcode-scan" class="text-4xl mb-2 opacity-30" />
        <p>{{ hint }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.875rem;
  font-weight: 500;
}

.card-body {
  padding: 1rem;
}

.scan-value {
  font-size: 1.5rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  transition: transform 0.15s ease;
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
}
</style>
