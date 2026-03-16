<script setup lang="ts">
import { Icon } from '@iconify/vue'
import HighTempBoxDashboard from './components/HighTempBoxDashboard.vue'
import HighTempBoxTestFlow from './components/HighTempBoxTestFlow.vue'
import { useHighTempBox } from './composables/useHighTempBox'

const ctx = useHighTempBox()
const { currentView } = ctx
</script>

<template>
  <div class="high-temp-box-page">
    <div class="page-header">
      <div class="header-left">
        <div class="header-icon">
          <Icon icon="mdi:thermometer-high" />
        </div>
        <div>
          <h1 class="header-title">高温箱</h1>
          <p class="header-subtitle">高温测试箱系统</p>
        </div>
      </div>
      <div class="header-right"></div>
    </div>
    <HighTempBoxDashboard v-if="currentView === 'dashboard'" :ctx="ctx" />
    <HighTempBoxTestFlow v-else :ctx="ctx" />

  </div>
</template>

<style scoped>
.high-temp-box-page {
  height: 100%;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  overflow: hidden;
  /* padding: 16px; */
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 页面头部 */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.page-header .header-icon {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.625rem;
  font-size: 1.25rem;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.15));
  color:  var(--color-accent-red);
}

.header-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0;
}

.header-subtitle {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  margin-top: 0.125rem;
  margin-bottom: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
</style>