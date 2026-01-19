import { ref, computed, readonly } from 'vue'

// 全局状态 - 在模块级别定义以实现跨组件共享
const isEditMode = ref(false)

/**
 * 布局状态管理 composable
 * 用于控制编辑模式下隐藏侧边栏等布局行为
 */
export function useLayout() {
  // 侧边栏是否可见（编辑模式下隐藏）
  const isAsideVisible = computed(() => !isEditMode.value)

  /**
   * 设置编辑模式
   * @param editing - 是否进入编辑模式
   */
  function setEditMode(editing: boolean) {
    isEditMode.value = editing
  }

  /**
   * 进入编辑模式
   */
  function enterEditMode() {
    isEditMode.value = true
  }

  /**
   * 退出编辑模式
   */
  function exitEditMode() {
    isEditMode.value = false
  }

  /**
   * 切换编辑模式
   */
  function toggleEditMode() {
    isEditMode.value = !isEditMode.value
  }

  return {
    // 只读状态
    isEditMode: readonly(isEditMode),
    isAsideVisible,
    // 方法
    setEditMode,
    enterEditMode,
    exitEditMode,
    toggleEditMode,
  }
}
