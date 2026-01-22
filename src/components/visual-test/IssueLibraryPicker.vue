<script setup lang="ts">
/**
 * IssueLibraryPicker - 缺陷/疑问库选择弹窗
 *
 * 功能：
 * - 左侧显示目录树
 * - 右侧显示条目列表
 * - 点击条目后选中并返回
 */
import { ref, computed, watch, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import {
  useIssueLibrary,
  type IssueLibraryType,
  type DirectoryTreeNode,
  type IssueItem,
} from '@/composables/useIssueLibrary'

// ==================== Props & Emits ====================

const props = withDefaults(
  defineProps<{
    visible: boolean
    type: IssueLibraryType // 'defect' | 'question'
  }>(),
  {
    visible: false,
    type: 'defect',
  }
)

const emit = defineEmits<{
  'update:visible': [value: boolean]
  select: [item: IssueItem]
}>()

// ==================== Composables ====================

const issueLib = useIssueLibrary()

// ==================== 状态 ====================

// 当前选中的目录 ID
const selectedDirId = ref<number | null>(null)
// 展开的一级目录 ID 集合
const expandedDirs = ref<Set<number>>(new Set())

// ==================== 计算属性 ====================

const title = computed(() => (props.type === 'defect' ? '缺陷库' : '疑问库'))

const treeData = computed(() =>
  props.type === 'defect' ? issueLib.defectTree.value : issueLib.questionTree.value
)

// ==================== 方法 ====================

/** 加载目录树 */
async function loadTree() {
  await issueLib.fetchDirectoryTree(props.type)
}

/** 切换一级目录展开状态 */
function toggleExpand(dirId: number) {
  if (expandedDirs.value.has(dirId)) {
    expandedDirs.value.delete(dirId)
  } else {
    expandedDirs.value.add(dirId)
  }
}

/** 选中二级目录，加载条目 */
async function selectDirectory(dir: { id: number }) {
  selectedDirId.value = dir.id
  await issueLib.fetchItems(props.type, dir.id)
}

/** 选中条目 */
function selectItem(item: IssueItem) {
  emit('select', item)
  close()
}

/** 关闭弹窗 */
function close() {
  emit('update:visible', false)
}

// ==================== 生命周期 ====================

// 弹窗打开时加载数据
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      loadTree()
      // 重置状态
      selectedDirId.value = null
      issueLib.currentItems.value = []
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="picker-overlay" @click.self="close">
        <div class="picker-card">
          <!-- 头部 -->
          <div class="picker-header">
            <div class="header-title">
              <Icon :icon="type === 'defect' ? 'mdi:bug' : 'mdi:help-circle'" class="title-icon" />
              <span>{{ title }}</span>
            </div>
            <button class="close-btn" @click="close">
              <Icon icon="mdi:close" />
            </button>
          </div>

          <!-- 主体内容 -->
          <div class="picker-body">
            <!-- 左侧目录树 -->
            <div class="tree-panel">
              <div class="panel-title">
                <Icon icon="mdi:folder-tree" />
                <span>目录</span>
              </div>

              <!-- 加载中 -->
              <div v-if="issueLib.isTreeLoading.value" class="loading-state">
                <Icon icon="mdi:loading" class="spin" />
                <span>加载中...</span>
              </div>

              <!-- 目录树 -->
              <div v-else class="tree-content">
                <template v-if="treeData.length > 0">
                  <div v-for="firstDir in treeData" :key="firstDir.id" class="tree-node">
                    <!-- 一级目录 -->
                    <div
                      class="node-header first-level"
                      @click="toggleExpand(firstDir.id)"
                    >
                      <Icon
                        :icon="expandedDirs.has(firstDir.id) ? 'mdi:chevron-down' : 'mdi:chevron-right'"
                        class="expand-icon"
                      />
                      <Icon icon="mdi:folder" class="folder-icon" />
                      <span class="node-label">{{ firstDir.label }}</span>
                    </div>

                    <!-- 二级目录列表 -->
                    <Transition name="expand">
                      <div
                        v-if="expandedDirs.has(firstDir.id) && firstDir.children?.length"
                        class="children-list"
                      >
                        <div
                          v-for="secondDir in firstDir.children"
                          :key="secondDir.id"
                          class="node-header second-level"
                          :class="{ active: selectedDirId === secondDir.id }"
                          @click="selectDirectory(secondDir)"
                        >
                          <Icon icon="mdi:folder-open-outline" class="folder-icon" />
                          <span class="node-label">{{ secondDir.label }}</span>
                        </div>
                      </div>
                    </Transition>
                  </div>
                </template>
                <div v-else class="empty-tree">
                  <Icon icon="mdi:folder-off-outline" />
                  <span>暂无目录</span>
                </div>
              </div>
            </div>

            <!-- 右侧条目列表 -->
            <div class="items-panel">
              <div class="panel-title">
                <Icon icon="mdi:format-list-bulleted" />
                <span>条目</span>
                <span v-if="issueLib.currentItems.value.length > 0" class="item-count">
                  {{ issueLib.currentItems.value.length }} 条
                </span>
              </div>

              <!-- 加载中 -->
              <div v-if="issueLib.isItemsLoading.value" class="loading-state">
                <Icon icon="mdi:loading" class="spin" />
                <span>加载中...</span>
              </div>

              <!-- 条目列表 -->
              <div v-else class="items-content">
                <template v-if="issueLib.currentItems.value.length > 0">
                  <div
                    v-for="item in issueLib.currentItems.value"
                    :key="item.id"
                    class="item-row"
                    @click="selectItem(item)"
                  >
                    <Icon icon="mdi:tag-outline" class="item-icon" />
                    <span class="item-name">{{ item.name }}</span>
                    <Icon icon="mdi:chevron-right" class="item-arrow" />
                  </div>
                </template>
                <div v-else class="empty-items">
                  <Icon icon="mdi:file-document-outline" />
                  <span>{{ selectedDirId ? '该目录暂无条目' : '请先选择目录' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 遮罩层 */
.picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

/* 弹窗卡片 */
.picker-card {
  display: flex;
  flex-direction: column;
  width: 680px;
  max-width: 90vw;
  height: 500px;
  max-height: 80vh;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

/* 头部 */
.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
}

.title-icon {
  font-size: 1.25rem;
  color: rgb(96, 165, 250);
}

.close-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 1.25rem;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

/* 主体 */
.picker-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* 左侧目录面板 */
.tree-panel {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
}

.item-count {
  margin-left: auto;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  background: var(--color-bg-tertiary);
  border-radius: 0.5rem;
}

.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

/* 树节点 */
.tree-node {
  margin-bottom: 0.25rem;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.node-header:hover {
  background: var(--color-bg-hover);
}

.node-header.active {
  background: rgba(96, 165, 250, 0.15);
  color: rgb(96, 165, 250);
}

.first-level {
  font-weight: 500;
}

.second-level {
  padding-left: 1.5rem;
  font-size: 0.875rem;
}

.expand-icon {
  font-size: 1rem;
  color: var(--color-text-secondary);
  transition: transform 0.2s;
}

.folder-icon {
  font-size: 1rem;
  color: rgb(251, 191, 36);
}

.node-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.children-list {
  overflow: hidden;
}

/* 右侧条目面板 */
.items-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.items-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

/* 条目行 */
.item-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  margin-bottom: 0.25rem;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.item-row:hover {
  background: var(--color-bg-hover);
}

.item-row:hover .item-arrow {
  opacity: 1;
  transform: translateX(0);
}

.item-icon {
  font-size: 1rem;
  color: var(--color-text-secondary);
}

.item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-arrow {
  font-size: 1rem;
  color: var(--color-text-secondary);
  opacity: 0;
  transform: translateX(-0.25rem);
  transition: all 0.2s;
}

/* 加载和空状态 */
.loading-state,
.empty-tree,
.empty-items {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.loading-state svg,
.empty-tree svg,
.empty-items svg {
  font-size: 2rem;
  opacity: 0.5;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 展开/收起动画 */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  transform-origin: top;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 500px;
}

/* 弹窗动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-active .picker-card {
  animation: slideUp 0.2s ease;
}

.fade-leave-active .picker-card {
  animation: slideDown 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.96);
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

/* 滚动条 */
.tree-content::-webkit-scrollbar,
.items-content::-webkit-scrollbar {
  width: 5px;
}

.tree-content::-webkit-scrollbar-track,
.items-content::-webkit-scrollbar-track {
  background: transparent;
}

.tree-content::-webkit-scrollbar-thumb,
.items-content::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 2.5px;
}

.tree-content::-webkit-scrollbar-thumb:hover,
.items-content::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-secondary);
}
</style>
