<script setup lang="ts">
/**
 * 流程图查看器
 * 只读模式的流程图显示，用于运行时监控
 */
import { computed, watch, onMounted, markRaw } from 'vue'
import { VueFlow, useVueFlow, MarkerType } from '@vue-flow/core'
import { v4 as uuidv4 } from 'uuid'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge, NodeTypesObject } from '@vue-flow/core'

// 导入自定义节点
import DefaultNode from './nodes/DefaultNode.vue'
import DataNode from './nodes/DataNode.vue'
import HardwareNode from './nodes/HardwareNode.vue'
import VisualizationNode from './nodes/VisualizationNode.vue'

// 导入样式
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

// Props
interface Props {
  // 节点数据
  nodes?: Node[]
  // 边数据
  edges?: Edge[]
  // 高度
  height?: string | number
  // 是否显示小地图
  showMinimap?: boolean
  // 是否显示控制按钮
  showControls?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  nodes: () => [],
  edges: () => [],
  height: '100%',
  showMinimap: true,
  showControls: true,
})

// Emits
const emit = defineEmits<{
  (e: 'nodeClick', node: Node): void
}>()

// 自定义节点类型
const nodeTypes = {
  default: markRaw(DefaultNode),
  data: markRaw(DataNode),
  hardware: markRaw(HardwareNode),
  visualization: markRaw(VisualizationNode),
} as unknown as NodeTypesObject

// 生成唯一 ID
const flowId = `flowchart-viewer-${uuidv4().slice(0, 8)}`

// Vue Flow 实例
const { 
  nodes: flowNodes, 
  setNodes,
  setEdges,
  addNodes,
  addEdges,
  onNodeClick,
  fitView,
} = useVueFlow({ id: flowId })

// 计算高度样式
const containerStyle = computed(() => ({
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
}))

// 监听 props 变化更新节点
watch(
  () => props.nodes,
  (newNodes) => {
    setNodes(newNodes)
  },
  { deep: true }
)

watch(
  () => props.edges,
  (newEdges) => {
    setEdges(newEdges)
  },
  { deep: true }
)

// 节点点击事件
onNodeClick(({ node }) => {
  emit('nodeClick', node)
})

// 更新节点状态
function updateNodeStatus(nodeId: string, status: string, result?: unknown) {
  const node = flowNodes.value.find(n => n.id === nodeId)
  if (node) {
    node.data = {
      ...node.data,
      status,
      result,
    }
  }
}

// 清除所有节点状态
function clearNodeStatuses() {
  flowNodes.value.forEach(node => {
    node.data = {
      ...node.data,
      status: 'pending',
      result: undefined,
    }
  })
}

// 适应视图
function fitToView() {
  fitView({ padding: 0.2 })
}

// 暴露方法
defineExpose({
  updateNodeStatus,
  clearNodeStatuses,
  fitToView,
})

// 初始化
onMounted(() => {
  // 设置初始节点和边
  if (props.nodes.length > 0) {
    addNodes(props.nodes)
  }
  if (props.edges.length > 0) {
    addEdges(props.edges)
  }
  setTimeout(() => fitToView(), 100)
})
</script>

<template>
  <div class="flowchart-viewer" :style="containerStyle">
    <VueFlow
      :id="flowId"
      :node-types="nodeTypes"
      :default-viewport="{ zoom: 1, x: 0, y: 0 }"
      :default-edge-options="{ type: 'smoothstep', markerEnd: MarkerType.ArrowClosed, animated: false }"
      :min-zoom="0.1"
      :max-zoom="2"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="true"
      fit-view-on-init
    >
      <!-- 背景网格 -->
      <Background pattern-color="#e2e8f0" :gap="20" />
      
      <!-- 控制按钮 -->
      <Controls v-if="showControls" position="bottom-right" />
      
      <!-- 小地图 -->
      <MiniMap v-if="showMinimap" position="bottom-left" />
    </VueFlow>
  </div>
</template>

<style scoped>
.flowchart-viewer {
  width: 100%;
  min-height: 300px;
  background-color: var(--color-bg-1, #f8fafc);
  border-radius: 8px;
  overflow: hidden;
}

:deep(.vue-flow) {
  background-color: var(--color-bg-1, #f8fafc);
}

:deep(.vue-flow__node) {
  cursor: pointer;
}

:deep(.vue-flow__edge-path) {
  stroke: var(--color-primary, #3b82f6);
  stroke-width: 2;
}

:deep(.vue-flow__edge.animated .vue-flow__edge-path) {
  stroke-dasharray: 5;
  animation: dashdraw 0.5s linear infinite;
}

@keyframes dashdraw {
  from {
    stroke-dashoffset: 10;
  }
}

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
