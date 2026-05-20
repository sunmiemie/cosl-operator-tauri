<script setup lang="ts">
/**
 * ResultPanel Component
 * Displays block execution results with Plotly visualization
 */
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { PlotlyChart } from '@/components/plotly'
import type { PlotlyTheme } from '@/components/plotly/plotlyTheme'
import type {
  BlockResult,
} from '@/types'
import {
  hasPlotlyFigure,
  hasTextBlob,
  hasDataContainer,
  getResultType,
  getDataContainerDisplayName,
} from '@/types'

const props = withDefaults(defineProps<{
  result: BlockResult | null
  theme?: PlotlyTheme
  nodeLabel?: string
}>(), {
  theme: 'light',
})

// Active tab
const activeTab = ref<string>('')

// Tab definitions
interface TabDef {
  id: string
  label: string
  icon: string
}

// Determine available tabs
const availableTabs = computed(() => {
  if (!props.result) return []

  const tabs: TabDef[] = []

  if (hasPlotlyFigure(props.result)) {
    tabs.push({ id: 'plot', label: '图表', icon: 'mdi:chart-bar' })
  }

  if (hasTextBlob(props.result)) {
    tabs.push({ id: 'text', label: '文本', icon: 'mdi:file-document-outline' })
  }

  if (hasDataContainer(props.result)) {
    tabs.push({ id: 'data', label: '数据', icon: 'mdi:database-outline' })
  }

  // Set default active tab
  if (tabs.length > 0 && !activeTab.value) {
    activeTab.value = tabs[0].id
  }

  return tabs
})

// Format data container for display
const dataContainerDisplay = computed(() => {
  if (!props.result?.data) return null

  const data = props.result.data
  return {
    type: getDataContainerDisplayName(data.type),
    value: JSON.stringify(data, null, 2),
  }
})
</script>

<template>
  <div class="result-panel">
    <!-- Header -->
    <div class="result-header">
      <div class="header-left">
        <span class="header-title">执行结果</span>
        <span v-if="nodeLabel" class="node-badge">{{ nodeLabel }}</span>
      </div>
      <span v-if="result" class="status-badge" :class="getResultType(result) === 'empty' ? 'secondary' : 'primary'">
        {{ getResultType(result) === 'empty' ? '无结果' : '有结果' }}
      </span>
    </div>

    <!-- Content -->
    <div class="result-content">
      <!-- No result state -->
      <div v-if="!result || availableTabs.length === 0" class="empty-state">
        <Icon icon="mdi:alert-circle-outline" class="empty-icon" />
        <p class="empty-title">暂无执行结果</p>
        <p class="empty-subtitle">运行流程图后将在此显示结果</p>
      </div>

      <!-- Tabs for different result types -->
      <div v-else class="tabs-container">
        <div class="tabs-list">
          <button
            v-for="tab in availableTabs"
            :key="tab.id"
            class="tab-trigger"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            <Icon :icon="tab.icon" class="tab-icon" />
            {{ tab.label }}
          </button>
        </div>

        <div class="tabs-content">
          <!-- Plot Tab -->
          <div v-if="activeTab === 'plot' && hasPlotlyFigure(result)" class="tab-panel">
            <PlotlyChart
              v-if="result.plotly_fig"
              :data="result.plotly_fig.data"
              :layout="result.plotly_fig.layout"
              :theme="theme"
              class="chart-container"
            />
          </div>

          <!-- Text Tab -->
          <div v-if="activeTab === 'text' && hasTextBlob(result)" class="tab-panel">
            <div class="scroll-area">
              <pre class="text-content">{{ result.text_blob }}</pre>
            </div>
          </div>

          <!-- Data Tab -->
          <div v-if="activeTab === 'data' && hasDataContainer(result)" class="tab-panel">
            <div class="scroll-area">
              <div class="data-content">
                <span class="data-type-badge">{{ dataContainerDisplay?.type }}</span>
                <pre class="data-json">{{ dataContainerDisplay?.value }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.result-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--muted-background, rgba(0, 0, 0, 0.03));
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title {
  font-weight: 500;
  font-size: 14px;
}

.node-badge {
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid var(--border);
  border-radius: 9999px;
  color: var(--muted-foreground);
}

.status-badge {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 9999px;
  font-weight: 500;
}

.status-badge.primary {
  background: var(--primary, #3b82f6);
  color: white;
}

.status-badge.secondary {
  background: var(--muted, #f1f5f9);
  color: var(--muted-foreground, #64748b);
}

.result-content {
  flex: 1;
  overflow: hidden;
}

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--muted-foreground);
}

.empty-icon {
  width: 40px;
  height: 40px;
  margin-bottom: 8px;
  opacity: 0.5;
}

.empty-title {
  font-size: 14px;
  margin: 0;
}

.empty-subtitle {
  font-size: 12px;
  margin: 4px 0 0 0;
  opacity: 0.7;
}

.tabs-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tabs-list {
  display: flex;
  gap: 4px;
  padding: 4px 16px;
  border-bottom: 1px solid var(--border);
}

.tab-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-trigger:hover {
  background: var(--muted);
}

.tab-trigger.active {
  background: var(--muted);
  color: var(--foreground);
  font-weight: 500;
}

.tab-icon {
  width: 14px;
  height: 14px;
}

.tabs-content {
  flex: 1;
  overflow: hidden;
}

.tab-panel {
  height: 100%;
  padding: 16px;
}

.scroll-area {
  height: 100%;
  overflow: auto;
}

.chart-container {
  width: 100%;
  height: 100%;
  min-height: 300px;
}

.text-content {
  font-size: 13px;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.data-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.data-type-badge {
  display: inline-block;
  width: fit-content;
  padding: 2px 8px;
  font-size: 11px;
  background: var(--muted, #f1f5f9);
  color: var(--muted-foreground, #64748b);
  border-radius: 9999px;
}

.data-json {
  font-size: 12px;
  font-family: monospace;
  background: var(--muted-background, rgba(0, 0, 0, 0.03));
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0;
}
</style>
