<script setup lang="ts">
/**
 * 电路板组多选选择器
 * 支持树形结构显示，多选 checkbox 模式
 */
import { ref, computed, reactive } from 'vue'
import { Icon } from '@iconify/vue'

interface TreeNode {
  id: number
  label: string
  children?: TreeNode[]
}

interface BoardGroupItem {
  id: number
  name: string
}

interface Props {
  treeData: TreeNode[]
  modelValue: BoardGroupItem[]
  isOnline?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isOnline: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: BoardGroupItem[]]
}>()

// 搜索关键词
const searchKeyword = ref('')
// 展开的节点集合
const expandedNodes = reactive(new Set<string>())

// 递归过滤树节点
function filterTree(nodes: TreeNode[], keyword: string): TreeNode[] {
  if (!keyword) return nodes
  const lowerKeyword = keyword.toLowerCase()

  return nodes.reduce<TreeNode[]>((acc, node) => {
    const labelMatch = node.label.toLowerCase().includes(lowerKeyword)

    if (node.children && node.children.length > 0) {
      const filteredChildren = filterTree(node.children, keyword)
      if (labelMatch || filteredChildren.length > 0) {
        acc.push({
          ...node,
          children: labelMatch ? node.children : filteredChildren,
        })
      }
    } else if (labelMatch) {
      acc.push(node)
    }

    return acc
  }, [])
}

const filteredTreeData = computed(() => filterTree(props.treeData, searchKeyword.value))

// 生成唯一的节点键
function getNodeKey(nodeId: number, parentKey?: string): string {
  return parentKey ? `${parentKey}_${nodeId}` : `${nodeId}`
}

// 切换节点展开状态
function toggleNode(nodeKey: string, event?: Event) {
  event?.stopPropagation()
  if (expandedNodes.has(nodeKey)) {
    expandedNodes.delete(nodeKey)
  } else {
    expandedNodes.add(nodeKey)
  }
}

// 检查节点是否展开
function isExpanded(nodeKey: string): boolean {
  return expandedNodes.has(nodeKey)
}

// 检查电路板是否已选中
function isSelected(nodeId: number): boolean {
  return props.modelValue.some((item) => item.id === nodeId)
}

// 切换电路板选中状态
function toggleBoard(node: TreeNode) {
  const currentSelected = [...props.modelValue]
  const index = currentSelected.findIndex((item) => item.id === node.id)

  if (index !== -1) {
    // 已选中，移除
    currentSelected.splice(index, 1)
  } else {
    // 未选中，添加
    currentSelected.push({
      id: node.id,
      name: node.label,
    })
  }

  emit('update:modelValue', currentSelected)
}

// 获取展开图标
function getExpandIcon(nodeKey: string): string {
  return isExpanded(nodeKey) ? 'mdi:chevron-down' : 'mdi:chevron-right'
}

// 获取节点图标
function getNodeIcon(nodeKey: string, level: number): string {
  if (level === 3) {
    return 'mdi:chip'
  }
  return isExpanded(nodeKey) ? 'mdi:folder-open' : 'mdi:folder'
}
</script>

<template>
  <div class="board-group-selector">
    <div class="panel-header">
      <Icon icon="mdi:folder-open-outline" class="header-icon" />
      <span>电路板型号</span>
      <span class="selected-count" v-if="modelValue.length > 0">
        已选 {{ modelValue.length }}
      </span>
    </div>

    <!-- 搜索框 -->
    <div class="search-box">
      <Icon icon="mdi:magnify" class="search-icon" />
      <input
        v-model="searchKeyword"
        type="text"
        placeholder="搜索型号..."
        class="search-input"
      />
      <button v-if="searchKeyword" class="clear-btn" @click="searchKeyword = ''">
        <Icon icon="mdi:close" />
      </button>
    </div>

    <!-- 树形列表 -->
    <div class="tree-content">
      <template v-if="isOnline">
        <!-- 递归渲染树节点 -->
        <template v-for="node in filteredTreeData" :key="node.id">
          <!-- 第一级节点 -->
          <div class="tree-node-wrapper">
            <div
              class="tree-node parent"
              :style="{ paddingLeft: '8px' }"
              @click="toggleNode(getNodeKey(node.id), $event)"
            >
              <button class="expand-btn" @click.stop="toggleNode(getNodeKey(node.id), $event)">
                <Icon :icon="getExpandIcon(getNodeKey(node.id))" class="expand-icon" />
              </button>
              <Icon :icon="getNodeIcon(getNodeKey(node.id), 1)" class="node-icon folder" />
              <span class="node-label">{{ node.label }}</span>
            </div>

            <!-- 第二级子节点 -->
            <template v-if="isExpanded(getNodeKey(node.id)) && node.children">
              <template v-for="child in node.children" :key="`${node.id}_${child.id}`">
                <div class="tree-node-wrapper">
                  <div
                    class="tree-node parent"
                    :style="{ paddingLeft: '28px' }"
                    @click="toggleNode(getNodeKey(child.id, getNodeKey(node.id)), $event)"
                  >
                    <button
                      class="expand-btn"
                      @click.stop="toggleNode(getNodeKey(child.id, getNodeKey(node.id)), $event)"
                    >
                      <Icon
                        :icon="getExpandIcon(getNodeKey(child.id, getNodeKey(node.id)))"
                        class="expand-icon"
                      />
                    </button>
                    <Icon
                      :icon="getNodeIcon(getNodeKey(child.id, getNodeKey(node.id)), 2)"
                      class="node-icon folder"
                    />
                    <span class="node-label">{{ child.label }}</span>
                  </div>

                  <!-- 第三级子节点（电路板，带 checkbox） -->
                  <template
                    v-if="isExpanded(getNodeKey(child.id, getNodeKey(node.id))) && child.children"
                  >
                    <div
                      v-for="grandChild in child.children"
                      :key="`${node.id}_${child.id}_${grandChild.id}`"
                      class="tree-node leaf"
                      :class="{ selected: isSelected(grandChild.id) }"
                      :style="{ paddingLeft: '52px' }"
                      @click="toggleBoard(grandChild)"
                    >
                      <div class="checkbox" :class="{ checked: isSelected(grandChild.id) }">
                        <Icon v-if="isSelected(grandChild.id)" icon="mdi:check" />
                      </div>
                      <Icon icon="mdi:chip" class="node-icon chip" />
                      <span class="node-label">{{ grandChild.label }}</span>
                    </div>
                  </template>
                </div>
              </template>
            </template>
          </div>
        </template>

        <!-- 空状态 -->
        <div v-if="filteredTreeData.length === 0" class="tree-empty">
          <Icon icon="mdi:folder-search-outline" class="empty-icon" />
          <span>{{ searchKeyword ? '未找到匹配项' : '暂无数据' }}</span>
        </div>
      </template>

      <!-- 离线模式 -->
      <div v-else class="offline-notice">
        <Icon icon="mdi:cloud-off-outline" class="offline-icon" />
        <span>离线模式</span>
        <p>请上传工艺文件进行编辑</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-group-selector {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

/* 面板头部 */
.panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border);
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.header-icon {
  font-size: 20px;
  color: var(--color-accent-blue);
}

.selected-count {
  margin-left: auto;
  padding: 4px 10px;
  background: var(--color-accent-blue);
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: white;
}

/* 搜索框 */
.search-box {
  position: relative;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}

.search-icon {
  position: absolute;
  left: 28px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  color: var(--color-text-tertiary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 36px 10px 40px;
  background: var(--color-bg-tertiary);
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
  transition: all 0.2s ease;
}

.search-input:focus {
  outline: none;
  border-color: var(--color-accent-blue);
  background: var(--color-bg-primary);
}

.search-input::placeholder {
  color: var(--color-text-tertiary);
}

.clear-btn {
  position: absolute;
  right: 28px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: var(--color-text-tertiary);
  border-radius: 50%;
  color: var(--color-bg-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-btn:hover {
  background: var(--color-text-secondary);
}

/* 树形内容区 */
.tree-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.tree-content::-webkit-scrollbar {
  width: 4px;
}

.tree-content::-webkit-scrollbar-track {
  background: transparent;
}

.tree-content::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 2px;
}

/* 树节点 */
.tree-node-wrapper {
  user-select: none;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.tree-node:hover {
  background: var(--color-bg-hover);
}

.tree-node.selected {
  background: rgba(88, 166, 255, 0.15);
}

.tree-node.selected .node-label {
  color: var(--color-accent-blue);
  font-weight: 500;
}

.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.expand-btn:hover {
  background: var(--color-bg-tertiary);
}

.expand-icon {
  font-size: 16px;
  color: var(--color-text-tertiary);
}

/* Checkbox */
.checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-border);
  border-radius: 4px;
  flex-shrink: 0;
  transition: all 0.2s ease;
  font-size: 12px;
  color: white;
}

.checkbox.checked {
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
}

.node-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.node-icon.folder {
  color: #f59e0b;
}

.node-icon.chip {
  color: var(--color-accent-purple);
}

.node-label {
  font-size: 14px;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--color-text-tertiary);
  gap: 8px;
}

.tree-empty .empty-icon {
  font-size: 40px;
  opacity: 0.5;
}

/* 离线提示 */
.offline-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-tertiary);
}

.offline-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.offline-notice span {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.offline-notice p {
  font-size: 13px;
  margin-top: 8px;
}
</style>
