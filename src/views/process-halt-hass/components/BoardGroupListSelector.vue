<script setup lang="ts">
/**
 * 电路板组列表选择器
 * 支持显示已有电路板组、单选一个组、创建新组
 */
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { BoardGroup } from '../types'

// 定义 props
interface Props {
  boardGroups: BoardGroup[]
  modelValue: BoardGroup | null
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

// 定义 emits
const emit = defineEmits<{
  'update:modelValue': [value: BoardGroup | null]
  'create': []
  'refresh': []
}>()

// 搜索关键词
const searchKeyword = ref('')

// 过滤后的电路板组列表
const filteredBoardGroups = computed(() => {
  if (!searchKeyword.value.trim()) {
    return props.boardGroups
  }
  const keyword = searchKeyword.value.toLowerCase()
  return props.boardGroups.filter(group =>
    group.name.toLowerCase().includes(keyword) ||
    group.description?.toLowerCase().includes(keyword) ||
    group.boards.some(board => board.name.toLowerCase().includes(keyword))
  )
})

// 选择电路板组
function selectGroup(group: BoardGroup) {
  if (props.modelValue?.id === group.id) {
    // 取消选择
    emit('update:modelValue', null)
  } else {
    emit('update:modelValue', group)
  }
}

// 展开的组 ID
const expandedGroupId = ref<number | null>(null)

// 切换展开状态
function toggleExpand(groupId: number, event: Event) {
  event.stopPropagation()
  if (expandedGroupId.value === groupId) {
    expandedGroupId.value = null
  } else {
    expandedGroupId.value = groupId
  }
}
</script>

<template>
  <div class="board-group-selector">
    <!-- 标题栏 -->
    <div class="selector-header">
      <div class="header-title">
        <Icon icon="mdi:view-grid-outline" class="header-icon" />
        <span>选择电路板组</span>
      </div>
      <div class="header-actions">
        <button class="icon-btn" title="刷新" @click="$emit('refresh')">
          <Icon icon="mdi:refresh" :class="{ spinning: loading }" />
        </button>
        <button class="create-btn" @click="$emit('create')">
          <Icon icon="mdi:plus" />
          新建
        </button>
      </div>
    </div>

    <!-- 搜索框 -->
    <div class="search-box">
      <Icon icon="mdi:magnify" class="search-icon" />
      <input
        v-model="searchKeyword"
        type="text"
        placeholder="搜索电路板组..."
      />
      <button
        v-if="searchKeyword"
        class="clear-btn"
        @click="searchKeyword = ''"
      >
        <Icon icon="mdi:close" />
      </button>
    </div>

    <!-- 电路板组列表 -->
    <div class="group-list">
      <template v-if="loading">
        <div class="loading-state">
          <Icon icon="mdi:loading" class="spinning" />
          <span>加载中...</span>
        </div>
      </template>

      <template v-else-if="filteredBoardGroups.length === 0">
        <div class="empty-state">
          <Icon icon="mdi:folder-outline" class="empty-icon" />
          <span v-if="searchKeyword">未找到匹配的电路板组</span>
          <span v-else>暂无电路板组</span>
          <button class="create-link" @click="$emit('create')">
            <Icon icon="mdi:plus" />
            创建新电路板组
          </button>
        </div>
      </template>

      <template v-else>
        <div
          v-for="group in filteredBoardGroups"
          :key="group.id"
          class="group-item"
          :class="{ selected: modelValue?.id === group.id }"
          @click="selectGroup(group)"
        >
          <div class="group-main">
            <div class="group-select">
              <div class="radio-circle">
                <Icon v-if="modelValue?.id === group.id" icon="mdi:check" />
              </div>
            </div>
            <div class="group-info">
              <div class="group-name">{{ group.name }}</div>
              <div v-if="group.description" class="group-desc">
                {{ group.description }}
              </div>
              <div class="group-meta">
                <span class="meta-item">
                  <Icon icon="mdi:chip" />
                  {{ group.boards.length }} 个电路板型号
                </span>
              </div>
            </div>
            <button
              class="expand-btn"
              :class="{ expanded: expandedGroupId === group.id }"
              @click="toggleExpand(group.id, $event)"
            >
              <Icon icon="mdi:chevron-down" />
            </button>
          </div>

          <!-- 展开的电路板列表 -->
          <Transition name="expand">
            <div
              v-if="expandedGroupId === group.id && group.boards.length > 0"
              class="board-list"
            >
              <div
                v-for="board in group.boards"
                :key="board.id"
                class="board-item"
              >
                <Icon icon="mdi:chip" class="board-icon" />
                <span class="board-name">{{ board.name }}</span>
                <span v-if="board.code" class="board-code">{{ board.code }}</span>
              </div>
            </div>
          </Transition>
        </div>
      </template>
    </div>

    <!-- 已选择提示 -->
    <div v-if="modelValue" class="selected-hint">
      <Icon icon="mdi:check-circle" />
      <span>已选择: {{ modelValue.name }}</span>
    </div>
  </div>
</template>

<style scoped>
.board-group-selector {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-secondary, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  overflow: hidden;
}

.selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
}

.header-icon {
  font-size: 20px;
  color: var(--color-primary, #3b82f6);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: var(--color-bg-tertiary, #f1f5f9);
  color: var(--color-text-primary, #1e293b);
}

.create-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: var(--color-primary, #3b82f6);
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.create-btn:hover {
  background: #2563eb;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.search-icon {
  font-size: 18px;
  color: var(--color-text-tertiary, #94a3b8);
}

.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--color-text-primary, #1e293b);
  outline: none;
}

.search-box input::placeholder {
  color: var(--color-text-tertiary, #94a3b8);
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: var(--color-bg-tertiary, #f1f5f9);
  color: var(--color-text-secondary, #64748b);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: var(--color-error, #ef4444);
  color: white;
}

.group-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 20px;
  color: var(--color-text-tertiary, #94a3b8);
}

.empty-icon {
  font-size: 40px;
  opacity: 0.5;
}

.create-link {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  background: transparent;
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: 6px;
  font-size: 13px;
  color: var(--color-primary, #3b82f6);
  cursor: pointer;
  transition: all 0.2s;
}

.create-link:hover {
  background: var(--color-primary-light, #dbeafe);
  border-color: var(--color-primary, #3b82f6);
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.group-item {
  margin-bottom: 8px;
  background: var(--color-bg-primary, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
}

.group-item:hover {
  border-color: var(--color-primary, #3b82f6);
}

.group-item.selected {
  border-color: var(--color-primary, #3b82f6);
  background: rgba(59, 130, 246, 0.05);
}

.group-main {
  display: flex;
  align-items: flex-start;
  padding: 14px;
  gap: 12px;
}

.group-select {
  flex-shrink: 0;
  padding-top: 2px;
}

.radio-circle {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border, #e2e8f0);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.group-item.selected .radio-circle {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary, #3b82f6);
  color: white;
}

.group-info {
  flex: 1;
  min-width: 0;
}

.group-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary, #1e293b);
  margin-bottom: 4px;
}

.group-desc {
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  margin-bottom: 6px;
  line-height: 1.4;
}

.group-meta {
  display: flex;
  gap: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-tertiary, #94a3b8);
}

.expand-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: var(--color-bg-tertiary, #f1f5f9);
  color: var(--color-text-secondary, #64748b);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.expand-btn:hover {
  background: var(--color-bg-secondary, #e2e8f0);
}

.expand-btn.expanded :deep(svg) {
  transform: rotate(180deg);
}

.board-list {
  border-top: 1px solid var(--color-border, #e2e8f0);
  padding: 12px 14px;
  background: var(--color-bg-tertiary, #f8fafc);
}

.board-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-bg-primary, #fff);
  border-radius: 6px;
  margin-bottom: 6px;
}

.board-item:last-child {
  margin-bottom: 0;
}

.board-icon {
  font-size: 16px;
  color: var(--color-primary, #3b82f6);
}

.board-name {
  flex: 1;
  font-size: 13px;
  color: var(--color-text-primary, #1e293b);
}

.board-code {
  font-size: 12px;
  color: var(--color-text-tertiary, #94a3b8);
  font-family: monospace;
}

.selected-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  background: var(--color-success-light, #dcfce7);
  border-top: 1px solid var(--color-success, #22c55e);
  font-size: 13px;
  color: var(--color-success-dark, #166534);
}

.selected-hint :deep(svg) {
  font-size: 18px;
}

/* 展开动画 */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 300px;
}
</style>
