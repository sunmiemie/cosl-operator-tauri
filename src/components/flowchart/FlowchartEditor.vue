<script setup lang="ts">
/**
 * 流程图编辑器主组件
 * 基于 Vue Flow 实现流程图编辑功能
 * 包含节点编辑面板
 */
import { ref, computed, watch, onMounted, markRaw } from 'vue'
import { VueFlow, useVueFlow, MarkerType } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge, Connection, NodeTypesObject } from '@vue-flow/core'
import { v4 as uuidv4 } from 'uuid'

// 导入自定义节点
import DefaultNode from './nodes/DefaultNode.vue'
import DataNode from './nodes/DataNode.vue'
import HardwareNode from './nodes/HardwareNode.vue'
import VisualizationNode from './nodes/VisualizationNode.vue'
// 新增专业化节点类型
import AINode from './nodes/AINode.vue'
import DSPNode from './nodes/DSPNode.vue'
import MathNode from './nodes/MathNode.vue'
import CtrlFlowNode from './nodes/CtrlFlowNode.vue'
import NumpyNode from './nodes/NumpyNode.vue'
import ScipyNode from './nodes/ScipyNode.vue'
import DebuggingNode from './nodes/DebuggingNode.vue'
import TextNode from './nodes/TextNode.vue'

// 导入节点编辑面板
import NodeEditPanel from './NodeEditPanel.vue'

// 导入类型
import type { BlockData, BlockParameterValue } from '@/views/process-halt-hass/types'
import { createNodeFromDrop } from '@/services/flojoy-adapter'

// 导入样式
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

// Props
interface Props {
  // 初始节点
  initialNodes?: Node[]
  // 初始边
  initialEdges?: Edge[]
  // 是否只读
  readonly?: boolean
  // 高度
  height?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  initialNodes: () => [],
  initialEdges: () => [],
  readonly: false,
  height: '100%',
})

// Emits
const emit = defineEmits<{
  (e: 'change', nodes: Node[], edges: Edge[]): void
  (e: 'nodeClick', node: Node): void
  (e: 'nodeDoubleClick', node: Node): void
  (e: 'nodeUpdate', node: Node): void
}>()

// 编辑面板状态
const selectedNode = ref<Node<BlockData> | null>(null)
const showEditPanel = ref(false)

// 防止循环更新的标志
let isSettingData = false

// 自定义节点类型 - 注册所有 Studio 使用的类型
// Studio 常见类型：default, DATA, CONTROL_FLOW, CONDITIONALS, LOOPS, TIMERS, HARDWARE, etc.
const nodeTypes = {
  // 基础类型
  default: markRaw(DefaultNode),
  // Studio 大写类型（直接对齐 Studio 格式）
  DATA: markRaw(DataNode),
  CONTROL_FLOW: markRaw(CtrlFlowNode),
  CONDITIONALS: markRaw(CtrlFlowNode),
  LOOPS: markRaw(CtrlFlowNode),
  TIMERS: markRaw(CtrlFlowNode),
  HARDWARE: markRaw(HardwareNode),
  VISUALIZATION: markRaw(VisualizationNode),
  SIGNAL_ANALYZERS: markRaw(DSPNode),
  INSTRUMENTS: markRaw(HardwareNode),
  SERIAL: markRaw(HardwareNode),
  VISA: markRaw(HardwareNode),
  // 新增专业化类型
  AI_ML: markRaw(AINode),
  DSP: markRaw(DSPNode),
  MATH: markRaw(MathNode),
  NUMPY: markRaw(NumpyNode),
  SCIPY: markRaw(ScipyNode),
  DEBUGGING: markRaw(DebuggingNode),
  TEXT: markRaw(TextNode),
  // ETL/Transform
  ETL: markRaw(DataNode),
  TRANSFORM: markRaw(DataNode),
  GENERATORS: markRaw(DataNode),
  // 小写类型（兼容我们之前的格式）
  data: markRaw(DataNode),
  hardware: markRaw(HardwareNode),
  visualization: markRaw(VisualizationNode),
  control_flow: markRaw(CtrlFlowNode),
  conditionals: markRaw(CtrlFlowNode),
  ai_ml: markRaw(AINode),
  dsp: markRaw(DSPNode),
  math: markRaw(MathNode),
  numpy: markRaw(NumpyNode),
  scipy: markRaw(ScipyNode),
  debugging: markRaw(DebuggingNode),
  text: markRaw(TextNode),
} as unknown as NodeTypesObject

// 规范化节点类型的辅助函数 - 确保未注册的类型使用 default 替代
function normalizeNodeTypes(inputNodes: Node[]): Node[] {
  const registeredTypes = Object.keys(nodeTypes)
  return inputNodes.map(node => {
    const nodeType = node.type || 'default'
    if (!registeredTypes.includes(nodeType)) {
      console.warn(`[normalizeNodeTypes] 未注册的节点类型: "${nodeType}", 使用 default 类型替代. 节点ID: ${node.id}, label: ${node.data?.label}`)
      return { ...node, type: 'default' }
    }
    return node
  })
}

// 生成唯一 ID
const flowId = `flowchart-editor-${uuidv4().slice(0, 8)}`

// Vue Flow 实例
const { 
  nodes, 
  edges, 
  addNodes, 
  addEdges, 
  removeNodes, 
  removeEdges,
  onConnect,
  onNodeClick,
  onNodeDoubleClick,
  fitView,
  project,
} = useVueFlow(flowId)

// 计算高度样式
const containerStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
}))

// 监听变化并触发事件（但在设置数据时不触发，避免循环）
watch(
  [nodes, edges],
  () => {
    if (!isSettingData) {
      emit('change', nodes.value, edges.value)
    }
  },
  { deep: true }
)

// 连接处理
onConnect((params: Connection) => {
  if (props.readonly) return
  
  const edge: Edge = {
    id: `e-${params.source}-${params.target}-${Date.now()}`,
    source: params.source!,
    target: params.target!,
    sourceHandle: params.sourceHandle || undefined,
    targetHandle: params.targetHandle || undefined,
    type: 'smoothstep',
    markerEnd: MarkerType.ArrowClosed,
  }
  addEdges([edge])
})

// 节点点击事件 - 打开编辑面板
onNodeClick(({ node }) => {
  if (!props.readonly) {
    selectedNode.value = node as Node<BlockData>
    showEditPanel.value = true
  }
  emit('nodeClick', node)
})

// 节点双击事件
onNodeDoubleClick(({ node }) => {
  emit('nodeDoubleClick', node)
})

// 关闭编辑面板
function closeEditPanel() {
  showEditPanel.value = false
  selectedNode.value = null
}

// 更新节点标签
function updateNodeLabel(nodeId: string, label: string) {
  const nodeIndex = nodes.value.findIndex(n => n.id === nodeId)
  if (nodeIndex !== -1) {
    nodes.value[nodeIndex].data = {
      ...nodes.value[nodeIndex].data,
      label,
    }
    emit('nodeUpdate', nodes.value[nodeIndex])
  }
}

// 更新节点参数
function updateNodeParam(nodeId: string, paramName: string, value: BlockParameterValue) {
  const nodeIndex = nodes.value.findIndex(n => n.id === nodeId)
  if (nodeIndex !== -1 && nodes.value[nodeIndex].data?.ctrls) {
    const node = nodes.value[nodeIndex]
    const ctrls = { ...(node.data as BlockData).ctrls }
    if (ctrls[paramName]) {
      ctrls[paramName] = { ...ctrls[paramName], value }
      nodes.value[nodeIndex].data = {
        ...node.data,
        ctrls,
      }
      emit('nodeUpdate', nodes.value[nodeIndex])
    }
  }
}

// 更新节点初始化参数
function updateNodeInitParam(nodeId: string, paramName: string, value: BlockParameterValue) {
  const nodeIndex = nodes.value.findIndex(n => n.id === nodeId)
  if (nodeIndex !== -1 && nodes.value[nodeIndex].data?.initCtrls) {
    const node = nodes.value[nodeIndex]
    const initCtrls = { ...(node.data as BlockData).initCtrls }
    if (initCtrls && initCtrls[paramName]) {
      initCtrls[paramName] = { ...initCtrls[paramName], value }
      nodes.value[nodeIndex].data = {
        ...node.data,
        initCtrls,
      }
      emit('nodeUpdate', nodes.value[nodeIndex])
    }
  }
}

// 删除节点
function deleteNode(nodeId: string) {
  const nodeToRemove = nodes.value.find(n => n.id === nodeId)
  if (nodeToRemove) {
    removeNodes([nodeToRemove])
    closeEditPanel()
  }
}

// 获取其他节点（用于 NodeReference）
const otherNodes = computed(() => {
  if (!selectedNode.value) return []
  return nodes.value.filter(n => n.id !== selectedNode.value?.id) as Node<BlockData>[]
})

// 添加节点方法
function addNode(
  type: string,
  label: string,
  position: { x: number; y: number },
  data: Record<string, unknown> = {}
) {
  const node: Node = {
    id: uuidv4(),
    type,
    position,
    data: {
      label,
      ...data,
    },
  }
  addNodes([node])
  return node
}

// 删除选中节点
function deleteSelectedNodes() {
  const selectedNodes = nodes.value.filter(n => n.selected)
  removeNodes(selectedNodes)
}

// 清空画布
function clearCanvas() {
  removeNodes(nodes.value)
  removeEdges(edges.value)
}

// 获取当前流程图数据
function getFlowchartData() {
  return {
    nodes: nodes.value,
    edges: edges.value,
  }
}

// 设置流程图数据
function setFlowchartData(newNodes: Node[], newEdges: Edge[]) {
  // 设置标志防止循环更新
  isSettingData = true

  try {
    // 清空现有节点和边
    nodes.value = []
    edges.value = []

    // 规范化节点类型，确保使用已注册的类型
    const normalizedNodes = normalizeNodeTypes(newNodes)

    // 添加规范化后的节点和边
    if (normalizedNodes.length > 0) {
      addNodes(normalizedNodes)
    }
    if (newEdges.length > 0) {
      addEdges(newEdges)
    }
  } finally {
    // 延迟重置标志，确保所有响应式更新完成
    setTimeout(() => {
      isSettingData = false
    }, 0)
  }
}

// 适应视图
function fitToView() {
  fitView({ padding: 0.2 })
}

// 拖放处理
function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function onDrop(event: DragEvent) {
  if (props.readonly) return
  
  const blockData = event.dataTransfer?.getData('application/json')
  if (!blockData) return
  
  try {
    const position = project({
      x: event.clientX,
      y: event.clientY,
    })
    
    // 使用适配层创建节点
    const newNode = createNodeFromDrop(blockData, position)
    if (newNode) {
      addNodes([newNode])
    }
  } catch (e) {
    console.error('Failed to parse dropped block:', e)
  }
}

// 暴露方法给父组件
defineExpose({
  addNode,
  deleteSelectedNodes,
  clearCanvas,
  getFlowchartData,
  setFlowchartData,
  fitToView,
})

// 注意：不再自动监听 props 变化，避免循环更新
// 父组件应直接调用 setFlowchartData 方法来更新画布

// 初始化
onMounted(() => {
  // 设置初始节点和边（规范化节点类型）
  if (props.initialNodes.length > 0) {
    const normalizedNodes = normalizeNodeTypes(props.initialNodes)
    addNodes(normalizedNodes)
  }
  if (props.initialEdges.length > 0) {
    addEdges(props.initialEdges)
  }
  setTimeout(() => fitToView(), 100)
})
</script>

<template>
  <div 
    class="flowchart-editor" 
    :style="containerStyle"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <VueFlow
      :id="flowId"
      :node-types="nodeTypes"
      :default-viewport="{ zoom: 1, x: 0, y: 0 }"
      :default-edge-options="{ type: 'smoothstep', markerEnd: MarkerType.ArrowClosed, animated: false }"
      :min-zoom="0.1"
      :max-zoom="2"
      :snap-to-grid="true"
      :snap-grid="[15, 15]"
      :nodes-draggable="!readonly"
      :nodes-connectable="!readonly"
      :elements-selectable="!readonly"
      fit-view-on-init
    >
      <!-- 背景网格 -->
      <Background pattern-color="#e2e8f0" :gap="20" />
      
      <!-- 控制按钮 -->
      <Controls v-if="!readonly" position="bottom-right" />
      
      <!-- 小地图 -->
      <MiniMap position="bottom-left" />
    </VueFlow>
    
    <!-- 节点编辑面板 -->
    <NodeEditPanel
      v-if="!readonly"
      :node="selectedNode"
      :other-nodes="otherNodes"
      :visible="showEditPanel"
      @close="closeEditPanel"
      @update-label="updateNodeLabel"
      @update-param="updateNodeParam"
      @update-init-param="updateNodeInitParam"
      @delete="deleteNode"
    />
  </div>
</template>

<style scoped>
.flowchart-editor {
  width: 100%;
  min-height: 400px;
  background-color: var(--color-bg-1, #f8fafc);
  border-radius: 8px;
  overflow: hidden;
}

/* Vue Flow 样式覆盖 */
:deep(.vue-flow) {
  background-color: var(--color-bg-1, #f8fafc);
}

/* 移除 Vue Flow 默认的节点边框和选中样式 */
:deep(.vue-flow__node) {
  cursor: pointer;
  /* 移除默认边框 */
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
  padding: 0 !important;
  /* 确保 handles 可以显示在节点边界外 */
  overflow: visible !important;
}

/* 选中状态由节点组件内部处理 */
:deep(.vue-flow__node.selected) {
  border: none !important;
  box-shadow: none !important;
}

/* Handle 连接点基础样式 */
:deep(.vue-flow__handle) {
  width: 12px;
  height: 12px;
  background: #3b82f6;
  border: 2px solid #fff;
  border-radius: 50%;
}

:deep(.vue-flow__handle:hover) {
  background: #2563eb;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.8);
}

/* 确保 handle 位置正确 - 覆盖 Vue Flow 默认行为 */
:deep(.vue-flow__handle-left) {
  left: -6px;
}

:deep(.vue-flow__handle-right) {
  right: -6px;
}

/* 连线样式 */
:deep(.vue-flow__edge-path) {
  stroke: var(--color-primary, #3b82f6);
  stroke-width: 2;
}

:deep(.vue-flow__edge.selected .vue-flow__edge-path) {
  stroke: var(--color-primary-dark, #2563eb);
  stroke-width: 3;
}

/* 控制栏和小地图 */
:deep(.vue-flow__controls) {
  background: var(--color-bg-2, #fff);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

:deep(.vue-flow__minimap) {
  background: var(--color-bg-2, #fff);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
</style>
