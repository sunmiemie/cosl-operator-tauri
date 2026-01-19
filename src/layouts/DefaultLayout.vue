<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppAside from '@/components/layout/AppAside.vue'
import AppFooter from '@/components/layout/AppFooter.vue'
import { useAuth } from '@/composables/useAuth'
import { useTheme } from '@/composables/useTheme'
import { useLayout } from '@/composables/useLayout'

const router = useRouter()
const { initAuth, isLoggedIn } = useAuth()
const { initTheme } = useTheme()
const { isAsideVisible, exitEditMode } = useLayout()

// 初始化
onMounted(async () => {
  // 初始化主题
  await initTheme()

  // 初始化认证状态
  const authenticated = await initAuth()
  
  // 如果未登录，重定向到登录页
  if (!authenticated || !isLoggedIn.value) {
    router.replace('/login')
  }
})

// 确保离开页面时退出编辑模式
onUnmounted(() => {
  exitEditMode()
})
</script>

<template>
  <div class="app-layout">
    <!-- 顶部标题栏 -->
    <AppHeader />

    <!-- 主体区域 -->
    <div class="layout-body">
      <!-- 侧边栏 - 编辑模式下隐藏 -->
      <Transition name="aside-slide">
        <AppAside v-if="isAsideVisible" />
      </Transition>

      <!-- 主内容区域 -->
      <main class="layout-main">
        <div class="main-content">
          <!-- 页面内容插槽 -->
          <router-view v-slot="{ Component, route }">
            <transition name="fade-slide" mode="out-in">
              <!-- 使用 route.fullPath 作为 key，确保路由变化时重新创建组件 -->
              <component :is="Component" :key="route.fullPath" />
            </transition>
          </router-view>
        </div>
      </main>
    </div>

    <!-- 底部状态栏 -->
    <AppFooter />
  </div>
</template>

<style scoped>
.app-layout {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-primary);
}

.layout-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.layout-main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 页面过渡动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s ease-out;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 侧边栏过渡动画 */
.aside-slide-enter-active,
.aside-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.aside-slide-enter-from {
  opacity: 0;
  transform: translateX(-100%);
}

.aside-slide-leave-to {
  opacity: 0;
  transform: translateX(-100%);
}

/* 自定义滚动条 */
.main-content::-webkit-scrollbar {
  width: 8px;
}

.main-content::-webkit-scrollbar-track {
  background: transparent;
}

.main-content::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 4px;
}

.main-content::-webkit-scrollbar-thumb:hover {
  background: var(--color-scrollbar-hover);
}
</style>
