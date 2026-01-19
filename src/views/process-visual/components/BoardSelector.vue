<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { Icon } from '@iconify/vue'

interface TreeNode {
  id: number
  label: string
  children?: TreeNode[]
}

interface ProcessVersion {
  id: number
  name: string
  version: string
}

interface Props {
  treeData: TreeNode[]
  presentProcess: ProcessVersion[]
  selectedBoardModel: string
  selectedBoardModelId: number
  processName: string
  processVersion: string
  currentSelectProcess: ProcessVersion | null
  isOnline: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:selectedBoardModel': [value: string]
  'update:selectedBoardModelId': [value: number]
  'update:processName': [value: string]
  'update:processVersion': [value: string]
  'update:currentSelectProcess': [value: ProcessVersion | null]
  'node-click': [node: TreeNode]
}>()

// 搜索关键词
const searchKeyword = ref('')
// 展开的节点集合 - 使用 reactive 确保响应式
const expandedNodes = reactive(new Set<number>())
// 选中的版本行
const selectedRow = ref<number | null>(null)

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
          children: labelMatch ? node.children : filteredChildren
        })
      }
    } else if (labelMatch) {
      acc.push(node)
    }
    
    return acc
  }, [])
}

const filteredTreeData = computed(() => filterTree(props.treeData, searchKeyword.value))

// 切换节点展开状态
function toggleNode(nodeId: number, event?: Event) {
  event?.stopPropagation()
  if (expandedNodes.has(nodeId)) {
    expandedNodes.delete(nodeId)
  } else {
    expandedNodes.add(nodeId)
  }
}

// 处理叶子节点点击
function handleLeafClick(node: TreeNode) {
  emit('update:selectedBoardModel', node.label)
  emit('update:selectedBoardModelId', node.id)
  emit('node-click', node)
}

// 处理节点点击
function handleNodeClick(node: TreeNode, event?: Event) {
  if (isLeaf(node)) {
    handleLeafClick(node)
  } else {
    toggleNode(node.id, event)
  }
}

// 选择版本
function selectVersion(row: ProcessVersion) {
  selectedRow.value = row.id
  emit('update:currentSelectProcess', row)
}

// 清除选择
function clearSelection() {
  selectedRow.value = null
  emit('update:currentSelectProcess', null)
}

// 检查节点是否展开
function isExpanded(nodeId: number): boolean {
  return expandedNodes.has(nodeId)
}

// 检查节点是否是叶子节点
function isLeaf(node: TreeNode): boolean {
  return !node.children || node.children.length === 0
}

// 获取节点图标
function getNodeIcon(node: TreeNode): string {
  if (isLeaf(node)) {
    return 'mdi:chip'
  }
  return isExpanded(node.id) ? 'mdi:folder-open' : 'mdi:folder'
}

// 获取展开图标
function getExpandIcon(nodeId: number): string {
  return isExpanded(nodeId) ? 'mdi:chevron-down' : 'mdi:chevron-right'
}
</script>

<template>
  <div class="board-selector">
    <!-- 左侧：树形选择器 -->
    <div class="tree-panel">
      <div class="panel-header">
        <Icon icon="mdi:folder-open-outline" class="header-icon" />
        <span>电路板型号</span>
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
        <button 
          v-if="searchKeyword" 
          class="clear-btn"
          @click="searchKeyword = ''"
        >
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
                class="tree-node"
                :class="{ 
                  selected: selectedBoardModelId === node.id && isLeaf(node),
                  leaf: isLeaf(node),
                  parent: !isLeaf(node)
                }"
                :style="{ paddingLeft: '12px' }"
                @click="handleNodeClick(node, $event)"
              >
                <!-- 展开箭头 -->
                <button 
                  v-if="!isLeaf(node)" 
                  class="expand-btn"
                  @click.stop="toggleNode(node.id, $event)"
                >
                  <Icon :icon="getExpandIcon(node.id)" class="expand-icon" />
                </button>
                <!-- 节点图标 -->
                <Icon 
                  :icon="getNodeIcon(node)" 
                  class="node-icon"
                  :class="{ folder: !isLeaf(node), chip: isLeaf(node) }"
                />
                <!-- 节点标签 -->
                <span class="node-label">{{ node.label }}</span>
              </div>

              <!-- 第二级子节点 -->
              <template v-if="!isLeaf(node) && isExpanded(node.id) && node.children">
                <template v-for="child in node.children" :key="child.id">
                  <div class="tree-node-wrapper">
                    <div 
                      class="tree-node"
                      :class="{ 
                        selected: selectedBoardModelId === child.id && isLeaf(child),
                        leaf: isLeaf(child),
                        parent: !isLeaf(child)
                      }"
                      :style="{ paddingLeft: '32px' }"
                      @click="handleNodeClick(child, $event)"
                    >
                      <button 
                        v-if="!isLeaf(child)" 
                        class="expand-btn"
                        @click.stop="toggleNode(child.id, $event)"
                      >
                        <Icon :icon="getExpandIcon(child.id)" class="expand-icon" />
                      </button>
                      <Icon 
                        :icon="getNodeIcon(child)" 
                        class="node-icon"
                        :class="{ folder: !isLeaf(child), chip: isLeaf(child) }"
                      />
                      <span class="node-label">{{ child.label }}</span>
                    </div>

                    <!-- 第三级子节点 -->
                    <template v-if="!isLeaf(child) && isExpanded(child.id) && child.children">
                      <template v-for="grandChild in child.children" :key="grandChild.id">
                        <div class="tree-node-wrapper">
                          <div 
                            class="tree-node"
                            :class="{ 
                              selected: selectedBoardModelId === grandChild.id && isLeaf(grandChild),
                              leaf: isLeaf(grandChild),
                              parent: !isLeaf(grandChild)
                            }"
                            :style="{ paddingLeft: '52px' }"
                            @click="handleNodeClick(grandChild, $event)"
                          >
                            <button 
                              v-if="!isLeaf(grandChild)" 
                              class="expand-btn"
                              @click.stop="toggleNode(grandChild.id, $event)"
                            >
                              <Icon :icon="getExpandIcon(grandChild.id)" class="expand-icon" />
                            </button>
                            <Icon 
                              :icon="getNodeIcon(grandChild)" 
                              class="node-icon"
                              :class="{ folder: !isLeaf(grandChild), chip: isLeaf(grandChild) }"
                            />
                            <span class="node-label">{{ grandChild.label }}</span>
                          </div>

                          <!-- 第四级子节点 -->
                          <template v-if="!isLeaf(grandChild) && isExpanded(grandChild.id) && grandChild.children">
                            <div 
                              v-for="greatGrandChild in grandChild.children" 
                              :key="greatGrandChild.id"
                              class="tree-node leaf"
                              :class="{ selected: selectedBoardModelId === greatGrandChild.id }"
                              :style="{ paddingLeft: '72px' }"
                              @click="handleLeafClick(greatGrandChild)"
                            >
                              <Icon icon="mdi:chip" class="node-icon chip" />
                              <span class="node-label">{{ greatGrandChild.label }}</span>
                            </div>
                          </template>
                        </div>
                      </template>
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

    <!-- 右侧：工艺信息 -->
    <div class="info-panel">
      <div class="panel-header">
        <Icon icon="mdi:file-document-edit-outline" class="header-icon" />
        <span>工艺信息</span>
        <span v-if="selectedBoardModel !== '待选择'" class="board-tag">{{ selectedBoardModel }}</span>
      </div>

      <!-- 表单 -->
      <div class="form-section">
        <div class="form-group">
          <label class="form-label">
            <Icon icon="mdi:tag-outline" />
            工艺名称
          </label>
          <input 
            :value="processName"
            @input="$emit('update:processName', ($event.target as HTMLInputElement).value)"
            type="text"
            placeholder="请填写工艺名称"
            class="form-input"
            :disabled="selectedBoardModel === '待选择'"
          />
        </div>
        
        <div class="form-group">
          <label class="form-label">
            <Icon icon="mdi:source-branch" />
            工艺版本
          </label>
          <div class="version-input">
            <span class="version-prefix">V</span>
            <input 
              :value="processVersion"
              @input="$emit('update:processVersion', ($event.target as HTMLInputElement).value)"
              type="text"
              placeholder="1.0.0"
              class="form-input version-field"
              :disabled="selectedBoardModel === '待选择'"
            />
          </div>
        </div>
      </div>

      <!-- 版本迭代选择 -->
      <div v-if="selectedBoardModel !== '待选择'" class="version-section">
        <div class="section-header">
          <div class="section-title">
            <Icon icon="mdi:history" />
            <span>基于版本进行迭代</span>
          </div>
          <button 
            v-if="currentSelectProcess" 
            class="clear-selection-btn"
            @click="clearSelection"
          >
            <Icon icon="mdi:close" />
            清除选择
          </button>
        </div>
        <p class="section-desc">单击表格内容选择基础版本</p>

        <!-- 版本表格 -->
        <div class="version-table-wrapper">
          <table class="version-table">
            <thead>
              <tr>
                <th>工艺ID</th>
                <th>所属电路板型号</th>
                <th>工艺版本</th>
              </tr>
            </thead>
            <tbody>
              <tr 
                v-for="row in presentProcess" 
                :key="row.id"
                :class="{ selected: selectedRow === row.id }"
                @click="selectVersion(row)"
              >
                <td class="mono">{{ row.id }}</td>
                <td>{{ row.name }}</td>
                <td class="mono">V{{ row.version }}</td>
              </tr>
              <tr v-if="presentProcess.length === 0">
                <td colspan="3" class="empty-row">
                  <div class="empty-content">
                    <Icon icon="mdi:package-variant" class="empty-icon" />
                    <span>该电路板当前无已创建工艺</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 未选择时的提示 -->
      <div v-else class="placeholder-section">
        <Icon icon="mdi:arrow-left-bold" class="placeholder-icon" />
        <span>请先从左侧选择电路板型号</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-selector {
  display: flex;
  gap: 16px;
  height: calc(100vh - 332px);
}

/* 左侧树形面板 */
.tree-panel {
  width: 320px;
  flex-shrink: 0;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 右侧信息面板 */
.info-panel {
  flex: 1;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

.board-tag {
  margin-left: auto;
  padding: 4px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-accent-blue);
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

/* 表单区域 */
.form-section {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-bottom: 1px solid var(--color-border);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.form-input {
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
  transition: all 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-accent-blue);
  background: var(--color-bg-primary);
}

.form-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-input::placeholder {
  color: var(--color-text-tertiary);
}

.version-input {
  display: flex;
  align-items: stretch;
}

.version-prefix {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-right: none;
  border-radius: 8px 0 0 8px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.version-field {
  border-radius: 0 8px 8px 0;
  flex: 1;
}

/* 版本选择区域 */
.version-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px 20px 20px;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.section-desc {
  font-size: 13px;
  color: var(--color-text-tertiary);
  margin-bottom: 12px;
}

.clear-selection-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-selection-btn:hover {
  border-color: var(--color-accent-red);
  color: var(--color-accent-red);
}

/* 版本表格 */
.version-table-wrapper {
  flex: 1;
  overflow-y: auto;
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.version-table-wrapper::-webkit-scrollbar {
  width: 4px;
}

.version-table-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

.version-table-wrapper::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 2px;
}

.version-table {
  width: 100%;
  border-collapse: collapse;
}

.version-table th {
  position: sticky;
  top: 0;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.version-table td {
  padding: 12px 16px;
  font-size: 14px;
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border-light);
}

.version-table tbody tr {
  cursor: pointer;
  transition: background 0.15s ease;
}

.version-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.version-table tbody tr.selected {
  background: rgba(88, 166, 255, 0.1);
}

.version-table tbody tr.selected td {
  color: var(--color-accent-blue);
  font-weight: 500;
}

.version-table tbody tr:last-child td {
  border-bottom: none;
}

.mono {
  font-family: var(--font-mono);
}

.empty-row {
  padding: 40px 16px !important;
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-tertiary);
}

.empty-content .empty-icon {
  font-size: 32px;
  opacity: 0.5;
}

/* 未选择提示 */
.placeholder-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-tertiary);
}

.placeholder-icon {
  font-size: 48px;
  opacity: 0.3;
}

.placeholder-section span {
  font-size: 14px;
}
</style>
