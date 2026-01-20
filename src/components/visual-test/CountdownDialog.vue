<script setup lang="ts">
/**
 * 倒计时对话框组件
 * 测试开始前的倒计时提示
 */
import { ref, watch, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'

// Props
const props = withDefaults(defineProps<{
  visible: boolean
  seconds?: number
  title?: string
  subtitle?: string
  accentColor?: 'green' | 'orange' | 'blue'
}>(), {
  seconds: 3,
  title: '准备开始',
  subtitle: '测试即将开始...',
  accentColor: 'green'
})

// Emits
const emit = defineEmits<{
  'update:visible': [value: boolean]
  start: []
  cancel: []
}>()

// 当前倒计时秒数
const countdown = ref(props.seconds)
let timer: ReturnType<typeof setInterval> | null = null

// 监听 visible 变化
watch(() => props.visible, (val) => {
  if (val) {
    startCountdown()
  } else {
    stopCountdown()
  }
})

// 开始倒计时
function startCountdown() {
  countdown.value = props.seconds
  timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      stopCountdown()
      emit('update:visible', false)
      emit('start')
    }
  }, 1000)
}

// 停止倒计时
function stopCountdown() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

// 取消
function handleCancel() {
  stopCountdown()
  emit('update:visible', false)
  emit('cancel')
}

// 清理
onUnmounted(() => {
  stopCountdown()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="dialog-overlay" @click.self="handleCancel">
        <div :class="['dialog-content', `accent-${accentColor}`]">
          <!-- 圆形倒计时 -->
          <div class="countdown-circle">
            <svg class="w-full h-full" viewBox="0 0 100 100">
              <!-- 背景圆 -->
              <circle 
                cx="50" cy="50" r="45"
                fill="none" 
                stroke="currentColor" 
                stroke-width="4"
                class="text-white/10"
              />
              <!-- 进度圆 -->
              <circle 
                cx="50" cy="50" r="45"
                fill="none" 
                stroke="currentColor" 
                stroke-width="4"
                stroke-linecap="round"
                class="progress-ring"
                :style="{ 
                  strokeDasharray: '283',
                  strokeDashoffset: 283 - (283 * (countdown / seconds))
                }"
              />
            </svg>
            <span class="countdown-number">{{ countdown }}</span>
          </div>
          
          <h3 class="dialog-title">{{ title }}</h3>
          <p class="dialog-subtitle">{{ subtitle }}</p>
          
          <button class="cancel-btn" @click="handleCancel">
            <Icon icon="mdi:close" />
            取消
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.dialog-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  border-radius: 1.5rem;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
}

.countdown-circle {
  position: relative;
  width: 120px;
  height: 120px;
  margin-bottom: 1.5rem;
}

.countdown-number {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  font-weight: 600;
}

.progress-ring {
  transform: rotate(-90deg);
  transform-origin: center;
  transition: stroke-dashoffset 0.3s ease;
}

/* 主题色 */
.accent-green .progress-ring {
  stroke: rgb(34, 197, 94);
}

.accent-green .countdown-number {
  color: rgb(74, 222, 128);
}

.accent-orange .progress-ring {
  stroke: rgb(249, 115, 22);
}

.accent-orange .countdown-number {
  color: rgb(251, 146, 60);
}

.accent-blue .progress-ring {
  stroke: rgb(59, 130, 246);
}

.accent-blue .countdown-number {
  color: rgb(96, 165, 250);
}

.dialog-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.dialog-subtitle {
  color: var(--color-text-secondary);
  margin-bottom: 1.5rem;
}

.cancel-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text);
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
