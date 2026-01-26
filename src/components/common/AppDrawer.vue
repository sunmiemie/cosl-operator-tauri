<script setup lang="ts">
/**
 * 自定义抽屉组件
 * 替代 Element Plus 的 ElDrawer，适配暗黑模式
 * 
 * 注意：抽屉不会遮挡 header(36px) 和 footer(28px)
 */
import { computed, watch, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'

// 布局常量（与 AppHeader/AppFooter 保持一致）
const HEADER_HEIGHT = 36
const FOOTER_HEIGHT = 28

interface Props {
  modelValue: boolean
  title?: string
  direction?: 'ltr' | 'rtl' | 'ttb' | 'btt'
  size?: string | number
  showClose?: boolean
  modal?: boolean
  closeOnClickModal?: boolean
  closeOnPressEscape?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  direction: 'rtl',
  size: '400px',
  showClose: true,
  modal: true,
  closeOnClickModal: true,
  closeOnPressEscape: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  open: []
  close: []
}>()

// 计算抽屉尺寸样式
const drawerStyle = computed(() => {
  const sizeValue = typeof props.size === 'number' ? `${props.size}px` : props.size
  
  if (props.direction === 'ltr' || props.direction === 'rtl') {
    return { width: sizeValue }
  }
  return { height: sizeValue }
})

// 计算抽屉位置类
const positionClass = computed(() => `drawer-${props.direction}`)

// 关闭抽屉
function handleClose() {
  emit('update:modelValue', false)
  emit('close')
}

// 点击遮罩层
function handleOverlayClick() {
  if (props.closeOnClickModal) {
    handleClose()
  }
}

// 键盘事件处理
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.closeOnPressEscape && props.modelValue) {
    handleClose()
  }
}

// 监听打开/关闭
watch(() => props.modelValue, (val) => {
  if (val) {
    emit('open')
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer-fade">
      <div v-if="modelValue" class="drawer-overlay" @click.self="handleOverlayClick">
        <Transition :name="`drawer-slide-${direction}`">
          <div
            v-if="modelValue"
            class="drawer-container"
            :class="positionClass"
            :style="drawerStyle"
          >
            <!-- 头部 -->
            <div class="drawer-header">
              <span class="drawer-title">{{ title }}</span>
              <button v-if="showClose" class="drawer-close" @click="handleClose">
                <Icon icon="mdi:close" />
              </button>
            </div>
            
            <!-- 内容 -->
            <div class="drawer-body">
              <slot />
            </div>
            
            <!-- 底部插槽 -->
            <div v-if="$slots.footer" class="drawer-footer">
              <slot name="footer" />
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 遮罩层 - 避免遮挡 header(36px) 和 footer(28px) */
.drawer-overlay {
  position: fixed;
  top: 36px;
  left: 0;
  right: 0;
  bottom: 28px;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
}

/* 根据方向调整 flex 布局 */
.drawer-overlay:has(.drawer-rtl) {
  justify-content: flex-end;
}

.drawer-overlay:has(.drawer-ltr) {
  justify-content: flex-start;
}

/* 抽屉容器 */
.drawer-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  border-left: 1px solid var(--color-border);
}

.drawer-ltr {
  border-left: none;
  border-right: 1px solid var(--color-border);
}

/* 水平方向抽屉不需要额外定位 */
.drawer-rtl,
.drawer-ltr {
  max-width: 90vw;
}

/* 垂直方向抽屉 */
.drawer-ttb {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: auto;
  max-height: 80%;
  border-left: none;
  border-bottom: 1px solid var(--color-border);
}

.drawer-btt {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: auto;
  max-height: 80%;
  border-left: none;
  border-top: 1px solid var(--color-border);
}

/* 头部 */
.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.drawer-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.drawer-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.drawer-close:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

/* 内容区域 */
.drawer-body {
  flex: 1;
  padding: 16px 24px;
  overflow-y: auto;
}

/* 底部 */
.drawer-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

/* 遮罩层动画 */
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.3s ease;
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

/* 从右侧滑入 */
.drawer-slide-rtl-enter-active,
.drawer-slide-rtl-leave-active {
  transition: transform 0.3s ease;
}

.drawer-slide-rtl-enter-from,
.drawer-slide-rtl-leave-to {
  transform: translateX(100%);
}

/* 从左侧滑入 */
.drawer-slide-ltr-enter-active,
.drawer-slide-ltr-leave-active {
  transition: transform 0.3s ease;
}

.drawer-slide-ltr-enter-from,
.drawer-slide-ltr-leave-to {
  transform: translateX(-100%);
}

/* 从顶部滑入 */
.drawer-slide-ttb-enter-active,
.drawer-slide-ttb-leave-active {
  transition: transform 0.3s ease;
}

.drawer-slide-ttb-enter-from,
.drawer-slide-ttb-leave-to {
  transform: translateY(-100%);
}

/* 从底部滑入 */
.drawer-slide-btt-enter-active,
.drawer-slide-btt-leave-active {
  transition: transform 0.3s ease;
}

.drawer-slide-btt-enter-from,
.drawer-slide-btt-leave-to {
  transform: translateY(100%);
}
</style>
