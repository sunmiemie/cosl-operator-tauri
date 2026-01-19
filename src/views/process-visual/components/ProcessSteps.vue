<script setup lang="ts">
import { Icon } from '@iconify/vue'

interface Props {
  active: number
  type: 'eyes' | 'xray'
}

defineProps<Props>()

// 定义事件
const emit = defineEmits(['exit'])

// 退出处理函数
function handleExitClick() {
  console.log('ProcessSteps: 退出按钮被点击，准备发送 exit 事件')
  emit('exit')
  console.log('ProcessSteps: exit 事件已发送')
}

// 目检测试步骤
const eyesSteps = [
  { title: '正面流程', icon: 'mdi:eye-outline' },
  { title: '背面流程', icon: 'mdi:rotate-3d-variant' },
  { title: '导出流程', icon: 'mdi:upload-outline' }
]

// X-Ray测试步骤
const xraySteps = [
  { title: '整体流程', icon: 'mdi:eye-outline' },
  { title: '分区流程', icon: 'mdi:grid' },
  { title: '导出流程', icon: 'mdi:upload-outline' }
]
</script>

<template>
  <div class="process-steps">
    <!-- 退出按钮 -->
    <button class="exit-btn" @click="handleExitClick" title="退出编辑">
      <Icon icon="mdi:logout" />
    </button>

    <!-- 步骤指示器 -->
    <div class="steps-container">
      <template v-for="(step, index) in (type === 'eyes' ? eyesSteps : xraySteps)" :key="index">
        <!-- 步骤项 -->
        <div 
          class="step-item" 
          :class="{
            'active': index === active,
            'completed': index < active
          }"
        >
          <div class="step-icon">
            <Icon v-if="index < active" icon="mdi:check" class="check-icon" />
            <Icon v-else :icon="step.icon" />
          </div>
          <span class="step-title">{{ step.title }}</span>
        </div>

        <!-- 连接线 -->
        <div 
          v-if="index < (type === 'eyes' ? eyesSteps : xraySteps).length - 1" 
          class="step-connector"
          :class="{ 'completed': index < active }"
        />
      </template>
    </div>

    <!-- 占位 -->
    <div class="placeholder" />
  </div>
</template>

<style scoped>
.process-steps {
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--color-bg-secondary);
  border-radius: 12px;
  margin-bottom: 20px;
}

.exit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: none;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 20px;
}

.exit-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  transform: translateX(-2px);
}

.steps-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  border-radius: 10px;
  background: var(--color-bg-tertiary);
  transition: all 0.3s ease;
}

.step-item.active {
  background: var(--color-accent-blue);
  box-shadow: 0 4px 15px rgba(88, 166, 255, 0.2);
}

.step-item.completed {
  background: rgba(34, 197, 94, 0.15);
}

.step-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  font-size: 18px;
  transition: all 0.3s ease;
}

.step-item.active .step-icon {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.step-item.completed .step-icon {
  background: #22c55e;
  color: white;
}

.check-icon {
  font-size: 16px;
}

.step-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  transition: all 0.3s ease;
}

.step-item.active .step-title {
  color: white;
}

.step-item.completed .step-title {
  color: #22c55e;
}

.step-connector {
  width: 40px;
  height: 3px;
  background: var(--color-border);
  border-radius: 2px;
  transition: all 0.3s ease;
}

.step-connector.completed {
  background: #22c55e;
}

.placeholder {
  width: 40px;
}
</style>
