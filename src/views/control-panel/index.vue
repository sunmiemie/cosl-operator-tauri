<script setup lang="ts">
/**
 * Control Panel View
 * Interactive parameter control panel using widgets
 */
import { ref, computed, onMounted } from 'vue'
import { VueFlow, useVueFlow, type Node, type NodeTypesObject } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { Icon } from '@iconify/vue'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

import {
  WIDGETS,
  VISUALIZATIONS,
  getWidgetComponent,
  getVisualizationComponent,
} from '@/components/controls'
import type {
  WidgetType,
  VisualizationType,
  WidgetData,
  VisualizationData,
} from '@/types'
import { useControl } from '@/composables/useControl'

const { widgetCount, clearAll } = useControl()

// Vue Flow instance
const { nodes, addNodes, removeNodes, project, fitView } = useVueFlow()

// Build node types from widget registry
const nodeTypes = computed<NodeTypesObject>(() => {
  const types: Record<string, ReturnType<typeof getWidgetComponent>> = {}

  // Add widget types
  for (const [widgetType] of Object.entries(WIDGETS)) {
    const component = getWidgetComponent(widgetType as WidgetType)
    if (component) {
      types[`widget-${widgetType}`] = component
    }
  }

  // Add visualization types
  for (const [vizType] of Object.entries(VISUALIZATIONS)) {
    const component = getVisualizationComponent(vizType as VisualizationType)
    if (component) {
      types[`viz-${vizType}`] = component
    }
  }

  return types as unknown as NodeTypesObject
})

// State
const showAddMenu = ref(false)

// Add widget node
function addWidgetNode(widgetType: WidgetType) {
  const id = `widget-${Date.now()}`
  const newNode: Node<WidgetData> = {
    id,
    type: `widget-${widgetType}`,
    position: project({ x: 200, y: 200 }),
    data: {
      blockId: 'demo-block',
      blockParameter: 'param1',
      label: WIDGETS[widgetType].label,
      config: undefined,
    },
  }
  addNodes([newNode])
  showAddMenu.value = false
}

// Add visualization node
function addVisualizationNode(vizType: VisualizationType) {
  const id = `viz-${Date.now()}`
  const newNode: Node<VisualizationData> = {
    id,
    type: `viz-${vizType}`,
    position: project({ x: 400, y: 200 }),
    data: {
      blockId: 'demo-block',
      blockOutput: 'output1',
      label: VISUALIZATIONS[vizType].label,
      visualizationType: vizType,
    },
  }
  addNodes([newNode])
  showAddMenu.value = false
}

// Clear all nodes
function handleClearAll() {
  const nodeIds = nodes.value.map((n) => n.id)
  removeNodes(nodeIds)
  clearAll()
}

// Fit view on mount
onMounted(() => {
  setTimeout(() => fitView(), 100)
})
</script>

<template>
  <div class="control-panel-view">
    <!-- Header -->
    <div class="panel-header">
      <div class="header-left">
        <Icon icon="mdi:tune-vertical" class="header-icon" />
        <h1>控制面板</h1>
        <span class="widget-badge">{{ widgetCount }} 控件</span>
      </div>

      <div class="header-right">
        <!-- Add dropdown -->
        <div class="dropdown-container">
          <button class="btn btn-outline" @click="showAddMenu = !showAddMenu">
            <Icon icon="mdi:plus" />
            添加控件
          </button>

          <!-- Add menu -->
          <div v-if="showAddMenu" class="dropdown-menu">
            <div class="menu-section">
              <span class="menu-title">输入控件</span>
            </div>
            <div class="menu-items">
              <button
                v-for="(entry, type) in WIDGETS"
                :key="type"
                class="menu-item"
                @click="addWidgetNode(type as WidgetType)"
              >
                {{ entry.label }}
              </button>
            </div>

            <div class="menu-section">
              <span class="menu-title">可视化</span>
            </div>
            <div class="menu-items">
              <button
                v-for="(entry, type) in VISUALIZATIONS"
                :key="type"
                class="menu-item"
                @click="addVisualizationNode(type as VisualizationType)"
              >
                {{ entry.label }}
              </button>
            </div>
          </div>
        </div>

        <button class="btn btn-outline" @click="handleClearAll">
          <Icon icon="mdi:trash-can-outline" />
          清空
        </button>

        <button class="btn btn-outline" disabled>
          <Icon icon="mdi:content-save-outline" />
          保存
        </button>

        <button class="btn btn-outline" disabled>
          <Icon icon="mdi:folder-open-outline" />
          加载
        </button>
      </div>
    </div>

    <!-- Flow Canvas -->
    <div class="canvas-container">
      <VueFlow
        :nodes="nodes"
        :node-types="nodeTypes"
        fit-view-on-init
        class="flow-canvas"
      >
        <Background />
        <Controls />
        <MiniMap />
      </VueFlow>

      <!-- Empty state -->
      <div v-if="nodes.length === 0" class="empty-state">
        <div class="empty-card">
          <h2>开始创建控制面板</h2>
          <p>添加滑块、旋钮、开关等控件来控制流程图参数</p>
          <button class="btn btn-primary" @click="showAddMenu = true">
            <Icon icon="mdi:plus" />
            添加第一个控件
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.control-panel-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--background);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--background);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  width: 20px;
  height: 20px;
  color: var(--primary);
}

.header-left h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.widget-badge {
  padding: 4px 10px;
  font-size: 12px;
  background: var(--muted);
  color: var(--muted-foreground);
  border-radius: 9999px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-outline {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--foreground);
}

.btn-outline:hover:not(:disabled) {
  background: var(--muted);
}

.btn-outline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  border: none;
  background: var(--primary);
  color: white;
}

.btn-primary:hover {
  opacity: 0.9;
}

.dropdown-container {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  right: 0;
  top: 100%;
  margin-top: 8px;
  width: 256px;
  background: var(--popover, white);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  z-index: 50;
  overflow: hidden;
}

.menu-section {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.menu-section:not(:first-child) {
  border-top: 1px solid var(--border);
}

.menu-title {
  font-size: 11px;
  font-weight: 500;
  color: var(--muted-foreground);
  text-transform: uppercase;
}

.menu-items {
  padding: 4px;
}

.menu-item {
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.menu-item:hover {
  background: var(--muted);
}

.canvas-container {
  flex: 1;
  position: relative;
}

.flow-canvas {
  background-image: radial-gradient(circle, #ddd 1px, transparent 1px);
  background-size: 20px 20px;
}

.empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.empty-card {
  max-width: 400px;
  padding: 32px;
  background: var(--card, white);
  border: 1px solid var(--border);
  border-radius: 12px;
  text-align: center;
  pointer-events: auto;
}

.empty-card h2 {
  margin: 0 0 8px 0;
  font-size: 18px;
}

.empty-card p {
  margin: 0 0 20px 0;
  font-size: 14px;
  color: var(--muted-foreground);
}

:deep(.vue-flow__node) {
  padding: 0;
  border-radius: 8px;
  background: transparent;
}
</style>
