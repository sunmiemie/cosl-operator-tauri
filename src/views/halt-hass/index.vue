<script setup lang="ts">
/**
 * HALT-HASS 测试页
 * 
 * 功能：
 * - 加载本地/导入工艺 JSON
 * - 显示工艺摘要
 * - 启动 Flojoy 服务并执行测试（TODO）
 */
import { ref, computed, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { open } from '@tauri-apps/plugin-dialog'
import { readTextFile } from '@tauri-apps/plugin-fs'
import FlojoyPanel from '@/components/common/FlojoyPanel.vue'
import { useFileSystem } from '@/composables/useFileSystem'
import { useFlojoy } from '@/composables/useFlojoy'
import {
  type HaltHassProcess,
  type HaltHassProcessListItem,
  isValidHaltHassProcess,
  isFlojoyFlow
} from '@/types/haltHassProcess'

const fileSystem = useFileSystem()
const { isRunning: isFlojoyRunning, status: flojoyStatus } = useFlojoy()

// 当前加载的工艺
const currentProcess = ref<HaltHassProcess | null>(null)

// 工艺来源
const processSource = ref<'local' | 'import' | 'backend' | null>(null)

// 本地工艺列表
const localProcessList = ref<HaltHassProcessListItem[]>([])

// 是否显示工艺选择器
const showProcessSelector = ref(false)

// 加载状态
const isLoading = ref(false)

// 是否已加载工艺
const hasProcess = computed(() => currentProcess.value !== null)

// 工艺摘要
const processSummary = computed(() => {
  if (!currentProcess.value) return null
  return {
    name: currentProcess.value.name,
    version: currentProcess.value.version,
    boardModelId: currentProcess.value.boardModelId,
    createdAt: currentProcess.value.meta.createdAt,
    updatedAt: currentProcess.value.meta.updatedAt,
    notes: currentProcess.value.meta.notes,
    nodeCount: currentProcess.value.flojoyFlow?.nodes?.length || 0,
    edgeCount: currentProcess.value.flojoyFlow?.edges?.length || 0
  }
})

// 格式化时间
function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('zh-CN')
  } catch {
    return isoString
  }
}

// 刷新本地工艺列表
async function refreshLocalList(): Promise<void> {
  try {
    const list = await fileSystem.getHaltHassProcessList()
    localProcessList.value = list.map(item => ({
      fileName: item.fileName,
      name: item.name,
      version: item.version,
      updatedAt: item.updatedAt,
      filePath: item.filePath
    }))
  } catch (error) {
    console.error('刷新本地列表失败:', error)
  }
}

// 从本地加载工艺
async function loadFromLocal(fileName: string): Promise<boolean> {
  isLoading.value = true
  try {
    const data = await fileSystem.loadHaltHassProcess<HaltHassProcess>(fileName)
    
    if (!data) {
      throw new Error('文件加载失败')
    }
    
    if (!isValidHaltHassProcess(data)) {
      throw new Error('文件格式无效')
    }
    
    currentProcess.value = data
    processSource.value = 'local'
    showProcessSelector.value = false
    ElMessage.success('工艺加载成功')
    return true
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载失败')
    return false
  } finally {
    isLoading.value = false
  }
}

// 从外部文件导入
async function importFromFile(): Promise<boolean> {
  isLoading.value = true
  try {
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'JSON 文件',
        extensions: ['json']
      }],
      title: '选择 HALT-HASS 工艺文件'
    })
    
    if (!selected) {
      return false
    }
    
    const filePath = selected as string
    const content = await readTextFile(filePath)
    const data = JSON.parse(content)
    
    // 判断是 HALT-HASS 工艺还是 Flojoy 原生流程
    if (isValidHaltHassProcess(data)) {
      currentProcess.value = data
    } else if (isFlojoyFlow(data)) {
      // Flojoy 原生流程，包装为 HALT-HASS 工艺
      const now = new Date().toISOString()
      currentProcess.value = {
        name: '导入的工艺',
        version: '1.0.0',
        flojoyFlow: data,
        meta: {
          createdAt: now,
          updatedAt: now,
          notes: '从 Flojoy 流程文件导入'
        }
      }
    } else {
      throw new Error('不支持的文件格式')
    }
    
    processSource.value = 'import'
    showProcessSelector.value = false
    ElMessage.success('工艺导入成功')
    return true
  } catch (error) {
    if (error instanceof Error && error.message !== '不支持的文件格式') {
      ElMessage.error(error.message)
    } else if (error instanceof Error) {
      ElMessage.error(error.message)
    }
    return false
  } finally {
    isLoading.value = false
  }
}

// 从后端拉取（TODO）
async function fetchFromBackend(): Promise<void> {
  // TODO: 实现后端拉取
  ElMessage.warning('后端拉取功能尚未实现')
}

// 清除当前工艺
function clearProcess(): void {
  ElMessageBox.confirm('确定要卸载当前工艺吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    currentProcess.value = null
    processSource.value = null
    ElMessage.info('已卸载工艺')
  }).catch(() => {})
}

// 启动测试（TODO）
async function startTest(): Promise<void> {
  if (!hasProcess.value) {
    ElMessage.warning('请先加载工艺')
    return
  }
  
  if (!isFlojoyRunning.value) {
    ElMessage.warning('请先启动 Flojoy 服务')
    return
  }
  
  // TODO: 实现测试启动逻辑
  // 1. 将 flojoyFlow 传递给 Flojoy 服务
  // 2. 调用 Flojoy 的执行 API
  // 3. 监控测试进度
  ElMessage.warning('测试执行功能尚未实现')
}

// 打开工艺选择器
function openProcessSelector(): void {
  refreshLocalList()
  showProcessSelector.value = true
}

// Flojoy 就绪回调
function handleFlojoyReady(url: string) {
  console.log('Flojoy 服务就绪:', url)
}

// Flojoy 错误回调
function handleFlojoyError(message: string) {
  console.error('Flojoy 错误:', message)
}

// 初始化
onMounted(async () => {
  await refreshLocalList()
})
</script>

<template>
  <div class="halt-hass-test">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <Icon icon="mdi:snowflake-thermometer" class="page-icon" />
          HALT-HASS 测试
        </h1>
        <p class="page-desc">高加速寿命试验与高加速应力筛选</p>
      </div>
      <div class="header-actions">
        <button 
          class="action-btn" 
          @click="openProcessSelector"
          title="选择工艺"
        >
          <Icon icon="mdi:folder-open-outline" />
          <span>选择工艺</span>
        </button>
        <button 
          class="action-btn" 
          @click="importFromFile" 
          :disabled="isLoading"
          title="导入工艺文件"
        >
          <Icon icon="mdi:import" />
          <span>导入</span>
        </button>
        <button 
          v-if="hasProcess"
          class="action-btn"
          @click="clearProcess"
          title="卸载当前工艺"
        >
          <Icon icon="mdi:close-circle-outline" />
          <span>卸载</span>
        </button>
        <button 
          class="action-btn primary"
          @click="startTest"
          :disabled="!hasProcess || !isFlojoyRunning"
          :title="!hasProcess ? '请先加载工艺' : !isFlojoyRunning ? '请先启动 Flojoy' : '启动测试'"
        >
          <Icon icon="mdi:play" />
          <span>启动测试</span>
          <span class="todo-tag">TODO</span>
        </button>
      </div>
    </div>
    
    <!-- 主内容区 -->
    <div class="test-main">
      <!-- 左侧工艺信息面板 -->
      <div class="info-panel">
        <!-- 工艺摘要 -->
        <div class="panel-card" v-if="hasProcess">
          <h3 class="card-title">
            <Icon icon="mdi:file-document-outline" />
            当前工艺
          </h3>
          <div class="process-info">
            <div class="info-row">
              <span class="info-label">名称</span>
              <span class="info-value">{{ processSummary?.name }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">版本</span>
              <span class="info-value">v{{ processSummary?.version }}</span>
            </div>
            <div class="info-row" v-if="processSummary?.boardModelId">
              <span class="info-label">板型</span>
              <span class="info-value">#{{ processSummary.boardModelId }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">节点数</span>
              <span class="info-value">{{ processSummary?.nodeCount }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">连接数</span>
              <span class="info-value">{{ processSummary?.edgeCount }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">来源</span>
              <span class="info-value source-badge" :class="processSource">
                {{ processSource === 'local' ? '本地' : processSource === 'import' ? '导入' : '后端' }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">更新时间</span>
              <span class="info-value">{{ formatTime(processSummary?.updatedAt || '') }}</span>
            </div>
            <div class="info-row" v-if="processSummary?.notes">
              <span class="info-label">备注</span>
              <span class="info-value notes">{{ processSummary.notes }}</span>
            </div>
          </div>
        </div>
        
        <!-- 未加载工艺提示 -->
        <div class="panel-card empty-state" v-else>
          <Icon icon="mdi:file-question-outline" class="empty-icon" />
          <p class="empty-title">未加载工艺</p>
          <p class="empty-desc">请选择或导入 HALT-HASS 工艺文件</p>
          <div class="empty-actions">
            <button class="empty-btn" @click="openProcessSelector">
              <Icon icon="mdi:folder-open-outline" />
              选择本地工艺
            </button>
            <button class="empty-btn" @click="importFromFile">
              <Icon icon="mdi:import" />
              导入文件
            </button>
          </div>
        </div>
        
        <!-- Flojoy 状态 -->
        <div class="panel-card status-card">
          <h3 class="card-title">
            <Icon icon="mdi:server" />
            Flojoy 状态
          </h3>
          <div class="status-row">
            <span class="status-label">服务状态</span>
            <span 
              class="status-value" 
              :class="flojoyStatus"
            >
              <Icon 
                :icon="isFlojoyRunning ? 'mdi:check-circle' : 'mdi:alert-circle'" 
                class="status-icon"
              />
              {{ isFlojoyRunning ? '运行中' : flojoyStatus === 'starting' ? '启动中' : '未启动' }}
            </span>
          </div>
        </div>
        
        <!-- 后端同步（TODO） -->
        <div class="panel-card">
          <h3 class="card-title">
            <Icon icon="mdi:cloud-outline" />
            后端同步
            <span class="todo-badge">TODO</span>
          </h3>
          <button class="fetch-btn" @click="fetchFromBackend" disabled>
            <Icon icon="mdi:cloud-download-outline" />
            从后端拉取工艺
          </button>
          <p class="todo-hint">后端对接功能开发中...</p>
        </div>
      </div>
      
      <!-- 右侧 Flojoy 面板 -->
      <div class="flojoy-panel-container">
        <FlojoyPanel
          :auto-start="true"
          @ready="handleFlojoyReady"
          @error="handleFlojoyError"
        />
      </div>
    </div>
    
    <!-- 工艺选择器弹窗 -->
    <Teleport to="body">
      <div v-if="showProcessSelector" class="process-selector-overlay" @click.self="showProcessSelector = false">
        <div class="process-selector-modal">
          <div class="modal-header">
            <h3>选择本地工艺</h3>
            <button class="close-btn" @click="showProcessSelector = false">
              <Icon icon="mdi:close" />
            </button>
          </div>
          <div class="modal-body">
            <div v-if="localProcessList.length === 0" class="list-empty">
              <Icon icon="mdi:folder-open-outline" class="empty-icon" />
              <p>暂无本地工艺</p>
              <p class="empty-hint">请先在工艺编辑页创建并保存工艺</p>
            </div>
            <div 
              v-for="item in localProcessList" 
              :key="item.fileName"
              class="process-item"
              @click="loadFromLocal(item.fileName)"
            >
              <div class="item-icon">
                <Icon icon="mdi:file-document-outline" />
              </div>
              <div class="item-content">
                <span class="item-name">{{ item.name }}</span>
                <span class="item-meta">
                  v{{ item.version }} · {{ formatTime(item.updatedAt) }}
                </span>
              </div>
              <Icon icon="mdi:chevron-right" class="item-arrow" />
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.halt-hass-test {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--color-text-primary);
}

/* 页面头部 */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 16px;
}

.header-left {
  flex: 1;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 600;
}

.page-icon {
  font-size: 24px;
  color: var(--color-accent-blue);
}

.page-desc {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
  border-color: var(--color-accent-blue);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.primary {
  color: #fff;
  background: var(--color-accent-blue);
  border-color: var(--color-accent-blue);
}

.action-btn.primary:hover:not(:disabled) {
  background: #4a94e8;
}

.todo-tag {
  padding: 2px 6px;
  font-size: 10px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  margin-left: 4px;
}

/* 主内容区 */
.test-main {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
}

/* 左侧信息面板 */
.info-panel {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.panel-card {
  padding: 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.todo-badge {
  margin-left: auto;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: normal;
  color: var(--color-accent-orange);
  background: rgba(247, 129, 102, 0.15);
  border-radius: 4px;
}

/* 工艺信息 */
.process-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.info-label {
  flex-shrink: 0;
  width: 60px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.info-value {
  flex: 1;
  font-size: 13px;
  color: var(--color-text-primary);
}

.info-value.notes {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.source-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 10px;
}

.source-badge.local {
  color: var(--color-accent-green);
  background: rgba(63, 185, 80, 0.15);
}

.source-badge.import {
  color: var(--color-accent-blue);
  background: rgba(88, 166, 255, 0.15);
}

.source-badge.backend {
  color: var(--color-accent-purple);
  background: rgba(163, 113, 247, 0.15);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  color: var(--color-text-muted);
  opacity: 0.5;
  margin-bottom: 12px;
}

.empty-title {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.empty-desc {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.empty-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.empty-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.empty-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
  border-color: var(--color-accent-blue);
}

/* 状态卡片 */
.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.status-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.status-value {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.status-value.running {
  color: var(--color-accent-green);
}

.status-value.starting {
  color: var(--color-accent-orange);
}

.status-value.stopped,
.status-value.failed {
  color: var(--color-text-muted);
}

.status-icon {
  font-size: 16px;
}

/* 后端同步按钮 */
.fetch-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.fetch-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.fetch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.todo-hint {
  margin: 8px 0 0 0;
  font-size: 11px;
  color: var(--color-text-muted);
  text-align: center;
}

/* 右侧 Flojoy 面板 */
.flojoy-panel-container {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* 工艺选择器弹窗 */
.process-selector-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.process-selector-modal {
  width: 480px;
  max-height: 70vh;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.modal-header .close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.modal-header .close-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  text-align: center;
}

.list-empty .empty-icon {
  font-size: 48px;
  color: var(--color-text-muted);
  opacity: 0.5;
  margin-bottom: 12px;
}

.list-empty p {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.list-empty .empty-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 4px;
}

.process-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.process-item:hover {
  border-color: var(--color-accent-blue);
  background: var(--color-bg-hover);
}

.item-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--color-accent-blue);
  background: rgba(88, 166, 255, 0.1);
  border-radius: 8px;
}

.item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  font-size: 12px;
  color: var(--color-text-muted);
}

.item-arrow {
  font-size: 20px;
  color: var(--color-text-muted);
}
</style>
