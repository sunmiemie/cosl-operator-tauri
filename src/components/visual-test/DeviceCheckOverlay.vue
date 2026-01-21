<script setup lang="ts">
/**
 * 设备检测遮罩层组件
 * 半透明羽化效果，可隐约看到背后界面
 */
import { computed } from 'vue'
import { Icon } from '@iconify/vue'

// Props
const props = withDefaults(defineProps<{
  visible: boolean
  status: 'checking' | 'success' | 'error'
  scannerOk: boolean
  cameraOk: boolean
  errorMsg?: string
  accentColor?: 'green' | 'orange'
}>(), {
  accentColor: 'green'
})

// Emits
const emit = defineEmits<{
  enter: []
  recheck: []
  skip: []
}>()

// 计算属性
const allDevicesOk = computed(() => props.scannerOk && props.cameraOk)

const checkComplete = computed(() => 
  props.status === 'success' || props.status === 'error'
)

const statusText = computed(() => {
  if (props.status === 'checking') return '设备检测中...'
  if (props.status === 'success') return '设备就绪'
  return '检测异常'
})

// 主题色相关
const accentClass = computed(() => {
  return props.accentColor === 'orange' ? 'accent-orange' : 'accent-green'
})
</script>

<template>
  <Transition name="fade">
    <div v-if="visible" :class="['device-overlay', accentClass]">
      <!-- 内容卡片 - 玻璃拟态效果 -->
      <div class="content-card">
        <!-- 装饰光晕 -->
        <div class="glow-effect"></div>
        
        <!-- 检测动画区域 -->
        <div class="check-animation">
          <!-- 外圈脉冲 -->
          <div v-if="status === 'checking'" class="pulse-ring"></div>
          
          <!-- 主圆环 -->
          <div class="main-ring">
            <!-- 背景圆 -->
            <svg class="ring-svg" viewBox="0 0 100 100">
              <circle 
                cx="50" cy="50" r="42"
                fill="none" 
                stroke="currentColor" 
                stroke-width="2"
                class="ring-bg"
              />
              <!-- 进度圆 (检测中旋转) -->
              <circle 
                v-if="status === 'checking'"
                cx="50" cy="50" r="42"
                fill="none" 
                stroke="currentColor" 
                stroke-width="3"
                stroke-linecap="round"
                class="ring-progress"
                stroke-dasharray="66 198"
              />
              <!-- 完成圆 -->
              <circle 
                v-else
                cx="50" cy="50" r="42"
                fill="none" 
                stroke="currentColor" 
                stroke-width="3"
                class="ring-complete"
                :class="status === 'success' ? 'ring-success' : 'ring-error'"
              />
            </svg>
            
            <!-- 中心图标 -->
            <div class="center-icon">
              <Icon 
                v-if="status === 'success'" 
                icon="mdi:check" 
                class="icon-success" 
              />
              <Icon 
                v-else-if="status === 'error'" 
                icon="mdi:alert" 
                class="icon-error" 
              />
              <div v-else class="scanning-dots">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 状态文字 -->
        <div class="status-text">{{ statusText }}</div>
        
        <!-- 设备状态列表 -->
        <div v-if="checkComplete" class="device-list">
          <div class="device-item" :class="{ 'is-ok': scannerOk }">
            <Icon :icon="scannerOk ? 'mdi:check-circle' : 'mdi:close-circle'" />
            <span>扫码枪</span>
          </div>
          <div class="device-item" :class="{ 'is-ok': cameraOk }">
            <Icon :icon="cameraOk ? 'mdi:check-circle' : 'mdi:close-circle'" />
            <span>摄像头</span>
          </div>
        </div>
        
        <!-- 错误信息 -->
        <div v-if="errorMsg" class="error-msg">
          <Icon icon="mdi:information-outline" />
          {{ errorMsg }}
        </div>
        
        <!-- 操作按钮 -->
        <div class="action-buttons">
          <button 
            v-if="allDevicesOk" 
            @click="emit('enter')"
            class="btn-primary"
          >
            <Icon icon="mdi:arrow-right" />
            进入测试
          </button>
          <template v-if="status === 'error'">
            <button @click="emit('recheck')" class="btn-secondary">
              <Icon icon="mdi:refresh" />
              重新检测
            </button>
            <button @click="emit('skip')" class="btn-ghost">
              跳过
            </button>
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 遮罩层 - 半透明羽化效果 */
.device-overlay {
  position: absolute;
  top: -24px;
  left: -24px;
  right: -24px;
  bottom: -24px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 降低不透明度，增加模糊，让背后内容隐约可见 */
  background: rgba(15, 15, 20, 0.20);
  backdrop-filter: blur(8px) saturate(120%);
}

/* 内容卡片 - 玻璃拟态 */
.content-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2.5rem 3rem;
  border-radius: 1.5rem;
  background: rgba(30, 30, 40, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
}

/* 装饰光晕 */
.glow-effect {
  position: absolute;
  top: -50%;
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  height: 200px;
  border-radius: 50%;
  opacity: 0.15;
  filter: blur(60px);
  pointer-events: none;
}

.accent-green .glow-effect {
  background: rgb(34, 197, 94);
}

.accent-orange .glow-effect {
  background: rgb(249, 115, 22);
}

/* 检测动画区域 */
.check-animation {
  position: relative;
  width: 120px;
  height: 120px;
  margin-bottom: 1.5rem;
}

/* 外圈脉冲 */
.pulse-ring {
  position: absolute;
  inset: -10px;
  border-radius: 50%;
  border: 2px solid currentColor;
  opacity: 0;
  animation: pulse 2s ease-out infinite;
}

.accent-green .pulse-ring {
  border-color: rgb(34, 197, 94);
}

.accent-orange .pulse-ring {
  border-color: rgb(249, 115, 22);
}

@keyframes pulse {
  0% {
    transform: scale(0.9);
    opacity: 0.5;
  }
  100% {
    transform: scale(1.3);
    opacity: 0;
  }
}

/* 主圆环 */
.main-ring {
  position: relative;
  width: 100%;
  height: 100%;
}

.ring-svg {
  width: 100%;
  height: 100%;
}

.ring-bg {
  color: rgba(255, 255, 255, 0.1);
}

.ring-progress {
  transform-origin: center;
  animation: rotate 1.2s linear infinite;
}

.accent-green .ring-progress {
  color: rgb(34, 197, 94);
}

.accent-orange .ring-progress {
  color: rgb(249, 115, 22);
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.ring-complete {
  stroke-dasharray: 264;
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 0.5s ease;
}

.ring-success {
  color: rgb(34, 197, 94);
}

.ring-error {
  color: rgb(239, 68, 68);
}

/* 中心图标 */
.center-icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
}

.icon-success {
  color: rgb(74, 222, 128);
  animation: scaleIn 0.3s ease;
}

.icon-error {
  color: rgb(248, 113, 113);
  animation: scaleIn 0.3s ease;
}

@keyframes scaleIn {
  from { transform: scale(0); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* 扫描点动画 */
.scanning-dots {
  display: flex;
  gap: 6px;
}

.scanning-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: bounce 1.4s ease-in-out infinite;
}

.accent-green .scanning-dots span {
  background: rgb(74, 222, 128);
}

.accent-orange .scanning-dots span {
  background: rgb(251, 146, 60);
}

.scanning-dots span:nth-child(1) { animation-delay: 0s; }
.scanning-dots span:nth-child(2) { animation-delay: 0.2s; }
.scanning-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

/* 状态文字 */
.status-text {
  font-size: 1.125rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 1rem;
  letter-spacing: 0.025em;
}

/* 设备状态列表 */
.device-list {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1rem;
}

.device-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 2rem;
  font-size: 0.875rem;
  background: rgba(255, 255, 255, 0.05);
  color: rgb(248, 113, 113);
  transition: all 0.2s;
}

.device-item.is-ok {
  color: rgb(74, 222, 128);
}

/* 错误信息 */
.error-msg {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  background: rgba(239, 68, 68, 0.1);
  color: rgb(248, 113, 113);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

/* 操作按钮 */
.action-buttons {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 0.75rem;
  font-weight: 500;
  color: white;
  transition: all 0.2s;
}

.btn-primary:hover {
  transform: translateY(-1px);
}

.accent-green .btn-primary {
  background: linear-gradient(135deg, rgb(34, 197, 94), rgb(22, 163, 74));
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
}

.accent-green .btn-primary:hover {
  box-shadow: 0 6px 20px rgba(34, 197, 94, 0.4);
}

.accent-orange .btn-primary {
  background: linear-gradient(135deg, rgb(249, 115, 22), rgb(234, 88, 12));
  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
}

.accent-orange .btn-primary:hover {
  box-shadow: 0 6px 20px rgba(249, 115, 22, 0.4);
}

.btn-secondary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.05);
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.25);
}

.btn-ghost {
  padding: 0.625rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.5);
  transition: all 0.2s;
}

.btn-ghost:hover {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.05);
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-active .content-card {
  animation: slideUp 0.3s ease;
}

.fade-leave-active .content-card {
  animation: slideDown 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes slideDown {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
}

/* ==================== 亮色主题适配 ==================== */
:global(html.light) .device-overlay {
  background: rgba(255, 255, 255, 0.6);
}

:global(html.light) .content-card {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid var(--color-border);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

:global(html.light) .ring-bg {
  color: rgba(0, 0, 0, 0.1);
}

:global(html.light) .status-text {
  color: var(--color-text-primary);
}

:global(html.light) .device-item {
  background: rgba(0, 0, 0, 0.05);
  color: var(--color-accent-red);
}

:global(html.light) .device-item.is-ok {
  color: var(--color-accent-green);
}

:global(html.light) .error-msg {
  background: rgba(239, 68, 68, 0.08);
  color: var(--color-accent-red);
  border-color: rgba(239, 68, 68, 0.15);
}

:global(html.light) .btn-secondary {
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
}

:global(html.light) .btn-secondary:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-accent-blue);
}

:global(html.light) .btn-ghost {
  color: var(--color-text-secondary);
}

:global(html.light) .btn-ghost:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-hover);
}
</style>
