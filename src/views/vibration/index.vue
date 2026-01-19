<script setup lang="ts">
import { Icon } from '@iconify/vue'
</script>

<template>
  <div class="vibration-page">
    <div class="page-header">
      <h1 class="page-title">
        <Icon icon="mdi:vibrate" class="page-icon" />
        振动台
      </h1>
      <p class="page-desc">振动测试系统</p>
    </div>
    
    <div class="placeholder-content">
      <Icon icon="mdi:vibrate" class="placeholder-icon" />
      <p>振动台功能开发中...</p>
    </div>
  </div>
</template>

<style scoped>
.vibration-page {
  color: var(--color-text-primary);
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
}

.page-icon {
  font-size: 28px;
  color: var(--color-accent-purple);
}

.page-desc {
  margin: 0;
  color: var(--color-text-secondary);
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px;
  background: var(--color-card-bg);
  border: 1px dashed var(--color-border);
  border-radius: 16px;
  color: var(--color-text-secondary);
}

.placeholder-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.3;
}
</style>
