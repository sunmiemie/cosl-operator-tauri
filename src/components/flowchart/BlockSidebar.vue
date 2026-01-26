<script setup lang="ts">
/**
 * Block 选择侧边栏
 * 使用 manifest 树结构显示 blocks，支持拖放到流程图
 * 使用原生样式，不依赖 Element Plus
 */
import { ref, computed, onMounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { type BlockManifestTree, type BlockDefinition, type BlockSection } from '@/services/flojoy-api'
import { useBlockManifest } from '@/composables/useBlockManifest'

// 使用共享的 manifest composable
const { manifest: sharedManifest, loadManifest: loadSharedManifest, isLoading: manifestLoading } = useBlockManifest()

// Props
interface Props {
  // 是否显示
  visible?: boolean
  // 宽度
  width?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  visible: true,
  width: 280,
})

// Emits
const emit = defineEmits<{
  // 选择 block
  (e: 'select', block: BlockDefinition): void
  // 拖动开始
  (e: 'dragStart', block: BlockDefinition, event: DragEvent): void
}>()

// 状态
const searchQuery = ref('')
const expandedCategories = ref<Set<string>>(new Set())

// 使用共享的 manifest 和 loading 状态
const manifest = sharedManifest
const loading = manifestLoading

// 分类颜色映射（对齐 Studio sidebarVariants）
const categoryColors: Record<string, { text: string; bg: string; border: string }> = {
  AI_ML: { text: 'var(--color-accent-purple)', bg: 'rgba(139, 92, 246, 0.05)', border: 'var(--color-accent-purple)' },
  DEBUGGING: { text: 'var(--color-accent-pink)', bg: 'rgba(236, 72, 153, 0.05)', border: 'var(--color-accent-pink)' },
  VISUALIZATION: { text: 'var(--color-accent-pink)', bg: 'rgba(236, 72, 153, 0.05)', border: 'var(--color-accent-pink)' },
  DATA: { text: 'var(--color-success)', bg: 'rgba(34, 197, 94, 0.05)', border: 'var(--color-success)' },
  ETL: { text: 'var(--color-accent-blue)', bg: 'rgba(59, 130, 246, 0.05)', border: 'var(--color-accent-blue)' },
  IO: { text: 'var(--color-warning)', bg: 'rgba(245, 158, 11, 0.05)', border: 'var(--color-warning)' },
  LOGIC: { text: 'var(--color-accent-cyan)', bg: 'rgba(6, 182, 212, 0.05)', border: 'var(--color-accent-cyan)' },
  AUTOGEN: { text: 'var(--color-accent-blue)', bg: 'rgba(59, 130, 246, 0.05)', border: 'var(--color-accent-blue)' },
  HARDWARE: { text: 'var(--color-warning)', bg: 'rgba(245, 158, 11, 0.05)', border: 'var(--color-warning)' },
  DSP: { text: 'var(--color-success)', bg: 'rgba(34, 197, 94, 0.05)', border: 'var(--color-success)' },
  MATH: { text: 'var(--color-accent-blue)', bg: 'rgba(59, 130, 246, 0.05)', border: 'var(--color-accent-blue)' },
  CONTROL_FLOW: { text: 'var(--color-accent-cyan)', bg: 'rgba(6, 182, 212, 0.05)', border: 'var(--color-accent-cyan)' },
  NUMPY: { text: 'var(--color-accent-blue)', bg: 'rgba(59, 130, 246, 0.05)', border: 'var(--color-accent-blue)' },
  SCIPY: { text: 'var(--color-accent-blue)', bg: 'rgba(59, 130, 246, 0.05)', border: 'var(--color-accent-blue)' },
  default: { text: 'var(--color-text-secondary)', bg: 'var(--color-bg-tertiary)', border: 'var(--color-border)' },
}

// 分类图标映射
const categoryIcons: Record<string, string> = {
  AI_ML: 'mdi:robot',
  DATA: 'mdi:database',
  HARDWARE: 'mdi:chip',
  VISUALIZATION: 'mdi:chart-line',
  MATH: 'mdi:calculator',
  DSP: 'mdi:sine-wave',
  CONTROL_FLOW: 'mdi:source-branch',
  NUMPY: 'mdi:function-variant',
  SCIPY: 'mdi:flask',
  DEBUGGING: 'mdi:bug',
  ETL: 'mdi:swap-horizontal',
  IO: 'mdi:connection',
  LOGIC: 'mdi:gate-and',
  default: 'mdi:cube-outline',
}

// 判断是否为叶子节点（Block 定义）
function isLeaf(node: unknown): node is BlockDefinition {
  return node !== null && typeof node === 'object' && 'children' in node && (node as any).children === null
}

// 判断是否为根节点
function isRoot(node: unknown): node is BlockManifestTree {
  return node !== null && typeof node === 'object' && 'name' in node && (node as any).name === 'ROOT'
}

// 判断节点是否匹配搜索
function matchesQuery(text: string | undefined, query: string): boolean {
  if (!text || !query) return true
  return text.toLowerCase().includes(query.toLowerCase())
}

// 递归过滤树节点
function filterTreeNode(
  node: BlockManifestTree | BlockSection | BlockDefinition,
  query: string
): (BlockSection | BlockDefinition)[] {
  if (isLeaf(node)) {
    // 叶子节点：检查名称或 key 是否匹配
    if (matchesQuery(node.name, query) || matchesQuery(node.key, query)) {
      return [node]
    }
    return []
  }

  if (!node.children) return []

  // 父节点：递归过滤子节点
  const filteredChildren: (BlockSection | BlockDefinition)[] = []
  for (const child of node.children) {
    const matches = filterTreeNode(child, query)
    filteredChildren.push(...matches)
  }

  // 如果是根节点，直接返回过滤后的子节点
  if (isRoot(node)) {
    return filteredChildren
  }

  // 如果有匹配的子节点，或者父节点名称匹配，保留这个分类
  if (filteredChildren.length > 0 || matchesQuery(node.name, query)) {
    return [{
      ...node,
      children: filteredChildren,
    }]
  }

  return []
}

// 过滤后的树
const filteredTree = computed(() => {
  if (!manifest.value) return null
  if (!searchQuery.value) return manifest.value

  const filtered = filterTreeNode(manifest.value, searchQuery.value)
  return {
    name: 'ROOT' as const,
    children: filtered,
  }
})

// 获取分类颜色
function getCategoryColor(category: string | undefined) {
  return categoryColors[category || 'default'] || categoryColors.default
}

// 获取分类图标
function getCategoryIcon(category: string | undefined): string {
  return categoryIcons[category || 'default'] || categoryIcons.default
}

// 收集所有叶子节点（用于展开/折叠计数）
function collectLeaves(node: BlockManifestTree | BlockSection | BlockDefinition): BlockDefinition[] {
  if (isLeaf(node)) return [node]
  if (!node.children) return []
  return node.children.flatMap(child => collectLeaves(child))
}

// 切换分类展开/折叠
function toggleCategory(key: string) {
  if (expandedCategories.value.has(key)) {
    expandedCategories.value.delete(key)
  } else {
    expandedCategories.value.add(key)
  }
  // 触发响应式更新
  expandedCategories.value = new Set(expandedCategories.value)
}

// 判断分类是否展开
function isCategoryExpanded(key: string): boolean {
  return expandedCategories.value.has(key)
}

// 加载 manifest（使用共享的 composable）
async function loadManifest() {
  try {
    await loadSharedManifest()
    // 默认展开前 3 个顶级分类
    if (manifest.value?.children) {
      const topCategories = manifest.value.children
        .filter(c => !isLeaf(c))
        .slice(0, 3)
        .map(c => (c as BlockSection).name)
      expandedCategories.value = new Set(topCategories)
    }
  } catch (e) {
    console.error('Failed to load manifest:', e)
    ElMessage.error('加载 Blocks 清单失败')
  }
}

// 拖动开始
function onDragStart(event: DragEvent, block: BlockDefinition, category?: string) {
  if (!event.dataTransfer) return

  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/json', JSON.stringify({
    key: block.key,
    label: block.name,
    title: block.name,
    type: block.type,
    category: category,
    inputs: block.inputs,
    outputs: block.outputs,
    parameters: block.parameters,
    init_parameters: block.init_parameters,
    pip_dependencies: block.pip_dependencies,
  }))

  emit('dragStart', block, event)
}

// 点击选择
function onBlockClick(block: BlockDefinition) {
  emit('select', block)
}

// 递归收集所有分类 key（用于展开全部）
function collectAllCategoryKeys(tree: BlockManifestTree | null): string[] {
  if (!tree?.children) return []
  const keys: string[] = []
  
  function collectKeys(nodes: (BlockSection | BlockDefinition)[], prefix = '') {
    for (const node of nodes) {
      if (!isLeaf(node)) {
        const key = prefix ? `${prefix}-${node.name}` : node.name
        keys.push(key)
        if (node.children) {
          collectKeys(node.children, key)
        }
      }
    }
  }
  
  collectKeys(tree.children)
  return keys
}

// 展开所有
function handleExpandAll() {
  if (manifest.value) {
    const allKeys = collectAllCategoryKeys(manifest.value)
    expandedCategories.value = new Set(allKeys)
  }
}

// 折叠所有
function handleCollapseAll() {
  expandedCategories.value = new Set()
}

// 搜索变化时自动展开
watch(searchQuery, (query) => {
  if (query) {
    handleExpandAll()
  }
})

// 初始化
onMounted(() => {
  loadManifest()
})

// 暴露方法
defineExpose({
  loadManifest,
})
</script>

<template>
  <div v-if="visible" class="block-sidebar" :style="{ width: typeof width === 'number' ? `${width}px` : width }">
    <!-- 搜索框 -->
    <div class="sidebar-header">
      <div class="sidebar-title">
        <Icon icon="mdi:puzzle" />
        <span>Blocks</span>
      </div>
      <div class="search-box">
        <Icon icon="mdi:magnify" class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="搜索 Block..."
        />
        <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">
          <Icon icon="mdi:close" />
        </button>
      </div>
      <div class="sidebar-actions">
        <button class="action-icon" title="展开全部" @click="handleExpandAll">
          <Icon icon="mdi:arrow-expand-vertical" />
        </button>
        <button class="action-icon" title="折叠全部" @click="handleCollapseAll">
          <Icon icon="mdi:arrow-collapse-vertical" />
        </button>
      </div>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="loading-state">
      <Icon icon="mdi:loading" class="spinning" />
      <span>加载中...</span>
    </div>

    <!-- 无数据 -->
    <div v-else-if="!filteredTree || filteredTree.children.length === 0" class="empty-state">
      <Icon icon="mdi:package-variant" />
      <span>{{ searchQuery ? '无匹配结果' : '暂无 Blocks' }}</span>
    </div>

    <!-- Blocks 树列表 -->
    <div v-else class="blocks-list">
      <template v-for="section in filteredTree.children" :key="section.name || section.key">
        <!-- 如果是叶子节点，直接显示 -->
        <template v-if="isLeaf(section)">
          <div
            class="block-item standalone"
            :style="{
              color: getCategoryColor(section.type).text,
              background: getCategoryColor(section.type).bg,
              borderColor: getCategoryColor(section.type).border,
            }"
            draggable="true"
            @dragstart="onDragStart($event, section)"
            @click="onBlockClick(section)"
          >
            <Icon :icon="getCategoryIcon(section.type)" class="block-icon" />
            <span class="block-name">{{ section.key || section.name }}</span>
          </div>
        </template>

        <!-- 如果是分类节点，显示折叠面板 -->
        <div v-else class="collapse-item">
          <!-- 分类头部 -->
          <button
            class="collapse-header"
            :class="{ expanded: isCategoryExpanded(section.name) }"
            @click="toggleCategory(section.name)"
          >
            <Icon
              icon="mdi:chevron-right"
              class="collapse-arrow"
              :class="{ rotated: isCategoryExpanded(section.name) }"
            />
            <Icon
              :icon="getCategoryIcon(section.key || section.name)"
              class="category-icon"
              :style="{ color: getCategoryColor(section.key || section.name).text }"
            />
            <span class="category-name">{{ section.name }}</span>
            <span class="category-count">{{ collectLeaves(section).length }}</span>
          </button>

          <!-- 分类内容 -->
          <div v-if="isCategoryExpanded(section.name)" class="collapse-content">
            <template v-for="child in section.children" :key="child.name || child.key">
              <!-- 子分类（可展开） -->
              <template v-if="!isLeaf(child)">
                <div class="sub-collapse-item">
                  <button
                    class="sub-collapse-header"
                    :class="{ expanded: isCategoryExpanded(`${section.name}-${child.name}`) }"
                    @click="toggleCategory(`${section.name}-${child.name}`)"
                  >
                    <Icon
                      icon="mdi:chevron-right"
                      class="collapse-arrow small"
                      :class="{ rotated: isCategoryExpanded(`${section.name}-${child.name}`) }"
                    />
                    <span class="subcategory-name">{{ child.name }}</span>
                    <span class="subcategory-count">{{ collectLeaves(child).length }}</span>
                  </button>
                  
                  <div v-if="isCategoryExpanded(`${section.name}-${child.name}`)" class="sub-collapse-content">
                    <template v-for="grandChild in child.children" :key="grandChild.name || grandChild.key">
                      <!-- 如果孙子节点还是分类，用可折叠组件 -->
                      <template v-if="!isLeaf(grandChild)">
                        <div class="deep-collapse-item">
                          <button
                            class="deep-collapse-header"
                            :class="{ expanded: isCategoryExpanded(`${section.name}-${child.name}-${grandChild.name}`) }"
                            @click="toggleCategory(`${section.name}-${child.name}-${grandChild.name}`)"
                          >
                            <Icon
                              icon="mdi:chevron-right"
                              class="collapse-arrow tiny"
                              :class="{ rotated: isCategoryExpanded(`${section.name}-${child.name}-${grandChild.name}`) }"
                            />
                            <span class="deep-name">{{ grandChild.name }}</span>
                            <span class="deep-count">{{ collectLeaves(grandChild).length }}</span>
                          </button>
                          
                          <div v-if="isCategoryExpanded(`${section.name}-${child.name}-${grandChild.name}`)" class="deep-collapse-content">
                            <template v-for="leaf in grandChild.children" :key="leaf.key || leaf.name">
                              <!-- 第4层分类 -->
                              <template v-if="!isLeaf(leaf)">
                                <div class="fourth-level">
                                  <div class="fourth-level-title">{{ leaf.name }}</div>
                                  <div class="fourth-level-items">
                                    <template v-for="deepLeaf in leaf.children" :key="deepLeaf.key">
                                      <div
                                        v-if="isLeaf(deepLeaf)"
                                        class="block-item"
                                        :style="{
                                          color: getCategoryColor(section.key || section.name).text,
                                          background: getCategoryColor(section.key || section.name).bg,
                                          borderColor: getCategoryColor(section.key || section.name).border,
                                        }"
                                        draggable="true"
                                        @dragstart="onDragStart($event, deepLeaf, section.key || section.name)"
                                        @click="onBlockClick(deepLeaf)"
                                      >
                                        <span class="block-name">{{ deepLeaf.key || deepLeaf.name }}</span>
                                      </div>
                                    </template>
                                  </div>
                                </div>
                              </template>
                              
                              <!-- 叶子节点 -->
                              <div
                                v-else
                                class="block-item"
                                :style="{
                                  color: getCategoryColor(section.key || section.name).text,
                                  background: getCategoryColor(section.key || section.name).bg,
                                  borderColor: getCategoryColor(section.key || section.name).border,
                                }"
                                draggable="true"
                                @dragstart="onDragStart($event, leaf, section.key || section.name)"
                                @click="onBlockClick(leaf)"
                              >
                                <span class="block-name">{{ leaf.key || leaf.name }}</span>
                              </div>
                            </template>
                          </div>
                        </div>
                      </template>
                      
                      <!-- 叶子节点（直接在第2层下） -->
                      <div
                        v-else
                        class="block-item"
                        :style="{
                          color: getCategoryColor(section.key || section.name).text,
                          background: getCategoryColor(section.key || section.name).bg,
                          borderColor: getCategoryColor(section.key || section.name).border,
                        }"
                        draggable="true"
                        @dragstart="onDragStart($event, grandChild, section.key || section.name)"
                        @click="onBlockClick(grandChild)"
                      >
                        <span class="block-name">{{ grandChild.key || grandChild.name }}</span>
                      </div>
                    </template>
                  </div>
                </div>
              </template>

              <!-- 叶子节点 -->
              <div
                v-else
                class="block-item"
                :style="{
                  color: getCategoryColor(section.key || section.name).text,
                  background: getCategoryColor(section.key || section.name).bg,
                  borderColor: getCategoryColor(section.key || section.name).border,
                }"
                draggable="true"
                @dragstart="onDragStart($event, child, section.key || section.name)"
                @click="onBlockClick(child)"
              >
                <span class="block-name">{{ child.key || child.name }}</span>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.block-sidebar {
  height: 100%;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
}

.sidebar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* 搜索框 */
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  transition: all 0.2s;
}

.search-box:focus-within {
  border-color: var(--color-accent-blue);
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
}

.search-icon {
  color: var(--color-text-muted);
  font-size: 18px;
}

.search-input {
  flex: 1;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  font-size: 14px;
}

.search-input:focus {
  outline: none;
}

.search-input::placeholder {
  color: var(--color-text-muted);
}

.search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: var(--color-bg-tertiary);
  border-radius: 50%;
  color: var(--color-text-muted);
  cursor: pointer;
}

.search-clear:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.sidebar-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 8px;
}

.action-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.2s;
}

.action-icon:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--color-text-muted);
}

.loading-state .iconify,
.empty-state .iconify {
  font-size: 32px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.blocks-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

/* 滚动条样式 */
.blocks-list::-webkit-scrollbar {
  width: 6px;
}

.blocks-list::-webkit-scrollbar-track {
  background: transparent;
}

.blocks-list::-webkit-scrollbar-thumb {
  background: var(--color-scrollbar);
  border-radius: 3px;
}

.blocks-list::-webkit-scrollbar-thumb:hover {
  background: var(--color-scrollbar-hover);
}

/* 折叠项 */
.collapse-item {
  margin-bottom: 4px;
}

.collapse-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 8px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.collapse-header:hover {
  background: var(--color-bg-tertiary);
}

.collapse-arrow {
  font-size: 16px;
  color: var(--color-text-muted);
  transition: transform 0.2s;
}

.collapse-arrow.small {
  font-size: 14px;
}

.collapse-arrow.tiny {
  font-size: 12px;
}

.collapse-arrow.rotated {
  transform: rotate(90deg);
}

.category-icon {
  font-size: 18px;
}

.category-name {
  flex: 1;
  color: var(--color-text-primary);
  font-weight: 500;
}

.category-count {
  padding: 2px 8px;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.collapse-content {
  padding: 4px 0 8px 8px;
}

/* 子分类 */
.sub-collapse-item {
  margin-bottom: 4px;
}

.sub-collapse-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 6px;
  border: none;
  background: var(--color-bg-primary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.sub-collapse-header:hover {
  background: var(--color-bg-tertiary);
}

.subcategory-name {
  flex: 1;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.subcategory-count {
  padding: 2px 6px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.sub-collapse-content {
  padding: 4px 0 4px 12px;
}

/* 深层折叠 */
.deep-collapse-item {
  margin-bottom: 2px;
}

.deep-collapse-header {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 6px 4px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.deep-collapse-header:hover {
  background: var(--color-bg-tertiary);
}

.deep-name {
  flex: 1;
  font-size: 12px;
  color: var(--color-text-muted);
}

.deep-count {
  padding: 2px 6px;
  background: var(--color-bg-tertiary);
  border-radius: 6px;
  font-size: 10px;
  color: var(--color-text-muted);
}

.deep-collapse-content {
  padding: 4px 0 4px 16px;
}

/* 第4层样式 */
.fourth-level {
  margin-bottom: 8px;
}

.fourth-level-title {
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.fourth-level-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 8px;
}

/* Block 项 */
.block-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin: 2px 0;
  border: 1px solid;
  border-radius: 6px;
  cursor: grab;
  font-family: var(--font-mono);
  font-size: 13px;
  transition: all 0.2s ease;
}

.block-item:hover {
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.block-item:active {
  cursor: grabbing;
}

.block-item.standalone {
  margin-bottom: 6px;
}

.block-icon {
  font-size: 18px;
}

.block-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
