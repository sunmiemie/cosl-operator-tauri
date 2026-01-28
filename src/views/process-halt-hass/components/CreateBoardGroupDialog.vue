<script setup lang="ts">
/**
 * 创建电路板组对话框
 * 支持选择电路板型号、输入组名称和描述
 * 支持三层树结构（第一层分类 -> 第二层分类 -> 第三层电路板型号）
 */
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'

// 树节点接口
interface TreeNode {
  id: number
  label: string
  children?: TreeNode[]
}

// 选中的电路板
interface SelectedBoard {
  id: number
  name: string
}

// 定义 props
interface Props {
  visible: boolean
  treeData: TreeNode[]
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

// 定义 emits
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'confirm': [data: { name: string; description: string; boardModelIds: number[] }]
}>()

// 表单数据
const formData = ref({
  name: '',
  description: '',
})

// 选中的电路板型号
const selectedBoards = ref<SelectedBoard[]>([])

// 搜索关键词
const searchKeyword = ref('')

// 展开的节点 Set（支持多层级）
const expandedNodes = ref<Set<number>>(new Set())

// 是否可以提交
const canSubmit = computed(() => {
  return formData.value.name.trim() !== '' && selectedBoards.value.length > 0
})

// 关闭对话框
function closeDialog() {
  emit('update:visible', false)
}

// 重置表单
function resetForm() {
  formData.value = {
    name: '',
    description: '',
  }
  selectedBoards.value = []
  searchKeyword.value = ''
  expandedNodes.value = new Set()
}

// 监听 visible 变化
watch(() => props.visible, (visible) => {
  if (visible) {
    resetForm()
  }
})

// 过滤树数据（递归支持任意层级）
const filteredTreeData = computed(() => {
  if (!searchKeyword.value.trim()) {
    return props.treeData
  }
  const keyword = searchKeyword.value.toLowerCase()
  return filterTree(props.treeData, keyword)
})

// 递归过滤树节点
function filterTree(nodes: TreeNode[], keyword: string): TreeNode[] {
  const result: TreeNode[] = []
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      const filteredChildren = filterTree(node.children, keyword)
      if (filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren,
        })
      }
    } else if (node.label.toLowerCase().includes(keyword)) {
      // 叶子节点且匹配关键词
      result.push(node)
    }
  }
  return result
}

// 切换节点展开状态
function toggleNode(nodeId: number) {
  const newSet = new Set(expandedNodes.value)
  if (newSet.has(nodeId)) {
    newSet.delete(nodeId)
  } else {
    newSet.add(nodeId)
  }
  expandedNodes.value = newSet
}

// 检查节点是否展开
function isNodeExpanded(nodeId: number) {
  return expandedNodes.value.has(nodeId)
}

// 判断是否为叶子节点（没有子节点）
function isLeafNode(node: TreeNode): boolean {
  return !node.children || node.children.length === 0
}

// 选择/取消选择电路板（只能选择叶子节点）
function toggleBoard(board: TreeNode) {
  if (!isLeafNode(board)) return

  const index = selectedBoards.value.findIndex(b => b.id === board.id)
  if (index >= 0) {
    selectedBoards.value.splice(index, 1)
  } else {
    selectedBoards.value.push({
      id: board.id,
      name: board.label,
    })
  }
}

// 检查电路板是否已选中
function isBoardSelected(boardId: number) {
  return selectedBoards.value.some(b => b.id === boardId)
}

// 移除已选电路板
function removeBoard(boardId: number) {
  const index = selectedBoards.value.findIndex(b => b.id === boardId)
  if (index >= 0) {
    selectedBoards.value.splice(index, 1)
  }
}

// 提交表单
function handleSubmit() {
  if (!canSubmit.value) {
    ElMessage.warning('请填写组名称并选择至少一个电路板型号')
    return
  }

  emit('confirm', {
    name: formData.value.name.trim(),
    description: formData.value.description.trim(),
    boardModelIds: selectedBoards.value.map(b => b.id),
  })
}

// 计算子节点中叶子节点的数量
function countLeafNodes(node: TreeNode): number {
  if (isLeafNode(node)) {
    return 1
  }
  let count = 0
  for (const child of node.children || []) {
    count += countLeafNodes(child)
  }
  return count
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible" class="dialog-overlay" @click.self="closeDialog">
        <div class="dialog-container">
          <!-- 标题栏 -->
          <div class="dialog-header">
            <h3 class="dialog-title">
              <Icon icon="mdi:plus-circle-outline" />
              创建电路板组
            </h3>
            <button class="close-btn" @click="closeDialog">
              <Icon icon="mdi:close" />
            </button>
          </div>

          <!-- 内容区 -->
          <div class="dialog-content">
            <!-- 基本信息 -->
            <div class="form-section">
              <div class="section-title">基本信息</div>
              <div class="form-row">
                <label>组名称 <span class="required">*</span></label>
                <input
                  v-model="formData.name"
                  type="text"
                  placeholder="请输入电路板组名称"
                  maxlength="50"
                />
              </div>
              <div class="form-row">
                <label>描述</label>
                <textarea
                  v-model="formData.description"
                  placeholder="请输入描述（可选）"
                  rows="2"
                  maxlength="200"
                />
              </div>
            </div>

            <!-- 电路板选择 -->
            <div class="form-section">
              <div class="section-title">
                <span>选择电路板型号 <span class="required">*</span></span>
                <span class="selected-count">已选 {{ selectedBoards.length }} 个</span>
              </div>

              <!-- 已选电路板标签 -->
              <div v-if="selectedBoards.length > 0" class="selected-tags">
                <div
                  v-for="board in selectedBoards"
                  :key="board.id"
                  class="board-tag"
                >
                  <Icon icon="mdi:chip" />
                  <span>{{ board.name }}</span>
                  <button class="remove-btn" @click="removeBoard(board.id)">
                    <Icon icon="mdi:close" />
                  </button>
                </div>
              </div>

              <!-- 搜索框 -->
              <div class="search-box">
                <Icon icon="mdi:magnify" class="search-icon" />
                <input
                  v-model="searchKeyword"
                  type="text"
                  placeholder="搜索电路板型号..."
                />
              </div>

              <!-- 树形选择器 -->
              <div class="tree-container">
                <template v-if="filteredTreeData.length === 0">
                  <div class="empty-state">
                    <Icon icon="mdi:folder-outline" />
                    <span>{{ searchKeyword ? '未找到匹配项' : '暂无电路板型号数据' }}</span>
                  </div>
                </template>
                <template v-else>
                  <!-- 第一层节点 -->
                  <div
                    v-for="level1 in filteredTreeData"
                    :key="level1.id"
                    class="tree-node level-1"
                  >
                    <!-- 第一层：如果是叶子节点则可选择，否则是分类 -->
                    <template v-if="isLeafNode(level1)">
                      <div
                        class="node-header leaf level-1-leaf"
                        :class="{ selected: isBoardSelected(level1.id) }"
                        @click="toggleBoard(level1)"
                      >
                        <div class="checkbox">
                          <Icon v-if="isBoardSelected(level1.id)" icon="mdi:check" />
                        </div>
                        <Icon icon="mdi:chip" class="chip-icon" />
                        <span class="node-label">{{ level1.label }}</span>
                      </div>
                    </template>
                    <template v-else>
                      <!-- 第一层分类 -->
                      <div
                        class="node-header parent level-1-parent"
                        @click="toggleNode(level1.id)"
                      >
                        <Icon
                          :icon="isNodeExpanded(level1.id) ? 'mdi:chevron-down' : 'mdi:chevron-right'"
                          class="expand-icon"
                        />
                        <Icon icon="mdi:folder-outline" class="folder-icon" />
                        <span class="node-label">{{ level1.label }}</span>
                        <span class="child-count">{{ countLeafNodes(level1) }} 个型号</span>
                      </div>

                      <!-- 第二层节点 -->
                      <Transition name="expand">
                        <div v-if="isNodeExpanded(level1.id)" class="node-children level-2-container">
                          <div
                            v-for="level2 in level1.children"
                            :key="level2.id"
                            class="tree-node level-2"
                          >
                            <!-- 第二层：始终是分类，不可选择 -->
                            <!-- 第二层分类头部 -->
                            <div
                              class="node-header parent level-2-parent"
                              @click="level2.children?.length ? toggleNode(level2.id) : undefined"
                              :class="{ 'no-children': !level2.children?.length }"
                            >
                              <template v-if="level2.children?.length">
                                <Icon
                                  :icon="isNodeExpanded(level2.id) ? 'mdi:chevron-down' : 'mdi:chevron-right'"
                                  class="expand-icon"
                                />
                              </template>
                              <template v-else>
                                <span class="expand-placeholder"></span>
                              </template>
                              <Icon icon="mdi:folder-open-outline" class="folder-icon sub" />
                              <span class="node-label">{{ level2.label }}</span>
                              <span class="child-count">
                                {{ level2.children?.length || 0 }} 个型号
                              </span>
                            </div>

                            <!-- 第三层节点（电路板型号） -->
                            <Transition name="expand">
                              <div v-if="level2.children?.length && isNodeExpanded(level2.id)" class="node-children level-3-container">
                                <div
                                  v-for="level3 in level2.children"
                                  :key="level3.id"
                                  class="tree-node level-3"
                                >
                                  <!-- 第三层：叶子节点（电路板型号），可选择 -->
                                  <div
                                    class="node-header leaf level-3-leaf"
                                    :class="{ selected: isBoardSelected(level3.id) }"
                                    @click="toggleBoard(level3)"
                                  >
                                    <div class="checkbox">
                                      <Icon v-if="isBoardSelected(level3.id)" icon="mdi:check" />
                                    </div>
                                    <Icon icon="mdi:chip" class="chip-icon" />
                                    <span class="node-label">{{ level3.label }}</span>
                                  </div>
                                </div>
                              </div>
                            </Transition>
                          </div>
                        </div>
                      </Transition>
                    </template>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- 底部按钮 -->
          <div class="dialog-footer">
            <button class="btn-cancel" @click="closeDialog">取消</button>
            <button
              class="btn-confirm"
              :disabled="!canSubmit || loading"
              @click="handleSubmit"
            >
              <Icon v-if="loading" icon="mdi:loading" class="spinning" />
              {{ loading ? '创建中...' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dialog-container {
  width: 650px;
  max-width: 90vw;
  max-height: 90vh;
  background: var(--color-bg-primary, #fff);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.dialog-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
  margin: 0;
}

.dialog-title :deep(svg) {
  font-size: 22px;
  color: var(--color-primary, #3b82f6);
}

.close-btn {
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

.close-btn:hover {
  background: var(--color-bg-tertiary, #f1f5f9);
  color: var(--color-text-primary, #1e293b);
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.form-section {
  margin-bottom: 24px;
}

.form-section:last-child {
  margin-bottom: 0;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
  margin-bottom: 12px;
}

.required {
  color: #ef4444;
}

.selected-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-tertiary, #94a3b8);
}

.form-row {
  margin-bottom: 12px;
}

.form-row:last-child {
  margin-bottom: 0;
}

.form-row label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #64748b);
  margin-bottom: 6px;
}

.form-row input,
.form-row textarea {
  width: 100%;
  padding: 10px 14px;
  background: var(--color-bg-tertiary, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary, #1e293b);
  transition: all 0.2s;
  resize: none;
}

.form-row input:focus,
.form-row textarea:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-bg-primary, #fff);
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  max-height: 80px;
  overflow-y: auto;
}

.board-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--color-primary-light, #dbeafe);
  border-radius: 6px;
  font-size: 13px;
  color: var(--color-primary, #3b82f6);
}

.board-tag :deep(svg:first-child) {
  font-size: 14px;
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--color-primary, #3b82f6);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
}

.remove-btn:hover {
  background: var(--color-primary, #3b82f6);
  color: white;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--color-bg-tertiary, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  margin-bottom: 12px;
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

.tree-container {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  background: var(--color-bg-primary, #fff);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: var(--color-text-tertiary, #94a3b8);
  font-size: 13px;
}

.empty-state :deep(svg) {
  font-size: 32px;
  opacity: 0.5;
}

/* 树节点基础样式 */
.tree-node {
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
}

.tree-node:last-child {
  border-bottom: none;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.node-header:hover {
  background: var(--color-bg-tertiary, #f8fafc);
}

.node-header.parent {
  font-weight: 500;
}

.node-header.leaf.selected {
  background: rgba(59, 130, 246, 0.1);
}

/* 层级缩进 */
.level-1-parent {
  padding-left: 14px;
}

.level-1-leaf {
  padding-left: 14px;
}

.level-2-container {
  background: var(--color-bg-tertiary, #f8fafc);
}

.level-2-parent {
  padding-left: 36px;
}

.level-2-leaf {
  padding-left: 36px;
}

.level-3-container {
  background: var(--color-bg-secondary, #f1f5f9);
}

.level-3-leaf {
  padding-left: 58px;
}

/* 图标样式 */
.expand-icon {
  font-size: 16px;
  color: var(--color-text-tertiary, #94a3b8);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.folder-icon {
  font-size: 18px;
  color: var(--color-warning, #f59e0b);
  flex-shrink: 0;
}

.folder-icon.sub {
  font-size: 16px;
  color: #d97706;
}

.chip-icon {
  font-size: 16px;
  color: var(--color-primary, #3b82f6);
  flex-shrink: 0;
}

.node-label {
  flex: 1;
  font-size: 13px;
  color: var(--color-text-primary, #1e293b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.child-count {
  font-size: 11px;
  color: var(--color-text-tertiary, #94a3b8);
  padding: 2px 8px;
  background: var(--color-bg-primary, #fff);
  border-radius: 10px;
  flex-shrink: 0;
}

/* 复选框 */
.checkbox {
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-border, #e2e8f0);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.node-header.leaf.selected .checkbox {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary, #3b82f6);
  color: white;
}

/* 子节点容器 */
.node-children {
  overflow: hidden;
}

/* 底部按钮 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border, #e2e8f0);
}

.btn-cancel,
.btn-confirm {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: var(--color-bg-tertiary, #f1f5f9);
  border: 1px solid var(--color-border, #e2e8f0);
  color: var(--color-text-secondary, #64748b);
}

.btn-cancel:hover {
  background: var(--color-bg-secondary, #e2e8f0);
}

.btn-confirm {
  background: var(--color-primary, #3b82f6);
  border: none;
  color: white;
  min-width: 100px;
}

.btn-confirm:hover:not(:disabled) {
  background: #2563eb;
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 1000px;
}

/* 对话框动画 */
.dialog-enter-active,
.dialog-leave-active {
  transition: all 0.3s ease;
}

.dialog-enter-active .dialog-container,
.dialog-leave-active .dialog-container {
  transition: all 0.3s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .dialog-container,
.dialog-leave-to .dialog-container {
  transform: scale(0.9) translateY(20px);
  opacity: 0;
}
</style>
