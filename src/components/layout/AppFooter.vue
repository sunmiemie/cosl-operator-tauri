<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useConnection } from '@/composables/useConnection'

const { connectionStatus, startChecking, getStatusText, checkConnection } = useConnection()

// 当前时间
const currentTime = ref('')

// 状态文本
const statusText = computed(() => getStatusText())

// 状态颜色类
const statusClass = computed(() => {
  switch (connectionStatus.value) {
    case 'online':
      return 'online'
    case 'offline':
      return 'offline'
    case 'checking':
      return 'checking'
    default:
      return 'offline'
  }
})

// 更新时间
function updateTime() {
  const now = new Date()
  currentTime.value = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 手动刷新连接状态
async function refreshConnection() {
  await checkConnection()
}

onMounted(() => {
  updateTime()
  setInterval(updateTime, 1000)
  
  // 启动连接状态检测
  startChecking()
})
</script>

<template>
  <footer class="app-footer">
    <!-- 左侧状态信息 -->
    <div class="footer-left">
      <div 
        class="status-indicator" 
        :class="statusClass"
        @click="refreshConnection"
        title="点击刷新连接状态"
      >
        <span class="status-dot" :class="statusClass">
          <Icon v-if="connectionStatus === 'checking'" icon="mdi:loading" class="spin" />
        </span>
        <span class="status-text">{{ statusText }}</span>
      </div>
      <span class="footer-divider">|</span>
      <span class="footer-info">
        <Icon icon="mdi:tag-outline" class="footer-icon" />
        版本 0.1.0
      </span>
    </div>

    <!-- 右侧信息 -->
    <div class="footer-right">
      <span class="footer-time">
        <Icon icon="mdi:clock-outline" class="footer-icon" />
        {{ currentTime }}
      </span>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  height: 28px;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
  user-select: none;
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 状态指示器 */
.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.2s ease;
}

.status-indicator:hover {
  background: var(--color-bg-hover);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.status-dot.online {
  background: var(--color-accent-green);
  box-shadow: 0 0 8px var(--color-accent-green);
  animation: pulse 2s ease-in-out infinite;
}

.status-dot.offline {
  background: var(--color-accent-red);
  box-shadow: 0 0 8px var(--color-accent-red);
}

.status-dot.checking {
  background: var(--color-accent-orange);
  width: 14px;
  height: 14px;
  font-size: 10px;
}

.status-dot.checking .spin {
  color: white;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.status-text {
  font-weight: 500;
  transition: color 0.3s ease;
}

.status-indicator.online .status-text {
  color: var(--color-accent-green);
}

.status-indicator.offline .status-text {
  color: var(--color-accent-red);
}

.status-indicator.checking .status-text {
  color: var(--color-accent-orange);
}

.footer-divider {
  color: var(--color-border);
}

.footer-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
}

.footer-icon {
  font-size: 14px;
}

.footer-time {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  color: var(--color-text-primary);
  padding: 2px 8px;
  border-radius: 4px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
