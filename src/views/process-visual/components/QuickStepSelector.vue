<script setup lang="ts">
import { reactive } from 'vue'
import { Icon } from '@iconify/vue'

// 定义 props (所有 data 相关 props 可选，用于简化模式)
interface Props {
  visible: boolean
  treeData?: any[]
  tableData?: any[]
  treeLoading?: boolean
  tableLoading?: boolean
  selectedId?: number
}

withDefaults(defineProps<Props>(), {
  treeData: () => [],
  tableData: () => [],
  treeLoading: false,
  tableLoading: false
})

// 定义 emits
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'select-category': [id: number]
  'add-step': [name: string, desc: string]
}>()

// 展开的节点
const expandedNodes = reactive(new Set<number>())

// 关闭弹窗
function closeModal() {
  emit('update:visible', false)
}

// 切换节点展开
function toggleNode(nodeId: number) {
  if (expandedNodes.has(nodeId)) {
    expandedNodes.delete(nodeId)
  } else {
    expandedNodes.add(nodeId)
  }
}

// 判断是否展开
function isExpanded(nodeId: number) {
  return expandedNodes.has(nodeId)
}

// 判断是否叶子节点
function isLeaf(node: any) {
  return !node.children || node.children.length === 0
}

// 处理节点点击
function handleNodeClick(node: any) {
  if (isLeaf(node)) {
    emit('select-category', node.id)
  } else {
    toggleNode(node.id)
  }
}

// 添加检测项
function handleAddStep(item: any) {
  emit('add-step', item.name, item.operation_desc || item.desc || '')
}

// 截断描述
function truncateDesc(desc: string, maxLen = 30) {
  if (!desc) return ''
  return desc.length > maxLen ? desc.substring(0, maxLen) + '...' : desc
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="closeModal">
        <div class="modal-container">
          <!-- 标题栏 -->
          <div class="modal-header">
            <h3 class="modal-title">
              <Icon icon="mdi:lightning-bolt" />
              快捷检测项
            </h3>
            <button class="close-btn" @click="closeModal">
              <Icon icon="mdi:close" />
            </button>
          </div>

          <!-- 内容区 -->
          <div class="modal-content">
            <!-- 左侧分类树 -->
            <div class="tree-panel">
              <div class="panel-header">
                <Icon icon="mdi:folder-outline" />
                <span>检测项分类</span>
              </div>
              
              <div class="tree-content">
                <div v-if="treeLoading" class="loading-state">
                  <Icon icon="mdi:loading" class="spin" />
                  <span>加载中...</span>
                </div>
                
                <template v-else-if="treeData.length > 0">
                  <template v-for="node in treeData" :key="node.id">
                    <!-- 第一级节点 -->
                    <div 
                      class="tree-node"
                      :class="{ 
                        leaf: isLeaf(node),
                        selected: selectedId === node.id && isLeaf(node)
                      }"
                      @click="handleNodeClick(node)"
                    >
                      <button 
                        v-if="!isLeaf(node)" 
                        class="expand-btn"
                        @click.stop="toggleNode(node.id)"
                      >
                        <Icon :icon="isExpanded(node.id) ? 'mdi:chevron-down' : 'mdi:chevron-right'" />
                      </button>
                      <Icon 
                        :icon="isLeaf(node) ? 'mdi:file-document-outline' : (isExpanded(node.id) ? 'mdi:folder-open' : 'mdi:folder')" 
                        class="node-icon"
                      />
                      <span class="node-label">{{ node.label || node.name }}</span>
                    </div>

                    <!-- 第二级子节点 -->
                    <template v-if="!isLeaf(node) && isExpanded(node.id) && node.children">
                      <div 
                        v-for="child in node.children" 
                        :key="child.id"
                        class="tree-node leaf"
                        :class="{ selected: selectedId === child.id }"
                        :style="{ paddingLeft: '32px' }"
                        @click="emit('select-category', child.id)"
                      >
                        <Icon icon="mdi:file-document-outline" class="node-icon" />
                        <span class="node-label">{{ child.label || child.name }}</span>
                      </div>
                    </template>
                  </template>
                </template>
                
                <div v-else class="empty-state">
                  <Icon icon="mdi:folder-off-outline" />
                  <span>暂无分类</span>
                </div>
              </div>
            </div>

            <!-- 右侧检测项列表 -->
            <div class="table-panel">
              <div class="panel-header">
                <Icon icon="mdi:format-list-checks" />
                <span>检测项列表</span>
              </div>
              
              <div class="table-content">
                <div v-if="tableLoading" class="loading-state">
                  <Icon icon="mdi:loading" class="spin" />
                  <span>加载中...</span>
                </div>
                
                <div v-else-if="!selectedId" class="empty-state">
                  <Icon icon="mdi:hand-pointing-left" />
                  <span>请选择检测类型</span>
                </div>
                
                <template v-else-if="tableData.length > 0">
                  <div class="table-wrapper">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>检测项名称</th>
                          <th>检测项描述</th>
                          <th width="80">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="item in tableData" :key="item.id">
                          <td class="name-cell">{{ item.name }}</td>
                          <td class="desc-cell" :title="item.operation_desc">
                            {{ truncateDesc(item.operation_desc) }}
                          </td>
                          <td class="action-cell">
                            <button 
                              class="add-btn"
                              @click="handleAddStep(item)"
                            >
                              <Icon icon="mdi:plus" />
                              添加
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </template>
                
                <div v-else class="empty-state">
                  <Icon icon="mdi:file-search-outline" />
                  <span>该分类下暂无检测项</span>
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
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.modal-container {
  width: 900px;
  max-width: 100%;
  max-height: 70vh;
  background: var(--color-bg-primary);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.modal-title :deep(svg) {
  color: var(--color-accent-blue);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.modal-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.tree-panel {
  width: 260px;
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
}

.table-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.tree-content,
.table-content {
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
  color: var(--color-text-tertiary);
  font-size: 14px;
}

.loading-state :deep(svg),
.empty-state :deep(svg) {
  font-size: 32px;
  opacity: 0.5;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.tree-node:hover {
  background: var(--color-bg-secondary);
}

.tree-node.selected {
  background: rgba(88, 166, 255, 0.15);
}

.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  padding: 0;
}

.node-icon {
  font-size: 18px;
  color: var(--color-text-tertiary);
}

.tree-node.leaf .node-icon {
  color: var(--color-accent-blue);
}

.node-label {
  flex: 1;
  font-size: 14px;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.data-table th {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
}

.data-table tbody tr:hover {
  background: var(--color-bg-secondary);
}

.name-cell {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.desc-cell {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.action-cell {
  text-align: center;
}

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: none;
  background: var(--color-accent-blue);
  color: white;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.add-btn:hover {
  background: #4a9eff;
}

/* 动画 */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95) translateY(-20px);
}
</style>
