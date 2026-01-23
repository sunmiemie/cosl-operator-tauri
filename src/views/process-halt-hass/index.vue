<script setup lang="ts">
/**
 * HALT-HASS 工艺编辑页
 * 
 * 功能：
 * - 双栏布局：左侧元数据/操作，右侧 Flojoy 编辑器
 * - 本地保存/导入/导出
 * - 后端上传/下载（TODO）
 */
import { ref, computed, onMounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import FlojoyPanel from '@/components/common/FlojoyPanel.vue'
import { useHaltHassProcess } from './composables/useHaltHassProcess'
import { useFlojoy } from '@/composables/useFlojoy'

const {
  currentProcess,
  currentFileName,
  status: processStatus,
  errorMessage,
  localProcessList,
  hasUnsavedChanges,
  hasProcess,
  processSummary,
  createNewProcess,
  updateProcessMeta,
  updateNotes,
  saveToLocal,
  loadFromLocal,
  importFromFile,
  exportToFile,
  refreshLocalList,
  deleteLocal,
  clearCurrentProcess,
  uploadToBackend,
  fetchFromBackend
} = useHaltHassProcess()

const { isConfigured: isFlojoyConfigured } = useFlojoy()

// 左侧面板折叠状态
const leftPanelCollapsed = ref(false)

// 当前选中的本地工艺（列表中）
const selectedLocalProcess = ref<string | null>(null)

// 是否显示本地工艺列表
const showLocalList = ref(false)

// 编辑中的元数据
const editName = ref('')
const editVersion = ref('')
const editNotes = ref('')

// 同步编辑状态
watch(currentProcess, (process) => {
  if (process) {
    editName.value = process.name
    editVersion.value = process.version
    editNotes.value = process.meta.notes || ''
  } else {
    editName.value = ''
    editVersion.value = ''
    editNotes.value = ''
  }
}, { immediate: true })

// 操作状态
const isSaving = computed(() => processStatus.value === 'saving')
const isLoading = computed(() => processStatus.value === 'loading')

// 格式化时间
function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('zh-CN')
  } catch {
    return isoString
  }
}

// 创建新工艺
function handleNewProcess() {
  if (hasUnsavedChanges.value) {
    ElMessageBox.confirm('当前工艺有未保存的更改，确定要创建新工艺吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      createNewProcess()
      ElMessage.success('已创建新工艺')
    }).catch(() => {})
  } else {
    createNewProcess()
    ElMessage.success('已创建新工艺')
  }
}

// 保存工艺
async function handleSave() {
  // 先更新元数据
  if (hasProcess.value) {
    updateProcessMeta({
      name: editName.value,
      version: editVersion.value
    })
    updateNotes(editNotes.value)
  }
  
  const success = await saveToLocal()
  if (success) {
    ElMessage.success('保存成功')
    await refreshLocalList()
  } else {
    ElMessage.error(errorMessage.value || '保存失败')
  }
}

// 导入工艺
async function handleImport() {
  if (hasUnsavedChanges.value) {
    try {
      await ElMessageBox.confirm('当前工艺有未保存的更改，确定要导入吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      })
    } catch {
      return
    }
  }
  
  const success = await importFromFile()
  if (success) {
    ElMessage.success('导入成功')
  } else if (errorMessage.value) {
    ElMessage.error(errorMessage.value)
  }
}

// 导出工艺
async function handleExport() {
  if (!hasProcess.value) {
    ElMessage.warning('没有可导出的工艺')
    return
  }
  
  // 先更新元数据
  updateProcessMeta({
    name: editName.value,
    version: editVersion.value
  })
  updateNotes(editNotes.value)
  
  const success = await exportToFile()
  if (success) {
    ElMessage.success('导出成功')
  }
}

// 加载本地工艺
async function handleLoadLocal(fileName: string) {
  if (hasUnsavedChanges.value) {
    try {
      await ElMessageBox.confirm('当前工艺有未保存的更改，确定要加载其他工艺吗？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      })
    } catch {
      return
    }
  }
  
  const success = await loadFromLocal(fileName)
  if (success) {
    ElMessage.success('加载成功')
    showLocalList.value = false
  } else {
    ElMessage.error(errorMessage.value || '加载失败')
  }
}

// 删除本地工艺
async function handleDeleteLocal(fileName: string) {
  try {
    await ElMessageBox.confirm('确定要删除此工艺吗？', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    const success = await deleteLocal(fileName)
    if (success) {
      ElMessage.success('删除成功')
    } else {
      ElMessage.error('删除失败')
    }
  } catch {
    // 取消删除
  }
}

// 清空当前工艺
function handleClear() {
  if (!hasProcess.value) return
  
  ElMessageBox.confirm('确定要关闭当前工艺吗？未保存的更改将丢失。', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    clearCurrentProcess()
    ElMessage.info('已关闭工艺')
  }).catch(() => {})
}

// 上传到后端（TODO）
async function handleUpload() {
  const success = await uploadToBackend()
  if (!success) {
    ElMessage.warning(errorMessage.value || '上传功能尚未实现')
  }
}

// 从后端拉取（TODO）
async function handleFetch() {
  const success = await fetchFromBackend(0)
  if (!success) {
    ElMessage.warning(errorMessage.value || '拉取功能尚未实现')
  }
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
  <div class="halt-hass-editor">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <Icon icon="mdi:chart-timeline-variant" class="page-icon" />
          HALT-HASS 工艺编辑
        </h1>
        <p class="page-desc">
          <template v-if="hasProcess">
            {{ processSummary?.name }} v{{ processSummary?.version }}
            <span v-if="hasUnsavedChanges" class="unsaved-badge">未保存</span>
          </template>
          <template v-else>创建或导入工艺以开始编辑</template>
        </p>
      </div>
      <div class="header-actions">
        <button class="action-btn" @click="handleNewProcess" title="新建工艺">
          <Icon icon="mdi:plus" />
          <span>新建</span>
        </button>
        <button class="action-btn" @click="handleImport" title="导入工艺">
          <Icon icon="mdi:import" />
          <span>导入</span>
        </button>
        <button 
          class="action-btn" 
          @click="handleExport" 
          :disabled="!hasProcess"
          title="导出工艺"
        >
          <Icon icon="mdi:export" />
          <span>导出</span>
        </button>
        <button 
          class="action-btn primary" 
          @click="handleSave" 
          :disabled="!hasProcess || isSaving"
          title="保存工艺"
        >
          <Icon :icon="isSaving ? 'mdi:loading' : 'mdi:content-save'" :class="{ spin: isSaving }" />
          <span>保存</span>
        </button>
      </div>
    </div>
    
    <!-- 主内容区 -->
    <div class="editor-main">
      <!-- 左侧面板 -->
      <div class="left-panel" :class="{ collapsed: leftPanelCollapsed }">
        <!-- 折叠按钮 -->
        <button 
          class="collapse-btn" 
          @click="leftPanelCollapsed = !leftPanelCollapsed"
          :title="leftPanelCollapsed ? '展开面板' : '折叠面板'"
        >
          <Icon :icon="leftPanelCollapsed ? 'mdi:chevron-right' : 'mdi:chevron-left'" />
        </button>
        
        <template v-if="!leftPanelCollapsed">
          <!-- 工艺信息编辑 -->
          <div class="panel-section" v-if="hasProcess">
            <h3 class="section-title">
              <Icon icon="mdi:information-outline" />
              工艺信息
            </h3>
            <div class="form-group">
              <label>工艺名称</label>
              <input 
                v-model="editName" 
                type="text" 
                placeholder="输入工艺名称"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label>版本号</label>
              <input 
                v-model="editVersion" 
                type="text" 
                placeholder="例如: 1.0.0"
                class="form-input"
              />
            </div>
            <div class="form-group">
              <label>备注</label>
              <textarea 
                v-model="editNotes" 
                placeholder="输入备注信息"
                class="form-textarea"
                rows="3"
              />
            </div>
            <div class="form-info">
              <span>更新时间: {{ formatTime(processSummary?.updatedAt || '') }}</span>
            </div>
            <button class="close-btn" @click="handleClear">
              <Icon icon="mdi:close" />
              关闭工艺
            </button>
          </div>
          
          <!-- 未加载工艺提示 -->
          <div class="panel-section empty-state" v-else>
            <Icon icon="mdi:file-document-outline" class="empty-icon" />
            <p>尚未加载工艺</p>
            <p class="empty-hint">点击"新建"或"导入"开始</p>
          </div>
          
          <!-- 本地工艺列表 -->
          <div class="panel-section">
            <h3 
              class="section-title clickable" 
              @click="showLocalList = !showLocalList"
            >
              <Icon icon="mdi:folder-outline" />
              本地工艺
              <Icon 
                :icon="showLocalList ? 'mdi:chevron-up' : 'mdi:chevron-down'" 
                class="toggle-icon"
              />
              <span class="count-badge">{{ localProcessList.length }}</span>
            </h3>
            
            <div v-if="showLocalList" class="local-list">
              <div v-if="localProcessList.length === 0" class="list-empty">
                暂无本地工艺
              </div>
              <div 
                v-for="item in localProcessList" 
                :key="item.fileName"
                class="local-item"
                :class="{ active: currentFileName === item.fileName }"
              >
                <div class="item-info" @click="handleLoadLocal(item.fileName)">
                  <span class="item-name">{{ item.name }}</span>
                  <span class="item-version">v{{ item.version }}</span>
                  <span class="item-time">{{ formatTime(item.updatedAt) }}</span>
                </div>
                <button 
                  class="item-delete" 
                  @click.stop="handleDeleteLocal(item.fileName)"
                  title="删除"
                >
                  <Icon icon="mdi:delete-outline" />
                </button>
              </div>
            </div>
          </div>
          
          <!-- 后端操作（TODO） -->
          <div class="panel-section">
            <h3 class="section-title">
              <Icon icon="mdi:cloud-outline" />
              后端同步
              <span class="todo-badge">TODO</span>
            </h3>
            <div class="backend-actions">
              <button class="backend-btn" @click="handleUpload" disabled>
                <Icon icon="mdi:cloud-upload-outline" />
                上传到后端
              </button>
              <button class="backend-btn" @click="handleFetch" disabled>
                <Icon icon="mdi:cloud-download-outline" />
                从后端拉取
              </button>
            </div>
            <p class="todo-hint">后端对接功能开发中...</p>
          </div>
        </template>
      </div>
      
      <!-- 右侧 Flojoy 面板 -->
      <div class="right-panel">
        <FlojoyPanel
          :auto-start="true"
          @ready="handleFlojoyReady"
          @error="handleFlojoyError"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.halt-hass-editor {
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

.unsaved-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--color-accent-orange);
  background: rgba(247, 129, 102, 0.15);
  border-radius: 10px;
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

/* 主内容区 */
.editor-main {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
}

/* 左侧面板 */
.left-panel {
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  position: relative;
  transition: width 0.3s ease;
  overflow-y: auto;
}

.left-panel.collapsed {
  width: 40px;
  padding: 12px 4px;
}

.collapse-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--color-text-secondary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  z-index: 10;
}

.left-panel.collapsed .collapse-btn {
  position: static;
  margin: 0 auto;
}

.collapse-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-hover);
}

/* 面板区块 */
.panel-section {
  padding: 12px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.section-title.clickable {
  cursor: pointer;
  user-select: none;
}

.section-title.clickable:hover {
  color: var(--color-accent-blue);
}

.toggle-icon {
  margin-left: auto;
  font-size: 16px;
}

.count-badge {
  margin-left: 4px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: normal;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  border-radius: 10px;
}

.todo-badge {
  margin-left: auto;
  padding: 2px 6px;
  font-size: 10px;
  color: var(--color-accent-orange);
  background: rgba(247, 129, 102, 0.15);
  border-radius: 4px;
}

/* 表单样式 */
.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  transition: all 0.2s ease;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--color-accent-blue);
  box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.15);
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.form-info {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-bottom: 12px;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px;
  font-size: 12px;
  color: var(--color-accent-red);
  background: transparent;
  border: 1px solid var(--color-accent-red);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(248, 81, 73, 0.1);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 12px;
  text-align: center;
}

.empty-icon {
  font-size: 40px;
  color: var(--color-text-muted);
  opacity: 0.5;
  margin-bottom: 8px;
}

.empty-state p {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.empty-hint {
  font-size: 12px !important;
  color: var(--color-text-muted) !important;
  margin-top: 4px !important;
}

/* 本地列表 */
.local-list {
  margin-top: 8px;
}

.list-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
}

.local-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  margin-bottom: 4px;
  background: var(--color-bg-tertiary);
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.local-item:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-border);
}

.local-item.active {
  border-color: var(--color-accent-blue);
  background: rgba(88, 166, 255, 0.1);
}

.item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-version {
  font-size: 11px;
  color: var(--color-text-muted);
}

.item-time {
  font-size: 10px;
  color: var(--color-text-muted);
}

.item-delete {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s ease;
}

.local-item:hover .item-delete {
  opacity: 1;
}

.item-delete:hover {
  color: var(--color-accent-red);
  background: rgba(248, 81, 73, 0.1);
}

/* 后端操作 */
.backend-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.backend-btn {
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
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.backend-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.backend-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.todo-hint {
  margin: 8px 0 0 0;
  font-size: 11px;
  color: var(--color-text-muted);
  text-align: center;
}

/* 右侧面板 */
.right-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* 加载动画 */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
